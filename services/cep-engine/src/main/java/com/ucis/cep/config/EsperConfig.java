package com.ucis.cep.config;

import com.espertech.esper.common.client.configuration.Configuration;
import com.espertech.esper.runtime.client.EPRuntime;
import com.espertech.esper.runtime.client.EPRuntimeProvider;
import org.springframework.context.annotation.Bean;

import java.util.HashMap;
import java.util.Map;

@org.springframework.context.annotation.Configuration
public class EsperConfig {

    @Bean
    public EPRuntime epRuntime() {
        Configuration config = new Configuration();

        // Shared enrichment sub-type (nested map, registered first)
        Map<String, Object> zoneContext = new HashMap<>();
        zoneContext.put("risk_level", String.class);
        zoneContext.put("population_density", String.class);
        zoneContext.put("avg_response_time_min", Double.class);
        zoneContext.put("hospitals", Object.class);
        zoneContext.put("police_stations", Object.class);
        zoneContext.put("fire_stations", Object.class);
        config.getCommon().addEventType("ZoneContext", zoneContext);

        Map<String, Object> enrichment = new HashMap<>();
        enrichment.put("zone_context", "ZoneContext");
        enrichment.put("enriched_at", String.class);
        enrichment.put("enriched_by", String.class);
        config.getCommon().addEventType("Enrichment", enrichment);

        // Base fields shared by all domain event types
        config.getCommon().addEventType("TrafficEvent",   buildTrafficFields(enrichment));
        config.getCommon().addEventType("ClimateEvent",   buildClimateFields(enrichment));
        config.getCommon().addEventType("HealthEvent",    buildHealthFields(enrichment));
        config.getCommon().addEventType("EnvironmentEvent", buildEnvironmentFields(enrichment));
        config.getCommon().addEventType("PopulationEvent",  buildPopulationFields(enrichment));

        // Generic fallback type for unrecognised domains
        config.getCommon().addEventType("Event", buildBaseFields());

        return EPRuntimeProvider.getRuntime("ucis-cep", config);
    }

    private Map<String, Object> buildBaseFields() {
        Map<String, Object> f = new HashMap<>();
        f.put("id", String.class);
        f.put("timestamp", String.class);
        f.put("domain", String.class);
        f.put("type", String.class);
        f.put("zone", String.class);
        f.put("severity", String.class);
        f.put("enrichment", Map.class);
        return f;
    }

    private Map<String, Object> buildTrafficFields(Map<String, Object> enrichment) {
        Map<String, Object> f = buildBaseFields();
        f.put("street", String.class);
        f.put("vehicles_involved", Integer.class);
        f.put("injuries", Integer.class);
        f.put("lanes_blocked", Integer.class);
        f.put("average_speed_kmh", Double.class);
        f.put("vehicle_count", Integer.class);
        f.put("occupancy_percent", Double.class);
        f.put("incident_type", String.class);
        return f;
    }

    private Map<String, Object> buildClimateFields(Map<String, Object> enrichment) {
        Map<String, Object> f = buildBaseFields();
        f.put("temperature_celsius", Double.class);
        f.put("humidity_percent", Double.class);
        f.put("wind_speed_kmh", Double.class);
        f.put("precipitation_mm", Double.class);
        f.put("lightning_detected", Boolean.class);
        return f;
    }

    private Map<String, Object> buildHealthFields(Map<String, Object> enrichment) {
        Map<String, Object> f = buildBaseFields();
        f.put("call_type", String.class);
        f.put("response_time_minutes", Double.class);
        f.put("patient_count", Integer.class);
        f.put("hospital_destination", String.class);
        f.put("dispatch_status", String.class);
        return f;
    }

    private Map<String, Object> buildEnvironmentFields(Map<String, Object> enrichment) {
        Map<String, Object> f = buildBaseFields();
        f.put("aqi", Double.class);
        f.put("primary_pollutant", String.class);
        f.put("concentration_ppm", Double.class);
        f.put("temperature_celsius", Double.class);
        f.put("humidity_percent", Double.class);
        return f;
    }

    private Map<String, Object> buildPopulationFields(Map<String, Object> enrichment) {
        Map<String, Object> f = buildBaseFields();
        f.put("estimated_population", Integer.class);
        f.put("crowd_type", String.class);
        f.put("location", String.class);
        f.put("occupancy_percent", Double.class);
        f.put("police_dispatched", Boolean.class);
        return f;
    }
}
