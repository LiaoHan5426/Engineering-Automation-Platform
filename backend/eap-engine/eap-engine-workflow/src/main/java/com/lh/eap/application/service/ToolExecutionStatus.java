package com.lh.eap.application.service;

import com.lh.eap.api.contract.WireValue;
import java.util.Arrays;
import java.util.List;

/** ToolExecutionStatus vocabulary; serialized strings are validated at the boundary. */
public enum ToolExecutionStatus implements WireValue {
    CREATED("CREATED"),
    RUNNING("RUNNING"),
    CANCELLING("CANCELLING"),
    SUCCEEDED("SUCCEEDED"),
    FAILED("FAILED"),
    REJECTED("REJECTED"),
    TIMED_OUT("TIMED_OUT"),
    CANCELLED("CANCELLED"),
    UNKNOWN("UNKNOWN"),
    CLOSED_UNKNOWN("CLOSED_UNKNOWN");

    private final String value;
    ToolExecutionStatus(String value) { this.value = value; }
    @Override public String wire() { return value; }
    public static ToolExecutionStatus fromWire(String value) { return WireValue.parse(ToolExecutionStatus.class, value); }
    public static boolean isKnown(String value) { return Arrays.stream(values()).anyMatch(item -> item.value.equals(value)); }
    public static List<String> wireValues() { return Arrays.stream(values()).map(ToolExecutionStatus::wire).toList(); }
    public boolean active() { return this == CREATED || this == RUNNING || this == CANCELLING; }
    public boolean blocking() { return this == CREATED || this == RUNNING || this == CANCELLING || this == UNKNOWN; }
}
