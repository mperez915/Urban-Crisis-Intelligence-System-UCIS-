# REST API

**Component 5** — REST API Backend

## Overview

Flask 3.x API that exposes MongoDB data (raw events, complex events, patterns, statistics) to the React frontend. Accessible via the Nginx proxy at `http://localhost:3000/api/`.

## Endpoints

### Health
| Method | Path      | Description         |
|--------|-----------|---------------------|
| GET    | `/health` | MongoDB ping        |

### Events
| Method | Path                        | Description                              |
|--------|-----------------------------|------------------------------------------|
| GET    | `/api/events`               | Raw events (filters: domain, zone, severity, limit, skip) |
| GET    | `/api/events/<event_id>`    | Single event by `id` field              |
| GET    | `/api/events/complex`       | Complex events (filters: pattern_id, alert_level, limit, skip) |

### Patterns
| Method | Path                        | Description                              |
|--------|-----------------------------|------------------------------------------|
| GET    | `/api/patterns`             | All patterns sorted by created_at DESC  |
| POST   | `/api/patterns`             | Create pattern                          |
| PUT    | `/api/patterns/<pattern_id>`| Partial update via `$set`               |
| DELETE | `/api/patterns/<pattern_id>`| Delete pattern                          |

> **Note:** Pattern changes (POST/PUT/DELETE) write to MongoDB. The CEP Engine must be restarted (or `PatternService.loadAndDeployPatterns()` called) to pick up changes at runtime.

### Statistics
| Method | Path                        | Description                              |
|--------|-----------------------------|------------------------------------------|
| GET    | `/api/stats/events-per-minute` | Event counts bucketed by minute (last 1 hour) |
| GET    | `/api/stats/top-alerts`     | Top 10 patterns by complex event count  |
| GET    | `/api/stats/zones/<zone>`   | Event and complex event counts for a zone |

## Access

The API is **not** exposed directly to the host. All external access goes through Nginx:

```
http://localhost:3000/api/  →  http://api:5000/api/
```

For local development, run the API directly on port 5000:

```bash
pip install -r requirements.txt
export MONGO_URI=mongodb://admin:admin123@localhost:27017/ucis_db?authSource=admin
python app.py
```

## Configuration

| Environment variable | Default                                            |
|----------------------|----------------------------------------------------|
| `MONGO_URI`          | `mongodb://admin:admin123@mongodb:27017/ucis_db?authSource=admin` |
| `FLASK_ENV`          | `development`                                      |
| `FLASK_DEBUG`        | `False`                                            |

## Monitoring

```bash
docker logs -f ucis-api
curl http://localhost:3000/health
curl http://localhost:3000/api/events?limit=5
```
