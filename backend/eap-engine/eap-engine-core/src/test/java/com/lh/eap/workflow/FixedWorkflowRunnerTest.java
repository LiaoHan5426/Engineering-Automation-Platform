package com.lh.eap.workflow;

import com.lh.eap.domain.model.NodeResult;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class FixedWorkflowRunnerTest {
    @Test void localWorkflowRunsWithoutProductSqlMcpOrSpringClasses() {
        for (String type : List.of("org.springframework.context.ApplicationContext",
                "com.lh.eap.application.service.ExpertExecutionService",
                "com.lh.eap.runtime.sql.DeterministicSqlAnalyzer", "com.lh.eap.runtime.mcp.McpSessionRegistry")) {
            assertThrows(ClassNotFoundException.class, () -> Class.forName(type));
        }
        var flow = new WorkflowDefinition(List.of(step("review", true), step("inspect", true)),
                List.of(new WorkflowDefinition.Edge("inspect", "review")));
        var calls = new ArrayList<String>();
        var result = new FixedWorkflowRunner().run(flow, Duration.ofSeconds(1), step -> {
            calls.add(step.id());
            return success();
        });
        assertEquals(List.of("inspect", "review"), calls);
        assertFalse(result.failed());
        assertFalse(result.incomplete());
        assertEquals(List.of("succeeded", "succeeded"), result.nodes().stream().map(FixedWorkflowRunner.StepOutcome::state).toList());
    }

    @Test void requiredFailureBlocksDescendantsButNotIndependentBranch() {
        var calls = new ArrayList<String>();
        var flow = new WorkflowDefinition(List.of(step("root", true), step("failure", true),
                step("sibling", true), step("child", true), step("grandchild", true)),
                List.of(edge("root", "failure"), edge("root", "sibling"),
                        edge("failure", "child"), edge("child", "grandchild")));
        var result = new FixedWorkflowRunner().run(flow, Duration.ofSeconds(1), step -> {
            calls.add(step.id());
            return step.id().equals("failure") ? failure() : success();
        });
        assertEquals(List.of("root", "failure", "sibling"), calls);
        assertTrue(result.failed());
        assertEquals(List.of("succeeded", "failed", "succeeded", "blocked", "blocked"),
                result.nodes().stream().map(FixedWorkflowRunner.StepOutcome::state).toList());
    }

    @Test void optionalFailureIsPartialAndDoesNotBlockTheNextNode() {
        var result = new FixedWorkflowRunner().run(chain(false), Duration.ofSeconds(1),
                step -> step.id().equals("first") ? failure() : success());
        assertFalse(result.failed());
        assertTrue(result.incomplete());
        assertEquals("succeeded", result.nodes().getLast().state());
    }

    @Test void incompleteEvidenceIsReportedWithoutPretendingTheWorkflowIsComplete() {
        var result = new FixedWorkflowRunner().run(chain(true), Duration.ofSeconds(1),
                step -> new NodeResult(true, true, "Evidence missing", Map.of()));
        assertFalse(result.failed());
        assertTrue(result.incomplete());
        assertTrue(result.nodes().stream().allMatch(node -> node.state().equals("needs-context")));
    }

    @Test void exhaustedBudgetPreventsLaterCallbacksIncludingOptionalNodes() {
        var clock = new AtomicLong(0);
        var calls = new AtomicInteger();
        var result = new FixedWorkflowRunner(clock::get).run(chain(false), Duration.ofNanos(100), step -> {
            calls.incrementAndGet();
            clock.set(100);
            return success();
        });
        assertEquals(1, calls.get());
        assertTrue(result.failed());
        assertEquals("failed", result.nodes().getLast().state());
        assertTrue(result.nodes().getLast().result().message().contains("调度预算"));
    }

    @Test void invalidGraphsAndBudgetsNeverInvokeTheCallback() {
        var calls = new AtomicInteger();
        var invalid = List.of(
                new WorkflowDefinition(List.of(), List.of()),
                new WorkflowDefinition(List.of(step("a", true), step("b", true)), List.of()),
                new WorkflowDefinition(List.of(step("a", true)), List.of(edge("a", "unknown"))),
                new WorkflowDefinition(List.of(step("a", true), step("b", true)), List.of(edge("a", "b"), edge("b", "a"))),
                new WorkflowDefinition(List.of(step("a", true), step("a", true)), List.of()),
                new WorkflowDefinition(Arrays.asList((WorkflowDefinition.Step) null), List.of()),
                new WorkflowDefinition(List.of(step("a", true)), Arrays.asList((WorkflowDefinition.Edge) null)),
                new WorkflowDefinition(List.of(new WorkflowDefinition.Step("a", "A", "local.inspect", null)), List.of()),
                new WorkflowDefinition(List.of(step("a", true)), List.of(edge("a", "a"))),
                new WorkflowDefinition(List.of(step("a", true), step("b", true)), List.of(edge("a", "b"), edge("a", "b"))),
                new WorkflowDefinition(Collections.nCopies(101, step("a", true)), List.of()),
                new WorkflowDefinition(List.of(step("a", true)), Collections.nCopies(501, edge("a", "a"))));
        for (var flow : invalid) assertThrows(IllegalArgumentException.class, () -> new FixedWorkflowRunner().run(
                flow, Duration.ofSeconds(1), step -> { calls.incrementAndGet(); return success(); }));
        assertThrows(IllegalArgumentException.class, () -> new FixedWorkflowRunner().run(
                chain(true), Duration.ofNanos(-1), step -> { calls.incrementAndGet(); return success(); }));
        assertEquals(0, calls.get());
    }

    @Test void alreadyExhaustedBudgetProducesFailedEvidenceWithoutInvokingAnyNode() {
        var calls = new AtomicInteger();
        var result = new FixedWorkflowRunner(() -> 0).run(chain(true), Duration.ZERO,
                step -> { calls.incrementAndGet(); return success(); });
        assertEquals(0, calls.get());
        assertTrue(result.failed());
        assertEquals(List.of("failed", "blocked"), result.nodes().stream().map(FixedWorkflowRunner.StepOutcome::state).toList());
    }

    @Test void callbackExceptionsAreSanitizedAndPropagateRequiredFailure() {
        var result = new FixedWorkflowRunner().run(chain(true), Duration.ofSeconds(1), step -> {
            throw new IllegalStateException("password=secret");
        });
        assertTrue(result.failed());
        assertEquals("blocked", result.nodes().getLast().state());
        assertFalse(result.toString().contains("password"));
        assertFalse(result.toString().contains("secret"));
    }

    @Test void observerFailureStopsSchedulingAndRemainsVisibleToTheCaller() {
        var failure = new IllegalStateException("Evidence storage unavailable");
        var calls = new AtomicInteger();
        assertSame(failure, assertThrows(IllegalStateException.class, () -> new FixedWorkflowRunner().run(
                chain(true), Duration.ofSeconds(1), step -> { calls.incrementAndGet(); return success(); },
                outcome -> { throw failure; })));
        assertEquals(1, calls.get());
    }

    @Test void callerCannotMutateTheSelectedWorkflowDuringExecution() {
        var steps = new ArrayList<>(List.of(step("first", true), step("second", true)));
        var edges = new ArrayList<>(List.of(edge("first", "second")));
        var flow = new WorkflowDefinition(steps, edges);
        steps.clear();
        edges.clear();
        assertThrows(UnsupportedOperationException.class, () -> flow.steps().clear());
        assertEquals(List.of("first", "second"), WorkflowGraph.order(flow).stream().map(WorkflowDefinition.Step::id).toList());
    }

    private static WorkflowDefinition chain(boolean required) {
        return new WorkflowDefinition(List.of(step("first", required), step("second", required)), List.of(edge("first", "second")));
    }
    private static WorkflowDefinition.Step step(String id, boolean required) {
        return new WorkflowDefinition.Step(id, id, "local." + id, required);
    }
    private static WorkflowDefinition.Edge edge(String from, String to) { return new WorkflowDefinition.Edge(from, to); }
    private static NodeResult success() { return new NodeResult(true, false, "Done", Map.of()); }
    private static NodeResult failure() { return new NodeResult(false, false, "Denied", Map.of()); }
}
