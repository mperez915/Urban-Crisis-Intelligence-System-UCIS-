# UCIS Quick Start Guide

## 🚀 Getting Started in 5 Minutes

### Prerequisites
- Docker & Docker Compose installed
- 4GB+ free disk space
- macOS, Linux, or Windows with WSL2

### Step 1: Clone & Navigate
```bash
cd /Users/melchorperez/Documents/España/UCA/IISC/SD/Urban-Crisis-Intelligence-System-UCIS-
```

### Step 2: Configure Environment
```bash
# Environment is already set up in .env
# (Uses default credentials for development)
cat .env
```

### Step 3: Start All Services
```bash
docker compose up -d --build
```

Or with logs:
```bash
docker compose up --build
```

> The API automatically seeds the 8 default CEP patterns into MongoDB on startup if none exist, so patterns will always appear in the Overview regardless of whether this is a fresh start or a restart.

### Step 4: Verify Services
```bash
# Check all containers are running
docker-compose ps

# All should show "Up"
CONTAINER ID   IMAGE                    STATUS
xxxxx          rabbitmq:3.12            Up
xxxxx          mongo:7.0                Up
xxxxx          ucis-simulator           Up
xxxxx          ucis-cep-engine          Up
xxxxx          ucis-enricher            Up
xxxxx          ucis-websocket           Up
xxxxx          ucis-api                 Up
xxxxx          ucis-frontend            Up
```

### Step 5: Access the System

| Service | URL | Credentials |
|---------|-----|-------------|
| **Frontend Dashboard** | http://localhost:3000 | - |
| **REST API** | http://localhost:5000/api | - |
| **WebSocket Server** | http://localhost:8083/health | - |
| **RabbitMQ Management** | http://localhost:15672 | admin / admin123 |
| **MongoDB** | localhost:27017 | admin / admin123 |

## 📊 What's Running

### 1. **Simulator** 🧩
Generates 100 events/second from 5 domains:
- Climate (temperature, storms, wind)
- Traffic (congestion, accidents)
- Health (emergency calls, ambulance dispatch)
- Environment (air quality, pollution)
- Population (crowds, gatherings)

**Check it**: `docker logs -f ucis-simulator | head -20`

### 2. **RabbitMQ Broker** 🐇
Routes events to all consumers via topics.

**Check it**: http://localhost:15672 (admin/admin123)

### 3. **CEP Engine** 🧠
Detects complex events using 8 predefined patterns.

**Check it**: `docker logs -f ucis-cep-engine`

### 4. **Enricher** 🧬
Adds context(zone info, coordinates) to events.

**Check it**: `docker logs -f ucis-enricher`

### 5. **MongoDB** 🗄️
Stores raw events, complex events, and patterns.

**Check it**: 
```bash
docker exec -it ucis-mongodb mongosh -u admin -p admin123
> use ucis_db
> db.events.count()  # Should be > 0
```

### 6. **REST API** 🌐
Flask API exposing data to frontend.

**Check it**: 
```bash
curl http://localhost:5000/health
curl http://localhost:5000/api/events?limit=5
```

### 7. **WebSocket Server** 🔌
Pushes complex events to the frontend in real-time via Socket.IO.
No HTTP polling needed for alerts — events arrive instantly.

**Check it**: `curl http://localhost:8083/health`

### 8. **React Frontend** 🖥️
Real-time dashboard for monitoring. Alerts arrive via WebSocket push;
events, stats and patterns still use REST polling every 5s.
A green dot indicator shows the WebSocket connection status.

**Check it**: http://localhost:3000

## 🔄 Common Tasks

### View Recent Events
```bash
curl http://localhost:5000/api/events?limit=10 | jq
```

### View Alerts/Complex Events
```bash
curl http://localhost:5000/api/events/complex?limit=5 | jq
```

### View Patterns
```bash
curl http://localhost:5000/api/patterns | jq
```

### Monitor Event Rate
```bash
watch -n 1 "curl -s http://localhost:5000/api/events?limit=1 | jq '.count'"
```

### Check Queue Depths
```bash
# Via RabbitMQ CLI
docker exec ucis-rabbitmq rabbitmq-diagnostics list_queues
```

### View CEP Engine Logs
```bash
docker logs -f ucis-cep-engine | grep "PATTERN\|ERROR"
```

### Query MongoDB
```bash
docker exec -it ucis-mongodb mongosh -u admin -p admin123

# List events by domain
> use ucis_db
> db.events.aggregate([{$group: {_id: "$domain", count: {$sum:1}}}])

# Find critical events
> db.events.find({severity: "critical"}).limit(5)

# Find complex events
> db.complex_events.find().limit(5)
```

## 📈 Expected Behavior

After ~30 seconds:
1. ✅ Simulator starts generating events
2. ✅ RabbitMQ shows messages flowing
3. ✅ MongoDB contains events starting to accumulate
4. ✅ CEP engine detects first complex events
5. ✅ API returns event data
6. ✅ Frontend shows dashboard with data and alerts

## 🛑 Stopping the System

```bash
# Stop all containers
docker-compose down

# Stop and remove volumes (WARNING: deletes data)
docker-compose down -v
```

## 🔧 Troubleshooting

### Services not starting
```bash
# Check individual service logs
docker-compose logs simulator
docker-compose logs cep-engine
docker-compose logs api
```

### Frontend shows "API not connecting"
```bash
# Verify API is running
curl http://localhost:5000/health

# Check API container
docker logs ucis-api
```

### No events in MongoDB
```bash
# Check simulator is running and connected to RabbitMQ
docker logs ucis-simulator | grep -i "error\|connected"

# Check RabbitMQ has messages
docker exec ucis-rabbitmq rabbitmq-diagnostics list_queues
```

### High memory usage
```bash
# Reduce event rate in .env
EVENT_RATE=50  # Change from 100

# Restart simulator
docker-compose restart simulator
```

## 📚 Documentation

For detailed information, see:
- [System Architecture](./README.md) — Overview of all 8 components
- [Simulator](./services/simulator/README.md) — Event generation
- [CEP Engine](./services/cep-engine/README.md) — Pattern detection
- [API Backend](./services/api/README.md) — REST endpoints
- [Frontend](./services/frontend/README.md) — Dashboard UI
- [RabbitMQ Config](./config/rabbitmq/README.md) — Message broker setup
- [Patterns](./config/patterns/README.md) — CEP rules

## 🎯 Next Steps

1. **Explore the Frontend**: Visit http://localhost:3000
2. **Test an API**: `curl http://localhost:5000/api/events`
3. **Add a Custom Pattern**: Edit `config/patterns/default_patterns.json`
4. **Monitor RabbitMQ**: Visit http://localhost:15672
5. **Check MongoDB Data**: Connect to mongodb://localhost:27017
6. **Read Pattern Docs**: See [Patterns README](./config/patterns/README.md)

## ⚡ Performance Testing

To test with higher event rate:

```bash
# In .env, increase EVENT_RATE
EVENT_RATE=500

# Restart simulator
docker-compose restart simulator

# Monitor RabbitMQ and CEP engine
docker logs -f ucis-cep-engine | grep PATTERN
```

## 💡 Tips

- **Real-time Alerts**: Delivered instantly via WebSocket (Socket.IO) — no refresh needed
- **Connection Indicator**: Green dot in header = WebSocket connected
- **Auto-refresh Dashboard**: Events, stats and patterns update via REST every 5 seconds
- **Check Health**: All services have `/health` endpoints
- **Persistent Data**: MongoDB data survives `docker compose down`
- **Clear All**: `docker compose down -v` (removes all data — patterns will be re-seeded automatically on next startup)
- **Rebuild Images**: `docker-compose build --no-cache`

## 📞 Support

For detailed troubleshooting, see individual component READMEs in each service directory.

---

**Created**: March 26, 2026  
**Version**: 1.0
