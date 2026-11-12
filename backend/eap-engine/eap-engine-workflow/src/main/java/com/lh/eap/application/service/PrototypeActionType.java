package com.lh.eap.application.service;

import com.lh.eap.api.contract.WireValue;

/** Declarative local preview actions; never an authorization to invoke business tools. */
public enum PrototypeActionType implements WireValue {
    TOGGLE("TOGGLE"),
    SUBMIT("SUBMIT"),
    RESET("RESET");

    private final String value;
    PrototypeActionType(String value) { this.value = value; }
    @Override public String wire() { return value; }
}
