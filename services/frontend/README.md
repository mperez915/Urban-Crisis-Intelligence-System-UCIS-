# React Dashboard

**Component 6** — Real-time Monitoring Dashboard

## Overview

Single-page React 18 app served by Nginx on port 3000. Polls the REST API every 5 seconds. Nginx also proxies `/api/` to the Flask backend.

## Tabs

| Tab       | Data fetched                                      | Refresh |
|-----------|---------------------------------------------------|---------|
| Dashboard | `/api/events?limit=10`, `/api/events/complex?limit=10`, `/api/stats/events-per-minute`, `/api/stats/top-alerts` | 5s |
| Alerts    | `/api/events/complex?limit=50`                    | 5s      |
| Events    | `/api/events?limit=50`                            | 5s      |
| Patterns  | `/api/patterns`                                   | 5s      |

The Patterns tab has **full CRUD** — create, edit, enable/disable, and delete patterns. Changes are picked up by the CEP Engine within ~30 seconds (no restart needed).

## Severity color coding

| Severity | Color   |
|----------|---------|
| critical | #ff4444 |
| high     | #ff9800 |
| medium   | #ffc107 |
| low      | #4caf50 |

## Access

```
http://localhost:3000
```

## Configuration

| Environment variable   | Default                        |
|------------------------|--------------------------------|
| `REACT_APP_API_URL`    | `http://localhost:5000/api`    |

In Docker the Nginx config proxies `/api/` to `http://api:5000/api/` automatically — no env var needed.

## Running locally

```bash
npm install
REACT_APP_API_URL=http://localhost:5000/api npm start
```

## Building for Docker

```bash
npm run build   # output: build/
docker build -t ucis-frontend .
```

## Dependencies

- **React 18** — UI framework
- **Axios** — HTTP client
- **Recharts** — Line chart on Dashboard tab
- **Leaflet / react-leaflet** — included in package.json but not yet wired up in App.js

## Known limitations

- No WebSocket/SSE — polling only (5-second interval)
- Leaflet map not yet implemented
