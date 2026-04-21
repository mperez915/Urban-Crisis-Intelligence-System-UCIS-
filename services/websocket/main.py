import json
import logging
import os
import threading
import time

import pika
import socketio
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
log = logging.getLogger("websocket-server")

RABBITMQ_HOST = os.getenv("RABBITMQ_HOST", "rabbitmq")
RABBITMQ_PORT = int(os.getenv("RABBITMQ_PORT", 5672))
RABBITMQ_USER = os.getenv("RABBITMQ_USERNAME", "admin")
RABBITMQ_PASS = os.getenv("RABBITMQ_PASSWORD", "admin123")
WS_QUEUE = "ucis.websocket.events"

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    logger=False,
    engineio_logger=False,
)

app = FastAPI(title="UCIS WebSocket Server")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

socket_app = socketio.ASGIApp(sio, other_asgi_app=app)


@sio.event
async def connect(sid, environ):
    log.info("Client connected: %s", sid)


@sio.event
async def disconnect(sid):
    log.info("Client disconnected: %s", sid)


@app.get("/health")
def health():
    return {"status": "ok", "service": "websocket-server"}


def _rabbitmq_credentials():
    return pika.PlainCredentials(RABBITMQ_USER, RABBITMQ_PASS)


def _connect_rabbitmq():
    params = pika.ConnectionParameters(
        host=RABBITMQ_HOST,
        port=RABBITMQ_PORT,
        credentials=_rabbitmq_credentials(),
        heartbeat=60,
        blocked_connection_timeout=300,
    )
    while True:
        try:
            connection = pika.BlockingConnection(params)
            log.info("Connected to RabbitMQ")
            return connection
        except Exception as exc:
            log.warning("RabbitMQ not ready (%s) — retrying in 3s", exc)
            time.sleep(3)


def _consume_loop():
    import asyncio

    loop = asyncio.new_event_loop()

    def on_message(ch, method, properties, body):
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            payload = {"raw": body.decode(errors="replace")}

        log.debug("Complex event received: %s", payload.get("pattern_id", "?"))

        asyncio.run_coroutine_threadsafe(
            sio.emit("complex_event", payload),
            loop,
        )
        ch.basic_ack(delivery_tag=method.delivery_tag)

    def run_loop():
        loop.run_forever()

    threading.Thread(target=run_loop, daemon=True).start()

    while True:
        try:
            connection = _connect_rabbitmq()
            channel = connection.channel()

            channel.queue_declare(queue=WS_QUEUE, durable=True)
            channel.basic_qos(prefetch_count=10)
            channel.basic_consume(queue=WS_QUEUE, on_message_callback=on_message)

            log.info("Listening on queue '%s'", WS_QUEUE)
            channel.start_consuming()
        except Exception as exc:
            log.error("Consumer error (%s) — reconnecting in 5s", exc)
            time.sleep(5)


@app.on_event("startup")
def startup():
    t = threading.Thread(target=_consume_loop, daemon=True)
    t.start()


if __name__ == "__main__":
    uvicorn.run(socket_app, host="0.0.0.0", port=8083)
