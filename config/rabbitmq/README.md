# RabbitMQ Message Broker Configuration

🐇 **Component 2** — Message Broker

## Overview

RabbitMQ serves as the central message broker for UCIS, distributing events from producers (Simulator) to consumers (CEP Engine, Enricher, Archive).

## Architecture

```
Simulator (Producer)
    │
    └─> RabbitMQ Broker
         │
         ├─> CEP Engine (Consumer)
         ├─> Enricher (Consumer)
         └─> Archive (Consumer)
```

## Configuration Files

- `rabbitmq.conf` — Server configuration
- `definitions.json` — Exchanges, queues, bindings, users

## Key Configuration Parameters

### Network
- **Port 5672**: AMQP protocol (for clients)
- **Port 15672**: Management UI (for monitoring)

### Memory
- **High Watermark**: 60% (start paging to disk)
- **Paging Ratio**: 0.75

### Performance
- **Max Channels**: 2048
- **Max Frame Size**: 128KB
- **Heartbeat**: 60 seconds

## Infrastructure

### Exchanges

#### Primary: `ucis.events`
- **Type**: Topic
- **Durable**: Yes
- **Purpose**: Receives all raw IoT events from simulator

**Routing Keys**:
```
events.climate.temperature
events.climate.storm
events.traffic.congestion
events.traffic.accident
events.health.emergency_call
events.environment.air_quality
events.population.gathering
events.enriched.*          (enriched events)
events.complex.*           (CEP complex events)
```

#### Secondary: `ucis.complex`
- **Type**: Topic
- **Durable**: Yes
- **Internal**: Yes
- **Purpose**: Routes complex events detected by CEP

### Queues

#### `ucis.cep.events`
- **Subscribers**: CEP Engine
- **Binding**: `ucis.events` → `events.#` (all events)
- **Purpose**: Event stream for pattern detection

#### `ucis.enricher.events`
- **Subscribers**: Event Enricher
- **Binding**: `ucis.events` → `events.#` (all events)
- **Purpose**: Event enrichment with context

#### `ucis.archive.events`
- **Subscribers**: Archive service (optional)
- **Binding**: `ucis.events` → `events.#` (all events)
- **Purpose**: Long-term event archival

### Users

#### admin (Default)
- **Username**: admin
- **Password**: (from .env)
- **Tags**: administrator
- **Permissions**: All (for management)

#### ucis_user (Application)
- **Username**: ucis_user
- **Password**: (from .env)
- **Permissions**: Limited to ucis.* resources

### High Availability

**Policy**: `ha-all`
- Applies to: Queues matching pattern `^ucis\..*`
- Mode: Replicate to all nodes
- Sync: Automatic sync

## Accessing RabbitMQ

### Management UI
```
URL: http://localhost:15672
Username: admin
Password: (from .env)
```

### CLI Commands

```bash
# Inside container
docker exec ucis-rabbitmq rabbitmq-diagnostics ping

# List queues
docker exec ucis-rabbitmq rabbitmq-diagnostics list_queues

# List exchanges
docker exec ucis-rabbitmq rabbitmq-diagnostics list_exchanges

# Check connections
docker exec ucis-rabbitmq rabbitmqctl list_connections
```

## Message Flow Example

### 1. Simulator publishes temperature event
```
Exchange: ucis.events
Routing Key: events.climate.temperature
Message: {
  "id": "uuid",
  "domain": "climate",
  "type": "temperature",
  "zone": "downtown",
  ...
}
```

### 2. RabbitMQ routes to matching subscribers

**To CEP Engine** (via ucis.cep.events queue)
- Uses pattern: `events.#`
- CEP analyzes against patterns
- Publishes complex event if matched

**To Enricher** (via ucis.enricher.events queue)
- Adds geographic context
- Publishes enriched version to `events.enriched.climate.temperature`

**To Archive** (via ucis.archive.events queue)
- Stores event for long-term analysis
- Enables event replay

## Performance Tuning

### For High Throughput (>10k evt/sec)

1. **Increase Memory**:
```conf
vm_memory_high_watermark.relative = 0.8
```

2. **Tune Thread Pool**:
```conf
channel_max = 4096
worker_pool_size = 256
```

3. **Optimize Frame Size**:
```conf
frame_max = 262144  # 256KB
```

### For Large Messages

```conf
frame_max = 1048576  # 1MB
```

## Monitoring

### Queue Depth
Monitor from RabbitMQ UI:
- Management → Queues
- Check "messages ready" and "messages unacked"

### Message Rate
```bash
# Approximate throughput (events/sec)
Watch "publish" and "deliver" rates in Management UI
```

### Connection Health
```bash
# List active connections
rabbitmqctl list_connections

# Monitor memory
rabbitmqctl status
```

## Troubleshooting

### Issue: Connection Refused
**Solution**: 
- Verify RabbitMQ container is running: `docker ps`
- Check port 5672 is accessible
- Verify credentials in .env

### Issue: Queue Not Created
**Solution**:
- Confirm definitions.json is loaded
- Check RabbitMQ startup logs: `docker logs ucis-rabbitmq`
- Manually create queue via Management UI or CLI

### Issue: Messages Not Routing
**Solution**:
- Verify routing key matches queue binding
- Check exchange type matches sender's expectation
- Ensure binding pattern is correct (e.g., `events.#`)

### Issue: Memory Pressure
**Solution**:
- Increase RabbitMQ memory limit
- Increase disk space
- Enable message TTL for old messages
- Implement consumer backpressure

## Scaling RabbitMQ

### Single Node (Current)
- Suitable for: <10,000 evt/sec
- Memory: 512MB-2GB
- Disk: 10GB+

### Clustered (Future)
```yaml
services:
  rabbitmq-1:
    environment:
      RABBITMQ_ERLANG_COOKIE: secret-cookie
      RABBITMQ_NODENAME: rabbit@rabbitmq-1
  
  rabbitmq-2:
    environment:
      RABBITMQ_ERLANG_COOKIE: secret-cookie
      RABBITMQ_NODENAME: rabbit@rabbitmq-2
```

## Security Considerations

1. **Change Default Credentials**: Always change admin password
2. **AMQP/TLS**: Use SSL for production
3. **Firewall**: Restrict access to 5672 and 15672
4. **User Permissions**: Use principle of least privilege
5. **Audit Logging**: Enable plugin for audit trail

## Message Retention

### TTL (Time To Live)
```javascript
// Set 24-hour TTL on queue
db.rabbitmq.set_queue_ttl("ucis.archive.events", 86400000);
```

### Max Length
```javascript
// Keep only last 1 million messages
db.rabbitmq.set_queue_max_length("ucis.cep.events", 1000000);
```

## See Also

- [RabbitMQ Official Documentation](https://www.rabbitmq.com/documentation.html)
- [RabbitMQ Topics](https://www.rabbitmq.com/tutorials/tutorial-five-python.html)
- [RabbitMQ Management UI](https://www.rabbitmq.com/management.html)
