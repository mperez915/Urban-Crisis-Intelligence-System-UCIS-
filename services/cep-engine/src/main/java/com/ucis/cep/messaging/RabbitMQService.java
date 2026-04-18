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
    private Channel channel;
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
     * Consume events from RabbitMQ
     */
    public void consumeEvents(DeliverCallback deliverCallback) throws IOException {
        channel.basicConsume("ucis.cep.events", true, deliverCallback, 
            (String consumerTag) -> {});
    }

    /**
     * Publish complex event
     */
    public void publishComplexEvent(Map<String, Object> complexEvent) throws IOException {
        String routingKey = "events.complex." + complexEvent.getOrDefault("pattern_id", "unknown");
        String message = objectMapper.writeValueAsString(complexEvent);

        channel.basicPublish("ucis.complex", routingKey,
            new AMQP.BasicProperties.Builder()
                .contentType("application/json")
                .deliveryMode(2)  // Persistent
                .build(),
            message.getBytes());

        log.debug("Published complex event: {}", routingKey);
    }

    /**
     * Close connection
     */
    public void close() throws IOException, TimeoutException {
        if (channel != null && channel.isOpen()) {
            channel.close();
        }
        if (connection != null && connection.isOpen()) {
            connection.close();
        }
        log.info("RabbitMQ connection closed");
    }
}
