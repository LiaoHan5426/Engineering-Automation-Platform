package com.lh.eap.delivery;

import com.lh.eap.api.contract.WireValue;

/** How a selected source dependency is loaded; this is not an execution status. */
public enum SourceDependencyKind implements WireValue {
    MODULE("MODULE"),
    LAZY_MODULE("LAZY_MODULE"),
    STYLESHEET("STYLESHEET");

    private final String value;
    SourceDependencyKind(String value) { this.value = value; }
    @Override public String wire() { return value; }
}
