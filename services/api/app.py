#!/usr/bin/env python3
"""
UCIS REST API Backend

Provides REST endpoints for:
- Event queries
- Pattern management
- Statistics and analytics
"""

import logging
import os
from datetime import datetime, timedelta

from flask import Flask, jsonify, request
from flask_cors import CORS
from pymongo import MongoClient

# Configure logging
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# MongoDB connection
mongo_uri = os.getenv(
    "MONGO_URI", "mongodb://admin:admin123@localhost:27017/ucis_db?authSource=admin"
)
client = MongoClient(mongo_uri)
db = client.ucis_db


# ============= Health & Status =============


@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint"""
    try:
        db.command("ping")
        return jsonify(
            {"status": "healthy", "service": "api", "mongo": "connected"}
        ), 200
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return jsonify({"status": "unhealthy", "error": str(e)}), 500


# ============= Events API =============


@app.route("/api/events", methods=["GET"])
def list_events():
    """List events with filtering and pagination"""
    try:
        limit = int(request.args.get("limit", 100))
        skip = int(request.args.get("skip", 0))
        domain = request.args.get("domain")
        zone = request.args.get("zone")
        severity = request.args.get("severity")

        query = {}
        if domain:
            query["domain"] = domain
        if zone:
            query["zone"] = zone
        if severity:
            query["severity"] = severity

        events = list(
            db.events.find(query).sort("timestamp", -1).skip(skip).limit(limit)
        )

        # Convert ObjectId to string
        for event in events:
            event["_id"] = str(event["_id"])

        count = db.events.count_documents(query)

        return jsonify(
            {"events": events, "count": count, "limit": limit, "skip": skip}
        ), 200
    except Exception as e:
        logger.error(f"Error listing events: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/events/<event_id>", methods=["GET"])
def get_event(event_id):
    """Get single event"""
    try:
        event = db.events.find_one({"id": event_id})
        if not event:
            return jsonify({"error": "Event not found"}), 404

        event["_id"] = str(event["_id"])
        return jsonify(event), 200
    except Exception as e:
        logger.error(f"Error getting event: {e}")
        return jsonify({"error": str(e)}), 500


# ============= Complex Events API =============


@app.route("/api/events/complex", methods=["GET"])
def list_complex_events():
    """List detected complex events"""
    try:
        limit = int(request.args.get("limit", 100))
        skip = int(request.args.get("skip", 0))
        pattern_id = request.args.get("pattern_id")
        alert_level = request.args.get("alert_level")

        query = {}
        if pattern_id:
            query["pattern_id"] = pattern_id
        if alert_level:
            query["alert_level"] = alert_level

        events = list(
            db.complex_events.find(query).sort("timestamp", -1).skip(skip).limit(limit)
        )

        for event in events:
            event["_id"] = str(event["_id"])

        return jsonify({"events": events}), 200
    except Exception as e:
        logger.error(f"Error listing complex events: {e}")
        return jsonify({"error": str(e)}), 500


# ============= Patterns API =============


@app.route("/api/patterns", methods=["GET"])
def list_patterns():
    """List CEP patterns"""
    try:
        patterns = list(db.patterns.find().sort("created_at", -1))

        for p in patterns:
            p["_id"] = str(p["_id"])

        return jsonify({"patterns": patterns}), 200
    except Exception as e:
        logger.error(f"Error listing patterns: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/patterns", methods=["POST"])
def create_pattern():
    """Create new pattern"""
    try:
        data = request.json

        pattern = {
            "pattern_id": data["pattern_id"],
            "name": data.get("name", ""),
            "description": data.get("description", ""),
            "epl_rule": data["epl_rule"],
            "severity": data.get("severity", "medium"),
            "enabled": data.get("enabled", True),
            "input_domains": data.get("input_domains", []),
            "created_at": datetime.utcnow().isoformat() + "Z",
            "updated_at": datetime.utcnow().isoformat() + "Z",
        }

        result = db.patterns.insert_one(pattern)

        return jsonify(
            {"_id": str(result.inserted_id), "pattern_id": pattern["pattern_id"]}
        ), 201
    except Exception as e:
        logger.error(f"Error creating pattern: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/patterns/<pattern_id>", methods=["PUT"])
def update_pattern(pattern_id):
    """Update pattern"""
    try:
        data = request.json
        data["updated_at"] = datetime.utcnow().isoformat() + "Z"

        result = db.patterns.update_one({"pattern_id": pattern_id}, {"$set": data})

        if result.matched_count == 0:
            return jsonify({"error": "Pattern not found"}), 404

        return jsonify({"modified_count": result.modified_count}), 200
    except Exception as e:
        logger.error(f"Error updating pattern: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/patterns/<pattern_id>", methods=["DELETE"])
def delete_pattern(pattern_id):
    """Delete pattern"""
    try:
        result = db.patterns.delete_one({"pattern_id": pattern_id})

        if result.deleted_count == 0:
            return jsonify({"error": "Pattern not found"}), 404

        return jsonify({"deleted_count": result.deleted_count}), 200
    except Exception as e:
        logger.error(f"Error deleting pattern: {e}")
        return jsonify({"error": str(e)}), 500


# ============= Statistics API =============


@app.route("/api/stats/events-per-minute", methods=["GET"])
def events_per_minute():
    """Get events per minute in last hour"""
    try:
        one_hour_ago = datetime.utcnow() - timedelta(hours=1)

        pipeline = [
            {"$match": {"created_at": {"$gte": one_hour_ago}}},
            {
                "$group": {
                    "_id": {
                        "$dateToString": {
                            "format": "%Y-%m-%dT%H:%M:00Z",
                            "date": "$created_at",
                        }
                    },
                    "count": {"$sum": 1},
                }
            },
            {"$sort": {"_id": 1}},
        ]

        result = list(db.events.aggregate(pipeline))
        return jsonify({"data": result}), 200
    except Exception as e:
        logger.error(f"Error getting events rate: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/stats/top-alerts", methods=["GET"])
def top_alerts():
    """Get top triggered alerts"""
    try:
        pipeline = [
            {"$group": {"_id": "$pattern_id", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 10},
        ]

        result = list(db.complex_events.aggregate(pipeline))
        return jsonify({"data": result}), 200
    except Exception as e:
        logger.error(f"Error getting top alerts: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/stats/zones/<zone>", methods=["GET"])
def zone_stats(zone):
    """Get statistics for a specific zone"""
    try:
        events = db.events.count_documents({"zone": zone})
        complex_events = db.complex_events.count_documents({"data.zone": zone})

        return jsonify(
            {"zone": zone, "event_count": events, "complex_event_count": complex_events}
        ), 200
    except Exception as e:
        logger.error(f"Error getting zone stats: {e}")
        return jsonify({"error": str(e)}), 500


# ============= Error Handlers =============


@app.errorhandler(404)
def not_found(error):
    return jsonify({"error": "Not found"}), 404


@app.errorhandler(500)
def server_error(error):
    logger.error(f"Server error: {error}")
    return jsonify({"error": "Internal server error"}), 500


def seed_default_patterns():
    if db.patterns.count_documents({}) > 0:
        return
    now = datetime.utcnow().isoformat() + "Z"
    defaults = [
        {"pattern_id": "high_traffic_congestion_enriched", "name": "High Traffic Congestion in Risk Zone", "description": "Detects sustained high-severity traffic congestion in high-risk zones.", "epl_rule": "SELECT zone, COUNT(*) as incident_count, AVG(average_speed_kmh) as avg_speed FROM TrafficEvent(type='congestion', severity in ('high','critical')).win:time(10 min) GROUP BY zone HAVING COUNT(*) >= 2", "severity": "high", "enabled": True, "input_domains": ["traffic"]},
        {"pattern_id": "accident_with_insufficient_response", "name": "Critical Accident with Insufficient Emergency Response", "description": "Detects critical traffic accidents in zones with limited hospital or police access.", "epl_rule": "SELECT zone, type, severity FROM TrafficEvent WHERE type='accident' AND severity='critical'", "severity": "critical", "enabled": True, "input_domains": ["traffic"]},
        {"pattern_id": "hazardous_weather_in_critical_zone", "name": "Severe Weather in Critical Infrastructure Zone", "description": "Detects severe weather events correlating with accidents in critical zones.", "epl_rule": "SELECT * FROM PATTERN [c=ClimateEvent(type='storm', severity='high') -> t=TrafficEvent(type='accident')] WHERE c.zone = t.zone", "severity": "critical", "enabled": True, "input_domains": ["climate", "traffic"]},
        {"pattern_id": "air_quality_health_emergency_correlation", "name": "Poor Air Quality Triggers Health Emergencies", "description": "Correlates poor air quality with respiratory/cardiac emergency calls.", "epl_rule": "SELECT a.zone, a.aqi, COUNT(h) as emergency_calls FROM PATTERN [a=EnvironmentEvent(type='air_quality', severity in ('high','critical')) -> h=HealthEvent(type='emergency_call', call_type in ('respiratory','cardiac'))].win:time(30 min) WHERE a.zone = h.zone GROUP BY a.zone, a.aqi", "severity": "high", "enabled": True, "input_domains": ["environment", "health"]},
        {"pattern_id": "crowd_alert_in_low_response_zone", "name": "Large Crowd in Zone with Limited Emergency Response", "description": "Detects large crowds in zones with limited emergency service response capability.", "epl_rule": "SELECT zone, location, SUM(estimated_population) as total_population FROM PopulationEvent(type in ('gathering','crowd_alert'), severity in ('high','critical')).win:time(5 min) GROUP BY zone, location HAVING SUM(estimated_population) > 5000", "severity": "high", "enabled": True, "input_domains": ["population"]},
        {"pattern_id": "emergency_services_overwhelmed", "name": "Emergency Services Potentially Overwhelmed", "description": "Detects surge in emergency calls within a short time window.", "epl_rule": "SELECT zone, COUNT(*) as emergency_count FROM HealthEvent(type='emergency_call', severity in ('high','critical')).win:time(10 min) GROUP BY zone HAVING COUNT(*) >= 5", "severity": "critical", "enabled": True, "input_domains": ["health"]},
        {"pattern_id": "critical_pollution_spike", "name": "Critical Pollution Spike", "description": "Alerts on critical pollution levels with AQI above 400.", "epl_rule": "SELECT zone, type, severity, aqi FROM EnvironmentEvent(severity='critical').win:time(1 min) WHERE aqi > 400", "severity": "critical", "enabled": True, "input_domains": ["environment"]},
        {"pattern_id": "multi_domain_crisis_critical_zone", "name": "Multi-Domain Crisis in Critical Infrastructure Zone", "description": "Simultaneous critical events across traffic, weather, and population in the same zone.", "epl_rule": "SELECT t.zone, COUNT(*) as event_count FROM PATTERN [t=TrafficEvent(severity='critical') and c=ClimateEvent(severity='critical') and p=PopulationEvent(severity='critical')] WHERE t.zone = c.zone AND c.zone = p.zone", "severity": "critical", "enabled": True, "input_domains": ["traffic", "climate", "population"]},
    ]
    for p in defaults:
        p.update({"uses_enrichment": True, "version": 2, "created_by": "system",
                  "created_at": now, "updated_at": now, "match_count": 0})
    db.patterns.insert_many(defaults)
    logger.info(f"Seeded {len(defaults)} default patterns into MongoDB")


if __name__ == "__main__":
    logger.info("Starting UCIS API Backend...")
    seed_default_patterns()
    app.run(host="0.0.0.0", port=5000, debug=os.getenv("FLASK_DEBUG", False))
