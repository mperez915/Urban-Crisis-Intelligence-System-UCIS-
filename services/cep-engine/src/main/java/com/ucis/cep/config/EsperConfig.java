package com.ucis.cep.config;

import com.espertech.esper.runtime.client.EPRuntime;
import com.espertech.esper.runtime.client.EPRuntimeProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import java.util.HashMap;
import java.util.Map;

/**
 * Esper CEP Engine Configuration
 */
@Configuration
public class EsperConfig {

    /**
     * Create and configure Esper runtime
     */
    @Bean
    public EPRuntime epRuntime() {
        com.espertech.esper.common.client.configuration.Configuration config = 
            new com.espertech.esper.common.client.configuration.Configuration();
        
        // Event representation: Map-based events with proper type definitions
        Map<String, Object> eventProperties = new HashMap<>();
        eventProperties.put("id", String.class);
        eventProperties.put("timestamp", String.class);
        eventProperties.put("domain", String.class);
        eventProperties.put("type", String.class);
        eventProperties.put("zone", String.class);
        eventProperties.put("severity", String.class);
        
        config.getCommon().addEventType("Event", eventProperties);
        
        EPRuntime runtime = EPRuntimeProvider.getRuntime("ucis-cep", config);
        return runtime;
    }
}
