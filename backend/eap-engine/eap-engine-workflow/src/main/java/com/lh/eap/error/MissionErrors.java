package com.lh.eap.error;

import com.lh.eap.api.error.PlatformErrorCode;

/** Mission operation errors. */
public enum MissionErrors implements PlatformErrorCode {
    MISSION_INPUT_INVALID,
    HANDOFF_INPUT_INVALID,
    MISSION_NOT_FOUND,
    HANDOFF_NOT_FOUND,
    MISSION_EXECUTION_NOT_FOUND;

    @Override public String code() { return name(); }
}
