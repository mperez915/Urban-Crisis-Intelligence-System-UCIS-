# Event Simulator

**Component 1** — Multi-Domain Event Producer

## Overview

Generates realistic IoT events from 5 domains and publishes them to RabbitMQ. Also writes raw events directly to MongoDB (`events` collection).

## Domains and event types

| Domain      | Types                                           |
|-------------|-------------------------------------------------|
| climate     | temperature, humidity, storm, winds             |
| traffic     | congestion, accident, incident, flow            |
| health      | emergency_call, ambulance_dispatch, health_incident |
| environment | air_quality, pollution, water_quality, waste_alert |
| population  | density, crowd_alert, gathering, evacuation     |

## Event flow

```
EventSimulator
  ├─ Publishes to RabbitMQ
  │    Exchange: ucis.events (topic, durable)
  │    Routing key: events.<domain>.<type>
  └─ Saves to MongoDB
       Collection: events (TTL 30 days)
```

Zones: `downtown`, `suburbs`, `industrial`, `residential`, `airport`

## Event structure

```json
{
  "id": "uuid",
  "timestamp": "2026-04-18T10:30:00.000Z",
  "domain": "traffic",
  "type": "accident",
  "zone": "downtown",
  "severity": "high",
  "<domain-specific fields>": "..."
}
```

## Configuration

| Environment variable  | Default   | Description                  |
|-----------------------|-----------|------------------------------|
| `RABBITMQ_HOST`       | `rabbitmq`| RabbitMQ hostname            |
| `RABBITMQ_PORT`       | `5672`    | AMQP port                    |
| `RABBITMQ_USERNAME`   | `admin`   | AMQP username                |
| `RABBITMQ_PASSWORD`   | `admin123`| AMQP password                |
| `EVENT_RATE`          | `100`     | Events per second            |
| `LOG_LEVEL`           | `INFO`    | Logging level                |

## Running locally

```bash
pip install -r requirements.txt
export RABBITMQ_HOST=localhost
export EVENT_RATE=10
python simulator.py
```

## Docker

```bash
docker build -t ucis-simulator .
docker run --network ucis-network \
  -e RABBITMQ_HOST=rabbitmq \
  -e EVENT_RATE=100 \
  ucis-simulator
```

## Monitoring

```bash
# Event publication rate (logged every 1000 events)
docker logs -f ucis-simulator | grep "Published"

# RabbitMQ Management UI
http://localhost:15672  # admin / admin123
```

## Adding a new domain

1. Create `event_generators/my_domain.py` extending `BaseEventGenerator`
2. Add import to `event_generators/__init__.py`
3. Register in `simulator.py` generators dict
