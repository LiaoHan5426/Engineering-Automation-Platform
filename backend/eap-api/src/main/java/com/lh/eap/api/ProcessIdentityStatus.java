package com.lh.eap.api;

import com.lh.eap.api.contract.WireValue;
import java.util.Arrays;
import java.util.List;

/** ProcessIdentityStatus vocabulary; serialized strings are validated at the boundary. */
public enum ProcessIdentityStatus implements WireValue {
    NOT_CAPTURED("NOT_CAPTURED"),
    NOT_FOUND("NOT_FOUND"),
    MATCHING_ALIVE("MATCHING_ALIVE"),
    MATCHING_EXITED("MATCHING_EXITED"),
    IDENTITY_MISMATCH("IDENTITY_MISMATCH"),
    UNVERIFIABLE("UNVERIFIABLE"),
    UNAVAILABLE("UNAVAILABLE");

    private final String value;
    ProcessIdentityStatus(String value) { this.value = value; }
    @Override public String wire() { return value; }
    public static ProcessIdentityStatus fromWire(String value) { return WireValue.parse(ProcessIdentityStatus.class, value); }
    public static boolean isKnown(String value) { return Arrays.stream(values()).anyMatch(item -> item.value.equals(value)); }
    public static List<String> wireValues() { return Arrays.stream(values()).map(ProcessIdentityStatus::wire).toList(); }
}
