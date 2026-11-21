package com.lh.eap.domain.model;

import java.util.Map;
import java.util.UUID;

/**
 * SQL-domain evidence references. A profile id is not a database grant; plans are supplied snapshots.
 *
 * <p>Domain input port: the workflow orchestration layer supplies a request implementing this so that
 * SQL domain handlers can read typed evidence, without the orchestration layer compiling against the
 * SQL implementation module. Lives in core so no consumer depends on engine-sql for a marker contract.
 */
public interface DatabaseEvidenceInput extends CapabilityRequest {
    UUID databaseId();
    Map<String, Object> explainPlan();
}
