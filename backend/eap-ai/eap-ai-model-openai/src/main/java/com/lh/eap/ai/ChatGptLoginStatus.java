package com.lh.eap.ai;

import com.lh.eap.api.contract.WireValue;
import java.util.Arrays;
import java.util.List;

/** ChatGptLoginStatus vocabulary; serialized strings are validated at the boundary. */
public enum ChatGptLoginStatus implements WireValue {
    WAITING("waiting"),
    EXCHANGING("exchanging"),
    CONNECTED("connected"),
    PERMISSION_REQUIRED("permission_required"),
    FAILED("failed"),
    CANCELLED("cancelled"),
    EXPIRED("expired");

    private final String value;
    ChatGptLoginStatus(String value) { this.value = value; }
    @Override public String wire() { return value; }
    public static ChatGptLoginStatus fromWire(String value) { return WireValue.parse(ChatGptLoginStatus.class, value); }
    public static boolean isKnown(String value) { return Arrays.stream(values()).anyMatch(item -> item.value.equals(value)); }
    public static List<String> wireValues() { return Arrays.stream(values()).map(ChatGptLoginStatus::wire).toList(); }
    public boolean active() { return this == WAITING || this == EXCHANGING; }
}
