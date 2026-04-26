package com.ucis.cep.messaging;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.rabbitmq.client.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeoutException;

/**
 * RabbitMQ message handler for receiving and publishing events
 */
@Slf4j
@Service
public class RabbitMQService {

    private Connection connection;
    private Channel channel;          // consumer channel
    private Channel publishChannel;   // separate channel for publishing complex events
    private final Object publishLock = new Object();
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${rabbitmq.host}")
    private String host;

    @Value("${rabbitmq.port}")
    private int port;

    @Value("${rabbitmq.username}")
    private String username;

    @Value("${rabbitmq.password}")
    private String password;

    /**
     * Initialize RabbitMQ connection
     */
    public void connect() throws IOException, TimeoutException {
        ConnectionFactory factory = new ConnectionFactory();
        factory.setHost(host);
        factory.setPort(port);
        factory.setUsername(username);
        factory.setPassword(password);
        factory.setAutomaticRecoveryEnabled(true);

        this.connection = factory.newConnection();
        this.channel = connection.createChannel();
        this.publishChannel = connection.createChannel();

        log.info("Connected to RabbitMQ at {}:{}", host, port);

        // Declare exchanges and queues
        declareInfrastructure();
    }

    /**
     * Declare exchanges and queues
     *
     * Flow:
     * 1. Simulator publishes raw events to "ucis.events" exchange with routing key "events.*"
     * 2. Enricher consumes from "ucis.events" (pattern: events.#)
     * 3. Enricher publishes enriched events to "ucis.events" with routing key "events.enriched.*"
     * 4. CEP Engine consumes enriched events from "ucis.events" (pattern: events.enriched.#)
     * 5. CEP detects patterns and publishes complex events to "ucis.complex"
     */
    private void declareInfrastructure() throws IOException {
        // Exchange for receiving events from Simulator and Enricher
        channel.exchangeDeclare("ucis.events", "topic", true);

        // Exchange for publishing complex events (alerts) detected by CEP
        channel.exchangeDeclare("ucis.complex", "topic", true);

        // Queue for CEP engine - consumes ENRICHED events (from Enricher output)
        // NOTE: CEP must consume "events.enriched.*" NOT raw "events.*"
        channel.queueDeclare("ucis.cep.events", true, false, false, null);
        channel.queueBind("ucis.cep.events", "ucis.events", "events.enriched.#");

        log.info("RabbitMQ infrastructure initialized");
        log.info("CEP Engine listening to: events.enriched.# (enriched events from Enricher)");
    }

    /**
     * Consume events from RabbitMQ.
     * Uses manual ack + basicQos prefetch so messages cannot pile up in memory
     * faster than the CEP engine can process them — prevents OOM under load.
     */
    public void consumeEvents(DeliverCallback deliverCallback) throws IOException {
        // Cap unacknowledged messages held by this consumer at any time.
        int prefetch = Integer.getInteger("cep.consumer.prefetch", 200);
        channel.basicQos(prefetch);

        DeliverCallback wrapped = (consumerTag, delivery) -> {
            try {
                deliverCallback.handle(consumerTag, delivery);
            } catch (Throwable t) {
                // CRITICAL: never let an exception escape to the AMQP client library —
                // it would close the consumer channel and stop event ingestion entirely.
                log.error("Unhandled error in delivery callback (swallowed to keep consumer alive): {}",
                          t.getMessage(), t);
            } finally {
                try {
                    channel.basicAck(delivery.getEnvelope().getDeliveryTag(), false);
                } catch (Exception e) {
                    log.warn("Failed to ack delivery tag {}: {}",
                        delivery.getEnvelope().getDeliveryTag(), e.getMessage());
                }
            }
        };

        channel.basicConsume("ucis.cep.events", false, wrapped,
            (String consumerTag) -> {});
        log.info("Consumer started on 'ucis.cep.events' with prefetch={}, manual ack", prefetch);
    }

    /**
     * Publish complex event. Uses a dedicated publish channel (separate from the consumer
     * channel) and lazily recreates it if it has been closed by a prior error so that a
     * transient publish failure cannot stall the CEP pipeline.
     */
    public void publishComplexEvent(Map<String, Object> complexEvent) throws IOException {
        String routingKey = "events.complex." + complexEvent.getOrDefault("pattern_id", "unknown");
        String message = objectMapper.writeValueAsString(complexEvent);
        byte[] body = message.getBytes();

        AMQP.BasicProperties props = new AMQP.BasicProperties.Builder()
            .contentType("application/json")
            .deliveryMode(2)  // Persistent
            .build();

        synchronized (publishLock) {
            try {
                ensurePublishChannel();
                publishChannel.basicPublish("ucis.complex", routingKey, props, body);
            } catch (Exception first) {
                log.warn("Publish failed ({}); recreating publish channel and retrying", first.getMessage());
                try {
                    if (publishChannel != null && publishChannel.isOpen()) {
                        try { publishChannel.close(); } catch (Exception ignored) {}
                    }
                    publishChannel = null;
                    ensurePublishChannel();
                    publishChannel.basicPublish("ucis.complex", routingKey, props, body);
                } catch (Exception retry) {
                    log.error("Publish retry failed for routingKey={}: {}", routingKey, retry.getMessage());
                    throw new IOException("publishComplexEvent failed", retry);
                }
            }
        }

        log.debug("Published complex event: {}", routingKey);
    }

    private void ensurePublishChannel() throws IOException {
        if (publishChannel == null || !publishChannel.isOpen()) {
            if (connection == null || !connection.isOpen()) {
                throw new IOException("RabbitMQ connection is not open");
            }
            publishChannel = connection.createChannel();
            log.info("(Re)created RabbitMQ publish channel");
        }
    }

    /**
     * Close connection
     */
    public void close() throws IOException, TimeoutException {
        if (publishChannel != null && publishChannel.isOpen()) {
            try { publishChannel.close(); } catch (Exception ignored) {}
        }
        if (channel != null && channel.isOpen()) {
            channel.close();
        }
        if (connection != null && connection.isOpen()) {
            connection.close();
        }
        log.info("RabbitMQ connection closed");
    }
}
