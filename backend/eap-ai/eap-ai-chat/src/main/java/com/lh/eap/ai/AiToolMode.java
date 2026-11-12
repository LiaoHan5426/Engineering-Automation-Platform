package com.lh.eap.ai;

import com.lh.eap.api.contract.WireValue;

/** Explicit tool surface for one chat request; never inferred from model output. */
public enum AiToolMode implements WireValue {
    NONE("none"),
    GIT_STATUS("git_status"),
    CODE_SOURCES("code_sources");

    private final String value;
    AiToolMode(String value) { this.value = value; }
    @Override public String wire() { return value; }
    public static AiToolMode fromWire(String value) { return WireValue.parse(AiToolMode.class, value); }
}
