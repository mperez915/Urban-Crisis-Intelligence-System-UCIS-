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
    """Provides contextual enrichment data"""

    def __init__(self):
        self.risk_zones = {
            "downtown": {"risk_level": "high", "population_density": "very_high"},
            "suburbs": {"risk_level": "medium", "population_density": "medium"},
            "industrial": {"risk_level": "high", "population_density": "low"},
            "residential": {"risk_level": "low", "population_density": "medium"},
            "airport": {"risk_level": "critical", "population_density": "high"},
        }

    def get_zone_context(self, zone: str) -> Dict[str, Any]:
        """Get geographic context for a zone"""
        return self.risk_zones.get(zone, {"risk_level": "unknown"})


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

            # Add geographic coordinates if available
            if zone in ["downtown", "airport"]:
                enriched["enrichment"]["coordinates"] = {
                    "latitude": 40.7128 + (hash(zone) % 100) / 10000,
                    "longitude": -74.0060 + (hash(zone) % 100) / 10000,
                }

            return enriched
        except Exception as e:
            logger.error(f"Error enriching event: {e}")
            return event

    def process_event(self, ch, method, properties, body):
        """RabbitMQ message callback"""
        try:
            event = json.loads(body)
            logger.debug(f"Received event: {event.get('id')}")

            # Enrich event
            enriched_event = self.enrich_event(event)

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

            logger.debug(f"Published enriched event: {routing_key}")

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
