package com.lh.eap.error;

import com.lh.eap.api.error.PlatformErrorCode;

/** Database operation errors. */
public enum DatabaseErrors implements PlatformErrorCode {
    DATABASE_PROFILE_NOT_FOUND,
    DATABASE_PROFILE_IN_USE,
    DATABASE_PROFILE_SECRET,
    DATABASE_PROFILE_INVALID;

    @Override public String code() { return name(); }
}
