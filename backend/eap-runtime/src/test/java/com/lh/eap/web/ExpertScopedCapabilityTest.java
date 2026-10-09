package com.lh.eap.web;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.lh.eap.api.ProcessExecutor;
import com.lh.eap.core.CapabilityRegistry;
import com.lh.eap.rules.RulePackService;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Why an MCP tool must not be enabled globally.
 *
 * <p>An MCP server keeps state per connection — session id, cursors, negotiated capabilities, and the
 * identity it was opened for. Registering such a capability "platform-wide" would let every expert call
 * it through whatever session happened to exist: expert B could be served from expert A's state, A's
 * cursors, A's authenticated principal, with the audit trail attributing both to whoever opened it. The
 * answer is not "be careful" but three enforced rules, pinned here:
 *
 * <ol>
 *   <li>An expert-scoped capability is never globally runnable — declared, granted, and resolved per
 *       expert, and the catalog says so instead of listing it beside a platform command.</li>
 *   <li>A manifest cannot conjure a server into existence: the tool must already be published by a
 *       registered, enabled and trusted server.</li>
 *   <li>Calls run in a session owned by one (execution, expert, server) triple, closed with the run.</li>
 * </ol>
 */
class ExpertScopedCapabilityTest {
    private static final String EXPERT = "orders-sql";

    private static CapabilityHandlerRegistry registryWith(CapabilityHandler extra) {
        var beans = new ArrayList<CapabilityHandler>(List.of(
                new SqlParseHandler(),
                new KnowledgeSearchHandler(mock(KnowledgeRepository.class)),
                new DatabaseMetadataHandler(mock(JdbcTemplate.class), mock(ExpertDefinitionService.class)),
                new DatabaseExplainHandler(),
                new GitInspectionHandler(new CapabilityRegistry(), mock(ProcessExecutor.class)),
                new WorkspaceSearchHandler(new CapabilityRegistry(), mock(ProcessExecutor.class))));
        beans.add(extra);
        return new CapabilityHandlerRegistry(beans);
    }

    private static ExpertManifest manifest(List<String> mcpTools, String... capabilities) {
        var nodes = new ArrayList<ExpertManifest.Step>();
        for (var capability : capabilities) nodes.add(new ExpertManifest.Step(capability, capability, capability, true));
        var edges = new ArrayList<ExpertManifest.Edge>();
        for (int index = 1; index < nodes.size(); index++) {
            edges.add(new ExpertManifest.Edge(nodes.get(index - 1).id(), nodes.get(index).id()));
        }
        return new ExpertManifest("eap/v1", "Expert", EXPERT, "订单库", List.of(), List.of(),
                List.copyOf(nodes), List.copyOf(edges), List.of("database.credentials.never-expose"), List.of(), mcpTools);
    }

    /** A registry with one registered, enabled and trusted server publishing {@code query}. */
    private static McpServerRegistry serverRegistry(boolean trusted) {
        var jdbc = mock(JdbcTemplate.class);
        var row = new LinkedHashMap<String, Object>();
        row.put("id", "registrydb");
        row.put("name", "登记库");
        row.put("transport", "stdio");
        row.put("trusted", trusted);
        row.put("enabled", true);
        row.put("tools", "[{\"name\":\"query\",\"readOnly\":true}]");
        when(jdbc.queryForList(anyString())).thenReturn(List.of(row));
        return new McpServerRegistry(jdbc);
    }

    private static Set<String> effectiveVocabulary(McpServerRegistry servers) {
        var known = new LinkedHashSet<>(ExpertGraph.CAPABILITIES);
        known.addAll(servers.capabilityIds());
        return known;
    }

    @Test void registeredServerPublishesANamespacedCapabilityAndNothingElse() {
        var servers = serverRegistry(true);
        assertEquals(Set.of(FakeMcpToolHandler.CAPABILITY), servers.capabilityIds(),
                "工具能力必须以 mcp.<服务器>.<工具> 命名，避免两个服务器同名工具互相覆盖");
        assertEquals(Optional.of("registrydb"), servers.serverOf(FakeMcpToolHandler.CAPABILITY));
        assertEquals(List.of("query"), servers.allowedTools("registrydb"));
    }

    @Test void anEnabledButUntrustedServerPublishesNothing() {
        assertEquals(Set.of(), serverRegistry(false).capabilityIds(),
                "只启用不放行不算登记完成：宁可没有工具，也不能调用一个未信任的服务器");
    }

    @Test void unreadableRegistryFailsClosedInsteadOfAllowingEveryTool() {
        var jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(anyString())).thenThrow(new IllegalStateException("relation does not exist"));
        assertEquals(Set.of(), new McpServerRegistry(jdbc).capabilityIds(), "登记表不可读时不得回退为“全部允许”");
    }

    @Test void anExpertScopedNodeMustBeDeclaredByThatExpert() {
        var servers = serverRegistry(true);
        var errors = ExpertGraph.validate(manifest(List.of(), "sql.parse", FakeMcpToolHandler.CAPABILITY),
                effectiveVocabulary(servers), Map.of(), servers.capabilityIds());
        assertTrue(errors.stream().anyMatch(error -> error.contains("不会在运行时全局启用") && error.contains("mcpTools")),
                "专家级能力必须由专家自己声明授权，否则会被平台对所有专家放开：" + errors);
    }

    @Test void declaringAToolThePlatformNeverRegisteredIsRejected() {
        var servers = serverRegistry(true);
        var errors = ExpertGraph.validate(manifest(List.of("mcp.unknown.query"), "sql.parse"),
                effectiveVocabulary(servers), Map.of(), servers.capabilityIds());
        assertTrue(errors.stream().anyMatch(error -> error.contains("未在任何已启用并信任的 MCP 服务器中发布")),
                "清单不能凭名字让一个 MCP 服务器存在：" + errors);
    }

    @Test void malformedToolIdsAndDuplicatesAreRejected() {
        var servers = serverRegistry(true);
        var errors = ExpertGraph.validate(manifest(List.of("registrydb.query"), "sql.parse"),
                effectiveVocabulary(servers), Map.of(), servers.capabilityIds());
        assertTrue(errors.stream().anyMatch(error -> error.contains("mcp.<服务器>.<工具>")), errors.toString());

        var duplicated = ExpertGraph.validate(
                manifest(List.of(FakeMcpToolHandler.CAPABILITY, FakeMcpToolHandler.CAPABILITY), "sql.parse"),
                effectiveVocabulary(servers), Map.of(), servers.capabilityIds());
        assertTrue(duplicated.stream().anyMatch(error -> error.contains("重复声明")), duplicated.toString());
    }

    @Test void aDeclaredExpertScopedNodePassesAndIsStillNotGlobal() {
        var servers = serverRegistry(true);
        var withDeclaration = manifest(List.of(FakeMcpToolHandler.CAPABILITY), "sql.parse", FakeMcpToolHandler.CAPABILITY);
        assertEquals(List.of(), ExpertGraph.validate(withDeclaration, effectiveVocabulary(servers),
                Map.of(), servers.capabilityIds()));

        var sessions = new McpSessionRegistry();
        var registry = registryWith(new FakeMcpToolHandler(sessions));
        assertTrue(registry.resolveFor(withDeclaration, FakeMcpToolHandler.CAPABILITY).isPresent(),
                "声明过的专家可以解析到该能力");
        assertTrue(registry.resolveFor(manifest(List.of(), "sql.parse"), FakeMcpToolHandler.CAPABILITY).isEmpty(),
                "未声明的专家即使处理器已注册也不能解析到该能力——这正是“不全局启用”的含义");
        assertFalse(registry.platformNames().contains(FakeMcpToolHandler.CAPABILITY));
        assertTrue(registry.expertScopedNames().contains(FakeMcpToolHandler.CAPABILITY));
    }

    @SuppressWarnings("unchecked")
    @Test void theCatalogNeverReportsAnExpertScopedCapabilityAsGloballyRunnable() {
        var sessions = new McpSessionRegistry();
        var catalog = new CapabilityCatalog(registryWith(new FakeMcpToolHandler(sessions)),
                mock(JdbcTemplate.class), serverRegistry(true)).catalog();
        var items = (List<Map<String, Object>>) catalog.get("items");
        var scoped = items.stream().filter(item -> FakeMcpToolHandler.CAPABILITY.equals(item.get("name")))
                .findFirst().orElseThrow();

        assertEquals("expert", scoped.get("scope"));
        assertEquals(true, scoped.get("expertScoped"));
        assertEquals(false, scoped.get("globallyRunnable"), "专家级能力永远不能被报告为全局可用");
        assertEquals("not-configured", scoped.get("availability"), "没有客户端时如实报告未配置");
        for (var item : items) {
            if (Boolean.TRUE.equals(item.get("expertScoped"))) {
                assertEquals(false, item.get("globallyRunnable"), "任何专家级能力都不得全局可运行：" + item);
            }
        }
        assertFalse(((List<String>) catalog.get("globallyUsable")).contains(FakeMcpToolHandler.CAPABILITY),
                "可全局引用的能力清单必须排除专家级能力");
        assertTrue(((List<String>) catalog.get("expertScoped")).contains(FakeMcpToolHandler.CAPABILITY));
        assertTrue(((List<String>) catalog.get("undeclared")).contains(FakeMcpToolHandler.CAPABILITY),
                "测试替身不在静态词表中，目录必须如实报告 undeclared 而不是隐藏它");
        assertEquals(Set.of(FakeMcpToolHandler.CAPABILITY),
                Set.copyOf((List<String>) catalog.get("expertScopedVocabulary")));
    }

    @Test void grantsAreWrittenOnActivationAndRevokedOnDisable() {
        var servers = serverRegistry(true);
        var jdbc = mock(JdbcTemplate.class);
        var row = new LinkedHashMap<String, Object>();
        row.put("manifest", ExpertManifest.serialize(
                manifest(List.of(FakeMcpToolHandler.CAPABILITY), "sql.parse", FakeMcpToolHandler.CAPABILITY)));
        row.put("builtin", false);
        when(jdbc.queryForList(anyString(), eq(EXPERT))).thenReturn(List.of(row));
        var service = new ExpertDefinitionService(jdbc, new RulePackService(jdbc), servers);

        service.activate(EXPERT, true);
        verify(jdbc).update(contains("INSERT INTO eap.expert_mcp_grant"), eq(EXPERT), eq(FakeMcpToolHandler.CAPABILITY));

        service.activate(EXPERT, false);
        verify(jdbc, atLeast(2)).update(contains("DELETE FROM eap.expert_mcp_grant"), eq(EXPERT));
    }
}
