# CEP Engine README

🧠 **Component 3** — Event Pattern Detection Engine

## Overview

The CEP Engine detects complex events by analyzing streams of simple events using Esper (Event Series Pattern Engine).

### Capabilities

- **Real-time Pattern Detection**: Analyze multi-domain events
- **Temporal Patterns**: Detect sequences within time windows
- **Aggregations**: Calculate statistics on event streams
- **Correlations**: Find relationships between events
- **Dynamic Rules**: Load patterns from MongoDB without restart

## Architecture

```
Events from RabbitMQ
        │
        ▼
┌──────────────────────────┐
│  Event Listener          │
│  (RabbitMQ Consumer)     │
└──────┬───────────────────┘
       │
       ▼
┌──────────────────────────┐
│  Pattern Matcher         │
│  (Esper Runtime)         │
└──────┬───────────────────┘
       │
       ▼
┌──────────────────────────┐
│  Complex Events          │
│  (Published to RabbitMQ) │
└──────────────────────────┘
      &
┌──────────────────────────┐
│  MongoDB (Storage)       │
└──────────────────────────┘
```

## Pattern Definition Format

Patterns are stored in MongoDB and loaded at runtime. Format:

```json
{
  "pattern_id": "high_traffic_accident",
  "name": "High Traffic with Accident",
  "epl_rule": "SELECT * FROM TrafficEvent(type='accident').win:time(5 min) WHERE severity='critical'",
  "severity": "critical",
  "enabled": true,
  "input_domains": ["traffic"],
  "created_at": "2026-03-26T15:00:00Z"
}
```

## Esper EPL Examples

### 1. Alert on Multiple Events of Same Type

```epl
SELECT * FROM 
  TrafficEvent(type='congestion').win:time(15 min)
HAVING count(*) >= 3
```

### 2. Temporal Sequence

```epl
SELECT * FROM PATTERN [
  e1=TrafficEvent(type='accident', severity='high') ->
  e2=TrafficEvent(type='congestion', zone=e1.zone)
]
```

### 3. Correlation Across Domains

```epl
SELECT * FROM PATTERN [
  a=TrafficEvent(type='accident', severity='critical') ->
  h=HealthEvent(type='emergency_call', response_time_minutes > 15)
] WHERE a.zone = h.zone
```

### 4. Aggregation on Time Window

```epl
SELECT zone, COUNT(*) as accident_count, AVG(injuries) as avg_injuries
FROM TrafficEvent(type='accident').win:time(1 hour)
GROUP BY zone
HAVING COUNT(*) > 5
```

### 5. Alert on Air Quality with Traffic Correlation

```epl
SELECT * FROM PATTERN [
  e=EnvironmentEvent(type='air_quality', aqi > 300) ->
  t=TrafficEvent(type='congestion', density_percent > 80)
] WHERE e.zone = t.zone
```

## Configuration

### Environment Variables

```bash
RABBITMQ_HOST=rabbitmq           # RabbitMQ server
RABBITMQ_PORT=5672              # AMQP port
RABBITMQ_USERNAME=admin         # Username
RABBITMQ_PASSWORD=admin123      # Password
MONGO_URI=mongodb://...         # MongoDB connection
CEP_RULES_PATH=/app/config      # Pattern files location
```

### Running Locally

```bash
# Build project
mvn clean package

# Run with Spring Boot
mvn spring-boot:run -Dspring-boot.run.arguments="--rabbitmq.host=localhost"

# Or run JAR
java -jar target/ucis-cep-*.jar
```

## API Endpoints

### Health Check
```bash
GET /health
```

Response:
```json
{
  "status": "UP",
  "components": {
    "rabbitmq": { "status": "UP" },
    "mongodb": { "status": "UP" },
    "esper": { "status": "UP" }
  }
}
```

### List Active Patterns
```bash
GET /api/patterns

// Response
[
  {
    "pattern_id": "high_traffic_accident",
    "name": "High Traffic with Accident",
    "enabled": true,
    "severity": "critical"
  }
]
```

### Pattern Statistics
```bash
GET /api/patterns/{pattern_id}/stats

// Response
{
  "pattern_id": "high_traffic_accident",
  "matches_total": 42,
  "matches_today": 5,
  "last_match": "2026-03-26T14:30:00Z",
  "avg_response_time_ms": 125
}
```

### Complex Events
```bash
GET /api/events/complex?limit=100

// Response
[
  {
    "pattern_id": "high_traffic_accident",
    "timestamp": "2026-03-26T14:30:00Z",
    "alert_level": "critical",
    "source_events": ["evt-1", "evt-2"],
    "description": "Critical accident detected in downtown"
  }
]
```

## Loading Patterns

### Method 1: MongoDB Direct

```javascript
db.patterns.insertOne({
  pattern_id: "test_pattern",
  name: "Test Pattern",
  epl_rule: "SELECT * FROM TrafficEvent WHERE severity='critical'",
  enabled: true,
  input_domains: ["traffic"],
  severity: "high"
})
```

### Method 2: REST API (future enhancement)

```bash
POST /api/patterns
{
  "pattern_id": "test_pattern",
  "name": "Test Pattern",
  "epl_rule": "...",
  "enabled": true
}
```

## Monitoring

### Performance Metrics

The CEP engine logs:
- Pattern match count per second
- Event processing latency
- Memory usage

### View Logs

```bash
docker logs -f ucis-cep-engine | grep "WARN\|ERROR\|PATTERN"
```

### Common Issues

**Issue**: Patterns not loading
- Check MongoDB connectivity
- Verify pattern_id format (no spaces)
- Look for Esper EPL syntax errors

**Issue**: High latency
- Reduce pattern complexity
- Increase thread pool size
- Check RabbitMQ queue depth

**Issue**: Memory leak
- Monitor event listener cleanup
- Check for infinite rule loops
- Restart container if needed

## Extending CEP Engine

### Add Custom Event Type

1. Update `EsperConfig.java`:
```java
config.getCommon().addEventType("MyEvent", 
    "{ id: String, value: Double, ... }");
```

2. Define pattern using new event type
3. Restart CEP engine

### Add Correlation Pattern

Example: Traffic accident + health emergency in same zone

```epl
SELECT * FROM PATTERN [
  t=TrafficEvent(type='accident', severity='critical') ->
  h=HealthEvent(type='emergency_call')
] WHERE t.zone = h.zone
```

### Performance Tuning

- **Thread Pool**: Increase `cep.thread.pool.size` for more concurrent processing
- **Memory**: Adjust JVM heap size: `java -Xmx2G -jar app.jar`
- **Window Size**: Reduce time windows to process fewer events

## Production Deployment

1. **Enable Monitoring**: Connect Prometheus scraper
2. **Set Alerts**: Alert on pattern match spikes
3. **Backup Patterns**: Export patterns from MongoDB regularly
4. **Scale**: Use Kubernetes for horizontal scaling

## See Also

- [Esper EPL Documentation](https://www.espertech.com/esper/)
- [Esper Tutorial](https://www.espertech.com/tutorial/)
- [Pattern Design Patterns](https://www.espertech.com/tutorials/epl-online-gettingstarted.html)
