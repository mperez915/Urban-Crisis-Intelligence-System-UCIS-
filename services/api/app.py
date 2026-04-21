#!/usr/bin/env python3
"""UCIS REST API Backend"""

import logging
import os
from datetime import datetime, timedelta

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

ALL_DOMAINS   = ["traffic", "climate", "health", "environment", "population"]
ALL_ZONES     = ["downtown", "suburbs", "industrial", "residential", "airport"]
ALL_SEVERITIES = ["low", "medium", "high", "critical"]


# ── Health ────────────────────────────────────────────────────────────────────

@app.route("/health")
def health():
    try:
        db.command("ping")
        return jsonify({"status": "healthy", "service": "api", "mongo": "connected"}), 200
    except Exception as e:
        return jsonify({"status": "unhealthy", "error": str(e)}), 500


# ── Events ────────────────────────────────────────────────────────────────────

@app.route("/api/events")
def list_events():
    try:
        limit    = min(int(request.args.get("limit", 100)), 500)
        skip     = int(request.args.get("skip", 0))
        query    = {}
        if request.args.get("domain"):   query["domain"]   = request.args["domain"]
        if request.args.get("zone"):     query["zone"]     = request.args["zone"]
        if request.args.get("severity"): query["severity"] = request.args["severity"]

        events = list(db.events.find(query).sort("timestamp", -1).skip(skip).limit(limit))
        for e in events:
            e["_id"] = str(e["_id"])
        count = db.events.count_documents(query)
        return jsonify({"events": events, "count": count, "limit": limit, "skip": skip}), 200
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
    try:
        limit  = min(int(request.args.get("limit", 100)), 500)
        skip   = int(request.args.get("skip", 0))
        query  = {}
        if request.args.get("pattern_id"):  query["pattern_id"]  = request.args["pattern_id"]
        if request.args.get("alert_level"): query["alert_level"] = request.args["alert_level"]

        events = list(db.complex_events.find(query).sort("timestamp", -1).skip(skip).limit(limit))
        for e in events:
            e["_id"] = str(e["_id"])
        count = db.complex_events.count_documents(query)
        return jsonify({"events": events, "count": count, "limit": limit, "skip": skip}), 200
    except Exception as e:
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
        now  = datetime.utcnow().isoformat() + "Z"
        pattern = {
            "pattern_id":    data["pattern_id"],
            "name":          data.get("name", ""),
            "description":   data.get("description", ""),
            "epl_rule":      data["epl_rule"],
            "severity":      data.get("severity", "medium"),
            "enabled":       data.get("enabled", True),
            "input_domains": data.get("input_domains", []),
            "match_count":   0,
            "created_at":    now,
            "updated_at":    now,
        }
        result = db.patterns.insert_one(pattern)
        return jsonify({"_id": str(result.inserted_id), "pattern_id": pattern["pattern_id"]}), 201
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
    Returns event counts bucketed by time.
    Uses 10-second buckets for the last 10 minutes (good for fast simulations),
    and falls back to 1-minute buckets for the full last hour when there are
    enough spread-out data points.
    The client receives both series and a 'granularity' hint.
    """
    try:
        now          = datetime.utcnow()
        ten_min_ago  = now - timedelta(minutes=10)
        one_hour_ago = now - timedelta(hours=1)

        ten_min_ago_iso  = ten_min_ago.isoformat() + "Z"
        one_hour_ago_iso = one_hour_ago.isoformat() + "Z"

        def _date_expr():
            return {"$cond": [
                {"$ifNull": ["$created_at", False]},
                "$created_at",
                {"$toDate": "$timestamp"},
            ]}

        # ── 10-second buckets for last 10 minutes ──────────────────────────
        pipeline_10s = [
            {"$match": {"$or": [
                {"created_at": {"$gte": ten_min_ago}},
                {"timestamp":  {"$gte": ten_min_ago_iso}},
            ]}},
            {"$group": {
                "_id": {"$dateToString": {
                    "format": "%Y-%m-%dT%H:%M:%S0Z",   # truncate to 10s
                    "date":   _date_expr(),
                }},
                "count": {"$sum": 1},
            }},
            {"$sort": {"_id": 1}},
        ]

        # Truncating to 10s with string manipulation: keep first 18 chars + "0Z"
        # MongoDB doesn't have a built-in 10s bucket, so we truncate the seconds digit
        # by flooring seconds to the nearest 10. We do this via $subtract on epoch ms.
        pipeline_10s = [
            {"$match": {"$or": [
                {"created_at": {"$gte": ten_min_ago}},
                {"timestamp":  {"$gte": ten_min_ago_iso}},
            ]}},
            {"$addFields": {
                "_ts": {"$toLong": _date_expr()},
            }},
            {"$group": {
                "_id": {
                    "$subtract": ["$_ts", {"$mod": ["$_ts", 10000]}]
                },
                "count": {"$sum": 1},
            }},
            {"$sort": {"_id": 1}},
            {"$project": {
                "_id": {"$dateToString": {
                    "format": "%H:%M:%S",
                    "date": {"$toDate": "$_id"},
                }},
                "count": 1,
            }},
        ]

        # ── 1-minute buckets for last hour ────────────────────────────────
        pipeline_1m = [
            {"$match": {"$or": [
                {"created_at": {"$gte": one_hour_ago}},
                {"timestamp":  {"$gte": one_hour_ago_iso}},
            ]}},
            {"$group": {
                "_id": {"$dateToString": {
                    "format": "%H:%M",
                    "date": _date_expr(),
                }},
                "count": {"$sum": 1},
            }},
            {"$sort": {"_id": 1}},
        ]

        data_10s = list(db.events.aggregate(pipeline_10s))
        data_1m  = list(db.events.aggregate(pipeline_1m))

        # Choose which series to return:
        # prefer 10s if it has more than 1 bucket (spread across time),
        # otherwise fall back to 1m so the chart always has context.
        if len(data_10s) > 1:
            return jsonify({"data": data_10s, "granularity": "10s", "label": "Events per 10 s (last 10 min)"}), 200
        else:
            return jsonify({"data": data_1m,  "granularity": "1m",  "label": "Events per minute (last hour)"}), 200

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
        return jsonify({
            "zone": zone,
            "event_count":         db.events.count_documents({"zone": zone}),
            "complex_event_count": db.complex_events.count_documents({"zone": zone}),
        }), 200
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
    """
    try:
        data    = request.json or {}
        allowed = {"event_rate", "paused", "active_scenario_id",
                   "force_domain", "force_zone", "force_severity"}
        update  = {k: v for k, v in data.items() if k in allowed}

        if "event_rate" in update:
            update["event_rate"] = max(1, min(int(update["event_rate"]), 20))
        if "force_domain" in update and update["force_domain"] not in (ALL_DOMAINS + [None, ""]):
            return jsonify({"error": f"Invalid domain. Choose from: {ALL_DOMAINS}"}), 400
        if "force_zone" in update and update["force_zone"] not in (ALL_ZONES + [None, ""]):
            return jsonify({"error": f"Invalid zone. Choose from: {ALL_ZONES}"}), 400
        if "force_severity" in update and update["force_severity"] not in (ALL_SEVERITIES + [None, ""]):
            return jsonify({"error": f"Invalid severity. Choose from: {ALL_SEVERITIES}"}), 400

        update["updated_at"] = datetime.utcnow().isoformat() + "Z"
        db.simulator_config.update_one({"_id": "main"}, {"$set": update}, upsert=True)
        cfg = db.simulator_config.find_one({"_id": "main"})
        cfg.pop("_id", None)
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
        err  = _validate_scenario(data)
        if err:
            return jsonify({"error": err}), 400

        now = datetime.utcnow().isoformat() + "Z"
        scenario = {
            "scenario_id":     data["scenario_id"],
            "name":            data.get("name", data["scenario_id"]),
            "description":     data.get("description", ""),
            "is_preset":       False,
            # runtime params
            "event_rate":      max(1, min(int(data.get("event_rate", 10)), 500)),
            "force_severity":  data.get("force_severity") or None,
            "force_zone":      data.get("force_zone") or None,
            # domain weights: 1–10, default 1 for unspecified
            "domain_weights":  _clean_weights(data.get("domain_weights", {})),
            "created_at":      now,
            "updated_at":      now,
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
            return jsonify({"error": "Built-in presets cannot be edited. Clone them first."}), 403

        data = request.json or {}
        err  = _validate_scenario(data, is_update=True)
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
            "event_rate":         scenario.get("event_rate", 10),
            "force_severity":     scenario.get("force_severity") or None,
            "force_zone":         scenario.get("force_zone") or None,
            "force_domain":       None,   # scenarios use domain_weights, not a single forced domain
            "paused":             False,
            "updated_at":         datetime.utcnow().isoformat() + "Z",
        }
        db.simulator_config.update_one({"_id": "main"}, {"$set": cfg_update}, upsert=True)

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

        data       = request.json or {}
        new_id     = data.get("new_scenario_id", f"{scenario_id}_copy")
        new_name   = data.get("new_name", f"{source.get('name', scenario_id)} (copy)")

        if db.scenarios.find_one({"scenario_id": new_id}):
            return jsonify({"error": f"scenario_id '{new_id}' already exists"}), 409

        now  = datetime.utcnow().isoformat() + "Z"
        clone = {
            "scenario_id":    new_id,
            "name":           new_name,
            "description":    data.get("description", source.get("description", "")),
            "is_preset":      False,
            "event_rate":     source.get("event_rate", 10),
            "force_severity": source.get("force_severity"),
            "force_zone":     source.get("force_zone"),
            "domain_weights": source.get("domain_weights", {}),
            "created_at":     now,
            "updated_at":     now,
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
    if "force_severity" in data and data["force_severity"] not in (ALL_SEVERITIES + [None, ""]):
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
        "event_rate": 3, "paused": False,
        "active_scenario_id": "normal",
        "force_domain": None, "force_zone": None, "force_severity": None,
        "updated_at": datetime.utcnow().isoformat() + "Z",
    }


# ── Error handlers ────────────────────────────────────────────────────────────

@app.errorhandler(404)
def not_found(_): return jsonify({"error": "Not found"}), 404

@app.errorhandler(500)
def server_error(_): return jsonify({"error": "Internal server error"}), 500


# ── Seed data ─────────────────────────────────────────────────────────────────

def seed_default_patterns():
    if db.patterns.count_documents({}) > 0:
        return
    now = datetime.utcnow().isoformat() + "Z"
    defaults = [
        {"pattern_id": "high_traffic_congestion_enriched",         "name": "High Traffic Congestion in Risk Zone",                "description": "Detects sustained high-severity traffic congestion in high-risk zones.",               "epl_rule": "SELECT zone, COUNT(*) as incident_count, AVG(average_speed_kmh) as avg_speed FROM TrafficEvent(type='congestion', severity in ('high','critical')).win:time(10 min) GROUP BY zone HAVING COUNT(*) >= 2",                                                                                                                                                    "severity": "high",     "input_domains": ["traffic"]},
        {"pattern_id": "accident_with_insufficient_response",       "name": "Critical Accident — Insufficient Response",          "description": "Detects critical traffic accidents in zones with limited hospital or police access.",   "epl_rule": "SELECT zone, type, severity FROM TrafficEvent WHERE type='accident' AND severity='critical'",                                                                                                                                                                                                                                                                                                 "severity": "critical", "input_domains": ["traffic"]},
        {"pattern_id": "hazardous_weather_in_critical_zone",        "name": "Severe Weather in Critical Zone",                    "description": "Detects severe weather correlating with accidents in critical zones.",                  "epl_rule": "SELECT * FROM PATTERN [c=ClimateEvent(type='storm', severity='high') -> t=TrafficEvent(type='accident')] WHERE c.zone = t.zone",                                                                                                                                                                                                                                                                          "severity": "critical", "input_domains": ["climate", "traffic"]},
        {"pattern_id": "air_quality_health_emergency_correlation",  "name": "Poor Air Quality → Health Emergencies",             "description": "Correlates poor air quality with respiratory/cardiac emergency calls.",                "epl_rule": "SELECT a.zone, a.aqi, COUNT(h) as emergency_calls FROM PATTERN [a=EnvironmentEvent(type='air_quality', severity in ('high','critical')) -> h=HealthEvent(type='emergency_call', call_type in ('respiratory','cardiac'))].win:time(30 min) WHERE a.zone = h.zone GROUP BY a.zone, a.aqi",                                                                                                                        "severity": "high",     "input_domains": ["environment", "health"]},
        {"pattern_id": "crowd_alert_in_low_response_zone",          "name": "Large Crowd — Limited Emergency Response",          "description": "Detects large crowds in zones with limited emergency service response.",               "epl_rule": "SELECT zone, location, SUM(estimated_population) as total_population FROM PopulationEvent(type in ('gathering','crowd_alert'), severity in ('high','critical')).win:time(5 min) GROUP BY zone, location HAVING SUM(estimated_population) > 5000",                                                                                                                                                       "severity": "high",     "input_domains": ["population"]},
        {"pattern_id": "emergency_services_overwhelmed",            "name": "Emergency Services Overwhelmed",                    "description": "Detects surge in emergency calls within a short time window.",                        "epl_rule": "SELECT zone, COUNT(*) as emergency_count FROM HealthEvent(type='emergency_call', severity in ('high','critical')).win:time(10 min) GROUP BY zone HAVING COUNT(*) >= 5",                                                                                                                                                                                                                                       "severity": "critical", "input_domains": ["health"]},
        {"pattern_id": "critical_pollution_spike",                  "name": "Critical Pollution Spike",                          "description": "Alerts on critical pollution levels with AQI above 400.",                             "epl_rule": "SELECT zone, type, severity, aqi FROM EnvironmentEvent(severity='critical').win:time(1 min) WHERE aqi > 400",                                                                                                                                                                                                                                                                                            "severity": "critical", "input_domains": ["environment"]},
        {"pattern_id": "multi_domain_crisis_critical_zone",         "name": "Multi-Domain Crisis — Critical Zone",               "description": "Simultaneous critical events across traffic, weather, and population.",               "epl_rule": "SELECT t.zone, COUNT(*) as event_count FROM PATTERN [t=TrafficEvent(severity='critical') and c=ClimateEvent(severity='critical') and p=PopulationEvent(severity='critical')] WHERE t.zone = c.zone AND c.zone = p.zone",                                                                                                                                                                                "severity": "critical", "input_domains": ["traffic", "climate", "population"]},
    ]
    for p in defaults:
        p.update({"uses_enrichment": True, "version": 2, "created_by": "system",
                  "enabled": True, "created_at": now, "updated_at": now, "match_count": 0})
    db.patterns.insert_many(defaults)
    logger.info("Seeded %d default patterns", len(defaults))


def seed_default_scenarios():
    if db.scenarios.count_documents({"is_preset": True}) > 0:
        return
    now = datetime.utcnow().isoformat() + "Z"
    presets = [
        {
            "scenario_id": "normal",
            "name": "Normal Operations",
            "description": "Balanced sensor readings across all domains. Good baseline for demos — low noise, occasional medium-severity events.",
            "event_rate": 3,
            "force_severity": None,
            "force_zone": None,
            "domain_weights": {"traffic": 2, "climate": 2, "health": 2, "environment": 2, "population": 2},
        },
        {
            "scenario_id": "rush_hour",
            "name": "Rush Hour",
            "description": "Elevated traffic and population readings across downtown and suburbs, as would be seen during peak commute hours.",
            "event_rate": 5,
            "force_severity": None,
            "force_zone": None,
            "domain_weights": {"traffic": 6, "climate": 1, "health": 2, "environment": 2, "population": 4},
        },
        {
            "scenario_id": "industrial_pollution",
            "name": "Industrial Pollution Spike",
            "description": "Critical AQI sensor readings in the industrial zone, correlating with respiratory health emergencies nearby.",
            "event_rate": 5,
            "force_severity": "critical",
            "force_zone": "industrial",
            "domain_weights": {"traffic": 1, "climate": 1, "health": 4, "environment": 8, "population": 1},
        },
        {
            "scenario_id": "mass_event",
            "name": "Mass Public Event",
            "description": "Large crowd gathering downtown triggering population density alerts and elevated health and traffic incidents.",
            "event_rate": 6,
            "force_severity": None,
            "force_zone": "downtown",
            "domain_weights": {"traffic": 4, "climate": 1, "health": 4, "environment": 1, "population": 8},
        },
        {
            "scenario_id": "storm_crisis",
            "name": "Severe Storm Crisis",
            "description": "Extreme weather sensor readings driving traffic accidents and health emergencies across all zones.",
            "event_rate": 6,
            "force_severity": "high",
            "force_zone": None,
            "domain_weights": {"traffic": 4, "climate": 8, "health": 3, "environment": 2, "population": 1},
        },
        {
            "scenario_id": "multi_domain_crisis",
            "name": "Multi-Domain Urban Crisis",
            "description": "Simultaneous critical sensor failures across all domains and zones — maximum stress scenario for CEP pattern detection.",
            "event_rate": 10,
            "force_severity": "critical",
            "force_zone": None,
            "domain_weights": {"traffic": 3, "climate": 3, "health": 3, "environment": 3, "population": 3},
        },
    ]
    for s in presets:
        s.update({"is_preset": True, "created_at": now, "updated_at": now})
    db.scenarios.insert_many(presets)
    # Ensure unique index on scenario_id
    db.scenarios.create_index("scenario_id", unique=True)
    logger.info("Seeded %d preset scenarios", len(presets))


def seed_simulator_config():
    if db.simulator_config.count_documents({"_id": "main"}) == 0:
        cfg = _default_sim_config()
        cfg["_id"] = "main"
        db.simulator_config.insert_one(cfg)
        logger.info("Seeded default simulator config")


if __name__ == "__main__":
    logger.info("Starting UCIS API Backend...")
    seed_default_patterns()
    seed_default_scenarios()
    seed_simulator_config()
    app.run(host="0.0.0.0", port=5000, debug=os.getenv("FLASK_DEBUG", False))
