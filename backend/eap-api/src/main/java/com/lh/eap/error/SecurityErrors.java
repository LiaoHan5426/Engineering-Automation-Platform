package com.lh.eap.error;

import com.lh.eap.api.error.PlatformErrorCode;

/** Security operation errors; display messages live in domain bundles. */
public enum SecurityErrors implements PlatformErrorCode {
    AUTHENTICATION_FAILED,
    CONTENT_REDACTED,
    CONTENT_TYPE_REJECTED,
    ENDPOINT_REJECTED,
    ENVIRONMENT_DENIED,
    HOST_REJECTED,
    NOT_AUTHENTICATED,
    NOT_AUTHORIZED,
    ORIGIN_REJECTED,
    PROTECTED_STORE_UNAVAILABLE,
    SECRET_REJECTED,
    SECRET_REQUIRED,
    UNAUTHORIZED_HIT;

    @Override public String code() { return name(); }
}
