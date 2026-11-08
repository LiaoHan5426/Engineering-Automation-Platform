package com.lh.eap.local;

import com.lh.eap.domain.model.CapabilityRequest;

/** Search text only; the executor supplies and authorizes the workspace independently. */
@FunctionalInterface
public interface WorkspaceSearchInput extends CapabilityRequest {
    String pattern();
}
