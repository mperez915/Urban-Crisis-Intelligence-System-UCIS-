package com.ucis.cep.config;

import com.espertech.esper.common.client.configuration.Configuration;
import com.espertech.esper.runtime.client.EPRuntime;
import com.espertech.esper.runtime.client.EPRuntimeProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

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
        Configuration config = new Configuration();
        
        // Enable timing
        config.getRuntime().setThreadingProfile("LARGE");
        
        // Event representation: Map-based events
        config.getCommon().addEventType("Event", 
            "{ id: String, timestamp: String, domain: String, type: String, " +
            "zone: String, severity: String}");
        
        EPRuntime runtime = EPRuntimeProvider.getRuntime("ucis-cep", config);
        return runtime;
    }
}
