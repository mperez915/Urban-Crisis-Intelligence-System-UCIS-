# Urban Crisis Intelligence System (UCIS)

Un sistema inteligente de análisis de eventos en tiempo real para detección y monitoreo de crisis urbanas, combinando datos de múltiples dominios.

## Tabla de Contenidos

- [Visión General](#visión-general)
- [Arquitectura del Sistema](#arquitectura-del-sistema)
- [Componentes](#componentes)
- [Guía de Inicio Rápido](#guía-de-inicio-rápido)
- [Documentación Detallada](#documentación-detallada)
- [Características Implementadas](#características-implementadas)
- [Roadmap / Futuras Mejoras](#roadmap--futuras-mejoras)
- [Troubleshooting](#troubleshooting)

---

## Visión General

UCIS es una plataforma de análisis de eventos complejos diseñada para detectar patrones críticos en datos de sensores IoT urbanos. El sistema procesa eventos de **5 dominios principales** en tiempo real y entrega alertas al panel de control sin latencia mediante un canal **WebSocket dedicado** (Socket.IO):

- **Climate** — Temperatura, tormentas, viento
- **Traffic** — Congestión, accidentes, incidentes  
- **Health** — Llamadas de emergencia, ambulancias
- **Environment** — Calidad del aire, contaminación
- **Population** — Densidad, aglomeraciones, evacuaciones

El sistema genera **~100 eventos/segundo** y detecta **patrones complejos** mediante un motor CEP (Complex Event Processing) que correlaciona eventos múltiples.

---

## Arquitectura del Sistema

UCIS implementa una arquitectura de **microservicios basada en eventos**, organizada en 7 capas que procesan datos en tiempo real con un flujo unidireccional asincrónico. Los eventos complejos detectados por el motor CEP se entregan al frontend en tiempo real a través de un **servidor WebSocket dedicado** (FastAPI + Socket.IO), eliminando el polling HTTP para las alertas críticas.

### Diagrama de Arquitectura (Capas)

```
┌───────────────────────────────────────────────────────────────────────────┐
│  CAPA 1: GENERACIÓN                                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  Event Simulator  (Python 3.11 + Pika)                              │  │
│  │                                                                     │  │
│  │  5 dominios: Climate | Traffic | Health | Environment | Population  │  │
│  │  Tasa: 100 eventos/segundo (configurable via EVENT_RATE)            │  │
│  │  Zonas: downtown | suburbs | industrial | residential | airport     │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────┬────────────────────────────────────────┘
                                   │ publica routing key: events.<domain>.<type>
                                   ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  CAPA 2A: ENRUTAMIENTO — Evento Crudo                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  RabbitMQ 3.12  —  Exchange: ucis.events  (Topic, Durable)          │  │
│  │                                                                     │  │
│  │  binding: events.#  →  cola ucis.enricher.events  →  Enricher      │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────┬────────────────────────────────────────┘
                                   │ consume cola ucis.enricher.events
                                   ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  CAPA 3A: ENRIQUECIMIENTO                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  Enricher  (Python 3.11 + FastAPI, Port 8082)                       │  │
│  │                                                                     │  │
│  │  - Agrega contexto de zona (risk_level, population_density)         │  │
│  │  - Agrega infraestructura (hospitales, policía, bomberos)           │  │
│  │  - Agrega coordenadas geográficas                                   │  │
│  │  - Agrega avg_response_time_min de la zona                          │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────┬────────────────────────────────────────┘
                                   │ publica routing key: events.enriched.<domain>.<type>
                                   ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  CAPA 2B: ENRUTAMIENTO — Evento Enriquecido                               │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  RabbitMQ 3.12  —  Exchange: ucis.events  (mismo exchange)          │  │
│  │                                                                     │  │
│  │  binding: events.enriched.#  →  cola ucis.cep.events  →  CEP       │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────┬────────────────────────────────────────┘
                                   │ consume cola ucis.cep.events
                                   ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  CAPA 3B: PROCESAMIENTO CEP                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  CEP Engine  (Java 17 + Spring Boot 3.2 + Esper 8.9, Port 8081)     │  │
│  │                                                                     │  │
│  │  - Carga patrones activos desde MongoDB (colección patterns)        │  │
│  │  - Evalúa reglas EPL con ventanas temporales (1 min – 30 min)       │  │
│  │  - Correlaciona eventos de múltiples dominios por zona              │  │
│  │  - Al detectar patrón → genera evento complejo y escribe MongoDB    │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────┬────────────────────────────────────────┘
                                   │ escribe complex_events + actualiza stats en patterns
                                   ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  CAPA 4: ALMACENAMIENTO                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  MongoDB 7.0  (Port 27017)                                          │  │
│  │                                                                     │  │
│  │  ┌──────────────┐  ┌────────────────┐  ┌──────────────────────┐    │  │
│  │  │   events     │  │ complex_events │  │      patterns        │    │  │
│  │  ├──────────────┤  ├────────────────┤  ├──────────────────────┤    │  │
│  │  │ Crudos del   │  │ Alertas del    │  │ Reglas EPL (CRUD)    │    │  │
│  │  │ Simulador    │  │ CEP Engine     │  │ Cargadas por CEP     │    │  │
│  │  │ TTL: 30 días │  │ TTL: 30 días   │  │ Gestionadas por API  │    │  │
│  │  └──────────────┘  └────────────────┘  └──────────────────────┘    │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────┬────────────────────────────────────────┘
                                   │ read/write
                                   ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  CAPA 5: EXPOSICIÓN                                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  REST API  (Flask 3.0, Port 5000)                                   │  │
│  │                                                                     │  │
│  │  GET  /api/events              →  eventos crudos                    │  │
│  │  GET  /api/events/complex      →  alertas detectadas                │  │
│  │  GET  /api/patterns            →  patrones activos                  │  │
│  │  POST /api/patterns            →  crear patrón                      │  │
│  │  PUT  /api/patterns/:id        →  modificar / activar / desactivar  │  │
│  │  DEL  /api/patterns/:id        →  eliminar patrón                   │  │
│  │  GET  /api/stats/*             →  estadísticas agregadas            │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────┬────────────────────────────────────────┘
                                   │ HTTP polling cada 5s / CRUD patrones
                                   ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  CAPA 6: ENTREGA EN TIEMPO REAL                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  WebSocket Server  (Python 3.11 + FastAPI + Socket.IO, Port 8083)   │  │
│  │                                                                     │  │
│  │  - Consume cola ucis.websocket.events (binding: events.complex.#)   │  │
│  │  - Emite evento Socket.IO "complex_event" a todos los clientes      │  │
│  │  - Reconexión automática ante fallo de RabbitMQ                     │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────┬────────────────────────────────────────┘
                                   │ Socket.IO push en tiempo real
                                   ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  CAPA 7: VISUALIZACIÓN                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  React Dashboard  (React 18, Port 3000)                             │  │
│  │                                                                     │  │
│  │  Dashboard | Events | Alerts | Patterns                             │  │
│  │  Alertas en tiempo real vía Socket.IO (sin polling)                 │  │
│  │  Indicador de conexión WebSocket (punto verde/gris)                 │  │
│  │  Permite crear / modificar / activar / desactivar / eliminar        │  │
│  │  patrones → API → MongoDB                                           │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────┘
```

### Flujo de Datos Detallado (Paso a Paso)

```
PASO 1: GENERACIÓN
━━━━━━━━━━━━━━━━━━━
Simulador genera 100 eventos/segundo:
{
  "id": "evt-12345",
  "timestamp": "2026-04-18T10:30:45.123Z",
  "domain": "traffic",
  "type": "accident",
  "zone": "downtown",
  "severity": "critical",
  "street": "Main St",
  "vehicles_involved": 3,
  "injuries": 2,
  "lanes_blocked": 2
}

                            ↓

PASO 2: ENRUTAMIENTO (RabbitMQ) — Evento Crudo
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Exchange: ucis.events
Routing Key: events.traffic.accident

RabbitMQ distribuye el evento crudo a:
└→ Queue: ucis.enricher.events (binding: events.#) → Enricher

                          ↓

PASO 3: ENRIQUECIMIENTO
━━━━━━━━━━━━━━━━━━━━━━━
Enricher recibe evento crudo:
- Consulta zona en zone_context.json
- Agrega contexto geográfico
- Añade hospitales, policía, tiempo de respuesta
- Calcula nivel de riesgo de la zona

OUTPUT enriquecido:
{
  ...evento original...
  "enrichment": {
    "zone_context": {
      "risk_level": "high",
      "population": "very_high"
    },
    "coordinates": {
      "lat": 40.7128,
      "lon": -74.0060
    },
    "hospitals": 5,
    "enriched_at": "2026-04-18..."
  }
}

Publica a RabbitMQ:
Routing Key: events.enriched.traffic.accident

                          ↓

PASO 4: ENRUTAMIENTO (RabbitMQ) — Evento Enriquecido
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Exchange: ucis.events
Routing Key: events.enriched.traffic.accident

RabbitMQ distribuye el evento enriquecido a:
└→ Queue: ucis.cep.events (binding: events.enriched.#) → CEP Engine

                          ↓

PASO 5: PATRÓN MATCHING (CEP Engine)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CEP Engine recibe evento enriquecido:
- Almacena en ventana temporal
- Ejecuta reglas EPL contra patrones cargados de MongoDB
- Busca correlaciones entre dominios
- Compara con patrones activos

Si hay coincidencia:
{
  pattern_id: "accident_emergency",
  timestamp: "2026-04-18T10:30:45Z",
  alert_level: "critical",
  source_events: ["evt-12345"],
  description: "Critical accident"
}

Publica a RabbitMQ:
Routing: complex.accident_emergency

                    ↓

PASO 6: STREAMING WEBSOCKET
━━━━━━━━━━━━━━━━━━━━━━━━━━━
El evento complejo también se publica al exchange ucis.complex:

  Routing Key: events.complex.<pattern_id>
  Cola: ucis.websocket.events  →  WebSocket Server
  WebSocket Server emite evento Socket.IO "complex_event"
  Frontend recibe el push sin polling

PASO 7: ALMACENAMIENTO
━━━━━━━━━━━━━━━━━━━━━
RabbitMQ enruta a MongoDB:

Colección events:
Insert original → { _id, ...raw event... }

Colección complex_events:
Insert alert → { _id, pattern_id, ...alert... }

Both:
- Indexado por timestamp (descendent)
- Indexado por zone, domain, severity
- TTL opcional (purge históricos)

                    ↓

PASO 8: EXPOSICIÓN (API REST)
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Frontend hace polling cada 5 segundos para eventos crudos, estadísticas y patrones:

GET /api/events
→ MongoDB.find({}, {sort: {timestamp: -1}}).limit(50)
→ Response JSON: [event1, event2, ...]

GET /api/events/complex
→ MongoDB.find({collection: complex_events}).limit(50)
→ Response: [{pattern_id, alert_level, ...}, ...]

                    ↓

PASO 9: VISUALIZACIÓN
━━━━━━━━━━━━━━━━━━━
React Frontend actualiza Dashboard:

Tab 1 - Dashboard: Muestra stats y últimas alertas
Tab 2 - Events: Lista eventos con filtros
Tab 3 - Alerts: Alertas codificadas por color (rojo=crítico)
Tab 4 - Patterns: Gestión de reglas CEP
```

### Propiedades Arquitectónicas

**1. Desacoplamiento**
- Cada componente es independiente
- Fallo de uno no afecta los demás (RabbitMQ bufferea)
- Cambios en implementación sin afectar interfaces

**2. Escalabilidad Horizontal**
```
Puedes añadir múltiples instancias:
- N Simuladores → Distintas zonas
- N Enrichers → Load balancing en RabbitMQ
- N CEP Engines → Procesamiento distribuido
- N APIs → Detrás de load balancer
- N Frontends → CDN
```

**3. Asincronía**
- Simulator no espera respuesta (fire-and-forget)
- Enricher procesa independiente del CEP
- MongoDB escritura no bloquea lectura (eventual consistency)
- Frontend actualiza sin bloquear API

**4. Garantía de Entrega**
- RabbitMQ persiste mensajes
- ACK automático en Enricher (auto_ack=True)
- Dead Letter Queue para errores
- Retry automático en timeouts

**5. Monitoreo**
```
Cada componente expone métricas:
- Simulator: eventos generados/sec
- RabbitMQ: mensajes en queue, ACKs
- Enricher: latencia, eventos procesados
- CEP: pattern matches, memory usage
- MongoDB: query latency, index stats
- API: response times, error rates
- Frontend: render time, API latency
```

---

## Componentes Detallados y Sus Relaciones

### 1. Event Simulator (CAPA 1: GENERACIÓN)
**Ubicación**: `services/simulator/`  
**Responsabilidad**: Generar eventos realistas de IoT desde 5 dominios en tiempo real

**Características**:
- Genera 100 eventos/segundo (configurable: 50-1000+ evt/sec)
- 5 generadores de dominio (Climate, Traffic, Health, Environment, Population)
- Publica a RabbitMQ con routing keys `events.{domain}.{type}`
- Validación de eventos contra JSON Schema
- Multi-threading para generación paralela

**Estructura de Evento**:
```json
{
  "id": "uuid-string",
  "timestamp": "2026-04-18T10:30:45.123Z",
  "domain": "climate|traffic|health|environment|population",
  "type": "storm|accident|emergency_call|air_quality|crowd_alert",
  "zone": "downtown|suburbs|industrial|residential",
  "severity": "low|medium|high|critical",
  "domain_specific_fields": {}
}
```

**Dominios y Eventos Generados**:
1. **Climate**: temperatura (-5°C a 45°C), tormentas, viento (0-120 km/h)
2. **Traffic**: congestión, accidentes, incidentes de carretera
3. **Health**: llamadas de emergencia, despacho de ambulancias
4. **Environment**: índice de calidad del aire (AQI 0-500), tipos de contaminantes
5. **Population**: densidad de población, aglomeraciones, eventos masivos

**Tecnología**: Python 3.11 + Pika (RabbitMQ client)  
**Configuración**:
- `EVENT_RATE=100` (eventos/segundo)
- `LOG_LEVEL=INFO|DEBUG|WARNING|ERROR`
- `RABBITMQ_HOST`, `RABBITMQ_PORT`, credenciales

**Ciclo de vida del evento**:
1. Generador selecciona dominio random
2. Crea evento con valores aleatorios realistas
3. Valida contra schema
4. Serializa a JSON
5. Publica a RabbitMQ con routing key
6. Log de publicación

**Ver documentación completa**: [Simulator README](./services/simulator/README.md)

---

### 2. RabbitMQ Message Broker (CAPA 2: TRANSPORTE)
**Ubicación**: `config/rabbitmq/`  
**Responsabilidad**: Enrutamiento y distribución de eventos a múltiples consumidores

**Características**:
- Exchange: `ucis.events` (Topic type, Durable)
- Durabilidad y persistencia de mensajes en disco
- Management UI en puerto 15672 (admin/admin123)
- Dead Letter Queue para mensajes fallidos
- Soporte para múltiples consumidores simultáneamente

**Modelo de Routing (Topic Exchange)**:
```
Simulator publica:
  events.traffic.accident
     ↓
RabbitMQ compara contra patrones de binding:
  events.#              (todos los eventos — usado por ucis.enricher.events)
  events.enriched.#     (solo eventos enriquecidos — usado por ucis.cep.events)
  events.traffic.#      (todos los eventos de tráfico — ejemplo)
  events.*.accident     (accidentes de cualquier dominio — ejemplo)
     ↓
Distribuye a queues coincidentes:
  └─ ucis.enricher.events (patrón: events.#)

Enricher publica routing key: events.enriched.<domain>.<type>
RabbitMQ enruta el evento enriquecido:
  └─ ucis.cep.events (patrón: events.enriched.#)
```

**Queues Consumer**:
- `ucis.enricher.events` ← Event Enricher (binding: `events.#` — recibe eventos crudos)
- `ucis.cep.events` ← CEP Engine (binding: `events.enriched.#` — recibe solo eventos ya enriquecidos)

**Garantías de Entrega**:
- **Durabilidad**: Exchange, queue y mensajes durables
- **Persistencia**: Mensajes almacenados en disco antes de ACK
- **ACK**: Enricher usa auto_ack=True (inmediato); CEP usa ACK manual
- **Prefetch Count**: Control de carga (1 evento a la vez)
- **Timeout**: Si no hay ACK en 30 segundos, requeue

**Tecnología**: RabbitMQ 3.12 con plugin de management  
**Puerto**: 5672 (AMQP), 15672 (Management UI)  

**Características Avanzadas**:
- **Fan-out**: Mismo evento a múltiples consumidores sin interferencia
- **Rate Limiting**: Backpressure automático si consumidores lentos
- **Visibility Timeout**: Si un consumidor falla, evento vuelve a queue
- **Message TTL**: Mensajes antiguos se auto-purgan
- **Lazy Queues**: Optimización para almacenar en disco (no en RAM)

**Monitoreo RabbitMQ**:
```bash
# Ver estado de queues
docker exec ucis-rabbitmq rabbitmq-diagnostics list_queues

# Ver exchanges
docker exec ucis-rabbitmq rabbitmq-diagnostics list_exchanges

# Ver bindings
docker exec ucis-rabbitmq rabbitmq-diagnostics list_bindings
```

**Ver documentación completa**: [RabbitMQ Config](./config/rabbitmq/README.md)

---

### 3. CEP Engine (CAPA 3A: PROCESAMIENTO - PATRONES)
**Ubicación**: `services/cep-engine/`  
**Responsabilidad**: Detectar patrones complejos analizando correlaciones multi-dominio

**¿Qué es CEP?**
Complex Event Processing (CEP) es un motor que:
- Recibe streams de eventos simples
- Los analiza contra reglas lógicas complejas
- Detecta patrones en el tiempo y el espacio
- Genera "complex events" (alertas) cuando hay coincidencias

**Características**:
- Motor de eventos: **Esper 8.9.0** (CEP framework open-source)
- 8+ patrones predefinidos y extensibles
- Correlación temporal (evento A seguido de evento B)
- Correlación espacial (eventos en misma zona)
- Agregaciones (contar, promediar, sumar)
- Carga dinámica de patrones desde MongoDB (sin reiniciar)
- API REST para gestión de patrones (puerto 8081)
- Time windows: detectar eventos dentro de ventanas de tiempo

**Lenguaje de Patrones: Esper EPL (Event Processing Language)**

Ejemplo 1: Accidente + Emergencia en misma zona
```sql
SELECT * FROM PATTERN [
  accident=TrafficEvent(type='accident', severity='critical') ->
  emergency=HealthEvent(type='emergency_call')
] WHERE accident.zone = emergency.zone
WITHIN 5 minutes
```

Ejemplo 2: Múltiples congestiones en 15 minutos
```sql
SELECT zone, COUNT(*) as congestion_count
FROM TrafficEvent(type='congestion').win:time(15 min)
GROUP BY zone
HAVING COUNT(*) >= 3
```

Ejemplo 3: Correlated multi-domain (Tráfico + Ambiente)
```sql
SELECT * FROM PATTERN [
  air=EnvironmentEvent(type='air_quality', aqi > 300) ->
  traffic=TrafficEvent(type='congestion', density > 80)
] WHERE air.zone = traffic.zone
```

**Patrones Detectados (8+ activos)**:
1. Accident + Emergency (misma zona)
2. Multiple congestions (15 min window)
3. Air quality + Traffic (correlación)
4. Crowd alert + Health emergency
5. Extreme weather + Traffic impact
6. Pollution spike + Multiple health calls
7. Incident cascade (multi-dominio)
8. Peak population + Infrastructure stress

**Ciclo de Vida de un Patrón**:
1. Cargar patrones desde MongoDB al iniciar
2. Compilar reglas EPL en Esper
3. Crear statement listeners
4. Recibir eventos de RabbitMQ
5. Evaluarlos contra cada patrón
6. Si hay match → generar complex event
7. Publicar a RabbitMQ + MongoDB
8. Log de detección

**Tecnología**: Java 17 + Spring Boot 3.2.3 + Esper 8.9.0  
**Puerto**: 8081 (health endpoint)  

**Relaciones con otros componentes**:
```
RABBITMQ
    │
    └─ Envía eventos enriquecidos (events.enriched.#) ──→ CEP ENGINE
                                 │
                              Recibe en Queue: ucis.cep.events
                                 │
                          Cada evento se evalúa contra:
                          ├─ Pattern 1 (Accident + Emergency)
                          ├─ Pattern 2 (Multiple congestions)
                          ├─ Pattern 3 (Air quality + Traffic)
                          └─ ... (N patrones)
                                 │
                        SI hay coincidencia:
                                 │
                    Crea Complex Event (JSON)
                                 │
                        ┌────────┴────────┐
                        │                 │
                        ▼                 ▼
                    RABBITMQ          MONGODB
                  (publica alert)    (escribe en
                   routing key:       complex_events)
                   complex.*

API Endpoint para patrones:
GET  /api/patterns                → MongoDB.find({patterns})
GET  /api/patterns/{id}/stats    → Estadísticas de match
PUT  /api/patterns/{id}          → Actualizar + reload
```

**Performance**:
- Latencia promedio: 10-50 ms por evento
- Throughput: 10,000+ eventos/segundo por instancia
- Memory: 500MB-1GB (depende de # patrones y window size)
- Escalable: múltiples instancias detrás de load balancer

**Monitoreo CEP**:
```bash
# Ver logs de patrones
docker logs -f ucis-cep-engine | grep "PATTERN\|matched"

# Ver estadísticas
curl http://localhost:8081/api/patterns/accident_emergency/stats

# Ver métricas de memoria
curl http://localhost:8081/metrics
```

**Ver documentación completa**: [CEP Engine README](./services/cep-engine/README.md)

---

### 4. Event Enricher (CAPA 3B: PROCESAMIENTO - CONTEXTO)
**Ubicación**: `services/enricher/`  
**Responsabilidad**: Aumentar eventos crudos con información contextual de la zona

**¿Por qué Enriquecer?**
Un evento crudo contiene solo data de sensores:
```json
{"domain": "traffic", "zone": "downtown", "severity": "critical"}
```

Enriquecido, el mismo evento incluye contexto operacional:
```json
{
  "domain": "traffic",
  "zone": "downtown",
  "severity": "critical",
  "enrichment": {
    "zone_risk_level": "high",
    "population_density": "very_high",
    "recent_incidents": 45,
    "nearby_hospitals": 5,
    "nearest_hospital_km": 2.3,
    "nearest_police_station_km": 1.8,
    "average_response_time_min": 8.5,
    "coordinates": {"lat": 40.7128, "lon": -74.0060},
    "district": "Manhattan",
    "enriched_at": "2026-04-18T10:30:46Z"
  }
}
```

**Tipos de Enriquecimiento**:

1. **Contexto de Zona**:
   - Nivel de riesgo (low, medium, high, critical)
   - Densidad poblacional actual
   - Historial de incidentes (últimas 24 horas)
   - Tiempo promedio de respuesta

2. **Datos Geográficos**:
   - Coordenadas exactas (lat, lon)
   - Distrito/neighborhood
   - Zona administrativa

3. **Infraestructura Cercana**:
   - Hospitales más próximos (distancia, nombre)
   - Comisarías de policía
   - Estaciones de bomberos
   - Centros de emergencia

4. **Datos Históricos**:
   - Eventos previos en la zona (últimas 24h)
   - Patrones temporales
   - Horarios pico de tráfico
   - Eventos meteorológicos históricos

**Ciclo de Vida del Enriquecimiento**:
1. Recibe evento crudo de RabbitMQ
2. Extrae zone, timestamp, dominio
3. Consulta MongoDB para contexto de zona
4. Calcula distancias a infraestructura
5. Recupera datos históricos de últimas 24h
6. Crea objeto "enrichment" anidado
7. Publica evento enriquecido a RabbitMQ
8. Opcionalmente: cachea datos para próximos eventos

**Tecnología**: Python 3.11 + Pika + PyMongo  
**Puerto**: 8082 (health endpoint)  

**Relaciones con otros componentes**:
```
RABBITMQ
    │
    └─ Envía evento crudo ──→ ENRICHER
                              │
                          Recibe en Queue: ucis.enricher.events
                              │
                    ┌─────────┴────────┐
                    │                  │
                    ▼                  ▼
                PROCESA          CONSULTA MONGODB
                evento           (zone data, history)
                    │                  │
                    └─────────┬────────┘
                              │
                    Añade "enrichment" object
                              │
                              ▼
                    RABBITMQ (publica)
                    routing key: enriched.{domain}.{type}
                              │
                    (No es usado directamente por CEP)
                    (Guardado en MongoDB para API)
```

**ContextProvider (Componente interno del Enricher)**:
```python
class ContextProvider:
    def get_zone_context(zone: str) -> Dict:
        # Consulta MongoDB
        # Retorna: risk_level, population, incident_history
        
    def get_geographic_data(zone: str) -> Dict:
        # Retorna: coordinates, district
        
    def get_nearby_infrastructure(zone: str) -> Dict:
        # Calcula distancias a hospitales, comisarías
        
    def get_historical_data(zone: str, hours: int) -> Dict:
        # Recupera eventos previos en ventana de tiempo
```

**Performance**:
- Latencia: 5-20 ms por evento (incluye consultas MongoDB)
- Throughput: 5,000-10,000 eventos/segundo por instancia
- Memory: 200-300 MB
- Escalable: múltiples instancias con RabbitMQ load balancing

**Estrategia de Caching**:
- Cachea zone context por 5 minutos
- Cachea coordenadas y infraestructura (cambios raros)
- Invalida cache si evento antiguo (>1 hora)

**Monitoreo Enricher**:
```bash
# Ver logs
docker logs -f ucis-enricher | grep "enriched\|error"

# Verificar salud
curl http://localhost:8082/health

# Ver estadísticas
docker logs ucis-enricher | grep "processed"
```

**Ver documentación completa**: [Enricher README](./services/enricher/README.md)

---

### 5. MongoDB Database (CAPA 4: ALMACENAMIENTO)
**Ubicación**: `config/schemas/`  
**Responsabilidad**: Almacenar eventos crudos, alertas, patrones, estadísticas

**¿Por qué MongoDB?**
- NoSQL: Flexibilidad para documentos con estructura variable
- Escalable: Maneja 100+ inserciones/segundo sin problema
- Indexable: Queries rápidas en campos específicos
- TTL: Purga automática de datos antiguos
- Transacciones ACID: Garantía de consistencia

**Colecciones Principales**:

1. **events** (Eventos crudos)
```javascript
{
  _id: ObjectId(...),
  id: "evt-12345",
  timestamp: ISODate("2026-04-18T10:30:45Z"),
  domain: "traffic",  // climate, traffic, health, environment, population
  type: "accident",
  zone: "downtown",
  severity: "critical",
  street: "Main St",
  vehicles_involved: 3,
  injuries: 2,
  lanes_blocked: 2,
  // ... domain-specific fields
  _indexed: true
}
```
**Volumen**: 100+ documentos/segundo  
**Retención**: 30 días (con TTL)  
**Índices**:
- `timestamp DESC` (últimos eventos)
- `domain, type` (filtrado por tipo)
- `zone` (filtrado por zona)
- `severity` (filtrado crítico)

2. **complex_events** (Alertas del CEP Engine)
```javascript
{
  _id: ObjectId(...),
  pattern_id: "accident_emergency",
  pattern_name: "Critical Accident + Emergency",
  timestamp: ISODate("2026-04-18T10:30:45Z"),
  alert_level: "critical",
  severity: "critical",
  zone: "downtown",
  source_events: ["evt-12345", "evt-67890"],
  event_count: 2,
  description: "Traffic accident + emergency call in downtown",
  details: {
    accident: {
      type: "accident",
      vehicles_involved: 3,
      injuries: 2
    },
    emergency: {
      type: "emergency_call",
      call_type: "trauma",
      response_time_minutes: 8.5
    }
  },
  acknowledged: false,
  acknowledged_by: null,
  acknowledged_at: null,
  actions_taken: []
}
```
**Volumen**: 10-100 documentos/segundo (depende de patrones)  
**Índices**:
- `pattern_id` (alertas por patrón)
- `timestamp DESC` (alertas recientes)
- `zone` (alertas por zona)
- `severity` (críticas primero)
- `acknowledged` (filtro: procesadas/no procesadas)

3. **patterns** (Definiciones de reglas CEP)
```javascript
{
  _id: ObjectId(...),
  pattern_id: "accident_emergency",
  name: "Accident + Emergency Response",
  description: "Detects traffic accidents followed by health emergencies in same zone",
  epl_rule: "SELECT * FROM PATTERN [accident=TrafficEvent(...) -> emergency=HealthEvent(...)] WHERE accident.zone = emergency.zone",
  enabled: true,
  severity: "critical",
  input_domains: ["traffic", "health"],
  time_window: "5 minutes",
  created_at: ISODate("2026-03-26T15:00:00Z"),
  updated_at: ISODate("2026-04-18T10:30:00Z"),
  created_by: "system",
  stats: {
    total_matches: 234,
    matches_today: 23,
    last_match: ISODate("2026-04-18T10:30:45Z"),
    avg_response_time_ms: 125
  },
  version: 1
}
```
**Volumen**: 8+ patrones (relativamente estático)  
**Índices**:
- `pattern_id` (lookup rápido)
- `enabled` (cargar solo patrones activos)

4. **enrichment_cache** (Cache de contexto de zonas)
```javascript
{
  _id: ObjectId(...),
  zone: "downtown",
  risk_level: "high",
  population_density: "very_high",
  recent_incident_count: 45,
  average_response_time_min: 8.5,
  hospitals: [
    { name: "Hospital Central", distance_km: 2.3 },
    { name: "Hospital East", distance_km: 3.1 }
  ],
  police_stations: [
    { name: "Downtown Precinct", distance_km: 1.8 }
  ],
  coordinates: {
    latitude: 40.7128,
    longitude: -74.0060
  },
  cached_at: ISODate("2026-04-18T10:30:00Z"),
  valid_until: ISODate("2026-04-18T10:35:00Z")
}
```
**Volumen**: 5-10 zonas (pequeño)  
**TTL**: 5 minutos (auto-purga después)  

**Relaciones con otros componentes**:
```
                    MONGODB
              (centro de datos)
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              ▼              ▼
    ENRICHER       CEP ENGINE       API REST
    
ENRICHER → MONGODB:
  - WRITE: eventos crudos a colección "events"
  - READ: datos de zona desde "enrichment_cache"
  - WRITE: actualiza stats en "enrichment_cache"

CEP ENGINE → MONGODB:
  - READ: patrones desde colección "patterns"
  - WRITE: complex events a colección "complex_events"
  - UPDATE: estadísticas en "patterns" (total_matches, last_match)

API REST → MONGODB:
  - READ: todas las consultas para servir al frontend
  - GET /api/events → find({events})
  - GET /api/events/complex → find({complex_events})
  - GET /api/patterns → find({patterns, enabled: true})
  - POST /api/patterns → insert nuevo patrón
  - PUT /api/patterns/{id} → update y notifica CEP
  - DELETE /api/patterns/{id} → elimina patrón

FRONTEND (via API) → MONGODB (indirecto):
  Todas las queries pasan por REST API
```

**Garantías ACID**:
- **Atomicity**: Operación completa o nada
- **Consistency**: Índices siempre coherentes
- **Isolation**: Lecturas/escrituras no se interfieren
- **Durability**: Datos persisten en disco

**Optimizaciones**:
```javascript
// Índices de consulta frecuente
db.events.createIndex({ timestamp: -1 })
db.events.createIndex({ domain: 1, type: 1 })
db.events.createIndex({ zone: 1 })
db.events.createIndex({ severity: 1 })

db.complex_events.createIndex({ pattern_id: 1 })
db.complex_events.createIndex({ timestamp: -1 })
db.complex_events.createIndex({ zone: 1, timestamp: -1 })

db.patterns.createIndex({ pattern_id: 1 })
db.patterns.createIndex({ enabled: 1 })

// TTL para auto-purga
db.events.createIndex({ timestamp: 1 }, { expireAfterSeconds: 2592000 })  // 30 días
db.enrichment_cache.createIndex({ valid_until: 1 }, { expireAfterSeconds: 0 })
```

**Tecnología**: MongoDB 7.0  
**Puerto**: 27017  
**Credenciales**: `admin / admin123`  
**Volumen de datos**: ~8.6 GB/día a 100 evt/sec

**Monitoreo MongoDB**:
```bash
# Conectar
docker exec -it ucis-mongodb mongosh -u admin -p admin123

# Stats colecciones
> use ucis_db
> db.stats()
> db.events.stats()

# Queries lentas
> db.setProfilingLevel(1)
> db.system.profile.find().limit(5)

# Index stats
> db.events.aggregate([{$indexStats: {}}])
```

**Ver documentación completa**: [Schemas](./config/schemas/README.md)

---

### 6. REST API Backend (CAPA 5: EXPOSICIÓN)
**Ubicación**: `services/api/`  
**Responsabilidad**: Exponer datos de MongoDB a través de endpoints HTTP y permitir operaciones CRUD

**Rol del API**:
El API es el **intermediario entre la base de datos y el frontend**. 
- Consulta MongoDB
- Aplica filtros, paginación, ordenamiento
- Transforma documentos BSON a JSON
- Valida entradas del cliente
- Expone como endpoints REST

**Endpoints Principales**:

**Health & Status**:
```bash
GET /health
# Response: {status: "healthy", service: "api", mongo: "connected"}
```

**Events (Eventos Crudos)**:
```bash
GET /api/events?limit=100&skip=0&domain=traffic&zone=downtown&severity=high
# Retorna: {events: [...], count: X, limit: 100, skip: 0}

GET /api/events/{event_id}
# Retorna: {id, timestamp, domain, type, zone, ...}
```

**Complex Events (Alertas)**:
```bash
GET /api/events/complex?limit=50&pattern_id=accident_emergency&alert_level=critical
# Retorna: {events: [{pattern_id, timestamp, alert_level, source_events, ...}]}

GET /api/events/complex/{alert_id}
# Detalle de alerta específica
```

**Patterns (Gestión de Reglas CEP)**:
```bash
GET /api/patterns
# Retorna: {patterns: [{pattern_id, name, enabled, severity, ...}]}

POST /api/patterns
# Body: {pattern_id, name, epl_rule, enabled, severity, input_domains}
# Retorna: {_id, pattern_id}
# Efecto: Patrón se carga en CEP Engine dinámicamente

PUT /api/patterns/{pattern_id}
# Body: {name, enabled, severity} (actualización parcial)
# Retorna: {modified_count: 1}
# Efecto: CEP Engine recarga patrón actualizado

DELETE /api/patterns/{pattern_id}
# Retorna: {deleted_count: 1}
# Efecto: CEP Engine deshabilita patrón
```

**Statistics & Analytics**:
```bash
GET /api/stats/events-per-minute
# Retorna: {data: [{_id: "2026-04-18T10:30:00Z", count: 5420}, ...]}
# Agregación MongoDB: GROUP BY timestamp

GET /api/stats/top-alerts
# Retorna: {data: [{_id: "pattern_name", count: N}, ...]}
# Identifica qué patrones se detectan más

GET /api/stats/zones/{zone}
# Retorna: {zone, event_count, complex_event_count, top_patterns: [...]}
# Estadísticas por zona geográfica

GET /api/stats/events-by-domain
# Retorna: {data: [{_id: "traffic", count: N}, ...]}
```

**Parámetros Comunes**:
```bash
# Paginación
?limit=100              # Items por página (default: 100, max: 1000)
?skip=0                 # Offset (default: 0)

# Filtrado
?domain=traffic         # Filtrar por dominio
?zone=downtown          # Filtrar por zona
?severity=critical      # Filtrar por severidad
?pattern_id=X           # Filtrar por patrón
?alert_level=high       # Filtrar alertas por nivel

# Ordenamiento
?sort=timestamp:desc    # -1 para descending, 1 para ascending
```

**Queries Internas (MongoDB)**:
```python
# GET /api/events
db.events.find(
    {domain: "traffic", zone: "downtown", severity: "critical"},
    limit=100,
    skip=0,
    sort={timestamp: -1}
)

# GET /api/events/complex
db.complex_events.find(
    {pattern_id: "accident_emergency"},
    limit=50,
    sort={timestamp: -1}
)

# GET /api/stats/events-per-minute
db.events.aggregate([
    {$match: {timestamp: {$gte: ISODate("24h ago")}}},
    {$group: {
        _id: {$dateToString: {format: "%Y-%m-%dT%H:%M:00Z", date: "$timestamp"}},
        count: {$sum: 1}
    }},
    {$sort: {_id: 1}}
])

# POST /api/patterns
db.patterns.insertOne({pattern_id, name, epl_rule, ...})
# Notifica CEP Engine vía mensaje RabbitMQ
```

**Flujo de Integración**:
```
                   REST API
                       │
        ┌──────────────┼──────────────┐
        │              │              │
     FRONTEND       REQUEST       RESPONSE
   (React)           │
        │            ▼
        │      VALIDATE INPUT
        │            │
        ├───────────→ QUERY MongoDB
        │            │
        │      TRANSFORM BSON→JSON
        │            │
        │      APPLY FILTERS
        │            │
        │      APPLY PAGINATION
        │            │
        │←──────────RESPONSE JSON
        │
   DISPLAY
   CHARTS, TABLES
```

**Características del API**:
- RESTful: Sigue convenciones REST
- Stateless: Cada request es independiente
- CORS habilitado: Frontend puede consumir
- JSON: Todas las respuestas en JSON
- Error handling: Mensajes de error descriptivos
- Validación: Valida tipos, límites, caracteres

**Respuestas HTTP**:
```json
// 200 OK - Éxito
{
  "status": "success",
  "data": {...},
  "count": 42
}

// 201 Created - Recurso creado
{
  "status": "created",
  "_id": "ObjectId",
  "pattern_id": "new_pattern"
}

// 400 Bad Request - Entrada inválida
{
  "status": "error",
  "error": "Invalid limit: must be 1-1000",
  "code": "INVALID_INPUT"
}

// 404 Not Found
{
  "status": "error",
  "error": "Event not found",
  "code": "NOT_FOUND"
}

// 500 Server Error
{
  "status": "error",
  "error": "Database connection failed",
  "code": "SERVER_ERROR"
}
```

**Performance**:
- Latencia promedio: 50-200 ms (incluye query MongoDB)
- Throughput: 100+ requests/segundo
- Timeout: 30 segundos
- No hay caching (datos siempre frescos)

**Tecnología**: Flask (Python) + PyMongo + CORS  
**Puerto**: 5000  

**Relaciones con otros componentes**:
```
FRONTEND (React)
      │
      │ HTTP Request
      │ GET /api/events, /api/patterns, etc.
      │
      ▼
REST API (Flask)
      │
      └─ QUERY MongoDB
      │  (find, aggregate, insert, update, delete)
      │
      ├─ Retorna eventos crudos
      ├─ Retorna alertas (complex events)
      ├─ Retorna patrones
      └─ Retorna estadísticas
      │
      ▼
FRONTEND (React)
      │
      └─ DISPLAY en Dashboard
         ├─ Tab: Dashboard (stats)
         ├─ Tab: Events (lista)
         ├─ Tab: Alerts (alertas)
         └─ Tab: Patterns (gestor)
```

**Escalado**:
```
Caso: Necesitas más capacidad

Opción 1: Vertical (aumentar recursos)
  - Más CPU, memoria en el servidor API
  
Opción 2: Horizontal (múltiples instancias)
  API-1 (puerto 5001)
    │
  Load Balancer (Nginx, HAProxy)
    │
  API-2 (puerto 5002)
    │
  API-3 (puerto 5003)
    │
  MongoDB (única, compartida)
```

**Ver documentación completa**: [API README](./services/api/README.md)

---

### 7. WebSocket Server (CAPA 6: ENTREGA EN TIEMPO REAL)
**Ubicación**: `services/websocket/`
**Responsabilidad**: Consumir eventos complejos de RabbitMQ y entregarlos al frontend vía Socket.IO sin que el cliente tenga que sondear

**Flujo**:
```
CEP Engine
    │ publica routing key: events.complex.<pattern_id>
    ▼
Exchange: ucis.complex
    │ binding: events.complex.# → Queue: ucis.websocket.events
    ▼
WebSocket Server (pika consumer)
    │ emite evento Socket.IO: "complex_event"
    ▼
Frontend React
    socket.on('complex_event', event => setComplexEvents(...))
```

**Características**:
- Conexión Socket.IO con soporte WebSocket y long-polling como fallback
- Consumer pika con reconexión automática ante caída de RabbitMQ
- CORS permisivo para desarrollo (restringir en producción)
- Evento `GET /health` para health checks de Docker

**Tecnología**: Python 3.11 + FastAPI + python-socketio + pika
**Puerto**: 8083

---

### 8. React Frontend Dashboard (CAPA 7: VISUALIZACIÓN)
**Ubicación**: `services/frontend/`  
**Responsabilidad**: Interfaz web interactiva para monitoreo y gestión del sistema

**¿Qué es el Frontend?**
El frontend es la **interfaz visual** que permite a operadores:
- Ver eventos y alertas en tiempo real
- Gestionar patrones de detección
- Analizar estadísticas
- Tomar decisiones basadas en datos

**Arquitectura**:
```
┌────────────────────────────────────┐
│       React 18 SPA                 │
├────────────────────────────────────┤
│  Tab Navigation (4 tabs)           │
├────────────────────────────────────┤
│ ┌──────────────────────────────┐  │
│ │   1. Dashboard Tab           │  │
│ │   ├─ KPI Cards (resumen)     │  │
│ │   ├─ Chart (eventos/min)     │  │
│ │   └─ Recent Alerts (5)       │  │
│ └──────────────────────────────┘  │
│ ┌──────────────────────────────┐  │
│ │   2. Events Tab              │  │
│ │   ├─ Filters (domain, zone)  │  │
│ │   ├─ Event Table (paginado)  │  │
│ │   └─ Detail View             │  │
│ └──────────────────────────────┘  │
│ ┌──────────────────────────────┐  │
│ │   3. Alerts Tab              │  │
│ │   ├─ Complex Events List     │  │
│ │   ├─ Color Coded (severity)  │  │
│ │   ├─ Acknowledge Button      │  │
│ │   └─ Source Events Trace     │  │
│ └──────────────────────────────┘  │
│ ┌──────────────────────────────┐  │
│ │   4. Patterns Tab            │  │
│ │   ├─ Pattern List (CRUD)     │  │
│ │   ├─ Create/Edit Dialog      │  │
│ │   ├─ Enable/Disable Toggle   │  │
│ │   └─ Statistics per Pattern  │  │
│ └──────────────────────────────┘  │
├────────────────────────────────────┤
│  Axios HTTP Client                 │
│  (consume REST API)                │
└────────────────────────────────────┘
        │
        │ HTTP Requests
        │
        ▼
    REST API (Flask)
        │
        └─ MongoDB
```

**Tab 1: Dashboard (Resumen General)**
```
┌─────────────────────────────────────┐
│          DASHBOARD                  │
├─────────────────────────────────────┤
│                                     │
│  ┌──────────┐ ┌──────────┐         │
│  │ TOTAL    │ │ TOTAL    │         │
│  │ EVENTS   │ │ ALERTS   │         │
│  │ 142,567  │ │ 234      │         │
│  └──────────┘ └──────────┘         │
│                                     │
│  ┌──────────────────────────────┐  │
│  │ Events Per Minute (Chart)    │  │
│  │   6000                       │  │
│  │   4500   ╱╲                  │  │
│  │   3000 ╱  ╲╱╲   ╱──         │  │
│  │   1500 ╱       ╲╱           │  │
│  │   0  └─────────────── (1h)   │  │
│  └──────────────────────────────┘  │
│                                     │
│  ┌──────────────────────────────┐  │
│  │ RECENT ALERTS (Last 5)       │  │
│  ├──────────────────────────────┤  │
│  │ 🔴 Accident + Emergency      │  │
│  │    Downtown | 2 min ago      │  │
│  │ 🟠 High Air Quality + Traffic│  │
│  │    Industrial | 5 min ago    │  │
│  │ 🟡 Crowd Alert              │  │
│  │    Downtown | 8 min ago      │  │
│  └──────────────────────────────┘  │
│                                     │
└─────────────────────────────────────┘
```
**Componentes**:
- KPI Cards: Totales, ratios
- Line Chart (Recharts): Eventos por minuto (última 1 hora)
- Alert Summary: Últimas 5 alertas con colores

**Tab 2: Events (Stream de Eventos Crudos)**
```
┌────────────────────────────────────────┐
│          EVENTS                        │
├────────────────────────────────────────┤
│ Filters: Domain ▼ | Zone ▼ |Severity▼│
├────────────────────────────────────────┤
│ Domain   Type        Zone       Sev   │
├────────────────────────────────────────┤
│ Traffic  Accident     Downtown   🔴   │
│ Climate  Storm        Industrial 🟠   │
│ Health   Emergency    Suburbs    🟡   │
│ Traffic  Congestion   Downtown   🟢   │
│ Environ. Air Quality  Downtown   🔴   │
├────────────────────────────────────────┤
│ < 1 of 100 >  [ Showing 1-10 ]        │
└────────────────────────────────────────┘
```
**Componentes**:
- Dropdown Filters: domain, zone, severity
- Data Table: columnas principales
- Pagination: 10-50 items por página
- Click para detalles completos del evento

**Tab 3: Alerts (Complex Events / Alertas)**
```
┌────────────────────────────────────────┐
│          ALERTS (Complex Events)       │
├────────────────────────────────────────┤
│ Pattern ▼ | Level ▼ | Acknowledged ▼  │
├────────────────────────────────────────┤
│ ▓▓▓ Pattern          Zone     Time  Act│
├────────────────────────────────────────┤
│ 🔴 Accident+Emergency Downtown  2m  ✓ │
│    Traffic accident + Health call      │
│    Source: evt-123, evt-456            │
│                                        │
│ 🟠 Air Quality+Traffic Industrial 5m  │
│    AQI > 300 + Congestion              │
│    Source: evt-789, evt-012            │
│                                        │
│ 🟡 Crowd Alert      Downtown   8m  ✓  │
│    >10k people gathering                │
│    Source: evt-345                     │
└────────────────────────────────────────┘
```
**Componentes**:
- Severity Color Coding:
  - 🔴 Critical (Red): #ff4444
  - 🟠 High (Orange): #ff9800
  - 🟡 Medium (Yellow): #ffc107
  - 🟢 Low (Green): #4caf50
- Expandable rows para ver detalles
- "Acknowledge" button para marcar como procesada
- Source events links para trazar la cadena causal

**Tab 4: Patterns (Gestión de Reglas CEP)**
```
┌────────────────────────────────────────┐
│          PATTERNS                      │
├────────────────────────────────────────┤
│ [+ New Pattern]                        │
├────────────────────────────────────────┤
│ Name                     Domains  Sev  │
├────────────────────────────────────────┤
│ ☑ Accident+Emergency     T,H      🔴  │
│   Detections: 234 | Last: 2m ago      │
│   [Edit] [Delete]                     │
│                                        │
│ ☑ Air Quality+Traffic    E,T      🟠  │
│   Detections: 89  | Last: 5m ago      │
│   [Edit] [Delete]                     │
│                                        │
│ ☐ Extreme Weather        C,T      🟡  │
│   Detections: 12  | Last: 1h ago      │
│   [Edit] [Delete]  [Enable]           │
│                                        │
│ ┌──────────────────────────────────┐  │
│ │ Create/Edit Pattern Dialog       │  │
│ ├──────────────────────────────────┤  │
│ │ Pattern ID: [accident_emergency] │  │
│ │ Name: [Accident + Emergency]     │  │
│ │ Severity: [Critical ▼]           │  │
│ │ EPL Rule: [textarea]             │  │
│ │ Input Domains: ☑T ☑H ☐E ☐C ☐P  │  │
│ │                                  │  │
│ │ [Save] [Cancel]                  │  │
│ └──────────────────────────────────┘  │
└────────────────────────────────────────┘
```
**Componentes**:
- Pattern list con toggle enable/disable
- Statistics: total matches, last match
- Edit/Delete buttons
- Modal dialog para crear/editar
- EPL rule textarea con syntax highlighting

**Polling Strategy**:
```javascript
// setInterval ejecuta cada 5 segundos
setInterval(async () => {
  // Fetch desde API
  const events = await axios.get('/api/events?limit=50');
  const alerts = await axios.get('/api/events/complex?limit=50');
  const stats = await axios.get('/api/stats/events-per-minute');
  
  // Update component state
  setEvents(events.data);
  setAlerts(alerts.data);
  setStats(stats.data);
  
  // React re-renders automatically
}, 5000);
```

**Componentes React**:
```
App.js (Principal)
  ├─ Navigation (Tabs)
  │   ├─ DashboardTab
  │   ├─ EventsTab
  │   ├─ AlertsTab
  │   └─ PatternsTab
  │
  ├─ Common
  │   ├─ Header (branding, timestamp)
  │   ├─ Sidebar (menu)
  │   └─ Footer (status)
  │
  └─ Utilities
      ├─ axiosClient (HTTP config)
      ├─ colors.js (severity color map)
      └─ utils.js (formatters)
```

**Librerías principales**:
- **React 18**: Framework UI
- **Axios**: HTTP client (consume API)
- **Recharts**: Charts y gráficos
- **React Router**: Navegación entre tabs
- **Material-UI** (opcional): Componentes UI estilizados

**Performance Optimization**:
1. **Memoization**: React.memo para componentes que no cambian
2. **Code Splitting**: Lazy load tabs bajo demanda
3. **Caching**: Browser cache assets estáticos (1 año)
4. **Virtualization**: Long lists usan virtual scrolling
5. **Debouncing**: Filters tienen debounce (300ms)

**Styling**:
- CSS-in-JS o CSS modules (no especificado en README)
- Responsive design (mobile, tablet, desktop)
- Dark blue theme (#1a3a52)
- Accent colors por severidad

**Características de UX**:
- Auto-refresco visible (contador con icono)
- Loading spinners durante fetches
- Error messages claros
- Empty states cuando no hay datos
- Confirmation dialogs para acciones destructivas

**Relaciones con otros componentes**:
```
                    FRONTEND (React)
                    Port 3000
                          │
                  Polling cada 5s
                          │
          ┌───────────────┼───────────────┐
          │               │               │
   GET /api/events   GET /api/alerts  GET /api/patterns
          │               │               │
          ▼               ▼               ▼
      REST API (Flask, Puerto 5000)
                          │
                    Query MongoDB
                          │
          ┌───────────────┼───────────────┐
          │               │               │
       events      complex_events      patterns
       collection   collection        collection
```

**Escalabilidad**:
- Frontend es stateless (datos del API)
- Puede servirse desde múltiples servidores (CDN)
- Escalabilidad limitada por API backend
- Múltiples usuarios pueden acceder simultáneamente

**Tecnología**: React 18 + Axios + Recharts + CSS  
**Puerto**: 3000 (Nginx)  

**Ver documentación completa**: [Frontend README](./services/frontend/README.md)

---

## Guía de Inicio Rápido

### Prerrequisitos
- Docker & Docker Compose
- 4GB+ RAM libre
- macOS, Linux, o Windows (WSL2)

### Pasos

#### 1. Clonar y Navegar
```bash
cd /ruta/al/proyecto/Urban-Crisis-Intelligence-System-UCIS-
```

#### 2. Configurar Entorno
```bash
# El archivo .env ya está configurado
cat .env
```

#### 3. Iniciar Sistema
```bash
# Opción A: En segundo plano
docker-compose up -d

# Opción B: Con logs en consola
docker-compose up
```

#### 4. Verificar Servicios
```bash
docker-compose ps

# Todos deben mostrar "Up"
```

#### 5. Acceder a Servicios

| Servicio | URL | Credenciales |
|----------|-----|-------------|
| **Frontend** | http://localhost:3000 | - |
| **REST API** | http://localhost:5000/api | - |
| **WebSocket Server** | http://localhost:8083/health | - |
| **RabbitMQ Mgmt** | http://localhost:15672 | admin / admin123 |
| **CEP Engine** | http://localhost:8081/health | - |
| **Enricher** | http://localhost:8082/health | - |
| **MongoDB** | localhost:27017 | admin / admin123 |

---

## Documentación Detallada

### Simulador de Eventos
- [Simulator README](./services/simulator/README.md)
- Estructura de eventos
- Generadores por dominio
- Configuración de tasa de eventos

### Motor CEP
- [CEP Engine README](./services/cep-engine/README.md)
- Sintaxis EPL (Esper Pattern Language)
- Ejemplos de patrones
- Carga dinámica de reglas

### API Backend
- [API README](./services/api/README.md)
- Referencia de endpoints
- Ejemplos de requests
- Optimización y scaling

### Frontend
- [Frontend README](./services/frontend/README.md)
- Estructura de componentes
- Integración con API
- Performance optimization

### Enriquecedor de Eventos
- [Enricher README](./services/enricher/README.md)
- Fuentes de contexto
- Extensión del enriquecimiento
- Escalado

### Configuraciones
- [RabbitMQ Config](./config/rabbitmq/README.md)
- [Patterns (CEP Rules)](./config/patterns/README.md)
- [Event Schemas](./config/schemas/README.md)

---

## Características Implementadas

### Sistema Core
- Event Simulator multi-dominio (5 dominios)
- RabbitMQ Topic Exchange
- Motor CEP con Esper
- Base de datos MongoDB
- Enriquecimiento de eventos
- REST API completa
- Dashboard React con auto-refresco

### Patrones Detectados
- Accidente + Emergencia en misma zona
- Múltiples congestiones
- Calidad del aire + Congestión
- Aglomeración de población
- Incidentes en cadena
- Condiciones climáticas críticas
- Eventos de salud + Crisis
- Contaminación crítica

### Operacionales
- Docker Compose deployment
- Health checks
- Logging centralizado
- Pagination en API
- Filtrado por dominio/zona/severidad
- Estadísticas agregadas

---

## Troubleshooting

### Los servicios no inician
```bash
# Verificar logs individuales
docker-compose logs simulator
docker-compose logs cep-engine
docker-compose logs api

# Reconstruir imágenes
docker-compose build --no-cache
docker-compose up
```

### Frontend no conecta a API
```bash
# Verificar API está corriendo
curl http://localhost:5000/health

# Revisar logs del API
docker logs ucis-api

# Revisar CORS en App.js
```

### No hay eventos en MongoDB
```bash
# Verificar simulador está enviando
docker logs ucis-simulator | grep -i "published"

# Verificar conexión RabbitMQ
docker logs ucis-simulator | grep -i "error"

# Conectar a MongoDB
docker exec -it ucis-mongodb mongosh -u admin -p admin123
> use ucis_db
> db.events.count()
```

### Alto uso de memoria
```bash
# Reducir tasa de eventos
# En .env: EVENT_RATE=50
docker-compose restart simulator

# Monitor de memoria
docker stats
```

### CEP Engine no detecta patrones
```bash
# Verificar patrones en MongoDB
docker exec -it ucis-mongodb mongosh -u admin -p admin123
> use ucis_db
> db.patterns.find()

# Revisar logs CEP
docker logs -f ucis-cep-engine | grep "PATTERN"

# Verificar EPL syntax
# Consultar docs: https://www.espertech.com/esper/
```

---

## Monitoreo y Debugging

### Ver Logs en Tiempo Real
```bash
# CEP Engine
docker logs -f ucis-cep-engine | grep "PATTERN\|ERROR"

# API
docker logs -f ucis-api

# Simulator
docker logs -f ucis-simulator

# Todos
docker-compose logs -f
```

### Monitorear Eventos
```bash
# Tasa de eventos por minuto
watch -n 1 "curl -s http://localhost:5000/api/stats/events-per-minute | jq '.data[-1]'"

# Alertas frecuentes
curl -s http://localhost:5000/api/stats/top-alerts | jq

# Total de eventos
curl -s http://localhost:5000/api/events?limit=1 | jq '.count'
```

### Verificar RabbitMQ
```bash
# UI Management
# http://localhost:15672 (admin/admin123)

# Desde CLI
docker exec ucis-rabbitmq rabbitmq-diagnostics list_queues
docker exec ucis-rabbitmq rabbitmqctl list_exchanges
```

### Conectar a MongoDB
```bash
docker exec -it ucis-mongodb mongosh -u admin -p admin123

# Consultas útiles
> use ucis_db
> db.events.count()
> db.complex_events.count()
> db.events.aggregate([{$group: {_id: "$domain", count: {$sum:1}}}])
> db.events.find({severity: "critical"}).limit(5)
```

---

## Configuración

### Variables de Entorno (.env)
```bash
# RabbitMQ
RABBITMQ_HOST=rabbitmq
RABBITMQ_PORT=5672
RABBITMQ_USERNAME=admin
RABBITMQ_PASSWORD=admin123

# MongoDB
MONGO_HOST=mongodb
MONGO_PORT=27017
MONGO_USERNAME=admin
MONGO_PASSWORD=admin123

# Simulator
EVENT_RATE=100        # eventos por segundo
LOG_LEVEL=INFO

# Flask
FLASK_ENV=development
FLASK_DEBUG=False

# General
ENVIRONMENT=development
```

### Ajustar Tasa de Eventos
```bash
# En .env
EVENT_RATE=500        # Alta carga
EVENT_RATE=50         # Baja carga
EVENT_RATE=1000       # Stress test

# Reiniciar
docker-compose restart simulator
```

### Agregar Nuevo Patrón CEP
```bash
# Via MongoDB
docker exec -it ucis-mongodb mongosh -u admin -p admin123
> use ucis_db
> db.patterns.insertOne({
    pattern_id: "my_pattern",
    name: "Mi Patrón",
    epl_rule: "SELECT * FROM TrafficEvent WHERE severity='critical'",
    enabled: true,
    input_domains: ["traffic"],
    severity: "high"
  })
```

---

## Soporte

Para más información, consulta:
- QUICKSTART — Guía de 5 minutos
- Esper Documentation — https://www.espertech.com/esper/
- RabbitMQ Docs — https://www.rabbitmq.com/documentation.html
- MongoDB Docs — https://docs.mongodb.com/
- React Docs — https://react.dev/

---

**Construido para análisis de crisis urbanas inteligentes**
