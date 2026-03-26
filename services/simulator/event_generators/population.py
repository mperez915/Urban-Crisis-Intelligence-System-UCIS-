"""Population event generator"""

import random
from typing import Any, Dict

from .base import BaseEventGenerator


class PopulationEventGenerator(BaseEventGenerator):
    """Generates population-related events (density, crowds, gatherings, evacuations)"""

    def __init__(self):
        super().__init__("population")
        self.zones = ["downtown", "suburbs", "industrial", "residential", "airport"]
        self.locations = [
            "shopping_mall",
            "stadium",
            "airport",
            "train_station",
            "park",
            "beach",
            "market",
            "plaza",
            "convention_center",
        ]

    def generate(self) -> Dict[str, Any]:
        """Generate a population event"""
        event_type = random.choice(
            ["density", "crowd_alert", "gathering", "evacuation"]
        )
        event = self._create_base_event(event_type)

        zone = random.choice(self.zones)
        location = random.choice(self.locations)

        if event_type == "density":
            density = round(random.uniform(0, 100), 2)
            event.update(
                {
                    "zone": zone,
                    "location": location,
                    "people_per_sqm": round(random.uniform(0, 10), 2),
                    "estimated_population": random.randint(100, 50000),
                    "density_percent": density,
                    "severity": self._calculate_density_severity(density),
                }
            )
        elif event_type == "crowd_alert":
            event.update(
                {
                    "zone": zone,
                    "location": location,
                    "estimated_population": random.randint(1000, 100000),
                    "crowd_type": random.choice(
                        ["gathering", "protest", "parade", "spontaneous"]
                    ),
                    "severity": random.choice(["low", "medium", "high", "critical"]),
                    "police_dispatched": random.random() < 0.6,
                }
            )
        elif event_type == "gathering":
            event.update(
                {
                    "zone": zone,
                    "location": location,
                    "event_type": random.choice(
                        ["concert", "festival", "protest", "celebration", "conference"]
                    ),
                    "estimated_attendance": random.randint(100, 100000),
                    "status": random.choice(["ongoing", "starting", "ending"]),
                    "expected_duration_hours": random.randint(1, 24),
                }
            )
        elif event_type == "evacuation":
            event.update(
                {
                    "zone": zone,
                    "location": location,
                    "evacuation_reason": random.choice(
                        [
                            "fire",
                            "toxic_gas",
                            "threat",
                            "structural_failure",
                            "natural_disaster",
                        ]
                    ),
                    "people_to_evacuate": random.randint(100, 10000),
                    "severity": random.choice(["high", "critical"]),
                    "emergency_services_deployed": random.randint(1, 50),
                }
            )

        return event

    @staticmethod
    def _calculate_density_severity(density: float) -> str:
        if density > 80:
            return "critical"
        elif density > 60:
            return "high"
        elif density > 40:
            return "medium"
        else:
            return "low"
