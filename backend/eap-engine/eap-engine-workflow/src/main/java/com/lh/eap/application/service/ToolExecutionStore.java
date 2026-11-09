package com.lh.eap.application.service;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.UnaryOperator;

public interface ToolExecutionStore {
    void insert(ToolExecution execution);
    Optional<ToolExecution> find(UUID id);
    Optional<ToolExecution> request(String workspace, UUID requestId);
    List<ToolExecution> list(String workspace, String operation, int limit);
    Optional<ToolExecution> blocking(String workspace, String operation);
    /** Runs the transition under a short row lock, never around process execution. */
    ToolExecution update(UUID id, UnaryOperator<ToolExecution> transition);
    void markRestartUnknown();
}
