package com.lh.eap.skill;

import com.lh.eap.api.contract.WireValue;
import java.util.Arrays;
import java.util.List;

/** SkillDependencyStatus vocabulary; serialized strings are validated at the boundary. */
public enum SkillDependencyStatus implements WireValue {
    UNKNOWN("unknown"),
    DISABLED("disabled"),
    AVAILABLE("available");

    private final String value;
    SkillDependencyStatus(String value) { this.value = value; }
    @Override public String wire() { return value; }
    public static SkillDependencyStatus fromWire(String value) { return WireValue.parse(SkillDependencyStatus.class, value); }
    public static boolean isKnown(String value) { return Arrays.stream(values()).anyMatch(item -> item.value.equals(value)); }
    public static List<String> wireValues() { return Arrays.stream(values()).map(SkillDependencyStatus::wire).toList(); }
}
