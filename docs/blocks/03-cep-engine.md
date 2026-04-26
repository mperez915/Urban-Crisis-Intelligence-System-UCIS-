# 03 · CEP Engine (Motor de Procesamiento de Eventos Complejos)

Servicio Java/Spring Boot que ejecuta el motor **Esper 8.9** para detectar patrones complejos sobre el flujo de eventos enriquecidos. Es el **cerebro analítico** del sistema.

- **Lenguaje**: Java 17 + Spring Boot 3.2
- **Motor CEP**: [Esper](https://www.espertech.com/esper/) 8.9 (lenguaje EPL)
- **Entrada**: cola `ucis.cep.events` (binding `events.enriched.#`)
- **Salida**: 
  - exchange `ucis.complex` con routing key `events.complex.<pattern_id>`
  - persistencia en `MongoDB.complex_events`
- **Puerto**: 8081 (Spring Boot Actuator)
- **JVM**: `-Xms512m -Xmx2g`, G1GC (configurado en docker-compose por las ventanas de 10 min en joins de 4 streams)
- **Container**: `ucis-cep-engine`

## Cómo funciona

### Boot (`CEPEngineApplication`)

1. Conecta a RabbitMQ y declara la infraestructura (exchanges + cola CEP).
2. Llama a `PatternService.start()` → carga inicial de patrones desde Mongo.
3. Lanza un thread (`cep-consumer`) que ejecuta `EventProcessorService.startConsuming()`.

### Tipos de evento Esper (`EsperConfig`)

Registra estáticamente 5 event-types tipados (`TrafficEvent`, `ClimateEvent`, `HealthEvent`, `EnvironmentEvent`, `PopulationEvent`) más `ZoneContext` y `Enrichment` como sub-tipos. Esto permite que las reglas EPL filtren con dot-notation (`enrichment.zone_context.risk_level`).

### Recepción y routing a Esper (`EventProcessorService`)

- Consume con `prefetch=200` y ack manual (definido en `RabbitMQService.consumeEvents`) → backpressure: el broker no entrega más mensajes de los que el motor puede procesar.
- Por cada mensaje JSON:
  - Lo deserializa con Jackson.
  - Mapea `domain` → nombre de event-type Esper.
  - Normaliza `enrichment.zone_context` (asegura que sea un Map vacío si falta) para que las reglas no rompan con NPE.
  - `epRuntime.getEventService().sendEventMap(event, eventType)` lo inyecta en Esper.

### Gestión dinámica de patrones (`PatternService`)

- En `start()` carga todos los patrones con `enabled: true` desde `MongoDB.patterns` y los **compila + despliega** en Esper.
- Tarea Spring `@Scheduled` cada **5 s** (`syncIfNeeded`):
  - Consulta el `updated_at` máximo de la colección (1 documento, índice descendente).
  - Si cambió respecto al último checksum → relanza `syncPatternsFromMongo` completo.
- `syncPatternsFromMongo`:
  - Despliega patrones nuevos o cuyo `updated_at` cambió.
  - Re-despliega (undeploy + deploy) los modificados.
  - Undeploya los que ya no estén `enabled` o se hayan borrado.
- Cada deployment registra un **listener** que dispara `handlePatternMatch`.

### Match → Alerta (`handlePatternMatch`)

1. Extrae el `zone` del resultado.
2. **Deduplicación**: clave `(pattern_id|zone)` con cooldown de `cep.dedup.cooldown.seconds` (60 s por defecto). Esper, por la naturaleza de los joins/sliding-windows, emite muchas filas para un mismo evento lógico; este filtro lo evita.
3. Construye el `complex_event`:
   ```json
   {
     "pattern_id": "...",
     "pattern_name": "...",
     "alert_level": "critical",
     "timestamp": "...",
     "zone": "...",
     "result_data": { ... },
     "source_events": [],
     "description": "..."
   }
   ```
4. **Persiste** en `MongoDB.complex_events` y hace `$inc match_count` y `$set last_match` en el patrón.
5. **Publica** en `ucis.complex` con routing key `events.complex.<pattern_id>` → consumido por el WebSocket Server.

## Archivos importantes

| Archivo | Rol |
|---------|-----|
| [services/cep-engine/src/main/java/com/ucis/cep/CEPEngineApplication.java](../../services/cep-engine/src/main/java/com/ucis/cep/CEPEngineApplication.java) | Bootstrap Spring Boot, orquesta arranque (Rabbit → patrones → consumer thread). |
| [services/cep-engine/src/main/java/com/ucis/cep/config/EsperConfig.java](../../services/cep-engine/src/main/java/com/ucis/cep/config/EsperConfig.java) | Define los 5 event-types tipados de Esper y su esquema (incluye sub-tipos `Enrichment` / `ZoneContext`). |
| [services/cep-engine/src/main/java/com/ucis/cep/config/MongoConfig.java](../../services/cep-engine/src/main/java/com/ucis/cep/config/MongoConfig.java) | Bean `MongoClient` para acceder a la colección de patrones y persistir alertas. |
| [services/cep-engine/src/main/java/com/ucis/cep/messaging/RabbitMQService.java](../../services/cep-engine/src/main/java/com/ucis/cep/messaging/RabbitMQService.java) | Conexión AMQP, declaración de exchanges/colas, consumer con prefetch + ack manual, publicación de complex events. |
| [services/cep-engine/src/main/java/com/ucis/cep/service/EventProcessorService.java](../../services/cep-engine/src/main/java/com/ucis/cep/service/EventProcessorService.java) | Consume mensajes, normaliza enrichment, inyecta a Esper. |
| [services/cep-engine/src/main/java/com/ucis/cep/service/PatternService.java](../../services/cep-engine/src/main/java/com/ucis/cep/service/PatternService.java) | Carga, compila, despliega y deduplica patrones. **Núcleo de la lógica CEP.** |
| [services/cep-engine/src/main/resources/application.properties](../../services/cep-engine/src/main/resources/application.properties) | Config Spring (Rabbit, Mongo, dedup, polling). |
| [services/cep-engine/pom.xml](../../services/cep-engine/pom.xml) | Dependencias Maven (Esper, Spring Boot, Jackson, MongoDB driver, RabbitMQ client). |
| [services/cep-engine/Dockerfile](../../services/cep-engine/Dockerfile) | Build multi-stage Maven → imagen runtime. |

## Patrones EPL (ejemplos)

Vienen de [`config/patterns/default_patterns.json`](../../config/patterns/default_patterns.json) y se cargan al iniciar Mongo. Ejemplos:

- **traffic_congestion_hotspot**: ≥2 congestiones high/critical en una zona en 2 min.
- **cascading_urban_crisis**: tormenta + accidente + emergencia sanitaria en la misma zona en 5 min (join de 3 streams).
- **moderate_air_quality_degradation**: ≥3 lecturas medium de AQI en 3 min por zona.

Las reglas son texto EPL puro (`SELECT ... FROM ...EventType(...).win:time(...) GROUP BY ... HAVING ...` o `PATTERN [a -> b]`) que el usuario puede editar desde la UI.

## Puntos a recordar

- **Hot-reload de patrones**: cualquier cambio vía API (`PUT /api/patterns/:id`) se aplica en ≤ 5 s sin reiniciar el motor.
- **Sin estado persistente en Esper**: si el contenedor reinicia, las ventanas temporales se pierden y empieza de cero — los patrones se recargan desde Mongo.
- **Backpressure**: prefetch=200 + ack manual evita OOM bajo ráfagas.
- **Dedup vs. ventanas de joins**: sin el cooldown, un join 3-stream con ventana de 5 min produce miles de filas duplicadas por una única crisis; el cooldown estabiliza la salida a 1 alerta lógica por (patrón, zona) cada 60 s.
- Las alertas se persisten **siempre** en Mongo, aunque el WebSocket esté caído. Eso garantiza que la pestaña Alerts del frontend nunca pierde histórico.
