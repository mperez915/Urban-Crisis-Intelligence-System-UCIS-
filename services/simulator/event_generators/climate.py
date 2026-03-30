"""Climate event generator"""

import random
from typing import Any, Dict

from faker import Faker

from .base import BaseEventGenerator


class ClimateEventGenerator(BaseEventGenerator):
    """Generates climate-related events (temperature, humidity, storms, etc.)"""

    def __init__(self):
        super().__init__("climate")
        self.faker = Faker()
        self.zones = ["downtown", "suburbs", "industrial", "residential", "airport"]

    def generate(self) -> Dict[str, Any]:
        """Generate a climate event"""
        event_type = random.choice(["temperature", "humidity", "storm", "winds"])
        event = self._create_base_event(event_type)

        zone = random.choice(self.zones)

        if event_type == "temperature":
            temperature = round(random.uniform(-5, 45), 2)
            event.update(
                {
                    "zone": zone,
                    "temperature_celsius": temperature,
                    "severity": self._calculate_temp_severity(temperature),
                }
            )
        elif event_type == "humidity":
            humidity = round(random.uniform(20, 100), 2)
            event.update(
                {
                    "zone": zone,
                    "humidity_percent": humidity,
                    "severity": self._calculate_humidity_severity(humidity),
                }
            )
        elif event_type == "storm":
            event.update(
                {
                    "zone": zone,
                    "wind_speed_kmh": round(random.uniform(0, 120), 2),
                    "precipitation_mm": round(random.uniform(0, 100), 2),
                    "lightning_detected": random.random() < 0.3,
                    "severity": random.choice(["low", "medium", "high", "critical"]),
                }
            )
        elif event_type == "winds":
            wind_speed = round(random.uniform(0, 80), 2)
            event.update(
                {
                    "zone": zone,
                    "wind_speed_kmh": wind_speed,
                    "wind_direction": random.choice(
                        ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
                    ),
                    "severity": self._calculate_wind_severity(wind_speed),
                }
            )

        return event

    @staticmethod
    def _calculate_temp_severity(temp: float) -> str:
        if temp < -10 or temp > 40:
            return "critical"
        elif temp < 0 or temp > 35:
            return "high"
        elif temp < 5 or temp > 30:
            return "medium"
        else:
            return "low"

    @staticmethod
    def _calculate_humidity_severity(humidity: float) -> str:
        if humidity > 95 or humidity < 10:
            return "high"
        elif humidity > 85 or humidity < 20:
            return "medium"
        else:
            return "low"

    @staticmethod
    def _calculate_wind_severity(wind_speed: float) -> str:
        if wind_speed > 80:
            return "critical"
        elif wind_speed > 60:
            return "high"
        elif wind_speed > 40:
            return "medium"
        else:
            return "low"
