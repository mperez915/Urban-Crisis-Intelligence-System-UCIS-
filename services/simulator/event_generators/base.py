"""Base class for all event generators"""

import uuid
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any, Dict


class BaseEventGenerator(ABC):
    """Abstract base class for domain-specific event generators"""

    def __init__(self, domain: str):
        self.domain = domain

    @abstractmethod
    def generate(self) -> Dict[str, Any]:
        """Generate a domain-specific event"""
        pass

    def _create_base_event(self, event_type: str) -> Dict[str, Any]:
        """Create base event structure"""
        return {
            "id": str(uuid.uuid4()),
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "domain": self.domain,
            "type": event_type,
        }
