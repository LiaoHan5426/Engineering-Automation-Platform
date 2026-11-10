package com.lh.eap.application.service;

import com.lh.eap.api.contract.WireValue;
import java.util.Arrays;
import java.util.List;

/** BoardDeliverySource vocabulary; serialized strings are validated at the boundary. */
public enum BoardDeliverySource implements WireValue {
    EXTERNAL_MANUAL("EXTERNAL_MANUAL"),
    CHAT_APPLIED_POST_HOC("CHAT_APPLIED_POST_HOC"),
    CHAT_APPLIED_PREBOUND("CHAT_APPLIED_PREBOUND");

    private final String value;
    BoardDeliverySource(String value) { this.value = value; }
    @Override public String wire() { return value; }
    public static BoardDeliverySource fromWire(String value) { return WireValue.parse(BoardDeliverySource.class, value); }
    public static boolean isKnown(String value) { return Arrays.stream(values()).anyMatch(item -> item.value.equals(value)); }
    public static List<String> wireValues() { return Arrays.stream(values()).map(BoardDeliverySource::wire).toList(); }
}
