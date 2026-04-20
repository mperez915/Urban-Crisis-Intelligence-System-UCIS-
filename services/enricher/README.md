# Event Enricher

**Component 2** — Event Context Enrichment

## Overview

Consumes raw events from RabbitMQ, adds geographic and infrastructure context from a static zone configuration file, and republishes the enriched events with a new routing key.

## Event flow

```
RabbitMQ (ucis.enricher.events)
  routing key: events.#
        │
        ▼
EventEnricher.enrich_event()
  - Adds enrichment.zone_context (risk_level, population_density,
    hospitals, police_stations, fire_stations, avg_response_time_min)
  - Adds enrichment.coordinates (lat/lon from zone_context.json)
  - Adds enrichment.enriched_at and enriched_by
        │
        ▼
RabbitMQ (ucis.events exchange)
  routing key: events.enriched.<domain>.<type>
```

Zone data is loaded from `/app/config/zones/zone_context.json` at startup.

The enricher does **not** write to MongoDB — the simulator writes raw events directly.

## Enriched event structure

```json
{
  "id": "...",
  "domain": "traffic",
  "type": "accident",
  "zone": "downtown",
  "severity": "critical",
  "enrichment": {
    "zone_context": {
      "risk_level": "high",
      "population_density": "very_high",
      "hospitals": [...],
      "police_stations": [...],
      "fire_stations": [...],
      "avg_response_time_min": 8.5
    },
    "coordinates": { "latitude": 40.7128, "longitude": -74.006 },
    "enriched_at": "2026-04-18T10:30:01Z",
    "enriched_by": "enricher-v1"
  }
}
```

## Health endpoint

```
GET http://localhost:8082/health
→ { "status": "healthy", "service": "enricher" }
```

## Configuration

| Environment variable  | Default   | Description          |
|-----------------------|-----------|----------------------|
| `RABBITMQ_HOST`       | `rabbitmq`| RabbitMQ hostname    |
| `RABBITMQ_PORT`       | `5672`    | AMQP port            |
| `RABBITMQ_USERNAME`   | `admin`   | AMQP username        |
| `RABBITMQ_PASSWORD`   | `admin123`| AMQP password        |
| `LOG_LEVEL`           | `INFO`    | Logging level        |

## Running locally

```bash
pip install -r requirements.txt
export RABBITMQ_HOST=localhost
python enricher.py
```

## Monitoring

```bash
docker logs -f ucis-enricher | grep "Published enriched"
```

## Supported zones

`downtown`, `suburbs`, `industrial`, `residential`, `airport`

Zone details are in `config/zones/zone_context.json`.
