package com.lh.eap.ai;
import com.lh.eap.api.error.PlatformErrorCode;
public enum ChatPlanErrors implements PlatformErrorCode {
    INVALID_CHAT_PLAN,
    CHAT_PLAN_STORE_UNAVAILABLE,
    CHAT_PLAN_EXECUTION_CLOSED,
    CHAT_PLAN_OPERATION_CONFLICT,
    CHAT_PLAN_REVISION_CONFLICT;
    @Override public String code() { return name(); }
}
