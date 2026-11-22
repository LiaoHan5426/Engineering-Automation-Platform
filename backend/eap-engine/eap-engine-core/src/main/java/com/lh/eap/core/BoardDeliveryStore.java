package com.lh.eap.core;

import java.util.UUID;

/**
 * Durable delivery snapshot and hash columns of a board task run. Snapshot payloads are
 * serialized by the caller, so this port carries JSON text rather than application records.
 */
public interface BoardDeliveryStore {
    record Row(String deliverySnapshotJson, String requestHash, String decisionHash,
               long taskRevision, String taskSnapshotJson, String verificationSnapshotJson) {}

    /** Returns null when the run row does not exist. */
    Row find(UUID taskId, UUID executionId);

    void saveDelivery(String deliveryJson, String requestHash, UUID taskId, UUID executionId);

    void saveDecision(String deliveryJson, String decisionHash, UUID taskId, UUID executionId);
}
