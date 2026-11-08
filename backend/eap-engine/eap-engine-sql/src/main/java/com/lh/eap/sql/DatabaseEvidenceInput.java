package com.lh.eap.sql;

import com.lh.eap.domain.model.CapabilityRequest;
import java.util.Map;
import java.util.UUID;

/** SQL-domain evidence references. A profile id is not a database grant; plans are supplied snapshots. */
public interface DatabaseEvidenceInput extends CapabilityRequest {
    UUID databaseId();
    Map<String, Object> explainPlan();
}
