# Patrones CEP por defecto

Este documento describe en detalle los **patrones de detección de eventos complejos** que UCIS carga por defecto en MongoDB la primera vez que arranca. Todos están definidos como reglas EPL (*Event Processing Language*) de **Esper 8.9** y se ejecutan dentro del [CEP Engine](../services/cep-engine/README.md).

## Índice

- [Cómo se cargan los patrones](#cómo-se-cargan-los-patrones)
- [Anatomía de un patrón](#anatomía-de-un-patrón)
- [Tipos de evento disponibles en EPL](#tipos-de-evento-disponibles-en-epl)
- [Patrones implementados](#patrones-implementados)
  - [1. `traffic_congestion_hotspot` — HIGH](#1-traffic_congestion_hotspot--high)
  - [2. `cascading_urban_crisis` — CRITICAL](#2-cascading_urban_crisis--critical)
  - [3. `moderate_air_quality_degradation` — MEDIUM](#3-moderate_air_quality_degradation--medium)
  - [4. `public_gathering_activity` — LOW](#4-public_gathering_activity--low)
- [Resumen comparativo](#resumen-comparativo)
- [Cómo probarlos en vivo](#cómo-probarlos-en-vivo)

---

## Cómo se cargan los patrones

Los patrones por defecto viven en [config/patterns/default_patterns.json](../config/patterns/default_patterns.json) y se *seedean* en MongoDB en el arranque de la API.

1. La API REST, al iniciarse, llama a `seed_default_patterns()` ([services/api/app.py](../services/api/app.py#L855)).
2. Esta función reconcilia los patrones gestionados por el sistema (`created_by: "system"`) con el contenido del JSON: inserta los nuevos, actualiza los existentes según `version`, y conserva intactos los patrones creados por el usuario.
3. El **CEP Engine** consulta periódicamente la colección `patterns` en MongoDB (`PatternService`) y registra como sentencias EPL todos los que tengan `enabled: true`.
4. Cuando una regla EPL hace *match*, el CEP genera un *complex event* que:
   - Se persiste en la colección `complex_events`.
   - Se publica en RabbitMQ (`ucis.complex`, routing key `events.complex.<pattern_id>`).
   - Llega al frontend en tiempo real vía el [WebSocket Server](../services/websocket/main.py).

> Los patrones se editan en caliente desde el frontend (pestaña **Patterns**) o vía REST (`POST /api/patterns`, `PUT /api/patterns/:id`). El CEP los recarga sin reiniciar.

---

## Anatomía de un patrón

Cada entrada del JSON tiene la siguiente forma:

```jsonc
{
  "pattern_id": "traffic_congestion_hotspot",   // id único, estable
  "name": "HIGH: Traffic Congestion Hotspot",   // nombre legible
  "description": "...",                         // qué detecta y por qué
  "epl_rule": "SELECT ... FROM ... WHERE ...",  // sentencia EPL Esper
  "severity": "high",                           // low | medium | high | critical
  "enabled": true,                              // activo en el motor
  "input_domains": ["traffic"],                 // dominios que consume
  "uses_enrichment": true,                      // requiere campos del enricher
  "enrichment_fields": [],                      // campos concretos que usa
  "version": 2,                                 // controla re-seed al arranque
  "created_by": "system",                       // diferencia user vs system
  "notes": "..."                                // pista para el escenario asociado
}
```

---

## Tipos de evento disponibles en EPL

El CEP Engine registra cuatro alias de tipo, uno por dominio relevante. Todos comparten los campos comunes (`id`, `timestamp`, `domain`, `type`, `zone`, `severity`) y exponen además los campos específicos del dominio (ver [events_schema.json](../config/schemas/events_schema.json)):

| Tipo Esper | Dominio | Campos específicos típicos |
|---|---|---|
| `TrafficEvent` | `traffic` | `street`, `vehicle_count`, `average_speed_kmh`, `vehicles_involved`, `injuries`, `lanes_blocked` |
| `ClimateEvent` | `climate` | `temperature_celsius`, `wind_speed_kmh`, `precipitation_mm`, `lightning_detected` |
| `HealthEvent` | `health` | `call_type`, `response_time_minutes`, `caller_location` |
| `EnvironmentEvent` | `environment` | `aqi`, `primary_pollutant`, `temperature_celsius` |
| `PopulationEvent` | `population` | `location`, `people_per_sqm`, `estimated_population`, `density_percent` |

Los patrones suelen filtrar con `(type='...', severity in ('high','critical'))` y agrupar por `zone` para que **una misma regla pueda alertar en varias zonas a la vez**.

---

## Patrones implementados

### 1. `traffic_congestion_hotspot` — HIGH

**Qué detecta.** Dos o más eventos de congestión de tráfico de severidad `high` o `critical` en una **misma zona** dentro de una ventana deslizante de 2 minutos.

**Regla EPL:**
```sql
SELECT zone,
       COUNT(*)                AS incident_count,
       AVG(average_speed_kmh)  AS avg_speed
FROM   TrafficEvent(type='congestion', severity in ('high','critical')).win:time(2 min)
GROUP  BY zone
HAVING COUNT(*) >= 2
```

**Cómo se lee:**
- `TrafficEvent(...).win:time(2 min)` → ventana **temporal deslizante** de 120 s sobre el stream de eventos de tráfico que ya cumplen el filtro.
- `GROUP BY zone` → cada zona mantiene su propio contador independiente; varias zonas pueden alertar simultáneamente.
- `HAVING COUNT(*) >= 2` → umbral mínimo de incidentes para emitir el complex event.
- El `SELECT` exporta el contador y la velocidad media, datos que viajarán dentro del *complex event* hasta el frontend.

**Dominios de entrada:** `traffic` · **Severidad:** `high` · **Escenario asociado:** `traffic_congestion_surge`.

---

### 2. `cascading_urban_crisis` — CRITICAL

**Qué detecta.** Una **correlación multi-dominio en la misma zona** dentro de una ventana de 5 minutos: simultáneamente hay una tormenta severa, un accidente de tráfico crítico y una emergencia sanitaria de alta gravedad.

**Regla EPL:**
```sql
SELECT c.zone           AS zone,
       c.wind_speed_kmh AS wind_speed_kmh,
       t.injuries       AS injuries,
       h.call_type      AS call_type
FROM   ClimateEvent(type='storm',         severity in ('high','critical')).win:time(5 min) AS c,
       TrafficEvent(type='accident',      severity in ('severe','critical')).win:time(5 min) AS t,
       HealthEvent (type='emergency_call', severity in ('high','critical')).win:time(5 min) AS h
WHERE  c.zone = t.zone
  AND  t.zone = h.zone
```

**Cómo se lee:**
- Se declaran **tres ventanas independientes** sobre tres tipos distintos, con alias `c`, `t`, `h`.
- El `WHERE` exige que las tres coincidan en la **misma zona** (`c.zone = t.zone = h.zone`). Esto convierte la consulta en una *join* entre streams.
- Esper mantiene cada ventana abierta 5 minutos: la combinación se evalúa en tiempo real cada vez que llega un evento de cualquiera de los tres dominios.
- El `SELECT` extrae datos representativos de cada lado (viento, heridos, tipo de llamada) que enriquecen la alerta.

**Por qué es CRITICAL.** Pretende capturar el patrón de cascada urbana clásica: un fenómeno climático grave provoca un accidente de tráfico, que a su vez se traduce en una emergencia sanitaria. La correlación geográfica + temporal eleva la confianza de que se trata de un incidente real coordinado y no ruido independiente.

**Dominios de entrada:** `climate`, `traffic`, `health` · **Severidad:** `critical` · **Escenario asociado:** `cascading_multi_zone_crisis`.

---

### 3. `moderate_air_quality_degradation` — MEDIUM

**Qué detecta.** Tres o más lecturas de calidad del aire (`type='air_quality'`) con severidad `medium` en la misma zona, dentro de una ventana de 3 minutos.

**Regla EPL:**
```sql
SELECT zone,
       COUNT(*)  AS readings,
       AVG(aqi)  AS avg_aqi
FROM   EnvironmentEvent(type='air_quality', severity='medium').win:time(3 min)
GROUP  BY zone
HAVING COUNT(*) >= 3
```

**Cómo se lee:**
- Filtro estricto a severidad `medium`: el patrón está pensado para detectar **deriva sostenida**, no picos puntuales.
- `AVG(aqi)` calcula el AQI medio del periodo; ese valor llega al frontend para contextualizar la alerta.
- 3 lecturas en 3 minutos = al menos una cada minuto en promedio.

**Dominios de entrada:** `environment` · **Severidad:** `medium` · **Escenario asociado:** `air_quality_drift`.

---

### 4. `public_gathering_activity` — LOW

**Qué detecta.** Tres o más eventos de tipo `gathering` en la misma zona dentro de una ventana de 5 minutos. Sirve como detector temprano de aglomeraciones que podrían escalar.

**Regla EPL:**
```sql
SELECT zone,
       COUNT(*) AS gatherings
FROM   PopulationEvent(type='gathering').win:time(5 min)
GROUP  BY zone
HAVING COUNT(*) >= 3
```

**Cómo se lee:**
- No filtra por severidad: cualquier `gathering` cuenta. La señal viene del **volumen**, no de la gravedad individual.
- Ventana larga (5 min) y umbral bajo (3) por estar etiquetado como severidad `low`: avisar pronto sin ser ruidoso.

**Dominios de entrada:** `population` · **Severidad:** `low` · **Escenario asociado:** `public_gatherings`.

---

## Resumen comparativo

| # | `pattern_id` | Severidad | Dominios | Ventana | Umbral / Lógica | Agrupación |
|---|---|---|---|---|---|---|
| 1 | `traffic_congestion_hotspot` | `high` | traffic | 2 min | `COUNT(*) >= 2` con severity ∈ {high, critical} | por `zone` |
| 2 | `cascading_urban_crisis` | `critical` | climate + traffic + health | 5 min | join de 3 streams en la misma `zone` | implícita por `zone` |
| 3 | `moderate_air_quality_degradation` | `medium` | environment | 3 min | `COUNT(*) >= 3` con severity = medium | por `zone` |
| 4 | `public_gathering_activity` | `low` | population | 5 min | `COUNT(*) >= 3` | por `zone` |

Todos son **zone-agnostic** (no atan la regla a una zona concreta), de manera que cualquier zona del sistema (`downtown`, `suburbs`, `industrial`, `residential`, `airport`) puede disparar el patrón de forma independiente.

---

## Cómo probarlos en vivo

Cada patrón tiene un **escenario** asociado en [config/scenarios/default_scenarios.json](../config/scenarios/default_scenarios.json) que sesga el simulador para forzar su disparo:

| Patrón | Escenario que lo provoca |
|---|---|
| `traffic_congestion_hotspot` | `traffic_congestion_surge` |
| `cascading_urban_crisis` | `cascading_multi_zone_crisis` |
| `moderate_air_quality_degradation` | `air_quality_drift` |
| `public_gathering_activity` | `public_gatherings` |

Pasos para verlos dispararse:

1. Abrir el frontend en http://localhost:3000 → pestaña **Scenarios**.
2. Activar el escenario correspondiente. El simulador empezará a sesgar dominios y severidades.
3. Tras unos segundos, la alerta llegará al **Dashboard** vía WebSocket y se persistirá en la pestaña **Alerts**.
4. Los logs del CEP Engine la confirman:
   ```bash
   docker logs -f ucis-cep-engine | grep PATTERN
   ```
5. La estadística por patrón se puede consultar vía API:
   ```bash
   curl -s http://localhost:5000/api/stats/patterns | jq
   ```

> Para escribir patrones nuevos, el modal **Patterns → New Pattern** en el frontend valida la sintaxis EPL antes de persistir. Cualquier patrón con `enabled: true` será cargado por el CEP en su siguiente ciclo de refresco, sin reinicio.
