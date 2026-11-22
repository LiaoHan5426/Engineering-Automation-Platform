package com.lh.eap.core;

import java.util.Optional;
import java.util.UUID;

/** Persistence access to the durable write-before application baseline. */
public interface BoardBaselineStore {
    record BaselineRow(String json) {}

    /** Return a present row with nullable JSON, or empty when no matching proposal row exists. */
    Optional<BaselineRow> findApplicationBaseline(String principal, UUID conversation, UUID proposal, String workspace);
}
