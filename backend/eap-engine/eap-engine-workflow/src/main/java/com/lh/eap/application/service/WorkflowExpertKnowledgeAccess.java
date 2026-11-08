package com.lh.eap.application.service;

import com.lh.eap.knowledge.ExpertKnowledgeAccess;
import com.lh.eap.persistence.mapper.ExpertDefinitionMapper;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Adapts the existing expert store; keeps its row lock and live grant reads inside the caller's transaction. */
@Service
@Transactional(propagation = Propagation.MANDATORY)
public class WorkflowExpertKnowledgeAccess implements ExpertKnowledgeAccess {
    private final ExpertDefinitionMapper definitions;
    private final ExpertDefinitionService experts;

    public WorkflowExpertKnowledgeAccess(ExpertDefinitionMapper definitions, ExpertDefinitionService experts) {
        this.definitions = definitions;
        this.experts = experts;
    }
    @Override public Optional<Map<String, Object>> lockForKnowledge(String expertId) {
        return definitions.lockForKnowledge(expertId);
    }
    @Override public List<UUID> knowledgeGrants(String expertId) {
        return experts.knowledgeGrants(expertId);
    }
}
