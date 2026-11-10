package com.lh.eap.error;

import com.lh.eap.api.error.PlatformErrorCode;

/** Common operation errors; display messages live in domain bundles. */
public enum CommonErrors implements PlatformErrorCode {
    DATA_SERVICE_UNAVAILABLE,
    INVALID_JSON,
    INVALID_REQUEST,
    INVALID_REQUEST_ID,
    ONLY_REQUEST_ID_ALLOWED,
    REQUEST_ID_REQUIRED,
    SESSION_ID_TOO_LONG,
    UNEXPECTED_ERROR;

    @Override public String code() { return name(); }
}
