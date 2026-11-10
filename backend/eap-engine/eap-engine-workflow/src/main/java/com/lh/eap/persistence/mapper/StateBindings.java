package com.lh.eap.persistence.mapper;

import com.lh.eap.api.contract.WireValue;
import com.lh.eap.application.service.*;
import com.lh.eap.delivery.CodeProposalStatus;
import java.util.Arrays;
import java.util.function.Predicate;
import java.util.stream.Collectors;

/** PostgreSQL array parameters derived from the owning state machine, never SQL fragments. */
public final class StateBindings {
    private StateBindings() {}
    public static final String MISSION_ACTIVE = array(MissionExecutionStatus.class, MissionExecutionStatus::active);
    public static final String MISSION_BLOCKING = array(MissionExecutionStatus.class, MissionExecutionStatus::blocking);
    public static final String VERIFICATION_ACTIVE = array(BoardVerificationStatus.class, BoardVerificationStatus::active);
    public static final String VERIFICATION_BLOCKING = array(BoardVerificationStatus.class, BoardVerificationStatus::blocking);
    public static final String CODE_BLOCKING = array(CodeProposalStatus.class, CodeProposalStatus::blocking);
    public static final String TOOL_ACTIVE = array(ToolExecutionStatus.class, ToolExecutionStatus::active);
    public static final String TOOL_BLOCKING = array(ToolExecutionStatus.class, ToolExecutionStatus::blocking);

    private static <E extends Enum<E> & WireValue> String array(Class<E> type, Predicate<E> filter) {
        return Arrays.stream(type.getEnumConstants()).filter(filter).map(WireValue::wire)
                .collect(Collectors.joining(",", "{", "}"));
    }
}
