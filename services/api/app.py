#!/usr/bin/env python3
"""UCIS REST API Backend"""

import json
import logging
import os
from datetime import datetime, timedelta
from pathlib import Path

import pika
from flask import Flask, jsonify, request
from flask_cors import CORS
from pymongo import MongoClient

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

mongo_uri = os.getenv(
    "MONGO_URI", "mongodb://admin:admin123@localhost:27017/ucis_db?authSource=admin"
)
client = MongoClient(mongo_uri)
db = client.ucis_db

rabbitmq_host = os.getenv("RABBITMQ_HOST", "rabbitmq")
rabbitmq_port = int(os.getenv("RABBITMQ_PORT", "5672"))
rabbitmq_user = os.getenv("RABBITMQ_USERNAME", "admin")
rabbitmq_pass = os.getenv("RABBITMQ_PASSWORD", "admin123")

ALL_DOMAINS = ["traffic", "climate", "health", "environment", "population"]
ALL_ZONES = ["downtown", "suburbs", "industrial", "residential", "airport"]
ALL_SEVERITIES = ["low", "medium", "high", "critical"]

# Paths to JSON files that are the SINGLE SOURCE OF TRUTH for default patterns
# and default scenarios. Mounted into the container via docker-compose volumes.
DEFAULT_PATTERNS_PATH = Path(
    os.getenv("DEFAULT_PATTERNS_PATH", "/app/config/patterns/default_patterns.json")
)
DEFAULT_SCENARIOS_PATH = Path(
    os.getenv("DEFAULT_SCENARIOS_PATH", "/app/config/scenarios/default_scenarios.json")
)


# ── RabbitMQ Queue Management ─────────────────────────────────────────────────


def purge_rabbitmq_queues():
    """
    Purges RabbitMQ queues when simulator is paused to prevent buffered events
    from continuing to generate alerts after pause.

    Uses a separate channel for each queue to handle non-existent queues gracefully.
    """
    try:
        credentials = pika.PlainCredentials(rabbitmq_user, rabbitmq_pass)
        parameters = pika.ConnectionParameters(
            host=rabbitmq_host,
            port=rabbitmq_port,
            credentials=credentials,
            connection_attempts=3,
            retry_delay=1,
        )
        connection = pika.BlockingConnection(parameters)

        queues_to_purge = [
            "ucis.enricher.events",  # Cola que consume el Enricher (eventos raw pendientes)
            "ucis.cep.events",  # Cola que consume el CEP Engine (Esper) - LA MÁS CRÍTICA
            "ucis.events.enriched",  # Eventos enriquecidos pendientes
            "ucis.events.complex",  # Alertas complejas ya generadas
        ]

        purged_counts = {}
        for queue_name in queues_to_purge:
            try:
                # Create a new channel for each queue to avoid channel errors affecting others
                channel = connection.channel()

                # Try to purge directly - if queue doesn't exist, will raise exception
                method = channel.queue_purge(queue=queue_name)
                purged_counts[queue_name] = method.method.message_count
                logger.info(
                    f"Purged {purged_counts[queue_name]} messages from queue '{queue_name}'"
                )
                channel.close()
            except pika.exceptions.ChannelClosedByBroker as e:
                # Queue doesn't exist - this is normal if simulator just started
                logger.info(
                    f"Queue '{queue_name}' does not exist yet (will be created when needed)"
                )
                purged_counts[queue_name] = 0
            except Exception as e:
                logger.warning(f"Could not purge queue '{queue_name}': {e}")
                purged_counts[queue_name] = 0

        connection.close()
        logger.info(f"Queue purge completed: {purged_counts}")
        return purged_counts

    except Exception as e:
        logger.error(f"Failed to connect to RabbitMQ for queue purging: {e}")
        return {}


# ── Health ────────────────────────────────────────────────────────────────────


@app.route("/health")
def health():
    try:
        db.command("ping")
        return jsonify(
            {"status": "healthy", "service": "api", "mongo": "connected"}
        ), 200
    except Exception as e:
        return jsonify({"status": "unhealthy", "error": str(e)}), 500


# ── Events ────────────────────────────────────────────────────────────────────


@app.route("/api/events")
def list_events():
    try:
        limit = min(int(request.args.get("limit", 100)), 500)
        skip = int(request.args.get("skip", 0))
        query = {}
        if request.args.get("domain"):
            query["domain"] = request.args["domain"]
        if request.args.get("zone"):
            query["zone"] = request.args["zone"]
        if request.args.get("severity"):
            query["severity"] = request.args["severity"]

        events = list(
            db.events.find(query).sort("timestamp", -1).skip(skip).limit(limit)
        )
        for e in events:
            e["_id"] = str(e["_id"])
        count = db.events.count_documents(query)
        return jsonify(
            {"events": events, "count": count, "limit": limit, "skip": skip}
        ), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/events/<event_id>")
def get_event(event_id):
    try:
        event = db.events.find_one({"id": event_id})
        if not event:
            return jsonify({"error": "Event not found"}), 404
        event["_id"] = str(event["_id"])
        return jsonify(event), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Complex Events ────────────────────────────────────────────────────────────


@app.route("/api/events/complex", methods=["GET"])
def list_complex_events():
    """
    Returns complex events grouped by (pattern_id, zone) by default.
    Each row shows: pattern_id, pattern_name, alert_level, zone, occurrences, last_seen.
    Pass grouped=false to get raw individual events (paginated).
    """
    try:
        since_minutes = int(request.args.get("since", 60))
        pattern_id = request.args.get("pattern_id")
        alert_level = request.args.get("alert_level")
        grouped = request.args.get("grouped", "true").lower() != "false"

        # Build time-window match
        match = {}
        if pattern_id:
            match["pattern_id"] = pattern_id
        if alert_level:
            match["alert_level"] = alert_level
        if since_minutes > 0:
            cutoff = datetime.utcnow() - timedelta(minutes=since_minutes)
            cutoff_iso = cutoff.isoformat() + "Z"
            match["$or"] = [
                {"created_at": {"$gte": cutoff}},
                {"timestamp": {"$gte": cutoff_iso}},
            ]

        if grouped:
            pipeline = [
                {"$match": match},
                {
                    "$group": {
                        "_id": {
                            "pattern_id": "$pattern_id",
                            "pattern_name": "$pattern_name",
                            "alert_level": "$alert_level",
                            "zone": "$zone",
                        },
                        "occurrences": {"$sum": 1},
                        "last_seen": {"$max": "$timestamp"},
                        "description": {"$first": "$description"},
                    }
                },
                {"$sort": {"last_seen": -1, "occurrences": -1}},
            ]
            rows = list(db.complex_events.aggregate(pipeline))
            events = [
                {
                    "pattern_id": r["_id"]["pattern_id"],
                    "pattern_name": r["_id"].get("pattern_name")
                    or r["_id"]["pattern_id"],
                    "alert_level": r["_id"]["alert_level"],
                    "zone": r["_id"].get("zone") or "—",
                    "occurrences": r["occurrences"],
                    "last_seen": r["last_seen"],
                    # Alias so the frontend can filter grouped rows by time
                    # the same way it does for raw complex events.
                    "timestamp": r["last_seen"],
                    "description": r.get("description", ""),
                }
                for r in rows
            ]
            return jsonify(
                {
                    "events": events,
                    "count": len(events),
                    "grouped": True,
                    "since_minutes": since_minutes,
                }
            ), 200

        # Raw mode (ungrouped) — for Load more
        limit = min(int(request.args.get("limit", 50)), 500)
        skip = int(request.args.get("skip", 0))
        raw = list(
            db.complex_events.find(match).sort("timestamp", -1).skip(skip).limit(limit)
        )
        for e in raw:
            e["_id"] = str(e["_id"])
        count = db.complex_events.count_documents(match)
        return jsonify(
            {
                "events": raw,
                "count": count,
                "limit": limit,
                "skip": skip,
                "grouped": False,
                "since_minutes": since_minutes,
            }
        ), 200

    except Exception as e:
        logger.error("Error listing complex events: %s", e)
        return jsonify({"error": str(e)}), 500


@app.route("/api/events/complex", methods=["POST"])
def ingest_complex_event():
    """CEP engine posts complex events here; we store and update match_count."""
    try:
        data = request.json
        data["created_at"] = datetime.utcnow()
        if "timestamp" not in data:
            data["timestamp"] = datetime.utcnow().isoformat() + "Z"

        db.complex_events.insert_one(data)

        pid = data.get("pattern_id")
        if pid:
            db.patterns.update_one({"pattern_id": pid}, {"$inc": {"match_count": 1}})

        data["_id"] = str(data["_id"])
        return jsonify(data), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Patterns ──────────────────────────────────────────────────────────────────


@app.route("/api/patterns")
def list_patterns():
    try:
        patterns = list(db.patterns.find().sort("created_at", -1))
        for p in patterns:
            p["_id"] = str(p["_id"])
        return jsonify({"patterns": patterns}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/patterns", methods=["POST"])
def create_pattern():
    try:
        data = request.json
        now = datetime.utcnow().isoformat() + "Z"
        pattern = {
            "pattern_id": data["pattern_id"],
            "name": data.get("name", ""),
            "description": data.get("description", ""),
            "epl_rule": data["epl_rule"],
            "severity": data.get("severity", "medium"),
            "enabled": data.get("enabled", True),
            "input_domains": data.get("input_domains", []),
            "match_count": 0,
            "created_at": now,
            "updated_at": now,
        }
        result = db.patterns.insert_one(pattern)
        return jsonify(
            {"_id": str(result.inserted_id), "pattern_id": pattern["pattern_id"]}
        ), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/patterns/<pattern_id>", methods=["PUT"])
def update_pattern(pattern_id):
    try:
        data = request.json
        data["updated_at"] = datetime.utcnow().isoformat() + "Z"
        result = db.patterns.update_one({"pattern_id": pattern_id}, {"$set": data})
        if result.matched_count == 0:
            return jsonify({"error": "Pattern not found"}), 404
        return jsonify({"modified_count": result.modified_count}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/patterns/<pattern_id>", methods=["DELETE"])
def delete_pattern(pattern_id):
    try:
        result = db.patterns.delete_one({"pattern_id": pattern_id})
        if result.deleted_count == 0:
            return jsonify({"error": "Pattern not found"}), 404
        return jsonify({"deleted_count": result.deleted_count}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Statistics ────────────────────────────────────────────────────────────────


@app.route("/api/stats/events-per-minute")
def events_per_minute():
    """
    Returns event counts bucketed by time, with severity breakdown.
    Granularity is selected by the client via ?granularity=10s|1m|5m
      - 10s : last 10 minutes  (60 buckets max)
      - 1m  : last hour        (60 buckets max)
      - 5m  : last 6 hours     (72 buckets max)
    """
    try:
        granularity = request.args.get("granularity", "10s").lower()
        if granularity not in ("10s", "1m", "5m"):
            granularity = "10s"

        # Per-granularity config: window length, bucket size in ms, label, x-axis format
        config = {
            "10s": {
                "window": timedelta(minutes=10),
                "bucket_ms": 10_000,
                "label": "Events per 10 s (last 10 min)",
                "fmt": "%H:%M:%S",
            },
            "1m": {
                "window": timedelta(hours=1),
                "bucket_ms": 60_000,
                "label": "Events per minute (last hour)",
                "fmt": "%H:%M",
            },
            "5m": {
                "window": timedelta(hours=6),
                "bucket_ms": 300_000,
                "label": "Events per 5 min (last 6 h)",
                "fmt": "%H:%M",
            },
        }[granularity]

        now = datetime.utcnow()
        since = now - config["window"]
        since_iso = since.isoformat() + "Z"

        def _date_expr():
            return {
                "$cond": [
                    {"$ifNull": ["$created_at", False]},
                    "$created_at",
                    {"$toDate": "$timestamp"},
                ]
            }

        pipeline = [
            {
                "$match": {
                    "$or": [
                        {"created_at": {"$gte": since}},
                        {"timestamp": {"$gte": since_iso}},
                    ]
                }
            },
            {
                "$addFields": {
                    "_ts": {"$toLong": _date_expr()},
                    "_sev": {"$ifNull": ["$severity", "unknown"]},
                }
            },
            {
                "$group": {
                    "_id": {
                        "$subtract": [
                            "$_ts",
                            {"$mod": ["$_ts", config["bucket_ms"]]},
                        ]
                    },
                    "count": {"$sum": 1},
                    "low": {"$sum": {"$cond": [{"$eq": ["$_sev", "low"]}, 1, 0]}},
                    "medium": {"$sum": {"$cond": [{"$eq": ["$_sev", "medium"]}, 1, 0]}},
                    "high": {"$sum": {"$cond": [{"$eq": ["$_sev", "high"]}, 1, 0]}},
                    "critical": {
                        "$sum": {"$cond": [{"$eq": ["$_sev", "critical"]}, 1, 0]}
                    },
                }
            },
            {"$sort": {"_id": 1}},
            {
                "$project": {
                    "_id": {
                        "$dateToString": {
                            "format": config["fmt"],
                            "date": {"$toDate": "$_id"},
                        }
                    },
                    "bucket_ms": "$_id",
                    "count": 1,
                    "low": 1,
                    "medium": 1,
                    "high": 1,
                    "critical": 1,
                }
            },
        ]

        data = list(db.events.aggregate(pipeline))

        # Backfill missing buckets with zeros so the chart length is stable across polls
        # (otherwise empty intervals make the line jump around).
        bucket_ms = config["bucket_ms"]
        end_ms = int(now.timestamp() * 1000)
        end_ms -= end_ms % bucket_ms
        start_ms = int(since.timestamp() * 1000)
        start_ms -= start_ms % bucket_ms

        existing = {row.get("bucket_ms"): row for row in data}
        filled = []
        cursor = start_ms
        while cursor <= end_ms:
            if cursor in existing:
                row = existing[cursor]
                filled.append(
                    {
                        "_id": row["_id"],
                        "bucket_ms": cursor,
                        "count": row.get("count", 0),
                        "low": row.get("low", 0),
                        "medium": row.get("medium", 0),
                        "high": row.get("high", 0),
                        "critical": row.get("critical", 0),
                    }
                )
            else:
                bucket_dt = datetime.utcfromtimestamp(cursor / 1000)
                filled.append(
                    {
                        "_id": bucket_dt.strftime(config["fmt"]),
                        "bucket_ms": cursor,
                        "count": 0,
                        "low": 0,
                        "medium": 0,
                        "high": 0,
                        "critical": 0,
                    }
                )
            cursor += bucket_ms

        return jsonify(
            {
                "data": filled,
                "granularity": granularity,
                "label": config["label"],
            }
        ), 200

    except Exception as e:
        logger.error("Error getting events rate: %s", e)
        return jsonify({"error": str(e)}), 500


@app.route("/api/stats/top-alerts")
def top_alerts():
    try:
        pipeline = [
            {"$group": {"_id": "$pattern_id", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 10},
        ]
        return jsonify({"data": list(db.complex_events.aggregate(pipeline))}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/stats/zones/<zone>")
def zone_stats(zone):
    try:
        return jsonify(
            {
                "zone": zone,
                "event_count": db.events.count_documents({"zone": zone}),
                "complex_event_count": db.complex_events.count_documents(
                    {"zone": zone}
                ),
            }
        ), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Simulator Config ──────────────────────────────────────────────────────────


@app.route("/api/simulator/config")
def get_simulator_config():
    try:
        cfg = db.simulator_config.find_one({"_id": "main"}) or _default_sim_config()
        cfg.pop("_id", None)
        return jsonify(cfg), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/simulator/config", methods=["PUT"])
def update_simulator_config():
    """
    Patch the live simulator config.
    Accepted fields: event_rate, paused, active_scenario_id,
                     force_domain, force_zone, force_severity

    When paused=True is set, automatically purges RabbitMQ queues to stop
    buffered events from continuing to generate alerts.
    """
    try:
        data = request.json or {}
        allowed = {
            "event_rate",
            "paused",
            "active_scenario_id",
            "force_domain",
            "force_zone",
            "force_severity",
        }
        update = {k: v for k, v in data.items() if k in allowed}

        if "event_rate" in update:
            update["event_rate"] = max(1, min(int(update["event_rate"]), 20))
        if "force_domain" in update and update["force_domain"] not in (
            ALL_DOMAINS + [None, ""]
        ):
            return jsonify(
                {"error": f"Invalid domain. Choose from: {ALL_DOMAINS}"}
            ), 400
        if "force_zone" in update and update["force_zone"] not in (
            ALL_ZONES + [None, ""]
        ):
            return jsonify({"error": f"Invalid zone. Choose from: {ALL_ZONES}"}), 400
        if "force_severity" in update and update["force_severity"] not in (
            ALL_SEVERITIES + [None, ""]
        ):
            return jsonify(
                {"error": f"Invalid severity. Choose from: {ALL_SEVERITIES}"}
            ), 400

        # Check if simulator is being paused
        current_config = (
            db.simulator_config.find_one({"_id": "main"}) or _default_sim_config()
        )
        was_paused = current_config.get("paused", False)
        is_pausing = update.get("paused", False) and not was_paused

        update["updated_at"] = datetime.utcnow().isoformat() + "Z"
        db.simulator_config.update_one({"_id": "main"}, {"$set": update}, upsert=True)

        # If simulator is being paused, purge RabbitMQ queues
        purge_info = {}
        if is_pausing:
            logger.info("Simulator paused - purging RabbitMQ queues...")
            purge_info = purge_rabbitmq_queues()

        cfg = db.simulator_config.find_one({"_id": "main"})
        cfg.pop("_id", None)

        # Include purge information in response if queues were purged
        if purge_info:
            cfg["queues_purged"] = purge_info

        return jsonify(cfg), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Scenarios ─────────────────────────────────────────────────────────────────


@app.route("/api/scenarios")
def list_scenarios():
    try:
        scenarios = list(db.scenarios.find().sort("is_preset", -1))
        for s in scenarios:
            s["_id"] = str(s["_id"])
        return jsonify({"scenarios": scenarios}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/scenarios", methods=["POST"])
def create_scenario():
    """Create a custom scenario."""
    try:
        data = request.json or {}
        err = _validate_scenario(data)
        if err:
            return jsonify({"error": err}), 400

        now = datetime.utcnow().isoformat() + "Z"
        scenario = {
            "scenario_id": data["scenario_id"],
            "name": data.get("name", data["scenario_id"]),
            "description": data.get("description", ""),
            "is_preset": False,
            # runtime params
            "event_rate": max(1, min(int(data.get("event_rate", 10)), 500)),
            "force_severity": data.get("force_severity") or None,
            "force_zone": data.get("force_zone") or None,
            # domain weights: 1–10, default 1 for unspecified
            "domain_weights": _clean_weights(data.get("domain_weights", {})),
            "created_at": now,
            "updated_at": now,
        }
        if db.scenarios.find_one({"scenario_id": scenario["scenario_id"]}):
            return jsonify({"error": "scenario_id already exists"}), 409

        result = db.scenarios.insert_one(scenario)
        scenario["_id"] = str(result.inserted_id)
        return jsonify(scenario), 201
    except Exception as e:
        logger.error("Error creating scenario: %s", e)
        return jsonify({"error": str(e)}), 500


@app.route("/api/scenarios/<scenario_id>", methods=["PUT"])
def update_scenario(scenario_id):
    try:
        existing = db.scenarios.find_one({"scenario_id": scenario_id})
        if not existing:
            return jsonify({"error": "Scenario not found"}), 404
        if existing.get("is_preset"):
            return jsonify(
                {"error": "Built-in presets cannot be edited. Clone them first."}
            ), 403

        data = request.json or {}
        err = _validate_scenario(data, is_update=True)
        if err:
            return jsonify({"error": err}), 400

        update = {}
        for field in ("name", "description", "force_severity", "force_zone"):
            if field in data:
                update[field] = data[field] or None
        if "event_rate" in data:
            update["event_rate"] = max(1, min(int(data["event_rate"]), 20))
        if "domain_weights" in data:
            update["domain_weights"] = _clean_weights(data["domain_weights"])
        update["updated_at"] = datetime.utcnow().isoformat() + "Z"

        db.scenarios.update_one({"scenario_id": scenario_id}, {"$set": update})
        result = db.scenarios.find_one({"scenario_id": scenario_id})
        result["_id"] = str(result["_id"])
        return jsonify(result), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/scenarios/<scenario_id>", methods=["DELETE"])
def delete_scenario(scenario_id):
    try:
        existing = db.scenarios.find_one({"scenario_id": scenario_id})
        if not existing:
            return jsonify({"error": "Scenario not found"}), 404
        if existing.get("is_preset"):
            return jsonify({"error": "Built-in presets cannot be deleted."}), 403
        db.scenarios.delete_one({"scenario_id": scenario_id})
        return jsonify({"deleted": scenario_id}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/scenarios/<scenario_id>/activate", methods=["POST"])
def activate_scenario(scenario_id):
    """Make the simulator switch to this scenario immediately."""
    try:
        scenario = db.scenarios.find_one({"scenario_id": scenario_id})
        if not scenario:
            return jsonify({"error": "Scenario not found"}), 404

        cfg_update = {
            "active_scenario_id": scenario_id,
            "event_rate": scenario.get("event_rate", 10),
            "force_severity": scenario.get("force_severity") or None,
            "force_zone": scenario.get("force_zone") or None,
            "force_domain": None,  # scenarios use domain_weights, not a single forced domain
            "paused": False,
            "updated_at": datetime.utcnow().isoformat() + "Z",
        }
        db.simulator_config.update_one(
            {"_id": "main"}, {"$set": cfg_update}, upsert=True
        )

        cfg = db.simulator_config.find_one({"_id": "main"})
        cfg.pop("_id", None)
        return jsonify(cfg), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/scenarios/<scenario_id>/clone", methods=["POST"])
def clone_scenario(scenario_id):
    """Clone any scenario (preset or custom) into a new editable one."""
    try:
        source = db.scenarios.find_one({"scenario_id": scenario_id})
        if not source:
            return jsonify({"error": "Scenario not found"}), 404

        data = request.json or {}
        new_id = data.get("new_scenario_id", f"{scenario_id}_copy")
        new_name = data.get("new_name", f"{source.get('name', scenario_id)} (copy)")

        if db.scenarios.find_one({"scenario_id": new_id}):
            return jsonify({"error": f"scenario_id '{new_id}' already exists"}), 409

        now = datetime.utcnow().isoformat() + "Z"
        clone = {
            "scenario_id": new_id,
            "name": new_name,
            "description": data.get("description", source.get("description", "")),
            "is_preset": False,
            "event_rate": source.get("event_rate", 10),
            "force_severity": source.get("force_severity"),
            "force_zone": source.get("force_zone"),
            "domain_weights": source.get("domain_weights", {}),
            "created_at": now,
            "updated_at": now,
        }
        result = db.scenarios.insert_one(clone)
        clone["_id"] = str(result.inserted_id)
        return jsonify(clone), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Helpers ───────────────────────────────────────────────────────────────────


def _validate_scenario(data: dict, is_update: bool = False) -> str | None:
    if not is_update and not data.get("scenario_id", "").strip():
        return "scenario_id is required"
    if "force_severity" in data and data["force_severity"] not in (
        ALL_SEVERITIES + [None, ""]
    ):
        return f"force_severity must be one of {ALL_SEVERITIES} or empty"
    if "force_zone" in data and data["force_zone"] not in (ALL_ZONES + [None, ""]):
        return f"force_zone must be one of {ALL_ZONES} or empty"
    if "domain_weights" in data:
        for domain, w in data["domain_weights"].items():
            if domain not in ALL_DOMAINS:
                return f"Unknown domain '{domain}'"
            try:
                if not (1 <= int(w) <= 10):
                    return f"Weight for '{domain}' must be between 1 and 10"
            except (ValueError, TypeError):
                return f"Weight for '{domain}' must be an integer"
    return None


def _clean_weights(raw: dict) -> dict:
    """Keep only valid domains, clamp 1-10, default missing ones to 1."""
    out = {}
    for d in ALL_DOMAINS:
        try:
            out[d] = max(1, min(int(raw.get(d, 1)), 10))
        except (ValueError, TypeError):
            out[d] = 1
    return out


def _default_sim_config() -> dict:
    return {
        "event_rate": 3,
        "paused": True,
        "active_scenario_id": "test_downtown_congestion",
        "force_domain": None,
        "force_zone": None,
        "force_severity": None,
        "updated_at": datetime.utcnow().isoformat() + "Z",
    }


# ── Error handlers ────────────────────────────────────────────────────────────


@app.errorhandler(404)
def not_found(_):
    return jsonify({"error": "Not found"}), 404


@app.errorhandler(500)
def server_error(_):
    return jsonify({"error": "Internal server error"}), 500


# ── Seed data ─────────────────────────────────────────────────────────────────


def _load_json_file(path: Path) -> list:
    """Load a JSON file that must contain a top-level list. Returns [] on error."""
    try:
        if not path.exists():
            logger.warning("Config file not found: %s", path)
            return []
        with path.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
        if not isinstance(data, list):
            logger.error(
                "Expected a JSON array in %s, got %s", path, type(data).__name__
            )
            return []
        return data
    except Exception as e:
        logger.error("Failed to load %s: %s", path, e)
        return []


def seed_default_patterns():
    """
    Reconcile system-managed patterns with config/patterns/default_patterns.json.

    The JSON file is the single source of truth. System-seeded patterns
    (created_by='system') are wiped and re-inserted on every startup so a
    rebuild always reflects the JSON. User-created patterns are preserved.
    """
    defaults = _load_json_file(DEFAULT_PATTERNS_PATH)
    if not defaults:
        logger.warning(
            "No default patterns loaded from %s — skipping seed", DEFAULT_PATTERNS_PATH
        )
        return

    now = datetime.utcnow().isoformat() + "Z"
    removed = db.patterns.delete_many({"created_by": "system"}).deleted_count

    docs = []
    for p in defaults:
        if "pattern_id" not in p or "epl_rule" not in p:
            logger.warning("Skipping malformed pattern entry: %s", p)
            continue
        doc = dict(p)
        doc.setdefault("enabled", True)
        doc.setdefault("severity", "medium")
        doc.setdefault("input_domains", [])
        doc.setdefault("uses_enrichment", False)
        doc.setdefault("version", 1)
        doc["created_by"] = "system"
        doc["created_at"] = now
        doc["updated_at"] = now
        doc["match_count"] = 0
        docs.append(doc)

    if docs:
        db.patterns.insert_many(docs)
        db.patterns.create_index("pattern_id", unique=True)
    logger.info(
        "Seeded %d pattern(s) from %s (removed %d stale system patterns)",
        len(docs),
        DEFAULT_PATTERNS_PATH,
        removed,
    )


def seed_default_scenarios():
    """
    Reconcile preset scenarios with config/scenarios/default_scenarios.json.

    The JSON file is the single source of truth. Preset scenarios
    (is_preset=True) are wiped and re-inserted on every startup. User-created
    scenarios are preserved.
    """
    defaults = _load_json_file(DEFAULT_SCENARIOS_PATH)
    if not defaults:
        logger.warning(
            "No default scenarios loaded from %s — skipping seed",
            DEFAULT_SCENARIOS_PATH,
        )
        return

    now = datetime.utcnow().isoformat() + "Z"
    removed = db.scenarios.delete_many({"is_preset": True}).deleted_count

    docs = []
    for s in defaults:
        if "scenario_id" not in s:
            logger.warning("Skipping malformed scenario entry: %s", s)
            continue
        doc = dict(s)
        doc["is_preset"] = True
        doc["created_at"] = now
        doc["updated_at"] = now
        doc.setdefault("event_rate", 5)
        doc.setdefault("force_severity", None)
        doc.setdefault("force_zone", None)
        doc.setdefault("domain_weights", {d: 1 for d in ALL_DOMAINS})
        docs.append(doc)

    if docs:
        db.scenarios.insert_many(docs)
        db.scenarios.create_index("scenario_id", unique=True)
    logger.info(
        "Seeded %d scenario(s) from %s (removed %d stale presets)",
        len(docs),
        DEFAULT_SCENARIOS_PATH,
        removed,
    )


def seed_simulator_config():
    if db.simulator_config.count_documents({"_id": "main"}) == 0:
        cfg = _default_sim_config()
        cfg["_id"] = "main"
        db.simulator_config.insert_one(cfg)
        logger.info("Seeded default simulator config")


def reset_runtime_data_if_new_build():
    """
    Detects a fresh build by comparing the build marker baked into the image
    (/app/.build_id, regenerated by Dockerfile on every rebuild of the COPY
    layer) with the value previously stored in MongoDB (db.meta._id='build').

    When the values differ — or when the env var RESET_DB_ON_START is truthy —
    all transient collections are wiped so the next startup produces a clean
    slate before the JSON seeders re-populate patterns and scenarios.
    Collections preserved: 'meta' (build marker), 'patterns' and 'scenarios'
    are fully reset by their own seeders immediately after.
    """
    marker_path = Path("/app/.build_id")
    current_build = (
        marker_path.read_text().strip() if marker_path.exists() else "unknown"
    )
    stored = db.meta.find_one({"_id": "build"})
    stored_build = stored.get("build_id") if stored else None

    forced = os.getenv("RESET_DB_ON_START", "").lower() in ("1", "true", "yes")
    if stored_build == current_build and not forced:
        logger.info("Build marker unchanged (%s) — skipping DB reset", current_build)
        return

    reason = (
        "RESET_DB_ON_START=true"
        if forced
        else f"new build detected ({stored_build} → {current_build})"
    )
    logger.warning("Wiping runtime MongoDB collections: %s", reason)

    collections_to_wipe = [
        "events",
        "complex_events",
        "simulator_config",
        "patterns",
        "scenarios",
    ]
    for name in collections_to_wipe:
        result = db[name].delete_many({})
        logger.info("  • %s: removed %d document(s)", name, result.deleted_count)

    db.meta.replace_one(
        {"_id": "build"},
        {
            "_id": "build",
            "build_id": current_build,
            "reset_at": datetime.utcnow().isoformat() + "Z",
        },
        upsert=True,
    )
    logger.info("Runtime data reset complete; seeders will re-populate from JSON")


if __name__ == "__main__":
    logger.info("Starting UCIS API Backend...")
    reset_runtime_data_if_new_build()
    seed_default_patterns()
    seed_default_scenarios()
    seed_simulator_config()
    app.run(host="0.0.0.0", port=5000, debug=os.getenv("FLASK_DEBUG", False))
