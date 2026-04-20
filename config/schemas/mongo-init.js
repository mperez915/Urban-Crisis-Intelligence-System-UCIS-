// MongoDB Initialization Script
// This script runs when MongoDB container starts for the first time

// Use the admin database to set up users and databases
db = db.getSiblingDB('admin');

// Create the main UCIS database
db = db.getSiblingDB('ucis_db');

// Create collections with validation
db.createCollection("events", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["id", "timestamp", "domain", "type"],
      properties: {
        _id: { bsonType: "objectId" },
        id: { bsonType: "string", description: "Unique event ID (UUID)" },
        timestamp: { bsonType: "string", description: "ISO-8601 timestamp" },
        domain: {
          enum: ["climate", "traffic", "health", "environment", "population"],
          description: "Event domain"
        },
        type: { bsonType: "string", description: "Event type within domain" },
        zone: { bsonType: "string", description: "Geographic zone" },
        severity: {
          enum: ["low", "medium", "high", "critical", "good", "fair", "poor"],
          description: "Event severity level"
        },
        processed: { bsonType: "bool", default: false },
        created_at: { bsonType: "date" }
      }
    }
  }
});

// Create collection for complex events (CEP output)
db.createCollection("complex_events", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["pattern_id", "timestamp", "source_events"],
      properties: {
        _id: { bsonType: "objectId" },
        pattern_id: { bsonType: "string", description: "Pattern that triggered this event" },
        timestamp: { bsonType: "string", description: "Detection timestamp" },
        source_events: { bsonType: "array", description: "IDs of source events" },
        alert_level: {
          enum: ["low", "medium", "high", "critical"],
          description: "Alert severity"
        },
        description: { bsonType: "string" },
        data: { bsonType: "object" },
        created_at: { bsonType: "date" },
        acknowledged: { bsonType: "bool", default: false },
        acknowledged_by: { bsonType: ["string", "null"] }
      }
    }
  }
});

// Create collection for CEP patterns
db.createCollection("patterns");

// Seed default CEP patterns
var now = new Date().toISOString();
db.patterns.insertMany([
  {
    pattern_id: "high_traffic_congestion_enriched",
    name: "High Traffic Congestion in Risk Zone",
    description: "Detects sustained high-severity traffic congestion in high-risk zones.",
    epl_rule: "SELECT zone, COUNT(*) as incident_count, AVG(average_speed_kmh) as avg_speed FROM TrafficEvent(type='congestion', severity in ('high','critical')).win:time(10 min) GROUP BY zone HAVING COUNT(*) >= 2",
    severity: "high", enabled: true, input_domains: ["traffic"],
    uses_enrichment: true, version: 2, created_by: "system",
    created_at: now, updated_at: now, match_count: 0
  },
  {
    pattern_id: "accident_with_insufficient_response",
    name: "Critical Accident with Insufficient Emergency Response",
    description: "Detects critical traffic accidents in zones with limited hospital or police access.",
    epl_rule: "SELECT zone, type, severity FROM TrafficEvent WHERE type='accident' AND severity='critical'",
    severity: "critical", enabled: true, input_domains: ["traffic"],
    uses_enrichment: true, version: 2, created_by: "system",
    created_at: now, updated_at: now, match_count: 0
  },
  {
    pattern_id: "hazardous_weather_in_critical_zone",
    name: "Severe Weather in Critical Infrastructure Zone",
    description: "Detects severe weather events correlating with accidents in critical zones.",
    epl_rule: "SELECT * FROM PATTERN [c=ClimateEvent(type='storm', severity='high') -> t=TrafficEvent(type='accident')] WHERE c.zone = t.zone",
    severity: "critical", enabled: true, input_domains: ["climate", "traffic"],
    uses_enrichment: true, version: 2, created_by: "system",
    created_at: now, updated_at: now, match_count: 0
  },
  {
    pattern_id: "air_quality_health_emergency_correlation",
    name: "Poor Air Quality Triggers Health Emergencies",
    description: "Correlates poor air quality with respiratory/cardiac emergency calls.",
    epl_rule: "SELECT a.zone, a.aqi, COUNT(h) as emergency_calls FROM PATTERN [a=EnvironmentEvent(type='air_quality', severity in ('high','critical')) -> h=HealthEvent(type='emergency_call', call_type in ('respiratory','cardiac'))].win:time(30 min) WHERE a.zone = h.zone GROUP BY a.zone, a.aqi",
    severity: "high", enabled: true, input_domains: ["environment", "health"],
    uses_enrichment: true, version: 2, created_by: "system",
    created_at: now, updated_at: now, match_count: 0
  },
  {
    pattern_id: "crowd_alert_in_low_response_zone",
    name: "Large Crowd in Zone with Limited Emergency Response",
    description: "Detects large crowds in zones with limited emergency service response capability.",
    epl_rule: "SELECT zone, location, SUM(estimated_population) as total_population FROM PopulationEvent(type in ('gathering','crowd_alert'), severity in ('high','critical')).win:time(5 min) GROUP BY zone, location HAVING SUM(estimated_population) > 5000",
    severity: "high", enabled: true, input_domains: ["population"],
    uses_enrichment: true, version: 2, created_by: "system",
    created_at: now, updated_at: now, match_count: 0
  },
  {
    pattern_id: "emergency_services_overwhelmed",
    name: "Emergency Services Potentially Overwhelmed",
    description: "Detects surge in emergency calls within a short time window.",
    epl_rule: "SELECT zone, COUNT(*) as emergency_count FROM HealthEvent(type='emergency_call', severity in ('high','critical')).win:time(10 min) GROUP BY zone HAVING COUNT(*) >= 5",
    severity: "critical", enabled: true, input_domains: ["health"],
    uses_enrichment: true, version: 2, created_by: "system",
    created_at: now, updated_at: now, match_count: 0
  },
  {
    pattern_id: "critical_pollution_spike",
    name: "Critical Pollution Spike",
    description: "Alerts on critical pollution levels with AQI above 400.",
    epl_rule: "SELECT zone, type, severity, aqi FROM EnvironmentEvent(severity='critical').win:time(1 min) WHERE aqi > 400",
    severity: "critical", enabled: true, input_domains: ["environment"],
    uses_enrichment: true, version: 2, created_by: "system",
    created_at: now, updated_at: now, match_count: 0
  },
  {
    pattern_id: "multi_domain_crisis_critical_zone",
    name: "Multi-Domain Crisis in Critical Infrastructure Zone",
    description: "Simultaneous critical events across traffic, weather, and population in the same zone.",
    epl_rule: "SELECT t.zone, COUNT(*) as event_count FROM PATTERN [t=TrafficEvent(severity='critical') and c=ClimateEvent(severity='critical') and p=PopulationEvent(severity='critical')] WHERE t.zone = c.zone AND c.zone = p.zone",
    severity: "critical", enabled: true, input_domains: ["traffic", "climate", "population"],
    uses_enrichment: true, version: 2, created_by: "system",
    created_at: now, updated_at: now, match_count: 0
  }
]);

// Create collection for pattern execution history
db.createCollection("pattern_executions");

// Create indexes for performance
db.events.createIndex({ timestamp: -1 });
db.events.createIndex({ domain: 1, type: 1 });
db.events.createIndex({ zone: 1 });
db.events.createIndex({ severity: 1 });
db.events.createIndex({ created_at: -1 });

db.complex_events.createIndex({ timestamp: -1 });
db.complex_events.createIndex({ pattern_id: 1 });
db.complex_events.createIndex({ alert_level: 1 });
db.complex_events.createIndex({ created_at: -1 });

db.patterns.createIndex({ pattern_id: 1 }, { unique: true });
db.patterns.createIndex({ enabled: 1 });
db.patterns.createIndex({ created_at: -1 });

db.pattern_executions.createIndex({ pattern_id: 1, timestamp: -1 });

// Enable compression for large collections
db.events.createIndex(
  { _id: 1 },
  { storageEngine: { wiredTiger: { configString: "block_compressor=snappy" } } }
);

// Create TTL index for automatic cleanup (30 days)
db.events.createIndex(
  { created_at: 1 },
  { expireAfterSeconds: 2592000 }
);

db.pattern_executions.createIndex(
  { created_at: 1 },
  { expireAfterSeconds: 604800 }  // 7 days
);

print("MongoDB initialization completed successfully!");
