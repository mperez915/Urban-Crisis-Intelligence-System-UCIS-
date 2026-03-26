# REST API Backend README

🌐 **Component 6** — REST API Backend

## Overview

The API Backend exposes all UCIS data and features via REST endpoints.

### Capabilities

- **Event Queries**: Retrieve raw and complex events
- **Pattern Management**: CRUD operations on CEP patterns
- **Analytics**: Statistics and trend analysis
- **Real-time Data**: Access latest alerts and events

## Architecture

```
React Frontend
     │
     ▼
┌──────────────┐
│ REST API     │
│ (Flask)      │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ MongoDB      │
│ (database)   │
└──────────────┘
```

## API Reference

### Health & Status

#### Health Check
```bash
GET /health

Response (200):
{
  "status": "healthy",
  "service": "api",
  "mongo": "connected"
}
```

### Events API

#### List Events
```bash
GET /api/events?limit=100&skip=0&domain=traffic&zone=downtown&severity=high

Response (200):
{
  "events": [...],
  "count": 42,
  "limit": 100,
  "skip": 0
}
```

**Query Parameters:**
- `limit` (int, default: 100) — Items per page
- `skip` (int, default: 0) — Pagination offset
- `domain` (string) — Filter by domain
- `zone` (string) — Filter by zone
- `severity` (string) — Filter by severity

#### Get Event Details
```bash
GET /api/events/{event_id}

Response (200):
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-03-26T15:30:45Z",
  "domain": "traffic",
  "type": "accident",
  ...
}
```

### Complex Events API

#### List Complex Events
```bash
GET /api/events/complex?limit=100&pattern_id=high_traffic&alert_level=critical

Response (200):
{
  "events": [
    {
      "pattern_id": "high_traffic_accident",
      "timestamp": "2026-03-26T14:30:00Z",
      "alert_level": "critical",
      "source_events": ["evt-1", "evt-2"],
      ...
    }
  ]
}
```

### Patterns API

#### List Patterns
```bash
GET /api/patterns

Response (200):
{
  "patterns": [
    {
      "pattern_id": "high_traffic",
      "name": "High Traffic Congestion",
      "epl_rule": "SELECT * FROM TrafficEvent ...",
      "enabled": true,
      "severity": "high"
    }
  ]
}
```

#### Create Pattern
```bash
POST /api/patterns
Content-Type: application/json

{
  "pattern_id": "new_pattern",
  "name": "New Pattern",
  "description": "Description here",
  "epl_rule": "SELECT * FROM...",
  "severity": "high",
  "enabled": true,
  "input_domains": ["traffic", "health"]
}

Response (201):
{
  "_id": "507f1f77bcf86cd799439011",
  "pattern_id": "new_pattern"
}
```

#### Update Pattern
```bash
PUT /api/patterns/{pattern_id}
Content-Type: application/json

{
  "name": "Updated Name",
  "enabled": false,
  "severity": "critical"
}

Response (200):
{
  "modified_count": 1
}
```

#### Delete Pattern
```bash
DELETE /api/patterns/{pattern_id}

Response (200):
{
  "deleted_count": 1
}
```

### Statistics API

#### Events Per Minute
```bash
GET /api/stats/events-per-minute

Response (200):
{
  "data": [
    {
      "_id": "2026-03-26T15:30:00Z",
      "count": 542
    },
    {
      "_id": "2026-03-26T15:31:00Z",
      "count": 618
    }
  ]
}
```

#### Top Alerts
```bash
GET /api/stats/top-alerts

Response (200):
{
  "data": [
    {
      "_id": "high_traffic_accident",
      "count": 42
    },
    {
      "_id": "air_quality_critical",
      "count": 15
    }
  ]
}
```

#### Zone Statistics
```bash
GET /api/stats/zones/{zone}

Response (200):
{
  "zone": "downtown",
  "event_count": 1542,
  "complex_event_count": 23
}
```

## Configuration

### Environment Variables

```bash
MONGO_URI=mongodb://admin:admin123@localhost:27017/ucis_db
FLASK_ENV=development
FLASK_DEBUG=False
LOG_LEVEL=INFO
```

### Running Locally

```bash
pip install -r requirements.txt
python app.py
```

Visit: http://localhost:5000

## Error Responses

### 404 Not Found
```json
{
  "error": "Event not found"
}
```

### 500 Server Error
```json
{
  "error": "Internal server error"
}
```

## Authentication (Future)

Planned additions:
- JWT token authentication
- Role-based access control
- API key management

## Performance Optimization

### Indexing
Ensure MongoDB indexes exist:
```javascript
db.events.createIndex({ timestamp: -1 })
db.events.createIndex({ domain: 1, type: 1 })
db.complex_events.createIndex({ pattern_id: 1 })
```

### Caching
Consider adding Redis for:
- Pattern list cache (invalidate on update)
- Statistics results (TTL: 60s)

### Pagination
Always use limit/skip for large result sets:
```bash
# Good
GET /api/events?limit=50&skip=0

# Bad (retrieves all events)
GET /api/events
```

## Scaling

Deploy multiple API instances behind a load balancer:

```yaml
services:
  api-1:
    build: ./services/api
    ports:
      - "5001:5000"
  
  api-2:
    build: ./services/api
    ports:
      - "5002:5000"
  
  nginx:
    image: nginx
    ports:
      - "5000:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
```

## CORS Configuration

Current CORS policy allows all origins. For production:

```python
CORS(app, resources={
    r"/api/*": {
        "origins": ["https://yourfrontend.com"],
        "methods": ["GET", "POST", "PUT", "DELETE"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})
```

## Monitoring

### View Logs
```bash
docker logs -f ucis-api
```

### Common Endpoints for Testing
```bash
# Test connectivity
curl http://localhost:5000/health

# List recent events
curl http://localhost:5000/api/events?limit=5

# List patterns
curl http://localhost:5000/api/patterns
```

## See Also

- [Flask Documentation](https://flask.palletsprojects.com/)
- [PyMongo Documentation](https://pymongo.readthedocs.io/)
- [REST API Best Practices](https://restfulapi.net/)
