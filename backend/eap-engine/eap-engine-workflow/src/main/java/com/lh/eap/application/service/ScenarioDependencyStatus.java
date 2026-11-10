package com.lh.eap.application.service;

import com.lh.eap.api.contract.WireValue;
import java.util.Arrays;
import java.util.List;

/** ScenarioDependencyStatus vocabulary; serialized strings are validated at the boundary. */
public enum ScenarioDependencyStatus implements WireValue {
    INSTALLED("installed"),
    MISSING("missing"),
    UNCONFIGURED("unconfigured"),
    DENIED("denied");

    private final String value;
    ScenarioDependencyStatus(String value) { this.value = value; }
    @Override public String wire() { return value; }
    public static ScenarioDependencyStatus fromWire(String value) { return WireValue.parse(ScenarioDependencyStatus.class, value); }
    public static boolean isKnown(String value) { return Arrays.stream(values()).anyMatch(item -> item.value.equals(value)); }
    public static List<String> wireValues() { return Arrays.stream(values()).map(ScenarioDependencyStatus::wire).toList(); }
}
