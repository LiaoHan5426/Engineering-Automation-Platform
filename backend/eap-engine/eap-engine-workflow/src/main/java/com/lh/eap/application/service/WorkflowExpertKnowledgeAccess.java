package com.lh.eap.application.service;

import com.lh.eap.core.ExpertDefinitionManagementStore;
import com.lh.eap.core.ExpertKnowledgeAccess;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Adapts the existing expert store; keeps its row lock and live grant reads inside the caller's transaction. */
@Service
@Transactional(propagation = Propagation.MANDATORY)
public class WorkflowExpertKnowledgeAccess implements ExpertKnowledgeAccess {
    private final ExpertDefinitionManagementStore definitions;
    private final ExpertDefinitionService experts;

    public WorkflowExpertKnowledgeAccess(ExpertDefinitionManagementStore definitions, ExpertDefinitionService experts) {
        this.definitions = definitions;
        this.experts = experts;
    }
    @Override public Optional<Map<String, Object>> lockForKnowledge(String expertId) {
        return definitions.lockDefinition(expertId).map(row -> Map.of(
                "id", row.id(), "manifest", row.manifest(), "enabled", row.enabled(), "revision", row.revision()));
    }
    @Override public List<UUID> knowledgeGrants(String expertId) {
        return experts.knowledgeGrants(expertId);
    }
}
