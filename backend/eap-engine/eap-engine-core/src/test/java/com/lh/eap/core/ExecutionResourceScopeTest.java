package com.lh.eap.core;

import java.util.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class ExecutionResourceScopeTest {
    @Test void resourcesCloseOnceInReverseOrderWithTheSameExecutionIdentity() {
        var calls = new ArrayList<String>(); var id = UUID.randomUUID();
        ExecutionResource first = (run, expert) -> {
            assertEquals(id, run); assertEquals("expert", expert); calls.add("open1");
            return () -> calls.add("close1");
        };
        ExecutionResource second = (run, expert) -> {
            assertEquals(id, run); assertEquals("expert", expert); calls.add("open2");
            return () -> calls.add("close2");
        };
        var scope = ExecutionResourceScope.open(List.of(first, second), id, "expert");
        scope.close(); scope.close();
        assertEquals(List.of("open1", "open2", "close2", "close1"), calls);
    }
    @Test void partialAcquisitionCleansUpAndPreservesTheOpeningFailure() {
        var calls = new ArrayList<String>();
        var failure = new IllegalStateException("open failed");
        var cleanup = new IllegalArgumentException("close failed");
        ExecutionResource first = (id, expert) -> () -> { calls.add("closed"); throw cleanup; };
        ExecutionResource second = (id, expert) -> { throw failure; };
        ExecutionResource third = (id, expert) -> { fail("must not open later resources"); return () -> {}; };
        assertSame(failure, assertThrows(IllegalStateException.class,
                () -> ExecutionResourceScope.open(List.of(first, second, third), UUID.randomUUID(), "expert")));
        assertEquals(List.of("closed"), calls);
        assertArrayEquals(new Throwable[]{cleanup}, failure.getSuppressed());
    }
    @Test void executionFailureRemainsPrimaryEvenWhenMultipleClosuresFail() {
        var calls = new ArrayList<String>();
        var execution = new IllegalStateException("task save failed");
        var firstClose = new IllegalArgumentException("first close");
        var secondClose = new IllegalArgumentException("second close");
        ExecutionResource first = (id, expert) -> () -> { calls.add("first"); throw firstClose; };
        ExecutionResource second = (id, expert) -> () -> { calls.add("second"); throw secondClose; };
        assertSame(execution, assertThrows(IllegalStateException.class, () -> {
            try (var scope = ExecutionResourceScope.open(List.of(first, second), UUID.randomUUID(), "expert")) {
                throw execution;
            }
        }));
        assertEquals(List.of("second", "first"), calls);
        assertArrayEquals(new Throwable[]{secondClose}, execution.getSuppressed());
        assertArrayEquals(new Throwable[]{firstClose}, secondClose.getSuppressed());
    }
    @Test void emptyCompositionNeedsNoSpringSqlOrMcp() {
        for (var type : List.of("org.springframework.context.ApplicationContext", "com.lh.eap.runtime.mcp.McpSessionRegistry",
                "com.lh.eap.runtime.sql.DeterministicSqlAnalyzer")) assertThrows(ClassNotFoundException.class, () -> Class.forName(type));
        try (var scope = ExecutionResourceScope.open(List.of(), UUID.randomUUID(), "expert")) { assertNotNull(scope); }
    }
}
