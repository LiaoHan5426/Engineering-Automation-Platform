package com.lh.eap.domain.model;

/** Search text only; the executor supplies and authorizes the workspace independently. */
@FunctionalInterface
public interface WorkspaceSearchInput extends CapabilityRequest {
    String pattern();
}
