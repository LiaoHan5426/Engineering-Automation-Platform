package com.lh.eap.ai;
import com.lh.eap.api.error.PlatformErrorCode;
/** Message graph mutation and observation errors owned by the chat domain. */
public enum ChatGraphErrors implements PlatformErrorCode {
    CHAT_OPERATION_CONFLICT,
    CHAT_REVISION_CONFLICT,
    CHAT_PARENT_INVALID,
    CHAT_TARGET_INVALID,
    CHAT_OPERATION_NOT_FOUND,
    CHAT_OPERATION_OBSERVE_EXECUTION;
    @Override public String code() { return name(); }
}
