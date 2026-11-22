package com.lh.eap.error;

import com.lh.eap.api.error.PlatformErrorCode;

/** Knowledge operation errors. */
public enum KnowledgeErrors implements PlatformErrorCode {
    KNOWLEDGE_CONTENT_SECRET,
    KNOWLEDGE_NAME_INVALID,
    KNOWLEDGE_BASE_NOT_FOUND,
    KNOWLEDGE_DOCUMENT_INVALID,
    KNOWLEDGE_DOCUMENT_CHANGED,
    KNOWLEDGE_BASE_IN_USE,
    KNOWLEDGE_DOCUMENT_NOT_FOUND;

    @Override public String code() { return name(); }
}
