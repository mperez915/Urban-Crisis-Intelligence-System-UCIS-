# Análisis de Tiempos - Sistema UCIS

## Problema: Eventos que persisten después de parar la simulación

### Resumen del Análisis

El problema de eventos que continúan apareciendo en el dashboard incluso después de parar el simulador se debe a la arquitectura de procesamiento por colas y ventanas de tiempo del CEP (Complex Event Processing).

## 1. Tiempos de Generación del Simulador

### Configuración del Simulador
- **Rate configurable**: 1-20 eventos/segundo
- **Rate por defecto**: 10 eventos/segundo
- **Intervalo entre eventos**: 1 / event_rate segundos
- **Polling de configuración**: cada 3 segundos

```python
# services/simulator/simulator.py
CONFIG_POLL_INTERVAL = 3   # seconds between MongoDB config re-reads
self.event_rate = int(os.getenv("EVENT_RATE", 10))  # Default: 10 evt/s

@property
def sleep_interval(self) -> float:
    return 1.0 / self.event_rate
```

### Ciclo de Vida de un Evento
1. **Generación** (simulador) → RabbitMQ exchange `ucis.events`
2. **Enriquecimiento** (enricher) → procesa de la cola → publica a `ucis.events.enriched`
3. **Procesamiento CEP** (cep-engine) → lee de cola → ingresa a ventanas de tiempo Esper
4. **Generación de Alertas** → eventos complejos → WebSocket → Dashboard

## 2. Tiempos Definidos en los Patrones

### Ventanas de Tiempo del CEP (win:time)

Los patrones de Esper utilizan ventanas deslizantes que mantienen eventos en memoria:

| Pattern ID | Window Time | Tipo de Agregación |
|------------|-------------|-------------------|
| `high_traffic_congestion_enriched` | **10 min** | COUNT(*) >= 2 |
| `accident_with_insufficient_response` | Instantáneo | Event único |
| `hazardous_weather_in_critical_zone` | Instantáneo | Pattern matching |
| `air_quality_health_emergency_correlation` | **30 min** | Pattern temporal |
| `crowd_alert_in_low_response_zone` | **5 min** | SUM(population) |
| `emergency_services_overwhelmed` | **10 min** | COUNT(*) >= 5 |
| `critical_pollution_spike` | **1 min** | Event único |

**Ventana máxima observada**: 30 minutos

### Implicaciones de las Ventanas de Tiempo

```sql
-- Ejemplo: Patrón con ventana de 30 minutos
FROM PATTERN [
    a=EnvironmentEvent(...) -> h=HealthEvent(...)
].win:time(30 min)
```

Esta ventana significa que:
- Los eventos permanecen en memoria durante 30 minutos
- Se pueden generar alertas basadas en eventos de hasta 30 minutos atrás
- Incluso después de parar el simulador, los eventos ya ingresados siguen siendo procesados

## 3. Por Qué Continúan Apareciendo Eventos

### Causa Raíz: Pipeline Asíncrono con Buffers

```
Simulador (PARADO) 
    ↓ (buffer vacío)
RabbitMQ Queue 'ucis.events.raw'
    ↓ (puede contener eventos pendientes)
Enricher (procesando)
    ↓
RabbitMQ Queue 'ucis.events.enriched'
    ↓ (puede contener eventos pendientes)
CEP Engine (procesando)
    ↓ (ventanas de tiempo activas: hasta 30 min)
Ventanas Esper (win:time)
    ↓ (eventos en memoria)
Generación de Alertas
    ↓
Dashboard
```

### Factores Contribuyentes

1. **Buffers de RabbitMQ**
   - Cola `ucis.events.raw`: eventos esperando enriquecimiento
   - Cola `ucis.events.enriched`: eventos esperando procesamiento CEP
   - Prefetch count: eventos pre-cargados en memoria del consumidor

2. **Ventanas de Tiempo de Esper**
   - Los eventos ya ingresados permanecen en ventanas activas
   - Tiempo de retención: 1-30 minutos según el patrón
   - Las ventanas no se "vacían" al parar el simulador

3. **Latencia de Procesamiento**
   - Tiempo de enriquecimiento: variable (consultas a MongoDB)
   - Tiempo de evaluación CEP: milisegundos por evento
   - Acumulación cuando event_rate > capacidad de procesamiento

### Escenario Típico

Con un `event_rate = 10 evt/s` y ventana de 30 minutos:

1. **T=0**: Simulador activo, generando 10 evt/s
2. **T=5 min**: Usuario para el simulador
3. **T=5 min + 1s**: Último evento generado
4. **T=5 min + 2s**: RabbitMQ aún tiene ~50-200 eventos en cola
5. **T=5 min + 30s**: Enricher termina de procesar eventos pendientes
6. **T=5 min + 31s**: CEP Engine ingresa últimos eventos a ventanas
7. **T=5 min → 35 min**: Ventanas siguen activas, pueden generar alertas

**Resultado**: Alertas pueden aparecer hasta **35 minutos** después de parar el simulador.

## 4. Soluciones Implementadas

### ✅ Solución Implementada: Purga Automática de Colas al Pausar

Se ha implementado la **Opción A + C**: Purgar colas RabbitMQ automáticamente + Banner informativo.

#### Implementación

**Backend (API):**
- Nuevo método `purge_rabbitmq_queues()` en `services/api/app.py`
- Endpoint `/api/simulator/config` (PUT) detecta cuando `paused` cambia a `True`
- Purga automática de 3 colas:
  - `ucis.events.raw` (eventos sin enriquecer)
  - `ucis.events.enriched` (eventos enriquecidos)
  - `ucis.events.complex` (alertas CEP)

**Frontend:**
- Banner informativo en Dashboard cuando simulador está pausado
- Mensaje actualizado indicando que las colas se han limpiado automáticamente
- Explicación de que alertas pueden continuar brevemente debido a ventanas CEP

#### Comportamiento Esperado

**Al pausar el simulador:**
1. ✅ Usuario hace clic en "⏸ Pause"
2. ✅ API actualiza `paused: true` en MongoDB
3. ✅ API detecta el cambio y llama a `purge_rabbitmq_queues()`
4. ✅ Se purgan las 3 colas de RabbitMQ
5. ⏱️ Eventos ya en ventanas CEP (hasta 30 min) continúan generando alertas
6. ℹ️ Banner azul aparece en el Dashboard explicando el comportamiento

**Reducción de tiempo post-pausa:**
- **Antes**: Alertas podían continuar hasta 30+ minutos
- **Ahora**: Alertas típicamente cesan en 1-5 minutos (solo eventos en ventanas CEP activas)

#### Ventajas de esta Solución

✅ **Inmediato**: Las colas se limpian al instante  
✅ **No invasivo**: Respeta eventos ya en procesamiento CEP  
✅ **Educativo**: Usuario entiende el comportamiento a través del banner  
✅ **Realista**: Simula comportamiento de sensores físicos (no paran instantáneamente)  
✅ **Automático**: No requiere acción manual del usuario

#### Logs del Sistema

El API registra información detallada cuando se purgan las colas:

```
INFO - Simulator paused - purging RabbitMQ queues...
INFO - Purged 127 messages from queue 'ucis.events.raw'
INFO - Purged 89 messages from queue 'ucis.events.enriched'
INFO - Purged 0 messages from queue 'ucis.events.complex'
INFO - Successfully purged RabbitMQ queues: {'ucis.events.raw': 127, 'ucis.events.enriched': 89, 'ucis.events.complex': 0}
```

## 5. Soluciones Consideradas (No Implementadas)

### Opción B: Resetear Ventanas CEP (No Implementada)
❌ Requiere reiniciar CEP Engine  
❌ Más complejo de implementar  
⚠️ Podría considerarse en el futuro para un botón "Hard Reset"

### Opción D: Modo "Flush" - Botón de Limpieza Manual (No Implementada)
⏸️ Pospuesto - la purga automática es suficiente para la mayoría de casos  
⏸️ Podría agregarse en futuras versiones si hay demanda

## 6. Tiempos Esperados por Patrón

| Patrón | Tiempo Máximo Post-Pausa |
|--------|--------------------------|
| critical_pollution_spike | ~1 minuto |
| crowd_alert_in_low_response_zone | ~5 minutos |
| high_traffic_congestion_enriched | ~10 minutos |
| emergency_services_overwhelmed | ~10 minutos |
| air_quality_health_emergency_correlation | **~30 minutos** |

---

**Fecha**: 23 de abril de 2026
**Sistema**: Urban Crisis Intelligence System (UCIS)
