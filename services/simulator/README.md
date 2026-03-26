# UCIS Multi-Domain Event Simulator

🧩 **Component 1** — Multi-Domain Event Producer

## Overview

The Simulator generates realistic IoT events from 5 distinct domains:

- **Climate**: Temperature, humidity, storms, wind
- **Traffic**: Congestion, accidents, incidents, flow
- **Health**: Emergency calls, ambulance dispatch, health incidents
- **Environment**: Air quality, pollution, water quality, waste alerts
- **Population**: Density, crowd alerts, gatherings, evacuations

All events are published to RabbitMQ in JSON format with domain-specific routing keys.

## Architecture

```
┌──────────────────────────────────────┐
│  Simulator Container (Python 3.11)   │
├──────────────────────────────────────┤
│  ┌─ Event Generators (5 domains)    │
│  ├─ Climate Generator               │
│  ├─ Traffic Generator               │
│  ├─ Health Generator                │
│  ├─ Environment Generator           │
│  └─ Population Generator            │
├──────────────────────────────────────┤
│  RabbitMQ Publisher (Pika client)    │
└──────────────────────────────────────┘
         │
         ▼
┌──────────────────────────┐
│     RabbitMQ Broker      │
│  Exchange: ucis.events   │
└──────────────────────────┘
```

## Event Structure

All events follow this base structure:

```json
{
  "id": "uuid-string",
  "timestamp": "2026-03-26T15:30:45.123Z",
  "domain": "climate|traffic|health|environment|population",
  "type": "event_type_specific_to_domain",
  "zone": "zone_identifier",
  "severity": "low|medium|high|critical",
  "domain_specific_fields": {}
}
```

## Event Examples

### Climate Event
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-03-26T15:30:45Z",
  "domain": "climate",
  "type": "storm",
  "zone": "downtown",
  "wind_speed_kmh": 85.5,
  "precipitation_mm": 45.2,
  "lightning_detected": true,
  "severity": "high"
}
```

### Traffic Event
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "timestamp": "2026-03-26T15:30:46Z",
  "domain": "traffic",
  "type": "accident",
  "street": "Main St",
  "zone": "downtown",
  "vehicles_involved": 3,
  "injuries": 2,
  "lanes_blocked": 2,
  "severity": "severe"
}
```

### Health Event
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440002",
  "timestamp": "2026-03-26T15:30:47Z",
  "domain": "health",
  "type": "emergency_call",
  "zone": "suburbs",
  "call_type": "cardiac",
  "response_time_minutes": 8.5,
  "severity": "critical",
  "caller_location": "123 Oak St, suburbs"
}
```

### Environment Event
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440003",
  "timestamp": "2026-03-26T15:30:48Z",
  "domain": "environment",
  "type": "air_quality",
  "zone": "industrial",
  "aqi": 245.5,
  "primary_pollutant": "PM2.5",
  "temperature_celsius": 22.5,
  "humidity_percent": 65.3,
  "severity": "high"
}
```

### Population Event
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440004",
  "timestamp": "2026-03-26T15:30:49Z",
  "domain": "population",
  "type": "crowd_alert",
  "zone": "downtown",
  "location": "plaza",
  "estimated_population": 15000,
  "crowd_type": "gathering",
  "severity": "medium",
  "police_dispatched": true
}
```

## RabbitMQ Integration

### Exchange
- **Name**: `ucis.events`
- **Type**: Topic
- **Durable**: Yes

### Routing Keys Pattern
```
events.{domain}.{type}

Examples:
- events.climate.temperature
- events.climate.storm
- events.traffic.congestion
- events.traffic.accident
- events.health.emergency_call
- events.environment.air_quality
- events.population.crowd_alert
```

### Queues (created by consumers)
- CEP Engine listens to: `events.#` (all events)
- Enricher listens to: `events.#` (all events)
- Archive listens to: `events.#` (optional)

## Configuration

### Environment Variables

```bash
# RabbitMQ Connection
RABBITMQ_HOST=rabbitmq          # RabbitMQ server hostname
RABBITMQ_PORT=5672             # AMQP port
RABBITMQ_USERNAME=admin        # RabbitMQ username
RABBITMQ_PASSWORD=admin123     # RabbitMQ password

# Event Generation
EVENT_RATE=100                 # Events per second (default: 100)
LOG_LEVEL=INFO                 # Logging level: DEBUG, INFO, WARNING, ERROR
```

### Running Locally

```bash
# Install dependencies
pip install -r requirements.txt

# Set environment variables
export RABBITMQ_HOST=localhost
export RABBITMQ_PORT=5672
export RABBITMQ_USERNAME=admin
export RABBITMQ_PASSWORD=admin123
export EVENT_RATE=100

# Run simulator
python simulator.py
```

## Docker Deployment

```bash
# Build image
docker build -t ucis-simulator:1.0 .

# Run container
docker run -d \
  --name ucis-simulator \
  --network ucis-network \
  -e RABBITMQ_HOST=rabbitmq \
  -e RABBITMQ_PORT=5672 \
  -e RABBITMQ_USERNAME=admin \
  -e RABBITMQ_PASSWORD=admin123 \
  -e EVENT_RATE=100 \
  ucis-simulator:1.0

# View logs
docker logs -f ucis-simulator
```

## Event Generation Details

### Climate Events

**Temperature Event**
- Range: -5°C to 45°C
- Severity calculation based on extreme values
- Includes zone information

**Storm Event**
- Wind speed: 0-120 km/h (with lightning probability)
- Precipitation: 0-100 mm
- Triggers high/critical alerts for dangerous conditions

### Traffic Events

**Congestion Event**
- Vehicle count: 50-500
- Average speed: 5-80 km/h
- Occupancy: 30-100%
- Severity based on speed and occupancy ratio

**Accident Event**
- Vehicles involved: 2-5
- Injuries: 0-10
- Multiple severity levels (minor to critical)
- Lanes blocked: 1-4

**Incident Event**
- Types: roadwork, debris, flood, fire, explosion
- Dynamic severity assignment

### Health Events

**Emergency Call**
- Types: cardiac, trauma, respiratory, medical, mental_health, poisoning
- Response time: 2-30 minutes
- Severity: low to critical

**Ambulance Dispatch**
- 4 status types: dispatched, en_route, at_scene, returning
- Multiple hospital destinations
- Patient count: 1-5

### Environment Events

**Air Quality**
- AQI range: 0-500
- 6 major pollutants (PM2.5, PM10, NO2, O3, SO2, CO)
- Severity mapped to AQI levels

**Pollution Alert**
- Concentration units: ppm
- Sources: industrial, traffic, agricultural, unknown

### Population Events

**Density Event**
- Range: 0-100% (occupancy)
- People per m²: 0-10
- 9 location types

**Crowd Alert**
- Types: gathering, protest, parade, spontaneous
- Estimated attendance: 1k-100k
- Police dispatch probability: 60%

**Gathering Event**
- Event types: concert, festival, protest, celebration, conference
- Duration: 1-24 hours

## Monitoring & Debugging

### Check RabbitMQ Connection
```bash
# From inside container
docker exec ucis-simulator python -c "import pika; print('Pika imported successfully')"
```

### Monitor Event Publication
```bash
# Watch logs
docker logs -f ucis-simulator | grep "Published"
```

### Check RabbitMQ Management UI
- Open: http://localhost:15672
- Username: admin
- Password: admin123
- View exchange `ucis.events` and active queues

### Performance Metrics

The simulator logs:
- Number of events published
- Average publication rate (events/sec)
- Any failed publications

## Extending the Simulator

### Add New Event Domain

1. Create new generator in `event_generators/my_domain.py`:
```python
from .base import BaseEventGenerator

class MyDomainEventGenerator(BaseEventGenerator):
    def __init__(self):
        super().__init__('my_domain')
    
    def generate(self):
        event = self._create_base_event('my_event_type')
        event.update({
            'field1': 'value1',
            'field2': value2,
        })
        return event
```

2. Import in `event_generators/__init__.py`:
```python
from .my_domain import MyDomainEventGenerator
```

3. Register in `simulator.py`:
```python
self.generators = {
    'my_domain': MyDomainEventGenerator(),
    # ... other generators
}
```

4. Restart simulator

### Customize Event Rates

Modify `EVENT_RATE` env var to adjust:
- 50: 50 events/sec (slower, less load)
- 100: baseline
- 500: high volume testing
- 1000+: stress testing

### Add Domain-Specific Validation

Extend event generators with:
```python
def _validate_event(self, event):
    # Add custom validation logic
    assert event['temperature'] > -273, "Temperature < absolute zero"
    return valid
```

## Performance Considerations

- **Event Rate**: Limited by RabbitMQ throughput and network bandwidth
- **Memory**: ~500MB for typical configuration
- **CPU**: Low usage for rates up to 1000 evt/sec
- **Network**: ~1-10 Mbps depending on event rate

## Troubleshooting

### Problem: "Connection refused"
**Solution**: Ensure RabbitMQ is running and accessible at `RABBITMQ_HOST:RABBITMQ_PORT`

### Problem: "Failed to publish event"
**Solution**: Check RabbitMQ credentials and authentication

### Problem: "High event latency"
**Solution**: Reduce `EVENT_RATE` or check RabbitMQ queue depth

### Problem: "Memory usage growing"
**Solution**: Check for connection leaks; restart container

## Next Steps

- Monitor with Prometheus metrics integration
- Add event sampling for high-volume testing
- Implement crisis simulation scenarios (cascading events)
- Create event replay functionality
