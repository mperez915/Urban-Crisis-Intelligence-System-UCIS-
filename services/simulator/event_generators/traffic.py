"""Traffic event generator"""

import random
from typing import Any, Dict

from .base import BaseEventGenerator


class TrafficEventGenerator(BaseEventGenerator):
    """Generates traffic-related events (congestion, accidents, incidents)"""

    def __init__(self):
        super().__init__("traffic")
        self.streets = [
            "Main St",
            "First Ave",
            "Second Ave",
            "Broadway",
            "Park Ave",
            "Madison Ave",
            "Fifth Ave",
            "Lexington Ave",
            "Third Ave",
        ]
        self.zones = ["downtown", "suburbs", "industrial", "residential", "airport"]

    def generate(self) -> Dict[str, Any]:
        """Generate a traffic event"""
        event_type = random.choice(["congestion", "accident", "incident", "flow"])
        event = self._create_base_event(event_type)

        street = random.choice(self.streets)
        zone = random.choice(self.zones)

        if event_type == "congestion":
            event.update(
                {
                    "street": street,
                    "zone": zone,
                    "vehicle_count": random.randint(50, 500),
                    "average_speed_kmh": round(random.uniform(5, 80), 2),
                    "occupancy_percent": round(random.uniform(30, 100), 2),
                    "severity": self._calculate_congestion_severity(
                        event["average_speed_kmh"], event["occupancy_percent"]
                    ),
                }
            )
        elif event_type == "accident":
            event.update(
                {
                    "street": street,
                    "zone": zone,
                    "vehicles_involved": random.randint(2, 5),
                    "injuries": random.randint(0, 10),
                    "severity": random.choice(
                        ["minor", "moderate", "severe", "critical"]
                    ),
                    "lanes_blocked": random.randint(1, 4),
                }
            )
        elif event_type == "incident":
            event.update(
                {
                    "street": street,
                    "zone": zone,
                    "incident_type": random.choice(
                        ["roadwork", "debris", "flood", "fire", "explosion"]
                    ),
                    "severity": random.choice(["low", "medium", "high", "critical"]),
                    "lanes_blocked": random.randint(1, 4),
                }
            )
        elif event_type == "flow":
            event.update(
                {
                    "street": street,
                    "zone": zone,
                    "vehicles_per_minute": random.randint(100, 1000),
                    "average_speed_kmh": round(random.uniform(20, 100), 2),
                    "direction": random.choice(["north", "south", "east", "west"]),
                }
            )

        return event

    @staticmethod
    def _calculate_congestion_severity(speed: float, occupancy: float) -> str:
        if speed < 10 and occupancy > 80:
            return "critical"
        elif speed < 20 and occupancy > 70:
            return "high"
        elif speed < 40 and occupancy > 60:
            return "medium"
        else:
            return "low"
