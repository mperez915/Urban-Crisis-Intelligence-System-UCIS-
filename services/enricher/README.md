# Event Enricher README

🧬 **Component 4** — Event Context Enrichment

## Overview

The Event Enricher augments raw events with contextual data before they reach the CEP engine.

### Enrichment Operations

- **Geographic Context**: Risk level, population density, coordinates
- **Historical Data**: Recent event patterns for the zone
- **Environmental Conditions**: Current climate/pollution status
- **Correlation**: Links to related ongoing events

## Architecture

```
Events from Simulator
        │
        ▼
┌──────────────────────────┐
│  RabbitMQ Listener       │
│  (exchange: ucis.events) │
└──────┬───────────────────┘
       │
       ▼
┌──────────────────────────┐
│  Context Provider        │
│  - Zone Data             │
│  - Geographic Data       │
│  - Historical Stats      │
└──────┬───────────────────┘
       │
       ▼
┌──────────────────────────┐
│  Enriched Events         │
│  (routing: enriched.*)   │
└──────────────────────────┘
```

## Enrichment Example

### Before Enrichment
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-03-26T15:30:45Z",
  "domain": "traffic",
  "type": "accident",
  "street": "Main St",
  "zone": "downtown",
  "severity": "critical"
}
```

### After Enrichment
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-03-26T15:30:45Z",
  "domain": "traffic",
  "type": "accident",
  "street": "Main St",
  "zone": "downtown",
  "severity": "critical",
  "enrichment": {
    "zone_context": {
      "risk_level": "high",
      "population_density": "very_high"
    },
    "coordinates": {
      "latitude": 40.7128,
      "longitude": -74.0060
    },
    "enriched_at": "2026-03-26T15:30:46Z",
    "enriched_by": "enricher-v1"
  }
}
```

## Configuration

### Environment Variables

```bash
RABBITMQ_HOST=rabbitmq              # RabbitMQ server
RABBITMQ_PORT=5672                 # AMQP port
RABBITMQ_USERNAME=admin            # Username
RABBITMQ_PASSWORD=admin123         # Password
MONGO_URI=mongodb://...           # MongoDB connection
LOG_LEVEL=INFO                      # Logging level
```

### Running Locally

```bash
pip install -r requirements.txt
export RABBITMQ_HOST=localhost
python enricher.py
```

## API Endpoints

### Health Check
```bash
GET /health

Response:
{
  "status": "healthy",
  "service": "enricher"
}
```

## Context Data Structure

### Zone Context
```json
{
  "zone": "downtown",
  "risk_level": "high",
  "population_density": "very_high",
  "incident_history": 45,
  "average_response_time": 8.5
}
```

### Geographic Context
```json
{
  "coordinates": {
    "latitude": 40.7128,
    "longitude": -74.0060
  },
  "district": "Manhattan",
  "nearby_hospitals": 5,
  "nearest_police_station": 2.3
}
```

## Extending Enrichment

### Add New Context Source

1. Extend `ContextProvider` class:
```python
def get_hospital_data(self, zone: str) -> Dict[str, Any]:
    # Query hospital database
    return {"nearest_hospital": "Hospital X", "distance_km": 2.5}
```

2. Call in `enrich_event()`:
```python
enriched['enrichment']['hospitals'] = self.context_provider.get_hospital_data(zone)
```

3. Restart enricher

## Performance Considerations

- **Processing Rate**: ~10,000 events/sec per instance
- **Memory**: ~300MB base
- **Latency**: <10ms per event

### Scaling

Deploy multiple enricher instances:
```bash
docker run -d --name enricher-1 ucis-enricher
docker run -d --name enricher-2 ucis-enricher
docker run -d --name enricher-3 ucis-enricher
```

All instances share the same queue (`ucis.enricher.events`) and RabbitMQ handles load balancing.

## Monitoring

### View Logs
```bash
docker logs -f ucis-enricher
```

### Check Processing Rate
```bash
docker logs ucis-enricher | grep "Published enriched"
```

## Troubleshooting

**Issue**: Events not being processed
- Check RabbitMQ connection
- Verify queue exists: `rabbitmq-admin list_queues` (via RabbitMQ UI)
- Check MongoDB connection

**Issue**: High latency
- Scale with multiple instances
- Optimize context provider queries
- Check network latency

## Next Steps

- Integrate external APIs (weather, traffic, etc.)
- Add event correlation logic
- Implement caching for context data
- Add Prometheus metrics
