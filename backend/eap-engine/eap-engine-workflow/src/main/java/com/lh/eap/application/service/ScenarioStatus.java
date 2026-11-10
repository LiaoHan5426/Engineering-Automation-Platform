package com.lh.eap.application.service;

import com.lh.eap.api.contract.WireValue;
import java.util.Arrays;
import java.util.List;

/** ScenarioStatus vocabulary; serialized strings are validated at the boundary. */
public enum ScenarioStatus implements WireValue {
    PARTIAL("partial"),
    MISSING("missing"),
    DISABLED("disabled");

    private final String value;
    ScenarioStatus(String value) { this.value = value; }
    @Override public String wire() { return value; }
    public static ScenarioStatus fromWire(String value) { return WireValue.parse(ScenarioStatus.class, value); }
    public static boolean isKnown(String value) { return Arrays.stream(values()).anyMatch(item -> item.value.equals(value)); }
    public static List<String> wireValues() { return Arrays.stream(values()).map(ScenarioStatus::wire).toList(); }
}
