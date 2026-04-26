# 00 · Arquitectura general de UCIS

Resumen rápido del sistema y de cómo encajan los bloques funcionales. Sirve como índice de los documentos de cada bloque.

## Visión

UCIS es un sistema de **Complex Event Processing (CEP)** sobre eventos urbanos. Cinco dominios (`traffic`, `climate`, `health`, `environment`, `population`) generan eventos que viajan por una pipeline asíncrona y terminan en alertas de crisis visualizadas en un dashboard web en tiempo real.

## Pipeline de datos (capa por capa)

```
Simulator ──► RabbitMQ (ucis.events, key=events.<dom>.<type>)
                │
                └──► Enricher (consume events.#)
                        │
                        └──► RabbitMQ (key=events.enriched.<dom>.<type>)
                                │
                                └──► CEP Engine / Esper (consume events.enriched.#)
                                        │
                                        ├──► MongoDB.complex_events (persistencia)
                                        └──► RabbitMQ ucis.complex (key=events.complex.<pattern>)
                                                │
                                                └──► WebSocket Server
                                                        │
                                                        └──► Frontend (Socket.IO push)

Frontend ◄── HTTP polling ──► API REST (Flask) ◄──► MongoDB
                                                  (events, complex_events,
                                                   patterns, scenarios,
                                                   simulator_config)
```

## Bloques funcionales documentados

| # | Bloque | Tecnología | Rol | Documento |
|---|--------|------------|-----|-----------|
| 1 | Simulator | Python 3.11 + Pika | Genera eventos sintéticos de 5 dominios | [01-simulator.md](01-simulator.md) |
| 2 | Enricher | Python 3.11 + FastAPI | Añade contexto de zona y geografía | [02-enricher.md](02-enricher.md) |
| 3 | CEP Engine | Java 17 + Spring Boot + Esper 8.9 | Detecta patrones complejos vía EPL | [03-cep-engine.md](03-cep-engine.md) |
| 4 | API REST | Python 3.11 + Flask | Expone datos y CRUD de patrones / escenarios | [04-api.md](04-api.md) |
| 5 | WebSocket Server | Python 3.11 + FastAPI + Socket.IO | Push en tiempo real de alertas al frontend | [05-websocket.md](05-websocket.md) |
| 6 | Frontend | React 18 | Dashboard, gestión de patrones y escenarios | [06-frontend.md](06-frontend.md) |
| 7 | Infraestructura | RabbitMQ 3.12 + MongoDB 7.0 | Mensajería y persistencia | [07-infraestructura.md](07-infraestructura.md) |
| 8 | Configuración | JSON + scripts | Patrones, escenarios, zonas, esquemas | [08-configuracion.md](08-configuracion.md) |

## Principios de diseño

- **Desacoplamiento por mensajería**: ningún servicio llama directamente a otro; todo va por RabbitMQ.
- **Estado compartido en MongoDB**: configuración del simulador, patrones activos y escenarios viven en colecciones, polleadas por los servicios que las necesitan (sin reinicios).
- **Push para alertas, polling para datos masivos**: las alertas críticas se entregan vía WebSocket; eventos crudos y stats se obtienen por HTTP cada 5 s.
- **Stateless services**: simulator, enricher, cep-engine, api y websocket pueden reiniciarse sin perder estado, porque todo persiste en Mongo o se reproduce desde RabbitMQ.

## Ejecución

Todo se orquesta con Docker Compose ([`docker-compose.yml`](../../docker-compose.yml)). Variables clave en `.env`:

- `EVENT_RATE` → tasa por defecto del simulador
- `RABBITMQ_*`, `MONGO_*` → credenciales y puertos
- `*_PORT_HOST` → mapeo de puertos al host
