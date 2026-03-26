"""Health event generator"""

import random
from typing import Any, Dict

from .base import BaseEventGenerator


class HealthEventGenerator(BaseEventGenerator):
    """Generates health-related events (emergency calls, ambulance dispatch, incidents)"""

    def __init__(self):
        super().__init__("health")
        self.hospitals = [
            "Central Hospital",
            "St. Mary Medical",
            "Emergency Care Center",
            "Urban Health Clinic",
            "Critical Care Unit",
        ]
        self.zones = ["downtown", "suburbs", "industrial", "residential", "airport"]

    def generate(self) -> Dict[str, Any]:
        """Generate a health event"""
        event_type = random.choice(
            ["emergency_call", "ambulance_dispatch", "health_incident"]
        )
        event = self._create_base_event(event_type)

        zone = random.choice(self.zones)

        if event_type == "emergency_call":
            event.update(
                {
                    "zone": zone,
                    "call_type": random.choice(
                        [
                            "cardiac",
                            "trauma",
                            "respiratory",
                            "medical",
                            "mental_health",
                            "poisoning",
                        ]
                    ),
                    "response_time_minutes": round(random.uniform(2, 30), 2),
                    "severity": random.choice(["low", "medium", "high", "critical"]),
                    "caller_location": f"{random.randint(1, 200)} {random.choice(['St', 'Ave', 'Blvd'])}, {zone}",
                }
            )
        elif event_type == "ambulance_dispatch":
            event.update(
                {
                    "zone": zone,
                    "ambulance_id": f"AMB-{random.randint(1000, 9999)}",
                    "destination": random.choice(self.hospitals),
                    "status": random.choice(
                        ["dispatched", "en_route", "at_scene", "returning"]
                    ),
                    "eta_minutes": round(random.uniform(5, 45), 2),
                    "patient_count": random.randint(1, 5),
                }
            )
        elif event_type == "health_incident":
            event.update(
                {
                    "zone": zone,
                    "incident_type": random.choice(
                        ["epidemic", "contamination", "outbreak", "healthcare_failure"]
                    ),
                    "affected_count": random.randint(1, 1000),
                    "severity": random.choice(["low", "medium", "high", "critical"]),
                    "hospital": random.choice(self.hospitals),
                }
            )

        return event
