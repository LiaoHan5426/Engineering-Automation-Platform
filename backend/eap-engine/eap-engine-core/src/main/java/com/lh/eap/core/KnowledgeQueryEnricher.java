package com.lh.eap.core;

import com.lh.eap.domain.model.CapabilityContext;

/** Domain-specific query adaptation; retrieval itself remains domain-neutral. */
@FunctionalInterface
public interface KnowledgeQueryEnricher {
    String enrich(CapabilityContext context, String query);
}
