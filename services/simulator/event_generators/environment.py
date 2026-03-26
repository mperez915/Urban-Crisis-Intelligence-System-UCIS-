"""Environment event generator"""

import random
from typing import Any, Dict

from .base import BaseEventGenerator


class EnvironmentEventGenerator(BaseEventGenerator):
    """Generates environment-related events (air quality, pollution, waste)"""

    def __init__(self):
        super().__init__("environment")
        self.zones = ["downtown", "suburbs", "industrial", "residential", "airport"]
        self.pollutants = ["PM2.5", "PM10", "NO2", "O3", "SO2", "CO"]

    def generate(self) -> Dict[str, Any]:
        """Generate an environment event"""
        event_type = random.choice(
            ["air_quality", "pollution", "water_quality", "waste_alert"]
        )
        event = self._create_base_event(event_type)

        zone = random.choice(self.zones)

        if event_type == "air_quality":
            aqi = round(random.uniform(0, 500), 2)
            event.update(
                {
                    "zone": zone,
                    "aqi": aqi,
                    "severity": self._calculate_aqi_severity(aqi),
                    "primary_pollutant": random.choice(self.pollutants),
                    "temperature_celsius": round(random.uniform(5, 35), 2),
                    "humidity_percent": round(random.uniform(20, 100), 2),
                }
            )
        elif event_type == "pollution":
            event.update(
                {
                    "zone": zone,
                    "pollutant": random.choice(self.pollutants),
                    "concentration_ppm": round(random.uniform(0, 1000), 2),
                    "severity": random.choice(["low", "medium", "high", "critical"]),
                    "source": random.choice(
                        ["industrial", "traffic", "agricultural", "unknown"]
                    ),
                }
            )
        elif event_type == "water_quality":
            event.update(
                {
                    "zone": zone,
                    "ph_level": round(random.uniform(6.5, 8.5), 2),
                    "dissolved_oxygen_mg": round(random.uniform(0, 15), 2),
                    "turbidity_ntu": round(random.uniform(0, 100), 2),
                    "severity": random.choice(["good", "fair", "poor", "critical"]),
                }
            )
        elif event_type == "waste_alert":
            event.update(
                {
                    "zone": zone,
                    "waste_type": random.choice(
                        ["hazardous", "electronic", "construction", "medical"]
                    ),
                    "amount_tons": round(random.uniform(0.1, 100), 2),
                    "severity": random.choice(["low", "medium", "high", "critical"]),
                    "location": f"{zone} landfill",
                }
            )

        return event

    @staticmethod
    def _calculate_aqi_severity(aqi: float) -> str:
        if aqi > 300:
            return "critical"
        elif aqi > 200:
            return "high"
        elif aqi > 100:
            return "medium"
        elif aqi > 50:
            return "low"
        else:
            return "good"
