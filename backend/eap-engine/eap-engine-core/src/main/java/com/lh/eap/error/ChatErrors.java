package com.lh.eap.error;

import com.lh.eap.api.error.PlatformErrorCode;

/** Chat operation errors; display messages live in domain bundles. */
public enum ChatErrors implements PlatformErrorCode {
    CHAT_EXECUTION_CAPACITY,
    CONTEXT_BUDGET_EXCEEDED,
    CONVERSATION_BUSY,
    CONVERSATION_LIMIT,
    CONVERSATION_WORKSPACE_CHANGED,
    INVALID_CHAT_REQUEST,
    INVALID_TASK_CONTEXT,
    UNKNOWN_CONVERSATION,
    WORKING_MEMORY_DELETE_FAILED,
    WORKING_MEMORY_SAVE_FAILED;

    @Override public String code() { return name(); }
}
