package com.lh.eap.ai;

import com.lh.eap.api.contract.WireValue;

/** Requested response contract; planning has no tool or source-write authority. */
public enum TaskMode implements WireValue {
    CHAT("chat"),
    CODE("code"),
    PLAN("plan");

    private final String value;
    TaskMode(String value) { this.value = value; }
    @Override public String wire() { return value; }
    public static TaskMode fromWire(String value) { return WireValue.parse(TaskMode.class, value); }
}
