#!/usr/bin/env python3
"""
UCIS Multi-Domain Event Simulator

Reads a live control document from MongoDB (simulator_config) and an active
scenario document (scenarios) every CONFIG_POLL_INTERVAL seconds, so the
dashboard can change rate, scenario, zone, severity, and domain weights at
runtime without restarting the container.
"""

import json
import logging
import os
import random
import time
from datetime import datetime
from typing import Any, Dict, Optional

import pika
from event_generators import (
    ClimateEventGenerator,
    EnvironmentEventGenerator,
    HealthEventGenerator,
    PopulationEventGenerator,
    TrafficEventGenerator,
)
from pymongo import MongoClient

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

CONFIG_POLL_INTERVAL = 1   # seconds between MongoDB config re-reads (fast pause response)
ALL_DOMAINS = ["traffic", "climate", "health", "environment", "population"]

# Fallback weights used when no scenario is loaded
DEFAULT_WEIGHTS = {d: 1 for d in ALL_DOMAINS}


class SimulatorConfig:
    """Live configuration, refreshed from MongoDB every CONFIG_POLL_INTERVAL s."""

    def __init__(self):
        self.event_rate:      int            = int(os.getenv("EVENT_RATE", 10))
        self.paused:          bool           = False
        self.active_scenario: Optional[dict] = None
        self.force_domain:    Optional[str]  = None
        self.force_zone:      Optional[str]  = None
        self.force_severity:  Optional[str]  = None

    def update(self, cfg_doc: dict, scenario_doc: Optional[dict]):
        self.event_rate    = max(1, min(int(cfg_doc.get("event_rate", self.event_rate)), 20))
        self.paused        = bool(cfg_doc.get("paused", False))
        self.force_domain  = cfg_doc.get("force_domain") or None
        self.force_zone    = cfg_doc.get("force_zone") or None
        self.force_severity = cfg_doc.get("force_severity") or None
        self.active_scenario = scenario_doc  # may be None → use DEFAULT_WEIGHTS

    @property
    def domain_weights(self) -> Dict[str, int]:
        if self.active_scenario and "domain_weights" in self.active_scenario:
            w = self.active_scenario["domain_weights"]
            # Respect zero weights (a scenario may want to exclude domains entirely).
            # Only fall back to default if the whole mapping sums to zero.
            weights = {d: max(0, int(w.get(d, 0))) for d in ALL_DOMAINS}
            if sum(weights.values()) > 0:
                return weights
        return DEFAULT_WEIGHTS.copy()

    @property
    def sleep_interval(self) -> float:
        return 1.0 / self.event_rate

    @property
    def scenario_name(self) -> str:
        if self.active_scenario:
            return self.active_scenario.get("name", self.active_scenario.get("scenario_id", "?"))
        return "default"


class EventSimulator:

    def __init__(self):
        self.rabbitmq_host     = os.getenv("RABBITMQ_HOST", "localhost")
        self.rabbitmq_port     = int(os.getenv("RABBITMQ_PORT", 5672))
        self.rabbitmq_username = os.getenv("RABBITMQ_USERNAME", "guest")
        self.rabbitmq_password = os.getenv("RABBITMQ_PASSWORD", "guest")
        self.mongo_uri         = os.getenv(
            "MONGO_URI",
            "mongodb://admin:admin123@localhost:27017/ucis_db?authSource=admin",
        )

        self.connection = None
        self.channel    = None
        self.mongo      = None
        self.config     = SimulatorConfig()

        self.generators: Dict[str, Any] = {
            "climate":     ClimateEventGenerator(),
            "traffic":     TrafficEventGenerator(),
            "health":      HealthEventGenerator(),
            "environment": EnvironmentEventGenerator(),
            "population":  PopulationEventGenerator(),
        }

        self._last_config_poll = 0.0
        logger.info("Simulator initialised — config poll every %ds", CONFIG_POLL_INTERVAL)

    # ── Connections ────────────────────────────────────────────────────────────

    def connect_rabbitmq(self):
        credentials = pika.PlainCredentials(self.rabbitmq_username, self.rabbitmq_password)
        params = pika.ConnectionParameters(
            host=self.rabbitmq_host, port=self.rabbitmq_port,
            credentials=credentials, connection_attempts=5, retry_delay=2,
        )
        self.connection = pika.BlockingConnection(params)
        self.channel    = self.connection.channel()
        self.channel.exchange_declare(exchange="ucis.events", exchange_type="topic", durable=True)
        logger.info("Connected to RabbitMQ at %s:%s", self.rabbitmq_host, self.rabbitmq_port)

    def connect_mongodb(self):
        self.mongo = MongoClient(self.mongo_uri)
        self.mongo.ucis_db.command("ping")
        logger.info("Connected to MongoDB")

    # ── Config polling ─────────────────────────────────────────────────────────

    def _poll_config(self):
        now = time.time()
        if now - self._last_config_poll < CONFIG_POLL_INTERVAL:
            return
        self._last_config_poll = now
        try:
            cfg_doc = self.mongo.ucis_db.simulator_config.find_one({"_id": "main"}) or {}

            scenario_doc = None
            sid = cfg_doc.get("active_scenario_id")
            if sid:
                scenario_doc = self.mongo.ucis_db.scenarios.find_one({"scenario_id": sid})
                # Scenario may override event_rate and force_* fields if not set in cfg_doc
                if scenario_doc:
                    if "event_rate" not in cfg_doc:
                        cfg_doc["event_rate"] = scenario_doc.get("event_rate", 10)
                    if not cfg_doc.get("force_zone"):
                        cfg_doc["force_zone"] = scenario_doc.get("force_zone")
                    if not cfg_doc.get("force_severity"):
                        cfg_doc["force_severity"] = scenario_doc.get("force_severity")

            old_rate     = self.config.event_rate
            old_scenario = self.config.scenario_name
            self.config.update(cfg_doc, scenario_doc)

            if self.config.event_rate != old_rate or self.config.scenario_name != old_scenario:
                logger.info(
                    "Config → rate=%d  scenario='%s'  paused=%s  zone=%s  severity=%s",
                    self.config.event_rate, self.config.scenario_name,
                    self.config.paused, self.config.force_zone, self.config.force_severity,
                )
        except Exception as exc:
            logger.warning("Config poll failed: %s", exc)

    # ── Domain selection ───────────────────────────────────────────────────────

    def _pick_domain(self) -> str:
        if self.config.force_domain and self.config.force_domain in self.generators:
            return self.config.force_domain
        weights  = self.config.domain_weights
        domains  = list(weights.keys())
        w_values = [weights[d] for d in domains]
        return random.choices(domains, weights=w_values, k=1)[0]

    # ── Overrides ──────────────────────────────────────────────────────────────

    def _apply_overrides(self, event: Dict[str, Any]) -> Dict[str, Any]:
        if self.config.force_zone:
            event["zone"] = self.config.force_zone
        if self.config.force_severity and "severity" in event:
            event["severity"] = self.config.force_severity
        return event

    # ── Publish / persist ──────────────────────────────────────────────────────

    def _ensure_channel(self) -> bool:
        """Reopen the RabbitMQ channel/connection if they went down."""
        try:
            if self.connection is None or self.connection.is_closed:
                logger.warning("RabbitMQ connection closed — reconnecting…")
                self.connect_rabbitmq()
                return True
            if self.channel is None or self.channel.is_closed:
                logger.warning("RabbitMQ channel closed — reopening…")
                self.channel = self.connection.channel()
                self.channel.exchange_declare(exchange="ucis.events", exchange_type="topic", durable=True)
                return True
            return True
        except Exception as exc:
            logger.error("Reconnect failed: %s", exc)
            return False

    def publish_event(self, event: Dict[str, Any], domain: str) -> bool:
        routing_key = f"events.{domain}.{event.get('type', 'generic')}"
        body = json.dumps(event)
        props = pika.BasicProperties(content_type="application/json", delivery_mode=2)

        for attempt in (1, 2):
            try:
                if self.channel is None or self.channel.is_closed \
                        or self.connection is None or self.connection.is_closed:
                    if not self._ensure_channel():
                        time.sleep(1)
                        continue
                self.channel.basic_publish(
                    exchange="ucis.events", routing_key=routing_key, body=body, properties=props,
                )
                logger.info(
                    "→ PUBLISHED [%s/%s] id=%s zone=%s severity=%s",
                    domain,
                    event.get("type", "?"),
                    event.get("id", "?")[:8],
                    event.get("zone", "?"),
                    event.get("severity", "?"),
                )
                return True
            except (pika.exceptions.ChannelClosed,
                    pika.exceptions.ChannelWrongStateError,
                    pika.exceptions.ConnectionClosed,
                    pika.exceptions.StreamLostError) as e:
                logger.warning("Publish attempt %d failed (%s); reconnecting…", attempt, e)
                try:
                    if self.connection and not self.connection.is_closed:
                        self.connection.close()
                except Exception:
                    pass
                self.connection = None
                self.channel = None
                self._ensure_channel()
            except Exception as e:
                logger.error("Publish failed: %s", e)
                return False
        return False

    def save_event(self, event: Dict[str, Any]) -> bool:
        try:
            event["created_at"] = datetime.utcnow()
            self.mongo.ucis_db.events.insert_one(event)
            return True
        except Exception as e:
            logger.error("Save failed: %s", e)
            return False

    # ── Main loop ──────────────────────────────────────────────────────────────

    def run(self):
        try:
            self.connect_rabbitmq()
            self.connect_mongodb()
            logger.info("Starting event generation loop…")

            event_count = 0
            last_report = time.time()

            was_paused = False
            while True:
                self._poll_config()

                if self.config.paused:
                    if not was_paused:
                        logger.info("⏸️  SIMULATOR PAUSED - stopping event generation")
                        was_paused = True
                    time.sleep(0.2)
                    continue
                elif was_paused:
                    logger.info("▶️  SIMULATOR RESUMED - resuming event generation")
                    was_paused = False

                domain    = self._pick_domain()
                generator = self.generators[domain]
                event     = generator.generate()
                event     = self._apply_overrides(event)

                if self.publish_event(event, domain) and self.save_event(event):
                    event_count += 1
                    if event_count % 500 == 0:
                        elapsed = time.time() - last_report
                        rate    = 500 / elapsed if elapsed else 0
                        logger.info(
                            "Published %d events  (%.1f evt/s | config=%d/s | scenario='%s')",
                            event_count, rate, self.config.event_rate, self.config.scenario_name,
                        )
                        last_report = time.time()

                time.sleep(self.config.sleep_interval)

        except KeyboardInterrupt:
            logger.info("Simulator stopped by user")
        except Exception as e:
            logger.error("Fatal simulator error: %s", e, exc_info=True)
        finally:
            if self.connection:
                try: self.connection.close()
                except Exception: pass
            if self.mongo:
                self.mongo.close()


if __name__ == "__main__":
    EventSimulator().run()
