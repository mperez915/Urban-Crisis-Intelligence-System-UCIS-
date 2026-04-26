#!/usr/bin/env python3
"""
UCIS Event Enricher

Enriches raw events with contextual data:
- Geographic risk zones
- Historical patterns
- Population density
- Environmental conditions
"""

import json
import logging
import os
import sys
import threading
import time
from datetime import datetime
from typing import Any, Dict

import pika
import uvicorn
from fastapi import FastAPI
from pymongo import MongoClient

# Configure logging
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# FastAPI app for health checks
app = FastAPI(title="UCIS Event Enricher")


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "enricher"}


class ContextProvider:
    """Provides contextual enrichment data from static configuration and optional MongoDB"""

    def __init__(self, config_file: str = "/app/config/zones/zone_context.json"):
        """
        Initialize context provider with zone definitions

        Args:
            config_file: Path to JSON file with zone context data
        """
        self.zone_context = {}
        self.config_file = config_file

        # Load from JSON file
        try:
            if os.path.exists(config_file):
                with open(config_file, "r") as f:
                    data = json.load(f)
                    self.zone_context = data.get("zones", {})
                logger.info(f"Loaded {len(self.zone_context)} zones from {config_file}")
            else:
                logger.warning(f"Config file not found: {config_file}, using defaults")
                self._load_defaults()
        except Exception as e:
            logger.error(f"Error loading config: {e}, using defaults")
            self._load_defaults()

    def _load_defaults(self):
        """Load default zone context when file is not available"""
        self.zone_context = {
            "downtown": {
                "risk_level": "high",
                "population_density": "very_high",
                "coordinates": {"latitude": 40.7128, "longitude": -74.0060},
                "hospitals": [
                    {"name": "Downtown Hospital", "distance_km": 2.3},
                    {"name": "Central Medical", "distance_km": 1.8},
                ],
                "police_stations": [
                    {"name": "Downtown Precinct", "distance_km": 1.8},
                ],
                "avg_response_time_min": 8.5,
            },
            "suburbs": {
                "risk_level": "medium",
                "population_density": "medium",
                "coordinates": {"latitude": 40.7580, "longitude": -73.9855},
                "hospitals": [
                    {"name": "Suburbs Medical", "distance_km": 5.2},
                ],
                "police_stations": [
                    {"name": "Suburbs Precinct", "distance_km": 4.5},
                ],
                "avg_response_time_min": 12.0,
            },
            "industrial": {
                "risk_level": "high",
                "population_density": "low",
                "coordinates": {"latitude": 40.7489, "longitude": -74.0040},
                "hospitals": [
                    {"name": "Industrial Hospital", "distance_km": 4.2},
                ],
                "police_stations": [
                    {"name": "Industrial Precinct", "distance_km": 3.5},
                ],
                "avg_response_time_min": 10.5,
            },
            "residential": {
                "risk_level": "low",
                "population_density": "medium",
                "coordinates": {"latitude": 40.7614, "longitude": -73.9776},
                "hospitals": [
                    {"name": "Residential Hospital", "distance_km": 3.5},
                ],
                "police_stations": [
                    {"name": "Residential Precinct", "distance_km": 2.8},
                ],
                "avg_response_time_min": 11.0,
            },
            "airport": {
                "risk_level": "critical",
                "population_density": "high",
                "coordinates": {"latitude": 40.6413, "longitude": -73.7781},
                "hospitals": [
                    {"name": "Airport Hospital", "distance_km": 1.5},
                    {"name": "Emergency Medical", "distance_km": 2.0},
                ],
                "police_stations": [
                    {"name": "Airport Police", "distance_km": 0.5},
                ],
                "avg_response_time_min": 5.0,
            },
        }
        logger.info(f"Loaded {len(self.zone_context)} default zones")

    def get_zone_context(self, zone: str) -> Dict[str, Any]:
        """
        Get complete geographic context for a zone

        Args:
            zone: Zone identifier

        Returns:
            Dictionary with zone context or empty dict if zone not found
        """
        if zone not in self.zone_context:
            logger.warning(f"Zone not found: {zone}")
            return {"risk_level": "unknown"}

        return self.zone_context[zone].copy()


class EventEnricher:
    """Main event enricher service"""

    def __init__(self):
        self.rabbitmq_host = os.getenv("RABBITMQ_HOST", "localhost")
        self.rabbitmq_port = int(os.getenv("RABBITMQ_PORT", 5672))
        self.rabbitmq_username = os.getenv("RABBITMQ_USERNAME", "guest")
        self.rabbitmq_password = os.getenv("RABBITMQ_PASSWORD", "guest")

        self.mongo_uri = os.getenv("MONGO_URI", "mongodb://localhost:27017/ucis_db")

        self.connection = None
        self.channel = None
        self.mongo = None

        # Pause state - polled from MongoDB to drop events when simulator is paused
        self._paused = False
        self._last_pause_check = 0.0
        self._pause_check_interval = 1.0  # seconds

        self.context_provider = ContextProvider()

        logger.info("Event Enricher initialized")

    def connect_rabbitmq(self):
        """Connect to RabbitMQ"""
        try:
            credentials = pika.PlainCredentials(
                self.rabbitmq_username, self.rabbitmq_password
            )
            parameters = pika.ConnectionParameters(
                host=self.rabbitmq_host,
                port=self.rabbitmq_port,
                credentials=credentials,
                connection_attempts=5,
                retry_delay=2,
            )
            self.connection = pika.BlockingConnection(parameters)
            self.channel = self.connection.channel()
            logger.info(
                f"Connected to RabbitMQ at {self.rabbitmq_host}:{self.rabbitmq_port}"
            )

            # Declare exchanges and queue
            self.channel.exchange_declare(
                exchange="ucis.events", exchange_type="topic", durable=True
            )

            self.channel.queue_declare(queue="ucis.enricher.events", durable=True)
            self.channel.queue_bind(
                exchange="ucis.events",
                queue="ucis.enricher.events",
                routing_key="events.#",
            )
        except Exception as e:
            logger.error(f"Failed to connect to RabbitMQ: {e}")
            raise

    def connect_mongodb(self):
        """Connect to MongoDB"""
        try:
            self.mongo = MongoClient(self.mongo_uri)
            db = self.mongo.ucis_db
            db.command("ping")
            logger.info("Connected to MongoDB")
        except Exception as e:
            logger.error(f"Failed to connect to MongoDB: {e}")
            raise

    def enrich_event(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """
        Enrich event with contextual data

        Args:
            event: Raw event from simulator

        Returns:
            Enriched event with additional context
        """
        try:
            # Get zone context
            zone = event.get("zone", "unknown")
            zone_context = self.context_provider.get_zone_context(zone)

            # Add enrichment
            enriched = event.copy()
            enriched["enrichment"] = {
                "zone_context": zone_context,
                "enriched_at": datetime.utcnow().isoformat() + "Z",
                "enriched_by": "enricher-v1",
            }

            # Add geographic coordinates from zone_context (available for all zones)
            coords = zone_context.get("coordinates")
            if coords:
                enriched["enrichment"]["coordinates"] = coords

            return enriched
        except Exception as e:
            logger.error(f"Error enriching event: {e}")
            return event

    def save_enriched_event(self, event: Dict[str, Any]):
        """Persist enriched event to MongoDB"""
        try:
            db = self.mongo.ucis_db
            doc = event.copy()
            doc["created_at"] = datetime.utcnow()
            db.events.update_one(
                {"id": doc["id"]},
                {"$set": doc},
                upsert=True,
            )
        except Exception as e:
            logger.error(f"Failed to save enriched event: {e}")

    def process_event(self, ch, method, properties, body):
        """RabbitMQ message callback"""
        try:
            # Check if simulator is paused (poll MongoDB periodically)
            now = time.time()
            if now - self._last_pause_check >= self._pause_check_interval:
                self._last_pause_check = now
                try:
                    cfg = self.mongo.ucis_db.simulator_config.find_one({"_id": "main"}) or {}
                    new_paused = bool(cfg.get("paused", False))
                    if new_paused != self._paused:
                        self._paused = new_paused
                        if new_paused:
                            logger.info("⏸️  ENRICHER PAUSED - dropping incoming events")
                        else:
                            logger.info("▶️  ENRICHER RESUMED - processing events")
                except Exception as exc:
                    logger.warning("Pause state poll failed: %s", exc)

            event = json.loads(body)

            # If paused, drop the event (don't enrich, don't forward)
            if self._paused:
                logger.debug("Dropped event (paused): %s", event.get("id", "?"))
                return

            logger.info(
                "← RECEIVED [%s/%s] id=%s zone=%s severity=%s",
                event.get("domain", "?"),
                event.get("type", "?"),
                event.get("id", "?")[:8],
                event.get("zone", "?"),
                event.get("severity", "?"),
            )

            # Enrich event
            enriched_event = self.enrich_event(event)

            # Persist enriched event to MongoDB (upsert over the raw event the simulator wrote)
            self.save_enriched_event(enriched_event)

            # Publish enriched event
            routing_key = f"events.enriched.{event.get('domain')}.{event.get('type')}"
            self.channel.basic_publish(
                exchange="ucis.events",
                routing_key=routing_key,
                body=json.dumps(enriched_event),
                properties=pika.BasicProperties(
                    content_type="application/json", delivery_mode=2
                ),
            )

            logger.info(
                "→ ENRICHED [%s] id=%s zone=%s",
                routing_key,
                event.get("id", "?")[:8],
                event.get("zone", "?"),
            )

        except Exception as e:
            logger.error(f"Error processing event: {e}")

    def run(self):
        """Main enricher loop"""
        try:
            self.connect_rabbitmq()
            self.connect_mongodb()

            logger.info("Starting event enrichment...")

            self.channel.basic_consume(
                queue="ucis.enricher.events",
                on_message_callback=self.process_event,
                auto_ack=True,
            )

            self.channel.start_consuming()

        except KeyboardInterrupt:
            logger.info("Enricher stopped by user")
        except Exception as e:
            logger.error(f"Enricher error: {e}", exc_info=True)
        finally:
            if self.connection:
                self.connection.close()
            if self.mongo:
                self.mongo.close()
            logger.info("Enricher shutdown complete")


if __name__ == "__main__":
    import threading

    # Start FastAPI health check server in background
    fastapi_thread = threading.Thread(
        target=lambda: uvicorn.run(app, host="0.0.0.0", port=8082), daemon=True
    )
    fastapi_thread.start()

    # Run enricher
    enricher = EventEnricher()
    enricher.run()
