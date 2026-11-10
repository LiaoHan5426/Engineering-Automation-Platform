package com.lh.eap.application.service;

import com.lh.eap.api.contract.WireValue;
import java.util.Arrays;
import java.util.List;

/** BoardVerificationStatus vocabulary; serialized strings are validated at the boundary. */
public enum BoardVerificationStatus implements WireValue {
    QUEUED("QUEUED"),
    RUNNING("RUNNING"),
    PASSED("PASSED"),
    FAILED("FAILED"),
    STALE("STALE"),
    UNKNOWN("UNKNOWN");

    private final String value;
    BoardVerificationStatus(String value) { this.value = value; }
    @Override public String wire() { return value; }
    public static BoardVerificationStatus fromWire(String value) { return WireValue.parse(BoardVerificationStatus.class, value); }
    public static boolean isKnown(String value) { return Arrays.stream(values()).anyMatch(item -> item.value.equals(value)); }
    public static List<String> wireValues() { return Arrays.stream(values()).map(BoardVerificationStatus::wire).toList(); }
    public boolean active() { return this == QUEUED || this == RUNNING; }
    public boolean blocking() { return this == QUEUED || this == RUNNING || this == UNKNOWN; }
}
