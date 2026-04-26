# 02 · Enricher (Enriquecedor de eventos)

Microservicio Python que consume eventos crudos del simulador, les añade contexto geográfico y los reenvía al CEP.

- **Lenguaje**: Python 3.11
- **Librerías**: `pika`, `pymongo`, `fastapi` (sólo para el endpoint `/health`)
- **Entrada**: cola `ucis.enricher.events` (binding `events.#` sobre `ucis.events`)
- **Salida**: exchange `ucis.events`, routing key `events.enriched.<domain>.<type>`
- **Persistencia**: upsert en `MongoDB.events` con el doc enriquecido
- **Puerto**: 8082 (health check HTTP)
- **Container**: `ucis-enricher`

## Cómo funciona

1. Al arrancar:
   - Lanza un thread con FastAPI/uvicorn para el endpoint `GET /health`.
   - Crea un `ContextProvider` que carga [`config/zones/zone_context.json`](../../services/enricher/config/zones/zone_context.json) en memoria. Si no existe, usa un diccionario por defecto (5 zonas hardcodeadas).
   - Conecta a RabbitMQ (con reintentos) y declara cola `ucis.enricher.events` ligada a `events.#`.
   - Conecta a MongoDB.
2. Loop de consumo (`process_event`):
   - Cada 1 s consulta `simulator_config.paused` en Mongo. Si está pausado, **descarta** el mensaje (no lo procesa ni lo reenvía).
   - Decodifica JSON, busca el campo `zone` y consulta `ContextProvider.get_zone_context(zone)`.
   - Añade un bloque `enrichment`:
     ```json
     "enrichment": {
       "zone_context": {
         "risk_level": "high",
         "population_density": "very_high",
         "avg_response_time_min": 8.5,
         "hospitals": [...],
         "police_stations": [...],
         "fire_stations": [...]
       },
       "coordinates": {"latitude": 40.7128, "longitude": -74.0060},
       "enriched_at": "2026-04-26T...",
       "enriched_by": "enricher-v1"
     }
     ```
   - **Persiste** el evento enriquecido en `MongoDB.events` con `upsert` por `id` (sobrescribe el doc que el simulador escribió).
   - **Republica** en `ucis.events` con routing key `events.enriched.<domain>.<type>` (delivery_mode=2, persistente).
3. Usa `auto_ack=True`, así que si la conexión cae, los mensajes en vuelo se pierden — aceptable para un stream sintético de alto volumen.

## Archivos importantes

| Archivo | Rol |
|---------|-----|
| [services/enricher/enricher.py](../../services/enricher/enricher.py) | Servicio completo: `ContextProvider` (carga zonas), `EventEnricher` (consume/enriquece/publica), endpoint `/health`, loop principal. |
| [services/enricher/config/zones/zone_context.json](../../services/enricher/config/zones/zone_context.json) | Contexto estático por zona: hospitales, policía, bomberos, coords, riesgo, tiempo medio de respuesta. **Fuente de verdad** del enriquecimiento. |
| [services/enricher/Dockerfile](../../services/enricher/Dockerfile) | Imagen del servicio. |
| [services/enricher/requirements.txt](../../services/enricher/requirements.txt) | `pika`, `pymongo`, `fastapi`, `uvicorn`. |

## Puntos a recordar

- Es **stateless**: toda su "inteligencia" depende del JSON de zonas y de la pause-flag en Mongo.
- El CEP **depende** del bloque `enrichment.zone_context` para evaluar reglas EPL que filtran por `risk_level` o `avg_response_time_min`. Sin enricher, esas reglas no disparan.
- La persistencia en `events` se hace aquí, no en el simulador. Esto garantiza que la colección guarda la **versión enriquecida** del evento (que es lo que verá el frontend en la pestaña Events).
- La pausa se respeta a nivel de consumidor: se siguen leyendo mensajes pero se descartan, así la cola no se acumula.
