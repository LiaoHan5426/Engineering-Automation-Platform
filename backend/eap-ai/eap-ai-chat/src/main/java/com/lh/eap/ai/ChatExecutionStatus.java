package com.lh.eap.ai;

import com.lh.eap.api.contract.WireValue;
import java.util.Arrays;
import java.util.List;

/** ChatExecutionStatus vocabulary; serialized strings are validated at the boundary. */
public enum ChatExecutionStatus implements WireValue {
    CREATED("CREATED"),
    RUNNING("RUNNING"),
    CANCELLING("CANCELLING"),
    SUCCEEDED("SUCCEEDED"),
    FAILED("FAILED"),
    REJECTED("REJECTED"),
    REFUSED("REFUSED"),
    TIMED_OUT("TIMED_OUT"),
    CANCELLED("CANCELLED"),
    UNKNOWN("UNKNOWN");

    private final String value;
    ChatExecutionStatus(String value) { this.value = value; }
    @Override public String wire() { return value; }
    public static ChatExecutionStatus fromWire(String value) { return WireValue.parse(ChatExecutionStatus.class, value); }
    public static boolean isKnown(String value) { return Arrays.stream(values()).anyMatch(item -> item.value.equals(value)); }
    public static List<String> wireValues() { return Arrays.stream(values()).map(ChatExecutionStatus::wire).toList(); }
    public boolean active() { return this == CREATED || this == RUNNING || this == CANCELLING; }
    public boolean blocking() { return this == CREATED || this == RUNNING || this == CANCELLING || this == UNKNOWN; }
}
