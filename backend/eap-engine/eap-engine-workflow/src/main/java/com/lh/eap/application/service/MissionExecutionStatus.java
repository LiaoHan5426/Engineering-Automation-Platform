package com.lh.eap.application.service;

import com.lh.eap.api.contract.WireValue;
import java.util.Arrays;
import java.util.List;

/** MissionExecutionStatus vocabulary; serialized strings are validated at the boundary. */
public enum MissionExecutionStatus implements WireValue {
    CREATED("CREATED"),
    RUNNING("RUNNING"),
    CANCELLING("CANCELLING"),
    SUCCEEDED("SUCCEEDED"),
    FAILED("FAILED"),
    REJECTED("REJECTED"),
    TIMED_OUT("TIMED_OUT"),
    CANCELLED("CANCELLED"),
    INTERRUPTED("INTERRUPTED"),
    UNKNOWN("UNKNOWN");

    private final String value;
    MissionExecutionStatus(String value) { this.value = value; }
    @Override public String wire() { return value; }
    public static MissionExecutionStatus fromWire(String value) { return WireValue.parse(MissionExecutionStatus.class, value); }
    public static boolean isKnown(String value) { return Arrays.stream(values()).anyMatch(item -> item.value.equals(value)); }
    public static List<String> wireValues() { return Arrays.stream(values()).map(MissionExecutionStatus::wire).toList(); }
    public boolean active() { return this == CREATED || this == RUNNING || this == CANCELLING; }
    public boolean blocking() { return this == CREATED || this == RUNNING || this == CANCELLING || this == UNKNOWN; }
}
