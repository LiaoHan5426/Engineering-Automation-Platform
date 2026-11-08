package com.lh.eap.domain.model;

/** Stable, host-published professional behavior identity. Versions never silently upgrade. */
public record ExpertBehaviorBinding(String id, int version) {
    public ExpertBehaviorBinding {
        if (id == null || id.length() > 100 || !id.matches("[a-z0-9]+(?:-[a-z0-9]+)*") || version < 1) {
            throw new IllegalArgumentException("Invalid expert behavior binding");
        }
    }
}
