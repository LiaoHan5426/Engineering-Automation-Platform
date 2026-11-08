package com.lh.eap.application.service;

import com.lh.eap.api.Observation;
import com.lh.eap.core.ExpertAgentAccess;
import com.lh.eap.domain.model.ExpertManifest;
import com.lh.eap.persistence.mapper.ExpertDefinitionMapper;
import com.lh.eap.persistence.mapper.TaskRepository;
import java.util.*;
import java.util.function.Function;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/** Short transactions over the existing Expert/grant/Task tables; no model, process or remote tool code. */
@Service
@Transactional(timeout = 10)
public class WorkflowExpertAgentAccess implements ExpertAgentAccess {
    private final ExpertDefinitionMapper mapper;
    private final ExpertDefinitionService definitions;
    private final TaskRepository tasks;

    public WorkflowExpertAgentAccess(ExpertDefinitionMapper mapper, ExpertDefinitionService definitions, TaskRepository tasks) {
        this.mapper = mapper; this.definitions = definitions; this.tasks = tasks;
    }
    @Override public Snapshot load(String id) {
        var row = mapper.lockForKnowledge(id).orElseThrow(() -> rejected("EXPERT_UNAVAILABLE"));
        if (!Boolean.TRUE.equals(row.get("enabled"))) throw rejected("EXPERT_DISABLED");
        var manifest = ExpertManifest.parse((String) row.get("manifest"));
        if (!definitions.validateGraph(manifest).isEmpty() || !definitions.validateReferences(manifest).isEmpty())
            throw rejected("EXPERT_DEFINITION_UNAVAILABLE");
        return new Snapshot(manifest, ((Number) row.get("revision")).longValue());
    }
    @Override public void check(Snapshot snapshot) { checked(snapshot); }
    @Override public void checkEvidence(Snapshot snapshot, Set<UUID> knowledge, Set<UUID> databases) {
        checked(snapshot);
        if (!new java.util.HashSet<>(definitions.knowledgeGrants(snapshot.manifest().id())).containsAll(knowledge)
                || databases.stream().anyMatch(id -> !definitions.databaseGranted(snapshot.manifest().id(), id)))
            throw rejected("AGENT_EVIDENCE_GRANT_REVOKED");
    }
    private void checked(Snapshot snapshot) {
        var row = mapper.lockForKnowledge(snapshot.manifest().id()).orElseThrow(() -> rejected("EXPERT_REVOKED"));
        if (!Boolean.TRUE.equals(row.get("enabled")) || ((Number) row.get("revision")).longValue() != snapshot.revision()
                || !ExpertManifest.parse((String) row.get("manifest")).equals(snapshot.manifest())) throw rejected("EXPERT_REVOKED");
    }
    @Override public <T> T authorized(Snapshot snapshot, Function<List<UUID>, T> localRead) {
        checked(snapshot);
        var declared = snapshot.manifest().knowledgeBases();
        var grants = definitions.knowledgeGrants(snapshot.manifest().id()).stream()
                .filter(id -> declared != null && declared.contains(id.toString())).toList();
        return localRead.apply(grants);
    }
    @Override public void begin(UUID id, Snapshot snapshot, String goal) {
        checked(snapshot);
        if (!tasks.startAgent(id, goal)) throw rejected("EXECUTION_ID_ALREADY_USED");
    }
    @Override public void finish(UUID id, String status, String modelEnhancement, List<Observation> observations) {
        if (!tasks.finishAgent(id, status, modelEnhancement, observations)) throw rejected("EXECUTION_ALREADY_FINISHED");
    }
    private static ResponseStatusException rejected(String code) { return new ResponseStatusException(HttpStatus.CONFLICT, code); }
}
