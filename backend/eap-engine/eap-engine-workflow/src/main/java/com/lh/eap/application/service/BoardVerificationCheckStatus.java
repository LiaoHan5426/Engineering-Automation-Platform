package com.lh.eap.application.service;

import com.lh.eap.api.contract.WireValue;
import java.util.Arrays;
import java.util.List;

/** BoardVerificationCheckStatus vocabulary; serialized strings are validated at the boundary. */
public enum BoardVerificationCheckStatus implements WireValue {
    RUNNING("RUNNING"),
    PASSED("PASSED"),
    FAILED("FAILED"),
    TIMED_OUT("TIMED_OUT"),
    UNKNOWN("UNKNOWN");

    private final String value;
    BoardVerificationCheckStatus(String value) { this.value = value; }
    @Override public String wire() { return value; }
    public static BoardVerificationCheckStatus fromWire(String value) { return WireValue.parse(BoardVerificationCheckStatus.class, value); }
    public static boolean isKnown(String value) { return Arrays.stream(values()).anyMatch(item -> item.value.equals(value)); }
    public static List<String> wireValues() { return Arrays.stream(values()).map(BoardVerificationCheckStatus::wire).toList(); }
    public boolean active() { return this == RUNNING; }
    public boolean blocking() { return this == RUNNING || this == UNKNOWN; }
}
