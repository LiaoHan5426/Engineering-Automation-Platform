package com.lh.eap.application.service;

import com.lh.eap.api.contract.WireValue;
import java.util.Arrays;
import java.util.List;

/** BoardTaskColumn vocabulary; serialized strings are validated at the boundary. */
public enum BoardTaskColumn implements WireValue {
    PLANNED("planned"),
    READY("ready"),
    RUNNING("running"),
    ACCEPTANCE("acceptance"),
    DONE("done");

    private final String value;
    BoardTaskColumn(String value) { this.value = value; }
    @Override public String wire() { return value; }
    public static BoardTaskColumn fromWire(String value) { return WireValue.parse(BoardTaskColumn.class, value); }
    public static boolean isKnown(String value) { return Arrays.stream(values()).anyMatch(item -> item.value.equals(value)); }
    public static List<String> wireValues() { return Arrays.stream(values()).map(BoardTaskColumn::wire).toList(); }
}
