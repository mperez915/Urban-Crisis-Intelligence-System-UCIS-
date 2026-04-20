# CEP Engine

**Component 3** — Complex Event Processing Engine

## Overview

Consumes enriched events from RabbitMQ, evaluates EPL rules via Esper 8.9, and writes detected complex events to MongoDB and the `ucis.complex` exchange.

## Architecture

```
RabbitMQ (ucis.cep.events)
        │  routing key: events.enriched.#
        ▼
EventProcessorService
  - Deserializes JSON enriched event
  - Maps domain → Esper event type
  - epRuntime.sendEventMap(event, eventType)
        │
        ▼
Esper EPL Runtime (ucis-cep)
  - Registered event types: TrafficEvent, ClimateEvent,
    HealthEvent, EnvironmentEvent, PopulationEvent, Event
  - Patterns loaded from MongoDB (collection: patterns)
  - Each EPStatement has a listener attached
        │  pattern fires
        ▼
PatternService listener
  - Writes complex_event to MongoDB (collection: complex_events)
  - Increments match_count on pattern document
  - Publishes to RabbitMQ (ucis.complex, routing key: events.complex.<pattern_id>)
```

## Startup sequence

1. `RabbitMQService.connect()` — declares exchanges and queues
2. `PatternService.start()` — initial sync from MongoDB + starts background poller
3. `EventProcessorService.startConsuming()` — starts RabbitMQ consumer on a background thread

## Pattern hot-reload (no restart needed)

Before processing **every** enriched event, `PatternService.syncIfNeeded()` runs a single cheap query:

```
db.patterns.find().sort({updated_at: -1}).limit(1).projection({updated_at: 1})
```

This is O(1) with the `updated_at` index. If the result differs from the last seen value, a full sync runs:
- Deploys new patterns
- Redeploys changed patterns (detected via `updated_at`)
- Undeploys disabled or deleted patterns

Pattern changes take effect on the next event that arrives after the write — no restart needed, no polling delay.

## Event type mapping

| Domain        | Esper event type    |
|---------------|---------------------|
| traffic       | TrafficEvent        |
| climate       | ClimateEvent        |
| health        | HealthEvent         |
| environment   | EnvironmentEvent    |
| population    | PopulationEvent     |
| (other)       | Event               |

All types include the base fields (`id`, `timestamp`, `domain`, `type`, `zone`, `severity`, `enrichment`) plus domain-specific fields (e.g. `aqi`, `average_speed_kmh`, `call_type`).

## Pattern format (MongoDB `patterns` collection)

```json
{
  "pattern_id": "high_traffic_congestion_enriched",
  "name": "High Traffic Congestion in Risk Zone",
  "epl_rule": "SELECT zone, COUNT(*) as incident_count FROM TrafficEvent(type='congestion', severity in ('high','critical')).win:time(10 min) GROUP BY zone HAVING COUNT(*) >= 2",
  "severity": "high",
  "enabled": true,
  "input_domains": ["traffic"],
  "uses_enrichment": true
}
```

Patterns are compiled at startup. To hot-reload after a change, call `PatternService.loadAndDeployPatterns()` — it undeploys the old version first.

## Complex event output (MongoDB `complex_events` collection)

```json
{
  "pattern_id": "high_traffic_congestion_enriched",
  "pattern_name": "High Traffic Congestion in Risk Zone",
  "alert_level": "high",
  "timestamp": "2026-04-18T10:30:00Z",
  "zone": "downtown",
  "result_data": { "incident_count": 3, "avg_speed": 12.5 },
  "source_events": [],
  "description": "...",
  "created_at": "..."
}
```

## Configuration

| Environment variable   | Default                                           | Description                |
|------------------------|---------------------------------------------------|----------------------------|
| `RABBITMQ_HOST`        | `rabbitmq`                                        | RabbitMQ hostname          |
| `RABBITMQ_PORT`        | `5672`                                            | AMQP port                  |
| `RABBITMQ_USERNAME`    | `admin`                                           | AMQP username              |
| `RABBITMQ_PASSWORD`    | `admin123`                                        | AMQP password              |
| `MONGO_URI`            | `mongodb://admin:admin123@mongodb:27017/ucis_db?authSource=admin` | MongoDB URI |
| `CEP_RULES_PATH`       | `/app/config/patterns`                            | (legacy, not used at runtime) |

## Running locally

```bash
# Build
mvn clean package -DskipTests

# Run
java -jar target/ucis-cep-engine-1.0.0.jar \
  --rabbitmq.host=localhost \
  --mongodb.uri=mongodb://admin:admin123@localhost:27017/ucis_db?authSource=admin
```

## Health endpoint

```
GET http://localhost:8081/actuator/health
```

## Troubleshooting

**Patterns not loading**
- Verify MongoDB connectivity and that the `patterns` collection has documents with `enabled: true`
- Check logs for `EPL compile error` — the EPL syntax in `default_patterns.json` uses enriched sub-fields; ensure enricher is running

**No complex events appearing**
- Confirm `ucis.cep.events` queue binding is `events.enriched.#` (not `events.#`)
- Check that the enricher is publishing with routing key `events.enriched.<domain>.<type>`
- Look for `Pattern '...' fired` in logs

**EPL compile errors**
- Esper 8.9 EPL syntax differs from Esper 5.x — window syntax is `.win:time(...)` not `#time(...)`
- The `enrichment` field is a `Map` in Esper; navigate with `enrichment('zone_context')('risk_level')` in EPL if dot-notation fails
