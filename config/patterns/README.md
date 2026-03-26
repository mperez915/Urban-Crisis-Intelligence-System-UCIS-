# CEP Patterns Configuration

⚙️ **Component 8** — Pattern Manager & CEP Rules

## Overview

This directory contains dynamically loadable CEP (Complex Event Processing) pattern definitions. Patterns are stored as JSON and loaded into the Esper CEP engine at runtime.

## Pattern Structure

```json
{
  "pattern_id": "unique_identifier",
  "name": "Human Readable Name",
  "description": "What this pattern detects",
  "epl_rule": "SELECT * FROM EventType WHERE conditions",
  "severity": "low|medium|high|critical",
  "enabled": true,
  "input_domains": ["climate", "traffic"],
  "version": 1,
  "created_by": "admin",
  "created_at": "2026-03-26T00:00:00Z"
}
```

## Default Patterns

### 1. High Traffic Congestion
- **ID**: `high_traffic_congestion`
- **Severity**: High
- **Trigger**: 2+ congestion events in same zone within 10 minutes
- **Output**: Zone with incident count and average speed

### 2. Multiple Accidents Cascade
- **ID**: `multiple_accidents_cascade`
- **Severity**: Critical
- **Trigger**: Multiple accidents in same zone within 15 minutes
- **Output**: Cascading accident alert

### 3. Hazardous Weather + Traffic
- **ID**: `hazardous_weather_traffic`
- **Severity**: Critical
- **Trigger**: Severe storm followed by traffic accident in same zone
- **Output**: Correlation between weather and traffic incident

### 4. Air Quality + Emergency Calls
- **ID**: `air_quality_emergency_correlation`
- **Severity**: High
- **Trigger**: Poor air quality (AQI > 300) + respiratory/cardiac calls
- **Output**: Correlation alert

### 5. Crowd Gathering
- **ID**: `crowd_gathering_emergency`
- **Severity**: High
- **Trigger**: Population density exceeds 5000 people in monitored area
- **Output**: Large gathering alert with location

### 6. Emergency Services Overload
- **ID**: `emergency_services_overload`
- **Severity**: Critical
- **Trigger**: 5+ critical emergency calls in same zone within 10 minutes
- **Output**: Overload alert

### 7. Critical Environmental Event
- **ID**: `critical_environmental_event`
- **Severity**: Critical
- **Trigger**: AQI > 400 or critical environmental incident
- **Output**: Environmental crisis alert

### 8. Multi-Domain Crisis
- **ID**: `multi_domain_crisis`
- **Severity**: Critical
- **Trigger**: Simultaneous critical events in traffic, climate, AND population
- **Output**: Multi-domain crisis alert

## Loading Patterns

### On Container Startup
Patterns are loaded from MongoDB at CEP engine startup:
```bash
docker-compose up cep-engine
```

### Via REST API
```bash
POST /api/patterns
Content-Type: application/json

{
  "pattern_id": "my_pattern",
  "name": "My Pattern",
  "epl_rule": "...",
  ...
}
```

### Manual MongoDB Insert
```javascript
db.patterns.insertMany([
  // Array of pattern objects
]);
```

## Writing Custom Patterns

### Example: Temperature Alert

```json
{
  "pattern_id": "extreme_temperature",
  "name": "Extreme Temperature Alert",
  "description": "Alerts on temperature extremes",
  "epl_rule": "SELECT zone, temperature_celsius FROM ClimateEvent(type='temperature') WHERE temperature_celsius < -10 OR temperature_celsius > 40",
  "severity": "high",
  "enabled": true,
  "input_domains": ["climate"]
}
```

### Example: Time-Window Aggregation

```json
{
  "pattern_id": "health_call_surge",
  "name": "Health Call Surge",
  "description": "Detects surge in emergency calls",
  "epl_rule": "SELECT zone, COUNT(*) as call_count, AVG(response_time_minutes) as avg_response FROM HealthEvent.win:time(5 min) GROUP BY zone HAVING COUNT(*) > 10",
  "severity": "high",
  "enabled": true,
  "input_domains": ["health"]
}
```

### Example: Sequence Pattern

```json
{
  "pattern_id": "accident_response",
  "name": "Accident Detection + Response",
  "description": "Detects accident followed by ambulance dispatch",
  "epl_rule": "SELECT * FROM PATTERN [acc=TrafficEvent(type='accident') -> amb=HealthEvent(type='ambulance_dispatch')].win:time(20 min)",
  "severity": "high",
  "enabled": true,
  "input_domains": ["traffic", "health"]
}
```

## EPL Query Reference

### Basic Selection
```epl
SELECT * FROM TrafficEvent WHERE severity='critical'
```

### Aggregation
```epl
SELECT zone, COUNT(*) as count, AVG(value) as avg_value
FROM TrafficEvent.win:time(10 min)
GROUP BY zone
```

### Time Windows
```epl
-- Last 10 minutes
TrafficEvent.win:time(10 min)

-- Last 100 events
TrafficEvent.win:length(100)

-- Last hour
TrafficEvent.win:time(1 hour)
```

### Pattern Matching
```epl
-- Sequence: A then B
SELECT * FROM PATTERN [a=EventA -> b=EventB]

-- Parallel: A and B (any order)
SELECT * FROM PATTERN [a=EventA and b=EventB]

-- Within time window
SELECT * FROM  PATTERN [a=EventA -> b=EventB].win:time(5 min)
```

### Correlation
```epl
-- Match events from same zone
SELECT * FROM PATTERN [
  e1=TrafficEvent(zone='downtown') ->
  e2=HealthEvent(zone='downtown')
] WHERE e1.zone = e2.zone
```

## Best Practices

1. **Naming**: Use snake_case for pattern_id
2. **Severity**: Match actual risk level
3. **Time Windows**: Use appropriate sizes (5-60 min)
4. **Testing**: Test pattern with sample data before enabling
5. **Documentation**: Always include description
6. **Versioning**: Increment version on changes
7. **Performance**: Avoid overly complex nested patterns

## Performance Considerations

- **Memory**: Each pattern consumes memory for statistics
- **CPU**: Complex correlations use more CPU
- **Latency**: Add 10-100ms per pattern match
- **Scaling**: Use multiple CEP engine instances for high throughput

## Monitoring Patterns

### Pattern Execution Stats
```bash
GET /api/patterns/{pattern_id}/stats
```

Response:
```json
{
  "pattern_id": "high_traffic_congestion",
  "matches_total": 42,
  "matches_today": 5,
  "last_match": "2026-03-26T14:30:00Z",
  "avg_response_time_ms": 125
}
```

### Enable/Disable Pattern
```bash
PATCH /api/patterns/{pattern_id}/toggle
```

## Troubleshooting

### Pattern not matching
- Check EPL syntax
- Verify input event types exist
- Ensure window size is appropriate
- Check MongoDB for pattern record

### High CPU usage
- Reduce number of patterns
- Use longer time windows
- Simplify pattern logic

### Pattern matches too often
- Increase time window size
- Add stricter WHERE conditions
- Increase threshold values

## See Also

- [Esper EPL Documentation](https://www.espertech.com/esper/)
- [Pattern Design Patterns](https://www.espertech.com/)
- [MongoDB Pattern Storage](../schemas/README.md)
