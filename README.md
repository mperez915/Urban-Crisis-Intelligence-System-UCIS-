# Urban Crisis Intelligence System (UCIS)

A modular, event-driven microservices architecture for real-time detection and monitoring of urban crises through complex event processing (CEP).

## 🏗️ Architecture Overview

UCIS consists of **8 independent, dockerized components** that work together to ingest, process, enrich, and visualize real-time IoT events from multiple domains (climate, traffic, health, environment, population density).

```
┌─────────────────┐
│    Simulator    │  (Python + Pika)
│   Multi-Domain  │  Generates IoT events
└────────┬────────┘
         │ JSON events
         ▼
┌─────────────────┐
│   RabbitMQ      │  Message Broker
│    Broker       │  Routes & Decouples
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐ ┌──────────┐
│  CEP   │ │ Enricher │  (Java + Esper)
│ Engine │ │ (Python) │  Pattern Detection
└───┬────┘ └────┬─────┘
    │           │
    └─────┬─────┘
          ▼
    ┌──────────────┐
    │   MongoDB    │  Persistence
    │   Database   │  Events & Patterns
    └──────┬───────┘
           │
      ┌────┴─────┐
      ▼          ▼
  ┌────────┐  ┌────────┐
  │  Flask │  │ Pattern│  REST API
  │  API   │  │Manager │
  └────┬───┘  └────────┘
       │
       ▼
  ┌──────────┐
  │  React   │  Frontend Dashboard
  │ Frontend │  Real-time Visualization
  └──────────┘
```

## 📁 Project Structure

```
ucis/
├── services/
│   ├── simulator/              # 🧩 Component 1: Multi-Domain Simulator
│   │   ├── Dockerfile
│   │   ├── simulator.py
│   │   ├── requirements.txt
│   │   ├── event_generators/
│   │   └── README.md
│   │
│   ├── cep-engine/             # 🧠 Component 3: CEP Engine
│   │   ├── Dockerfile
│   │   ├── pom.xml
│   │   ├── src/
│   │   ├── epl-rules/
│   │   └── README.md
│   │
│   ├── enricher/               # 🧬 Component 4: Event Enricher
│   │   ├── Dockerfile
│   │   ├── enricher.py
│   │   ├── requirements.txt
│   │   └── README.md
│   │
│   ├── api/                    # 🌐 Component 6: API Backend
│   │   ├── Dockerfile
│   │   ├── app.py
│   │   ├── requirements.txt
│   │   └── README.md
│   │
│   └── frontend/               # 🖥️ Component 7: Frontend Dashboard
│       ├── Dockerfile
│       ├── package.json
│       ├── src/
│       ├── public/
│       └── README.md
│
├── config/
│   ├── patterns/               # ⚙️ Component 8: Pattern Definitions (JSON)
│   │   ├── traffic_patterns.json
│   │   ├── health_patterns.json
│   │   └── README.md
│   │
│   ├── schemas/                # 📋 Event Schema Definitions
│   │   ├── events_schema.json
│   │   └── README.md
│   │
│   └── rabbitmq/
│       ├── rabbitmq.conf
│       └── definitions.json
│
├── docker-compose.yml          # Orchestration & Service Discovery
├── .env                        # Environment Configuration
├── .env.example                # Environment Template
└── README.md                   # This file
```

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- Git

### Setup

1. **Clone Repository**
   ```bash
   cd /Users/melchorperez/Documents/España/UCA/IISC/SD/Urban-Crisis-Intelligence-System-UCIS-
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env for your deployment settings
   ```

3. **Start All Services**
   ```bash
   docker-compose up -d
   ```

4. **Verify Services**
   ```bash
   docker-compose ps
   ```

## 🧩 Components Overview

| # | Component | Technology | Role | Port |
|---|-----------|-----------|------|------|
| 1 | **Simulator** | Python 3.11 + Pika | Generates multi-domain IoT events | N/A |
| 2 | **RabbitMQ** | RabbitMQ 3.12 | Message broker & event routing | 5672, 15672 |
| 3 | **CEP Engine** | Java 17 + Esper | Detects complex events & patterns | 8081 |
| 4 | **Enricher** | Python 3.11 + FastAPI | Augments events with context | 8082 |
| 5 | **MongoDB** | MongoDB 7.0 | Stores events & pattern configs | 27017 |
| 6 | **API Backend** | Python 3.11 + Flask | REST endpoints for frontend | 5000 |
| 7 | **Frontend** | React 18 + Node 18 | Dashboard & visualization | 3000 |
| 8 | **Pattern Manager** | Flask + MongoDB | Dynamic pattern CRUD | 5000 |

## 🔄 Data Flow

1. **Event Generation**: Simulator produces domain-specific events (climate, traffic, health, etc.)
2. **Message Routing**: RabbitMQ distributes events to CEP Engine and Enricher
3. **Enrichment**: Enricher adds contextual data (risk zones, density, historical)
4. **Pattern Detection**: CEP Engine executes EPL rules against event streams
5. **Persistence**: Complex events stored in MongoDB
6. **API Access**: Flask API exposes data to frontend
7. **Visualization**: React dashboard displays alerts, history, and analytics

## 📋 Configuration Files

### Event Patterns (Component 8)
Define CEP rules in `/config/patterns/` as JSON. Example:
```json
{
  "pattern_id": "high_traffic_alert",
  "name": "High Traffic Congestion",
  "epl_rule": "SELECT * FROM TrafficEvent.win:time(5 min) WHERE speed < 10 AND density > 0.8",
  "severity": "high",
  "enabled": true
}
```

### Event Schemas
Define expected event structure in `/config/schemas/events_schema.json`:
```json
{
  "climate_event": {
    "id": "string",
    "timestamp": "ISO-8601",
    "temperature": "float",
    "humidity": "float",
    "zone": "string"
  }
}
```

### RabbitMQ Topics
- `events.climate.*` → Climate events
- `events.traffic.*` → Traffic events
- `events.health.*` → Health events
- `events.environment.*` → Environmental events
- `events.population.*` → Population density events
- `events.complex.*` → Detected complex events

## 🔌 API Endpoints

### Events API (`/api/events`)
- `GET /api/events` — List recent events
- `GET /api/events?type=climate` — Filter by type
- `GET /api/events/:id` — Get event details

### Patterns API (`/api/patterns`)
- `GET /api/patterns` — List all patterns
- `POST /api/patterns` — Create new pattern
- `PUT /api/patterns/:id` — Update pattern
- `DELETE /api/patterns/:id` — Delete pattern
- `PATCH /api/patterns/:id/toggle` — Enable/disable pattern

### Statistics API (`/api/stats`)
- `GET /api/stats/events-per-minute` — Event rate
- `GET /api/stats/top-alerts` — Most triggered alerts
- `GET /api/stats/zones/:zone` — Zone-specific stats

## 🧪 Testing the System

### 1. Monitor RabbitMQ
Visit: http://localhost:15672 (admin / admin)

### 2. Check Simulator Output
```bash
docker logs ucis-simulator -f
```

### 3. View CEP Engine Logs
```bash
docker logs ucis-cep-engine -f
```

### 4. Query MongoDB
```bash
docker exec -it ucis-mongodb mongosh
> use ucis_db
> db.events.find().limit(5)
```

### 5. Test API
```bash
curl http://localhost:5000/api/events
curl http://localhost:5000/api/patterns
```

### 6. Open Frontend
Visit: http://localhost:3000

## 🛠️ Development

### Add New Event Domain

1. Create generator in `services/simulator/event_generators/my_domain.py`
2. Add schema to `config/schemas/events_schema.json`
3. Create RabbitMQ topic: `events.my_domain.*`
4. Create CEP rules in `config/patterns/my_domain_patterns.json`
5. Restart simulator: `docker-compose restart simulator`

### Add New Pattern

1. Create JSON pattern in `config/patterns/`
2. Call `POST /api/patterns` via API, or manually load to MongoDB
3. CEP engine reloads patterns on startup and listens for updates

### Scale CEP Engine

Adjust `docker-compose.yml`:
```yaml
deploy:
  replicas: 3
```

## 📚 Component Documentation

- [Simulator README](./services/simulator/README.md)
- [CEP Engine README](./services/cep-engine/README.md)
- [Enricher README](./services/enricher/README.md)
- [API Backend README](./services/api/README.md)
- [Frontend README](./services/frontend/README.md)
- [Pattern Manager README](./config/patterns/README.md)

## 🔐 Security & Best Practices

- ✅ Use `.env` for secrets (never commit)
- ✅ Enable RabbitMQ authentication (change default credentials)
- ✅ Enable MongoDB authentication
- ✅ Use network policies in production (Kubernetes)
- ✅ Validate all incoming events
- ✅ Implement rate limiting on API endpoints
- ✅ Use TLS for RabbitMQ and MongoDB in production

## 📈 Next Steps

- [ ] Deploy to Kubernetes
- [ ] Add authentication/authorization (OAuth2)
- [ ] Implement event replay from MongoDB
- [ ] Add alerting service (email, Slack)
- [ ] Create data retention policies
- [ ] Add performance monitoring (Prometheus)
- [ ] Implement circuit breakers and retry logic

## 📞 Support

For issues or questions about specific components, refer to the individual README files in each `services/` directory.

---

**Last Updated**: March 26, 2026
**Architecture Version**: 1.0