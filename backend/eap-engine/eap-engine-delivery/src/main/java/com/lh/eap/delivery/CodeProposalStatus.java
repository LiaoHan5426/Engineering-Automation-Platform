package com.lh.eap.delivery;

import com.lh.eap.api.contract.WireValue;
import java.util.Arrays;
import java.util.List;

/** CodeProposalStatus vocabulary; serialized strings are validated at the boundary. */
public enum CodeProposalStatus implements WireValue {
    PROPOSED("PROPOSED"),
    APPLYING("APPLYING"),
    APPLIED("APPLIED"),
    FAILED("FAILED"),
    UNKNOWN("UNKNOWN"),
    CLOSED_UNKNOWN("CLOSED_UNKNOWN"),
    REFUSED("REFUSED");

    private final String value;
    CodeProposalStatus(String value) { this.value = value; }
    @Override public String wire() { return value; }
    public static CodeProposalStatus fromWire(String value) { return WireValue.parse(CodeProposalStatus.class, value); }
    public static boolean isKnown(String value) { return Arrays.stream(values()).anyMatch(item -> item.value.equals(value)); }
    public static List<String> wireValues() { return Arrays.stream(values()).map(CodeProposalStatus::wire).toList(); }
    public boolean active() { return this == APPLYING; }
    public boolean blocking() { return this == APPLYING || this == UNKNOWN; }
}
