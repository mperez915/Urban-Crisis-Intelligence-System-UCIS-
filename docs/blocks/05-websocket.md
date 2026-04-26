# 05 · WebSocket Server

Microservicio Python que entrega **alertas en tiempo real** desde RabbitMQ al frontend usando Socket.IO. Elimina el polling HTTP para alertas críticas.

- **Lenguaje**: Python 3.11
- **Stack**: FastAPI + `python-socketio` (modo ASGI) + Uvicorn + Pika
- **Entrada**: cola `ucis.websocket.events` (binding `events.complex.#` sobre exchange `ucis.complex`)
- **Salida**: evento Socket.IO `complex_event` a todos los clientes conectados
- **Puerto**: 8083
- **Container**: `ucis-websocket`

## Cómo funciona

1. Arranca un servidor ASGI con dos cosas montadas en el mismo proceso:
   - **FastAPI** con `GET /health` y CORS abierto (`*`).
   - **Socket.IO** (`socketio.AsyncServer`) wrapped en `socketio.ASGIApp`. Acepta `websocket` y fallback `polling`.
2. En el evento `startup` lanza un thread daemon (`_consume_loop`) que:
   - Crea un nuevo `asyncio` event loop dentro del thread (necesario para llamar `sio.emit` desde un thread Pika síncrono).
   - Conecta a RabbitMQ con reintentos infinitos (3 s).
   - Declara la cola `ucis.websocket.events` como durable, con `prefetch=10` y ack manual.
   - Para cada mensaje:
     - Decodifica JSON (con fallback a raw).
     - Loggea `pattern_id`, `severity`, `zone`, número de `source_events`.
     - Ejecuta `asyncio.run_coroutine_threadsafe(sio.emit("complex_event", payload), loop)` → emite a **todos los clientes** conectados.
     - `basic_ack` del mensaje.
3. Si el consumer cae, hace `sleep(5)` y vuelve a intentar — supervivencia ante reinicios de RabbitMQ.

## Por qué un servicio aparte

- El bridge **AMQP → Socket.IO** requiere un loop asyncio + threads dedicados; meterlo en la API Flask complicaría el modelo de concurrencia.
- Permite escalar horizontalmente el push real-time sin tocar la API ni el CEP.
- Si se cae, los eventos siguen persistiéndose en `complex_events` (lo escribe el CEP). El frontend recupera por HTTP al recargar.

## Archivos importantes

| Archivo | Rol |
|---------|-----|
| [services/websocket/main.py](../../services/websocket/main.py) | Servidor completo: FastAPI + Socket.IO + thread consumer Pika + reconexión. |
| [services/websocket/requirements.txt](../../services/websocket/requirements.txt) | `fastapi`, `uvicorn`, `python-socketio`, `pika`. |
| [services/websocket/Dockerfile](../../services/websocket/Dockerfile) | Imagen del servicio. |
| [config/rabbitmq/definitions.json](../../config/rabbitmq/definitions.json) | Declara la cola `ucis.websocket.events` y su binding `events.complex.#` al exchange `ucis.complex`. |

## Cliente (frontend)

En [services/frontend/src/App.js](../../services/frontend/src/App.js) el frontend abre la conexión:

```js
const socket = io(WS_URL, { transports: ['websocket', 'polling'] });
socket.on('complex_event', () => setComplexCount(prev => prev + 1));
```

Y muestra el indicador de conexión con [`WsIndicator`](../../services/frontend/src/components/common/WsIndicator.js).

## Puntos a recordar

- Broadcast **sin filtros**: todos los clientes reciben todas las alertas. La filtración por severidad/zona se hace client-side.
- `auto_ack=False` + `prefetch=10`: si el server cae, los mensajes no acked se redistribuyen al volver.
- CORS está abierto (`*`) para simplificar dev. En producción habría que restringirlo al dominio del frontend.
