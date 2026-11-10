package com.lh.eap.application.service;

import com.lh.eap.api.contract.WireValue;
import java.util.Arrays;
import java.util.List;

/** BoardDeliveryDecision vocabulary; serialized strings are validated at the boundary. */
public enum BoardDeliveryDecision implements WireValue {
    ACCEPT("ACCEPT"),
    REJECT("REJECT");

    private final String value;
    BoardDeliveryDecision(String value) { this.value = value; }
    @Override public String wire() { return value; }
    public static BoardDeliveryDecision fromWire(String value) { return WireValue.parse(BoardDeliveryDecision.class, value); }
    public static boolean isKnown(String value) { return Arrays.stream(values()).anyMatch(item -> item.value.equals(value)); }
    public static List<String> wireValues() { return Arrays.stream(values()).map(BoardDeliveryDecision::wire).toList(); }
}
