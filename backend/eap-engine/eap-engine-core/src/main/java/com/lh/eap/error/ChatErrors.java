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
    IMAGE_INPUT_NOT_SUPPORTED,
    UNKNOWN_CONVERSATION,
    WORKING_MEMORY_DELETE_FAILED,
    WORKING_MEMORY_CHANGED,
    HISTORY_SUMMARY_SENSITIVE,
    WORKING_MEMORY_SAVE_FAILED;

    @Override public String code() { return name(); }
}
