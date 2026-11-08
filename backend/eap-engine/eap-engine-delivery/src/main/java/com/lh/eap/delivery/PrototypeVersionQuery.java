package com.lh.eap.delivery;

import com.lh.eap.application.service.PrototypeVersion;
import java.util.UUID;

/** Read-only access to a saved, immutable prototype version for delivery context. */
@FunctionalInterface
public interface PrototypeVersionQuery {
    /** Return the saved version or reject a missing/inaccessible version; never fall back to a draft. */
    PrototypeVersion find(UUID id);
}
