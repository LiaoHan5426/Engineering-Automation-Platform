package com.lh.eap.workflow;

import com.lh.eap.domain.model.NodeResult;
import java.time.Duration;
import java.util.*;
import java.util.function.Consumer;
import java.util.function.Function;
import java.util.function.LongSupplier;

/**
 * Synchronous fixed DAG scheduling only. The caller owns authorization, side effects and persistence.
 * The budget prevents starting later nodes; callbacks must enforce their own I/O timeout/cancellation.
 */
public final class FixedWorkflowRunner {
    public record StepOutcome(WorkflowDefinition.Step step, NodeResult result, String state) {}
    public record Outcome(List<StepOutcome> nodes, boolean failed, boolean incomplete) {
        public Outcome { nodes = List.copyOf(nodes); }
    }

    private final LongSupplier nanoTime;

    public FixedWorkflowRunner() { this(System::nanoTime); }
    FixedWorkflowRunner(LongSupplier nanoTime) { this.nanoTime = Objects.requireNonNull(nanoTime); }

    public Outcome run(WorkflowDefinition workflow, Duration budget,
            Function<WorkflowDefinition.Step, NodeResult> invoke) {
        return run(workflow, budget, invoke, outcome -> {});
    }

    public Outcome run(WorkflowDefinition workflow, Duration budget,
            Function<WorkflowDefinition.Step, NodeResult> invoke, Consumer<StepOutcome> observer) {
        Objects.requireNonNull(invoke);
        Objects.requireNonNull(observer);
        long budgetNanos = Objects.requireNonNull(budget).toNanos();
        if (budgetNanos < 0) throw new IllegalArgumentException("Workflow budget cannot be negative");
        var errors = WorkflowGraph.validate(workflow);
        if (!errors.isEmpty()) throw new IllegalArgumentException(String.join("；", errors));
        long started = nanoTime.getAsLong();
        var blocking = new HashSet<String>();
        var outcomes = new ArrayList<StepOutcome>();
        boolean failed = false, incomplete = false;
        for (var step : WorkflowGraph.order(workflow)) {
            boolean blocked = workflow.edges().stream()
                    .anyMatch(edge -> edge.target().equals(step.id()) && blocking.contains(edge.source()));
            NodeResult result;
            if (blocked || nanoTime.getAsLong() - started >= budgetNanos) {
                result = new NodeResult(false, false, blocked ? "必需依赖未通过，未执行此节点"
                        : "流程达到调度预算，未执行此节点", Map.of());
                blocking.add(step.id());
                failed = true;
            } else {
                try { result = Objects.requireNonNull(invoke.apply(step), "Node result is required"); }
                catch (RuntimeException failure) {
                    result = new NodeResult(false, false, "能力执行失败，请查看后端日志；敏感上下文不会写入日志", Map.of());
                }
            }
            if (!result.success() && Boolean.TRUE.equals(step.required())) {
                blocking.add(step.id());
                failed = true;
            }
            incomplete |= result.incomplete() || (!result.success() && !Boolean.TRUE.equals(step.required()));
            var state = blocked ? "blocked" : result.incomplete() ? "needs-context" : result.success() ? "succeeded" : "failed";
            var outcome = new StepOutcome(step, result, state);
            outcomes.add(outcome);
            observer.accept(outcome);
        }
        return new Outcome(outcomes, failed, incomplete);
    }
}
