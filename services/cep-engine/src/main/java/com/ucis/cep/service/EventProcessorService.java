package com.ucis.cep.service;

import com.espertech.esper.runtime.client.EPRuntime;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ucis.cep.messaging.RabbitMQService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

@Slf4j
@Service
public class EventProcessorService {

    private final EPRuntime epRuntime;
    private final RabbitMQService rabbitMQService;
    private final PatternService patternService;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final AtomicLong processedCount = new AtomicLong(0);

    // Maps domain string to Esper event type name
    private static final Map<String, String> DOMAIN_TO_EVENT_TYPE = Map.of(
        "traffic",     "TrafficEvent",
        "climate",     "ClimateEvent",
        "health",      "HealthEvent",
        "environment", "EnvironmentEvent",
        "population",  "PopulationEvent"
    );

    @Autowired
    public EventProcessorService(EPRuntime epRuntime, RabbitMQService rabbitMQService, PatternService patternService) {
        this.epRuntime = epRuntime;
        this.rabbitMQService = rabbitMQService;
        this.patternService = patternService;
    }

    /**
     * Start consuming enriched events from RabbitMQ and routing them into Esper.
     */
    public void startConsuming() throws Exception {
        rabbitMQService.consumeEvents((consumerTag, delivery) -> {
            try {
                String body = new String(delivery.getBody());
                processEvent(body);
            } catch (Exception e) {
                log.error("Error processing message: {}", e.getMessage());
            }
        });
        log.info("Started consuming enriched events from RabbitMQ");
    }

    @SuppressWarnings("unchecked")
    private void processEvent(String json) {
        try {
            Map<String, Object> event = objectMapper.readValue(json, HashMap.class);

            String domain = (String) event.get("domain");
            String eventType = DOMAIN_TO_EVENT_TYPE.getOrDefault(domain, "Event");

            // Flatten enrichment.zone_context fields into a typed sub-map that Esper can navigate
            normalizeEnrichment(event);

            // Check if patterns changed in MongoDB before processing this event
            patternService.syncIfNeeded();

            epRuntime.getEventService().sendEventMap(event, eventType);

            long count = processedCount.incrementAndGet();

            if (count % 1000 == 0) {
                log.info("Processed {} enriched events into Esper", count);
            }

        } catch (Exception e) {
            log.error("Failed to parse/send event to Esper: {}", e.getMessage());
        }
    }

    /**
     * Ensures the enrichment block is a plain Map so Esper can navigate it with dot-notation.
     * The enricher publishes enrichment as a nested JSON object; Jackson parses it as LinkedHashMap
     * already, so we just make sure it is present and well-formed.
     */
    @SuppressWarnings("unchecked")
    private void normalizeEnrichment(Map<String, Object> event) {
        Object rawEnrichment = event.get("enrichment");
        if (rawEnrichment instanceof Map) {
            Map<String, Object> enrichment = (Map<String, Object>) rawEnrichment;
            Object rawZoneCtx = enrichment.get("zone_context");
            if (!(rawZoneCtx instanceof Map)) {
                // Provide default empty zone context so EPL filters don't NPE
                enrichment.put("zone_context", new HashMap<String, Object>());
            }
        } else {
            // No enrichment block at all — insert empty structure
            Map<String, Object> enrichment = new HashMap<>();
            enrichment.put("zone_context", new HashMap<String, Object>());
            event.put("enrichment", enrichment);
        }
    }

    public long getProcessedCount() {
        return processedCount.get();
    }
}
