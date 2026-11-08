package com.lh.eap.core;

import java.util.Set;

/** Live vocabulary of published, enabled and trusted expert-scoped capabilities. */
@FunctionalInterface
public interface ExpertScopedCapabilityQuery {
    /** Discovery is not a grant; callers must still require declarations and persisted authorization. */
    Set<String> capabilityIds();
}
