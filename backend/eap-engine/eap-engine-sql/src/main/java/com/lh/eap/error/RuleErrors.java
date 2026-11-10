package com.lh.eap.error;

import com.lh.eap.api.error.PlatformErrorCode;

/** Rule operation errors. */
public enum RuleErrors implements PlatformErrorCode {
    RULE_PACK_NOT_FOUND,
    RULE_PACK_ID_MISMATCH,
    RULE_PACK_BUILTIN,
    RULE_PACK_IN_USE;

    @Override public String code() { return name(); }
}
