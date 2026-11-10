package com.lh.eap.ai;

import com.lh.eap.api.contract.WireValue;
import java.util.Arrays;
import java.util.List;

/** ModelConnectionState vocabulary; serialized strings are validated at the boundary. */
public enum ModelConnectionState implements WireValue {
    DISABLED("disabled"),
    NOT_CONFIGURED("not_configured"),
    CONFIGURED_UNVERIFIED("configured_unverified"),
    AVAILABLE("available"),
    ERROR("error");

    private final String value;
    ModelConnectionState(String value) { this.value = value; }
    @Override public String wire() { return value; }
    public static ModelConnectionState fromWire(String value) { return WireValue.parse(ModelConnectionState.class, value); }
    public static boolean isKnown(String value) { return Arrays.stream(values()).anyMatch(item -> item.value.equals(value)); }
    public static List<String> wireValues() { return Arrays.stream(values()).map(ModelConnectionState::wire).toList(); }
}
