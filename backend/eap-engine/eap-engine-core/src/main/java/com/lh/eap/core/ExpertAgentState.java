package com.lh.eap.core;

import com.lh.eap.api.contract.WireValue;
import java.util.Arrays;
import java.util.List;

/** ExpertAgentState vocabulary; serialized strings are validated at the boundary. */
public enum ExpertAgentState implements WireValue {
    QUEUED("queued"),
    RUNNING("running"),
    INTERRUPTED("interrupted"),
    COMPLETED("completed"),
    PARTIAL("partial"),
    NEEDS_INPUT("needs-input"),
    FAILED("failed"),
    CANCELLED("cancelled"),
    TIMED_OUT("timed-out"),
    AWAITING_APPROVAL("awaiting-approval"),
    APPLYING("applying"),
    APPLIED("applied"),
    DENIED("denied"),
    EXPIRED("expired"),
    UNKNOWN("unknown");

    private final String value;
    ExpertAgentState(String value) { this.value = value; }
    @Override public String wire() { return value; }
    public static ExpertAgentState fromWire(String value) { return WireValue.parse(ExpertAgentState.class, value); }
    public static boolean isKnown(String value) { return Arrays.stream(values()).anyMatch(item -> item.value.equals(value)); }
    public static List<String> wireValues() { return Arrays.stream(values()).map(ExpertAgentState::wire).toList(); }
    public boolean active() { return this == QUEUED || this == RUNNING || this == AWAITING_APPROVAL || this == APPLYING; }
    public boolean blocking() { return this == QUEUED || this == RUNNING || this == AWAITING_APPROVAL || this == APPLYING || this == UNKNOWN; }
}
