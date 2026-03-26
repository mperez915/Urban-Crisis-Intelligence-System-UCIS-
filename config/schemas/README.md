# Database Schemas and MongoDB Configuration

This directory contains database schema definitions and MongoDB initialization scripts.

## Files

- `mongo-init.js` — MongoDB initialization script (runs on container startup)
- `events_schema.json` — JSON Schema for event validation

## Collections

### `events`
Stores all simple (raw) events from the simulator.

**Fields:**
- `id` (string, UUID) — Unique event identifier
- `timestamp` (ISO-8601) — Event occurrence time
- `domain` (enum) — Event domain: climate, traffic, health, environment, population
- `type` (string) — Event type (e.g., "accident", "storm", "air_quality")
- `zone` (string) — Geographic zone
- `severity` (enum) — low, medium, high, critical
- `processed` (boolean) — CEP processing status
- `metadata` (object) — Domain-specific fields
- `created_at` (date) — MongoDB insertion time

**Indexes:**
- Timestamp (descending) — For time-range queries
- Domain + Type — For filtering by domain/type
- Zone — For geographic queries
- Severity — For alert filtering
- Created_at (descending) — For pagination

**TTL:** 30 days (auto-deletion)

### `complex_events`
Stores complex events detected by the CEP engine.

**Fields:**
- `pattern_id` (string) — Triggering pattern identifier
- `timestamp` (ISO-8601) — Detection time
- `source_events` (array) — IDs of events that triggered pattern
- `alert_level` (enum) — low, medium, high, critical
- `description` (string) — Human-readable alert description
- `data` (object) — Pattern-specific results
- `acknowledged` (boolean) — Alert acknowledgment status
- `acknowledged_by` (string) — User who acknowledged
- `created_at` (date) — Detection time

**Indexes:**
- Timestamp (descending)
- Pattern_id
- Alert_level
- Created_at

### `patterns`
Stores CEP pattern definitions (loaded dynamically).

**Fields:**
- `pattern_id` (string, unique) — Pattern identifier
- `name` (string) — Human-readable name
- `description` (string) — Pattern description
- `epl_rule` (string) — Esper EPL query
- `enabled` (boolean) — Is pattern active?
- `severity` (enum) — Alert severity if triggered
- `input_domains` (array) — Required event domains
- `version` (number) — Pattern version
- `created_at` (date)
- `updated_at` (date)
- `created_by` (string) — Creator username
- `last_triggered` (ISO-8601) — Last execution

**Indexes:**
- Pattern_id (unique)
- Enabled

### `pattern_executions`
Audit log of pattern matches and executions.

**Fields:**
- `pattern_id` (string)
- `timestamp` (ISO-8601) — Execution time
- `matched_events` (array) — IDs of matching events
- `result` (object) — Pattern output
- `execution_time_ms` (number)
- `status` (enum) — success, error, timeout
- `error_message` (string, optional)
- `created_at` (date)

**TTL:** 7 days (auto-deletion)

## Query Examples

### Find recent traffic accidents
```javascript
db.events.find({
  domain: "traffic",
  type: "accident",
  timestamp: { $gte: ISODate("2026-03-26T00:00:00Z") }
}).sort({ timestamp: -1 }).limit(100)
```

### Find critical alerts in last hour
```javascript
db.complex_events.find({
  alert_level: "critical",
  created_at: { $gte: new Date(Date.now() - 3600000) }
}).sort({ created_at: -1 })
```

### List enabled patterns
```javascript
db.patterns.find({ enabled: true }).sort({ created_at: -1 })
```

### Count events by domain (last 24h)
```javascript
db.events.aggregate([
  {
    $match: {
      created_at: { $gte: new Date(Date.now() - 86400000) }
    }
  },
  {
    $group: {
      _id: "$domain",
      count: { $sum: 1 }
    }
  }
])
```

## Backup & Restore

### Backup
```bash
docker exec ucis-mongodb mongodump \
  --username admin \
  --password admin123 \
  --authenticationDatabase admin \
  --out /backup/ucis-backup
```

### Restore
```bash
docker exec ucis-mongodb mongorestore \
  --username admin \
  --password admin123 \
  --authenticationDatabase admin \
  /backup/ucis-backup/ucis_db
```

## Performance Tuning

1. **Compression**: Collections use Snappy compression
2. **TTL Indexes**: Automatic cleanup of old data
3. **Aggregation Pipeline**: Use $match early in pipelines
4. **Compound Indexes**: Optimize common query patterns

## Extending Schemas

To add new event types:

1. Update `events_schema.json` with new domain definitions
2. Add new collection validators if needed (in `mongo-init.js`)
3. Create corresponding indexes
4. Update simulator event generators
5. Restart MongoDB container

## See Also

- [MongoDB Validator Documentation](https://docs.mongodb.com/manual/core/schema-validation/)
- [MongoDB Indexing](https://docs.mongodb.com/manual/indexes/)
- [TTL Indexes](https://docs.mongodb.com/manual/core/index-ttl/)
