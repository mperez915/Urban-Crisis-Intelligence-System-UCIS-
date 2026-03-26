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
