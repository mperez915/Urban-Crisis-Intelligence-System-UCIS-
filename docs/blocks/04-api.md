# 04 · API REST (Backend Flask)

Backend HTTP que expone los datos de MongoDB al frontend y centraliza el CRUD de **patrones** y **escenarios**, además de controlar el simulador en runtime.

- **Lenguaje**: Python 3.11
- **Framework**: Flask 3.0 + flask-cors
- **Persistencia**: MongoDB (lectura/escritura sobre `events`, `complex_events`, `patterns`, `scenarios`, `simulator_config`)
- **Mensajería**: usa `pika` puntualmente para **purgar colas RabbitMQ** cuando el simulador se pausa
- **Puerto**: 5000 (interno) → mapeado por `API_PORT_HOST`
- **Container**: `ucis-api`

## Endpoints

### Eventos crudos
- `GET  /api/events` — lista paginada con filtros `domain|zone|severity|skip|limit`.
- `GET  /api/events/<id>` — un evento por id.

### Eventos complejos (alertas)
- `GET  /api/events/complex` — alertas, soporta `grouped=true&since=<min>` para agrupar por `pattern_id`.
- `POST /api/events/complex` — inserción manual (testing).

### Patrones CEP
- `GET    /api/patterns` — todos los patrones (campos completos: `epl_rule`, `enabled`, `match_count`, ...).
- `POST   /api/patterns` — crear patrón. El CEP Engine lo detectará y desplegará en ≤5 s.
- `PUT    /api/patterns/<id>` — actualizar (typical use: `enabled: true/false`, editar `epl_rule`). Setea `updated_at` ⇒ trigger del hot-reload del CEP.
- `DELETE /api/patterns/<id>` — eliminar (CEP lo undeploya automáticamente).

### Escenarios (presets de simulación)
- `GET    /api/scenarios`
- `POST   /api/scenarios`
- `PUT    /api/scenarios/<id>`
- `DELETE /api/scenarios/<id>`
- `POST   /api/scenarios/<id>/activate` — marca como activo en `simulator_config.active_scenario_id`.
- `POST   /api/scenarios/<id>/clone`

### Simulador (control runtime)
- `GET /api/simulator/config`
- `PUT /api/simulator/config` — campos permitidos: `event_rate`, `paused`, `active_scenario_id`, `force_domain`, `force_zone`, `force_severity`. Si `paused=true` ⇒ **purga las 4 colas RabbitMQ** (`ucis.enricher.events`, `ucis.cep.events`, `ucis.events.enriched`, `ucis.events.complex`) para que no sigan saliendo alertas residuales.

### Estadísticas (para Dashboard)
- `GET /api/stats/events-per-minute?granularity=10s|1m|5m` — agregación con `$group` sobre buckets de tiempo, **rellenado con ceros** los buckets vacíos para estabilizar el gráfico. Devuelve breakdown por severidad.
- `GET /api/stats/top-alerts` — top 10 patrones por número de matches.
- `GET /api/stats/zones/<zone>` — contadores de eventos y alertas por zona.

### Salud
- `GET /health` — ping para healthchecks.

## Cómo se acopla al resto del sistema

- **No** publica eventos al pipeline; sólo lee/escribe en Mongo y purga colas en pausa.
- El CEP Engine **observa** la colección `patterns` en Mongo (polling cada 5 s) → cualquier cambio vía la API se aplica sin reiniciar nada.
- El simulator y enricher **observan** `simulator_config` y `scenarios` en Mongo → la API es el único punto que los modifica.
- El frontend hace polling cada 5 s a varios endpoints y un `Promise.all` en el dashboard.

## Archivos importantes

| Archivo | Rol |
|---------|-----|
| [services/api/app.py](../../services/api/app.py) | Aplicación Flask completa: todas las rutas, `purge_rabbitmq_queues`, helpers de defaults para `simulator_config`. |
| [services/api/requirements.txt](../../services/api/requirements.txt) | `flask`, `flask-cors`, `pymongo`, `pika`. |
| [services/api/Dockerfile](../../services/api/Dockerfile) | Imagen del servicio. |
| [config/patterns/default_patterns.json](../../config/patterns/default_patterns.json) | Montado como volumen read-only en `/app/config/patterns/` — fuente de verdad para resetear/seedear patrones. |
| [config/scenarios/default_scenarios.json](../../config/scenarios/default_scenarios.json) | Montado en `/app/config/scenarios/` — escenarios por defecto. |

## Puntos a recordar

- Es **stateless**: toda la lógica vive en Mongo. Reiniciarlo no pierde nada.
- Es el **único productor de cambios de configuración** (patrones, escenarios, simulator_config). Los demás servicios sólo leen.
- El control del simulador (rate/pause/scenario) se hace **vía Mongo**, no llamando al simulador directamente — esto evita acoplamiento sincrónico y permite que cualquier servicio reaccione a los cambios.
- La purga de colas en pausa es esencial: sin ella, un escenario crítico puede dejar miles de eventos buffered que siguen generando alertas tras pulsar "pause".
