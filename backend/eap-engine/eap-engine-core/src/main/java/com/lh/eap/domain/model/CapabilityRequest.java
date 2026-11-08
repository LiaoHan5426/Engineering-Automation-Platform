package com.lh.eap.domain.model;
/**
 * Marker for domain-owned capability input contracts. Each handler reads only its declared interface.
 * Implementing an input contract conveys data, never identity, workspace access or an execution grant.
 */
public interface CapabilityRequest {}
