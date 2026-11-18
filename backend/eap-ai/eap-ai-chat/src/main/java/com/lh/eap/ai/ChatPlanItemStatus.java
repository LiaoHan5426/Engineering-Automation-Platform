package com.lh.eap.ai;
import com.lh.eap.api.contract.WireValue;
public enum ChatPlanItemStatus implements WireValue {
    PENDING("pending"),
    IN_PROGRESS("in_progress"),
    COMPLETED("completed");
    private final String wire;
    ChatPlanItemStatus(String wire) { this.wire = wire; }
    public String wire() { return wire; }
    public static ChatPlanItemStatus fromWire(String value) {
        for (var status : values()) if (status.wire.equals(value)) return status;
        throw new IllegalArgumentException("Invalid plan item status");
    }
}
