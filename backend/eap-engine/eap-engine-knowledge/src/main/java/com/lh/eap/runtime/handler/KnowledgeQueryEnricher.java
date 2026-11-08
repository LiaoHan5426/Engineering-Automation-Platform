package com.lh.eap.runtime.handler;
import com.lh.eap.domain.model.CapabilityContext;
/** Domain-specific query adaptation; retrieval itself remains domain-neutral. */
@FunctionalInterface
public interface KnowledgeQueryEnricher { String enrich(CapabilityContext context, String query); }
