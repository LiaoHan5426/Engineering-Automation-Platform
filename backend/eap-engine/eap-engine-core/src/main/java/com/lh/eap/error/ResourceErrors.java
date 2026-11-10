package com.lh.eap.error;

import com.lh.eap.api.error.PlatformErrorCode;

/** Resource machine errors. User messages belong to the corresponding i18n bundle. */
public enum ResourceErrors implements PlatformErrorCode {
    INVALID_SCENARIO_INPUT,
    PROTOTYPE_SEMANTIC_DESIGN_REQUIRED,
    PUBLICATION_NOT_FOUND,
    PUBLICATION_REQUEST_CONTENT_CONFLICT,
    PUBLICATION_REQUEST_ID_REQUIRED,
    SCENARIO_DEPENDENCY_UNAVAILABLE,
    SCENARIO_NOT_FOUND,
    SCENARIO_STALE,
    SCENARIO_STORE_UNAVAILABLE,
    SCENARIO_WORKFLOW_NOT_FOUND,
    PROTOTYPE_VERSION_NOT_FOUND,
    PROTOTYPE_SOURCE_INVALID,
    PROTOTYPE_CONTENT_REQUIRED;

    @Override public String code() { return name(); }
}
