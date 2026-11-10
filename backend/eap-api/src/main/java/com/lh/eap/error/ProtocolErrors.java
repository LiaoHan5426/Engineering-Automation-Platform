package com.lh.eap.error;

import com.lh.eap.api.error.PlatformErrorCode;

/** Protocol operation errors; display messages live in domain bundles. */
public enum ProtocolErrors implements PlatformErrorCode {
    CURSOR_INVALID,
    HTTP_REQUEST_FAILED,
    INCOMPLETE_PROTOCOL,
    INVALID_CURSOR,
    INVALID_LIMIT,
    INVALID_OR_TRUNCATED_JSONL,
    METHOD_NOT_FOUND,
    NETWORK_ERROR,
    PARSE_ERROR,
    PROVIDER_ERROR,
    QUERY_TOO_LARGE,
    SERVER_CLOSED,
    SSE_CLOSED,
    UNSUPPORTED_PARAMETERS;

    @Override public String code() { return name(); }
}
