# 01 · Simulator (Generador de eventos)

Servicio Python que genera eventos sintéticos de 5 dominios urbanos y los publica en RabbitMQ. Es la **fuente de datos** de toda la pipeline.

- **Lenguaje**: Python 3.11
- **Librerías**: `pika` (AMQP), `pymongo`
- **Salida**: exchange `ucis.events`, routing key `events.<domain>.<type>`
- **Container**: `ucis-simulator`

## Cómo funciona

1. Al arrancar declara el exchange `ucis.events` (topic, durable) y se conecta a MongoDB.
2. Cada **1 segundo** consulta dos documentos en Mongo (`SimulatorConfig._poll_config`):
   - `simulator_config` (id `main`): estado runtime → `event_rate`, `paused`, `force_domain`, `force_zone`, `force_severity`, `active_scenario_id`.
   - `scenarios` con el `scenario_id` activo: aporta `domain_weights` y opcionalmente sobrescribe rate / zona / severidad.
3. En cada iteración del loop principal:
   - Si `paused == true` ⇒ duerme y no genera nada.
   - Elige dominio según `force_domain` o por **muestreo ponderado** (`random.choices`) con los `domain_weights`.
   - Llama al generador correspondiente (`TrafficEventGenerator`, etc.) → produce un dict con campos del dominio.
   - Aplica overrides `force_zone` / `force_severity` si están definidos.
   - Publica en RabbitMQ con routing key `events.<domain>.<type>`.
   - Persiste también el evento crudo en `MongoDB.events` (la versión enriquecida lo sobreescribe luego con `upsert`).
4. Tasa: `time.sleep(1.0 / event_rate)` entre eventos. Reconexión automática al canal AMQP si se cierra.

## Estructura de un evento crudo

```json
{
  "id": "uuid4",
  "timestamp": "2026-04-26T12:34:56Z",
  "domain": "traffic",
  "type": "accident",
  "zone": "downtown",
  "severity": "critical",
  "vehicles_involved": 3,
  "injuries": 2,
  "lanes_blocked": 2
}
```

Cada generador define su propio conjunto de tipos y campos específicos.

## Archivos importantes

| Archivo | Rol |
|---------|-----|
| [services/simulator/simulator.py](../../services/simulator/simulator.py) | Loop principal, polling de config, conexión a RabbitMQ y Mongo, publicación. Contiene `SimulatorConfig` (estado runtime) y `EventSimulator` (orquestador). |
| [services/simulator/event_generators/base.py](../../services/simulator/event_generators/base.py) | Clase abstracta `BaseEventGenerator`: genera `id`, `timestamp`, `domain`, `type`. |
| [services/simulator/event_generators/traffic.py](../../services/simulator/event_generators/traffic.py) | Eventos de tráfico (`congestion`, `accident`, `incident`, `flow`). Calcula severidad de congestión a partir de velocidad y ocupación. |
| [services/simulator/event_generators/climate.py](../../services/simulator/event_generators/climate.py) | Tormentas, temperatura, viento. |
| [services/simulator/event_generators/health.py](../../services/simulator/event_generators/health.py) | Llamadas de emergencia, ambulancias. |
| [services/simulator/event_generators/environment.py](../../services/simulator/event_generators/environment.py) | Calidad del aire, contaminación (AQI). |
| [services/simulator/event_generators/population.py](../../services/simulator/event_generators/population.py) | Densidad, aglomeraciones, evacuaciones. |
| [services/simulator/event_generators/__init__.py](../../services/simulator/event_generators/__init__.py) | Export de los generadores. |
| [services/simulator/Dockerfile](../../services/simulator/Dockerfile) | Imagen del servicio. |
| [services/simulator/requirements.txt](../../services/simulator/requirements.txt) | Dependencias Python. |

## Puntos a recordar

- El simulador es **dinámicamente reconfigurable**: cambiar `simulator_config` o `scenarios` en MongoDB se refleja en ≤ 1 s sin reiniciar el contenedor.
- `event_rate` está acotado a `[1, 20]` eventos/segundo en `SimulatorConfig.update`.
- Si los `domain_weights` del escenario suman 0, se usan los pesos por defecto (todos 1).
- No envía nada cuando está en pausa: la API se encarga además de purgar las colas para evitar alertas residuales (ver bloque API).
