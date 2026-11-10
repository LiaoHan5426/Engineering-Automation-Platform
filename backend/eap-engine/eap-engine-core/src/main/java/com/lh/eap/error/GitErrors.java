package com.lh.eap.error;

import com.lh.eap.api.error.PlatformErrorCode;

/** Git operation errors; display messages live in domain bundles. */
public enum GitErrors implements PlatformErrorCode {
    GIT_DIFF_CAPABILITY_MISSING,
    GIT_DIFF_HANDLER_MISSING,
    GIT_EVIDENCE_FAILED,
    GIT_PREFLIGHT_UNCONFIRMED,
    GIT_ROOT_UNAVAILABLE,
    GIT_STATUS_CAPABILITY_MISSING,
    GIT_STATUS_FAILED,
    GIT_STATUS_HANDLER_MISSING,
    GIT_STATUS_TRUNCATED,
    GIT_STATUS_UNAVAILABLE,
    GIT_STATUS_UNCONFIRMED,
    GIT_STEP_FAILED;

    @Override public String code() { return name(); }
}
