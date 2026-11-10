package com.lh.eap.error;

import com.lh.eap.api.error.PlatformErrorCode;

/** Workspace operation errors; display messages live in domain bundles. */
public enum WorkspaceErrors implements PlatformErrorCode {
    AUTHORIZED_ROOT_MISSING,
    DIRECTORY_DENIED,
    DIRECTORY_NOT_FOUND,
    DIRECTORY_UNAVAILABLE,
    INVALID_DIRECTORY_PATH,
    OUTSIDE_AUTHORIZED_ROOT,
    PATH_REJECTED,
    REPOSITORY_DENIED,
    REPOSITORY_ROOT_MISMATCH,
    SOURCE_UNAVAILABLE,
    SYMLINK_NOT_ALLOWED,
    USER_DIRECTORY_GRANTS_NOT_STORED_ON_SERVER,
    WORKSPACE_CHANGED,
    WORKSPACE_CHANGED_DURING_CAPTURE,
    WORKSPACE_ESCAPES_ROOT,
    WORKSPACE_MISMATCH,
    WORKSPACE_WRITE_NOT_AUTHORIZED;

    @Override public String code() { return name(); }
}
