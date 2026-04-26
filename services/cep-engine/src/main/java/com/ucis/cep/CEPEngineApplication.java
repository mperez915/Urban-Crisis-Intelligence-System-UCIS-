package com.ucis.cep;

import com.ucis.cep.messaging.RabbitMQService;
import com.ucis.cep.service.EventProcessorService;
import com.ucis.cep.service.PatternService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@Slf4j
@EnableScheduling
@SpringBootApplication(exclude = {
    org.springframework.boot.autoconfigure.mongo.MongoAutoConfiguration.class,
    org.springframework.boot.autoconfigure.data.mongo.MongoDataAutoConfiguration.class
})
public class CEPEngineApplication implements CommandLineRunner {

    @Autowired
    private RabbitMQService rabbitMQService;

    @Autowired
    private PatternService patternService;

    @Autowired
    private EventProcessorService eventProcessorService;

    public static void main(String[] args) {
        SpringApplication.run(CEPEngineApplication.class, args);
    }

    @Override
    public void run(String... args) throws Exception {
        log.info("=== UCIS CEP Engine starting ===");

        // 1. Connect to RabbitMQ and declare infrastructure
        rabbitMQService.connect();

        // 2. Load patterns from MongoDB and start background polling for changes
        patternService.start();
        log.info("Active patterns: {}", patternService.getDeployedPatternIds());

        // 3. Start consuming enriched events from RabbitMQ → Esper (blocking call in background thread)
        Thread consumerThread = new Thread(() -> {
            try {
                eventProcessorService.startConsuming();
                // Keep the consumer thread alive
                Thread.currentThread().join();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                log.info("Consumer thread interrupted, shutting down");
            } catch (Exception e) {
                log.error("Fatal error in consumer thread: {}", e.getMessage(), e);
            }
        }, "cep-consumer");
        consumerThread.setDaemon(false);
        consumerThread.start();

        log.info("=== UCIS CEP Engine running — consuming from ucis.cep.events ===");
    }
}
