package com.lh.eap.ai;
import com.lh.eap.api.contract.WireValue;
public enum SpeechOperationStatus implements WireValue {
    RUNNING("RUNNING"),
    SUCCEEDED("SUCCEEDED"),
    FAILED("FAILED"),
    CANCELLED("CANCELLED");
    private final String value;
    SpeechOperationStatus(String value){this.value=value;}
    @Override public String wire(){return value;}
    public static java.util.List<String> wireValues(){return java.util.Arrays.stream(values()).map(SpeechOperationStatus::wire).toList();}
    public static SpeechOperationStatus fromWire(String value){return WireValue.parse(SpeechOperationStatus.class,value);}
}
