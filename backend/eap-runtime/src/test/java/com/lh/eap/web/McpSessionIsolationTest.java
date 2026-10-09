package com.lh.eap.web;

import static org.junit.jupiter.api.Assertions.*;

import java.util.*;
import org.junit.jupiter.api.Test;

/**
 * The isolation rule for expert-scoped capabilities.
 *
 * <p>A shared MCP session is the concrete form of "被不同专家调用后导致 MCP 内部混乱": one connection's
 * state (session id, cursors, negotiated capabilities, authenticated identity) serving calls made under
 * different experts' grants. These tests pin the four properties that make that impossible rather than
 * merely discouraged.
 */
class McpSessionIsolationTest {
    private static final String SERVER = "registrydb";
    private static final String CAPABILITY = "mcp.registrydb.query";

    private static McpCallScope scope(UUID executionId, String expertId) {
        return new McpCallScope(executionId, expertId, SERVER, CAPABILITY);
    }

    private static FakeMcpToolHandler.ShapeSession open(McpSessionRegistry registry, McpCallScope scope) {
        return (FakeMcpToolHandler.ShapeSession) registry.session(scope,
                () -> new FakeMcpToolHandler.ShapeSession(scope.serverId()));
    }

    @Test void aSessionCannotBeOpenedOutsideAnExecution() {
        var registry = new McpSessionRegistry();
        var error = assertThrows(IllegalStateException.class,
                () -> open(registry, scope(UUID.randomUUID(), "orders-sql")));
        assertTrue(error.getMessage().contains("只能在一次专家执行内创建"), error.getMessage());
    }

    @Test void anExecutionBelongsToExactlyOneExpert() {
        var registry = new McpSessionRegistry();
        var execution = UUID.randomUUID();
        registry.beginExecution(execution, "orders-sql");
        var error = assertThrows(IllegalStateException.class, () -> open(registry, scope(execution, "billing-sql")));
        assertTrue(error.getMessage().contains("不能跨专家复用"), error.getMessage());
    }

    @Test void twoExpertsOnTheSameServerGetDifferentSessions() {
        var registry = new McpSessionRegistry();
        var first = UUID.randomUUID();
        var second = UUID.randomUUID();
        registry.beginExecution(first, "orders-sql");
        registry.beginExecution(second, "billing-sql");

        var ordersSession = open(registry, scope(first, "orders-sql"));
        var billingSession = open(registry, scope(second, "billing-sql"));

        assertNotSame(ordersSession, billingSession, "同一服务器上的两个专家必须各自持有一个会话");
        assertEquals(2, registry.sessionCount(SERVER), "并发调用以独立会话承载，而不是复用同一个");
        assertNotEquals(scope(first, "orders-sql").sessionKey(), scope(second, "billing-sql").sessionKey());
    }

    @Test void oneExpertReusesItsOwnSessionWithinTheRunOnly() {
        var registry = new McpSessionRegistry();
        var execution = UUID.randomUUID();
        registry.beginExecution(execution, "orders-sql");

        assertSame(open(registry, scope(execution, "orders-sql")), open(registry, scope(execution, "orders-sql")),
                "同一次执行内的重复调用复用该执行自己的会话，避免每次调用都重开会话");
        assertEquals(1, registry.sessionCount(SERVER));
    }

    @Test void aSessionBelongingToAnotherScopeIsRefused() {
        var registry = new McpSessionRegistry();
        var execution = UUID.randomUUID();
        registry.beginExecution(execution, "orders-sql");
        var session = open(registry, scope(execution, "orders-sql"));

        var foreign = new McpCallScope(UUID.randomUUID(), "billing-sql", SERVER, CAPABILITY);
        var error = assertThrows(IllegalStateException.class, () -> registry.requireOwnership(foreign, session));
        assertTrue(error.getMessage().contains("不能跨专家或跨执行复用"), error.getMessage());
        assertDoesNotThrow(() -> registry.requireOwnership(scope(execution, "orders-sql"), session));
    }

    @Test void endingAnExecutionClosesItsSessionsSoNothingSurvivesIntoTheNextRun() {
        var registry = new McpSessionRegistry();
        var firstRun = UUID.randomUUID();
        registry.beginExecution(firstRun, "orders-sql");
        var firstSession = open(registry, scope(firstRun, "orders-sql"));

        assertEquals(1, registry.endExecution(firstRun));
        assertTrue(firstSession.closed, "执行结束必须关闭会话，否则下一个专家会继承它的状态");
        assertEquals(0, registry.openSessionCount());

        var secondRun = UUID.randomUUID();
        registry.beginExecution(secondRun, "orders-sql");
        var secondSession = open(registry, scope(secondRun, "orders-sql"));
        assertNotSame(firstSession, secondSession, "两次执行不能共享 MCP 会话");
        assertFalse(secondSession.closed);
        registry.endExecution(secondRun);
        assertTrue(secondSession.closed);
    }

    @Test void aFailedExecutionStillHasItsSessionsClosed() {
        var registry = new McpSessionRegistry();
        var execution = UUID.randomUUID();
        registry.beginExecution(execution, "orders-sql");
        open(registry, scope(execution, "orders-sql"));
        try {
            throw new IllegalStateException("节点失败");
        } catch (IllegalStateException expected) {
            assertEquals(1, registry.endExecution(execution));
        }
        assertEquals(0, registry.openSessionCount());
    }

    @Test void scopeRejectsAnIncompleteIdentityAndParsesTheCapabilityId() {
        var execution = UUID.randomUUID();
        assertThrows(IllegalArgumentException.class, () -> new McpCallScope(null, "orders-sql", SERVER, CAPABILITY));
        assertThrows(IllegalArgumentException.class, () -> new McpCallScope(execution, " ", SERVER, CAPABILITY));
        assertThrows(IllegalArgumentException.class, () -> new McpCallScope(execution, "orders-sql", "", CAPABILITY));

        assertEquals(Optional.of(SERVER), McpCallScope.serverIdOf(CAPABILITY));
        assertEquals(Optional.empty(), McpCallScope.serverIdOf("sql.parse"));
        assertEquals(Optional.empty(), McpCallScope.serverIdOf("mcp.registrydb"));
        assertEquals(CAPABILITY, McpCallScope.of(execution, "orders-sql", CAPABILITY).orElseThrow().capability());
    }
}
