package com.ucis.cep.service;

import com.espertech.esper.common.client.EPCompiled;
import com.espertech.esper.common.client.configuration.Configuration;
import com.espertech.esper.compiler.client.CompilerArguments;
import com.espertech.esper.compiler.client.EPCompileException;
import com.espertech.esper.compiler.client.EPCompilerProvider;
import com.espertech.esper.runtime.client.DeploymentOptions;
import com.espertech.esper.runtime.client.EPDeployException;
import com.espertech.esper.runtime.client.EPRuntime;
import com.espertech.esper.runtime.client.EPStatement;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.MongoDatabase;
import com.ucis.cep.messaging.RabbitMQService;
import lombok.extern.slf4j.Slf4j;
import org.bson.Document;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
public class PatternService {

    private final EPRuntime epRuntime;
    private final MongoClient mongoClient;
    private final RabbitMQService rabbitMQService;

    // patternId -> deploymentId
    private final Map<String, String> deployedPatterns = new ConcurrentHashMap<>();
    // patternId -> last known updated_at (ISO string) — used for change detection
    private final Map<String, String> patternVersions = new ConcurrentHashMap<>();

    @Autowired
    public PatternService(EPRuntime epRuntime, MongoClient mongoClient, RabbitMQService rabbitMQService) {
        this.epRuntime = epRuntime;
        this.mongoClient = mongoClient;
        this.rabbitMQService = rabbitMQService;
    }

    // Last known max updated_at across all patterns — used to detect any change cheaply
    private volatile String lastKnownChecksum = null;

    public void start() {
        syncPatternsFromMongo();
        log.info("Patterns loaded. Will check for changes before every event.");
    }

    /**
     * Called by EventProcessorService before sending each event to Esper.
     * Queries only the latest updated_at in the patterns collection — O(1) with index.
     * Full sync runs only when that value has changed.
     */
    public void syncIfNeeded() {
        try {
            MongoDatabase db = mongoClient.getDatabase("ucis_db");
            Document latest = db.getCollection("patterns")
                .find()
                .sort(new Document("updated_at", -1))
                .limit(1)
                .projection(new Document("updated_at", 1).append("_id", 0))
                .first();

            String checksum = latest != null ? latest.getString("updated_at") : "empty";
            if (!Objects.equals(checksum, lastKnownChecksum)) {
                log.info("Pattern change detected (updated_at={}), reloading...", checksum);
                syncPatternsFromMongo();
                lastKnownChecksum = checksum;
            }
        } catch (Exception e) {
            log.warn("Could not check pattern freshness: {}", e.getMessage());
        }
    }

    /**
     * Read enabled patterns from MongoDB and reconcile with what is deployed in Esper:
     * - Deploy new or changed patterns
     * - Undeploy patterns that were disabled or deleted
     */
    private void syncPatternsFromMongo() {
        try {
            MongoDatabase db = mongoClient.getDatabase("ucis_db");
            MongoCollection<Document> col = db.getCollection("patterns");

            List<Document> enabled = col.find(new Document("enabled", true)).into(new ArrayList<>());

            Set<String> enabledIds = new HashSet<>();
            for (Document p : enabled) {
                String patternId = p.getString("pattern_id");
                String eplRule   = p.getString("epl_rule");
                if (patternId == null || eplRule == null) continue;

                enabledIds.add(patternId);
                String updatedAt = p.getString("updated_at");

                // Deploy if new or updated_at changed
                if (!deployedPatterns.containsKey(patternId)
                        || !Objects.equals(patternVersions.get(patternId), updatedAt)) {
                    log.info("Deploying pattern '{}' (updated_at={})", patternId, updatedAt);
                    deployPattern(patternId, eplRule, p);
                    patternVersions.put(patternId, updatedAt);
                }
            }

            // Undeploy patterns that are no longer enabled or were deleted
            new HashSet<>(deployedPatterns.keySet()).stream()
                .filter(id -> !enabledIds.contains(id))
                .forEach(id -> {
                    log.info("Undeploying pattern '{}' (disabled or deleted)", id);
                    undeployPattern(id);
                    patternVersions.remove(id);
                });

        } catch (Exception e) {
            log.error("Error syncing patterns from MongoDB: {}", e.getMessage());
        }
    }

    private void deployPattern(String patternId, String eplRule, Document patternDoc) {
        undeployPattern(patternId);
        try {
            Configuration config = epRuntime.getConfigurationDeepCopy();
            CompilerArguments args = new CompilerArguments(config);
            EPCompiled compiled = EPCompilerProvider.getCompiler().compile(eplRule, args);

            DeploymentOptions opts = new DeploymentOptions();
            opts.setDeploymentId(patternId);

            String deploymentId = epRuntime.getDeploymentService().deploy(compiled, opts).getDeploymentId();
            deployedPatterns.put(patternId, deploymentId);

            for (EPStatement stmt : epRuntime.getDeploymentService().getDeployment(deploymentId).getStatements()) {
                if (stmt != null) {
                    stmt.addListener((newEvents, oldEvents, statement, runtime) -> {
                        if (newEvents == null) return;
                        for (var event : newEvents) {
                            handlePatternMatch(patternId, patternDoc, event.getUnderlying());
                        }
                    });
                }
            }

            log.info("Pattern '{}' deployed (deploymentId={})", patternId, deploymentId);
        } catch (EPCompileException e) {
            log.error("EPL compile error for pattern '{}': {}", patternId, e.getMessage());
        } catch (EPDeployException e) {
            log.error("EPL deploy error for pattern '{}': {}", patternId, e.getMessage());
        }
    }

    private void undeployPattern(String patternId) {
        String deploymentId = deployedPatterns.remove(patternId);
        if (deploymentId == null) return;
        try {
            epRuntime.getDeploymentService().undeploy(deploymentId);
        } catch (Exception e) {
            log.warn("Could not undeploy pattern '{}': {}", patternId, e.getMessage());
        }
    }

    private void handlePatternMatch(String patternId, Document patternDoc, Object underlying) {
        try {
            Map<String, Object> resultMap = toMap(underlying);

            Map<String, Object> complexEvent = new LinkedHashMap<>();
            complexEvent.put("pattern_id",    patternId);
            complexEvent.put("pattern_name",  patternDoc.getString("name"));
            complexEvent.put("alert_level",   patternDoc.getString("severity"));
            complexEvent.put("timestamp",     Instant.now().toString());
            complexEvent.put("zone",          resultMap.getOrDefault("zone", "unknown").toString());
            complexEvent.put("result_data",   resultMap);
            complexEvent.put("source_events", Collections.emptyList());
            complexEvent.put("description",   patternDoc.getString("description"));

            persistComplexEvent(complexEvent, patternId);
            rabbitMQService.publishComplexEvent(complexEvent);

            log.info("Pattern '{}' fired — zone={}, level={}", patternId,
                     complexEvent.get("zone"), complexEvent.get("alert_level"));
        } catch (Exception e) {
            log.error("Error handling pattern match for '{}': {}", patternId, e.getMessage());
        }
    }

    private void persistComplexEvent(Map<String, Object> complexEvent, String patternId) {
        try {
            MongoDatabase db = mongoClient.getDatabase("ucis_db");
            Document doc = new Document(complexEvent);
            doc.put("created_at", new Date());
            db.getCollection("complex_events").insertOne(doc);

            db.getCollection("patterns").updateOne(
                new Document("pattern_id", patternId),
                new Document("$inc", new Document("match_count", 1))
                    .append("$set", new Document("last_match", Instant.now().toString()))
            );
        } catch (Exception e) {
            log.error("MongoDB write error for complex_event (pattern={}): {}", patternId, e.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> toMap(Object underlying) {
        if (underlying instanceof Map) return (Map<String, Object>) underlying;
        return Collections.singletonMap("raw", String.valueOf(underlying));
    }

    public Set<String> getDeployedPatternIds() {
        return Collections.unmodifiableSet(deployedPatterns.keySet());
    }
}
