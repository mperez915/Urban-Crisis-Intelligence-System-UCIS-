#!/usr/bin/env python3
"""
UCIS Multi-Domain Event Simulator

Generates realistic IoT events from multiple domains:
- Climate (temperature, humidity, storms)
- Traffic (congestion, accidents)
- Health (emergency calls, ambulance dispatch)
- Environment (air quality, pollution)
- Population Density (crowds, gatherings)

All events are published to RabbitMQ with proper routing keys AND persisted to MongoDB.
"""

import json
import logging
import os
import sys
import time
from datetime import datetime
from typing import Any, Dict

import pika
from pymongo import MongoClient
from event_generators import (
    ClimateEventGenerator,
    EnvironmentEventGenerator,
    HealthEventGenerator,
    PopulationEventGenerator,
    TrafficEventGenerator,
)

# Configure logging
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


class EventSimulator:
    """Main event simulator that orchestrates all event generators"""

    def __init__(self):
        self.rabbitmq_host = os.getenv("RABBITMQ_HOST", "localhost")
        self.rabbitmq_port = int(os.getenv("RABBITMQ_PORT", 5672))
        self.rabbitmq_username = os.getenv("RABBITMQ_USERNAME", "guest")
        self.rabbitmq_password = os.getenv("RABBITMQ_PASSWORD", "guest")
        self.event_rate = int(os.getenv("EVENT_RATE", 100))
        
        self.mongo_uri = os.getenv(
            "MONGO_URI", "mongodb://admin:admin123@localhost:27017/ucis_db?authSource=admin"
        )

        self.connection = None
        self.channel = None
        self.mongo = None

        # Initialize event generators
        self.generators = {
            "climate": ClimateEventGenerator(),
            "traffic": TrafficEventGenerator(),
            "health": HealthEventGenerator(),
            "environment": EnvironmentEventGenerator(),
            "population": PopulationEventGenerator(),
        }

        logger.info(
            f"Event Simulator initialized with rate: {self.event_rate} events/sec"
        )

    def connect_rabbitmq(self):
        """Establish connection to RabbitMQ"""
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

            # Declare exchange
            self.channel.exchange_declare(
                exchange="ucis.events", exchange_type="topic", durable=True
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

    def publish_event(self, event: Dict[str, Any], domain: str) -> bool:
        """
        Publish event to RabbitMQ

        Args:
            event: Event dictionary
            domain: Event domain (climate, traffic, etc.)

        Returns:
            True if published successfully
        """
        try:
            routing_key = f"events.{domain}.{event.get('type', 'generic')}"

            self.channel.basic_publish(
                exchange="ucis.events",
                routing_key=routing_key,
                body=json.dumps(event),
                properties=pika.BasicProperties(
                    content_type="application/json",
                    delivery_mode=2,  # Persistent
                ),
            )
            return True
        except Exception as e:
            logger.error(f"Failed to publish event: {e}")
            return False
    
    def save_event(self, event: Dict[str, Any]) -> bool:
        """
        Save event to MongoDB
        
        Args:
            event: Event dictionary
            
        Returns:
            True if saved successfully
        """
        try:
            db = self.mongo.ucis_db
            event["created_at"] = datetime.utcnow()
            db.events.insert_one(event)
            return True
        except Exception as e:
            logger.error(f"Failed to save event to MongoDB: {e}")
            return False

    def run(self):
        """Main simulation loop"""
        try:
            logger.info("Connecting to RabbitMQ...")
            self.connect_rabbitmq()
            logger.info("Connecting to MongoDB...")
            self.connect_mongodb()
            logger.info("Both connections established. Starting event generation...")

            event_count = 0
            last_report = time.time()

            while True:
                # Generate random event from random domain
                import random

                domain = random.choice(list(self.generators.keys()))
                generator = self.generators[domain]

                # Generate event
                event = generator.generate()

                # Publish to RabbitMQ and save to MongoDB
                published = self.publish_event(event, domain)
                saved = self.save_event(event)
                
                if published and saved:
                    event_count += 1

                    # Log progress every 1000 events
                    if event_count % 1000 == 0:
                        elapsed = time.time() - last_report
                        rate = 1000 / elapsed
                        logger.info(
                            f"Published {event_count} events (@{rate:.2f} evt/sec)"
                        )
                        last_report = time.time()

                # Rate limiting
                time.sleep(1.0 / self.event_rate)

        except KeyboardInterrupt:
            logger.info("Simulator stopped by user")
        except Exception as e:
            logger.error(f"Simulator error: {e}", exc_info=True)
        finally:
            if self.connection:
                self.connection.close()
                logger.info("RabbitMQ connection closed")
            if self.mongo:
                self.mongo.close()
                logger.info("MongoDB connection closed")


if __name__ == "__main__":
    simulator = EventSimulator()
    simulator.run()
