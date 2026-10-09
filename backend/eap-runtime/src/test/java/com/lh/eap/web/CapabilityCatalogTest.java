package com.lh.eap.web;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.lh.eap.api.ProcessExecutor;
import com.lh.eap.core.CapabilityRegistry;
import com.lh.eap.rules.SqlFactVocabulary;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * The capability catalog must tell an operator the truth about each capability: what kind of thing it
 * is, what it can publish, and whether it is runnable here.
 */
class CapabilityCatalogTest {

    private static CapabilityHandlerRegistry registry() {
        return new CapabilityHandlerRegistry(List.of(
                new SqlParseHandler(),
                new KnowledgeSearchHandler(mock(KnowledgeRepository.class)),
                new DatabaseMetadataHandler(mock(JdbcTemplate.class), mock(ExpertDefinitionService.class)),
                new DatabaseExplainHandler(),
                new GitInspectionHandler(new CapabilityRegistry(), mock(ProcessExecutor.class)),
                new WorkspaceSearchHandler(new CapabilityRegistry(), mock(ProcessExecutor.class))));
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> items(Map<String, Object> catalog) {
        return (List<Map<String, Object>>) catalog.get("items");
    }

    private static Map<String, Object> item(Map<String, Object> catalog, String name) {
        return items(catalog).stream().filter(entry -> name.equals(entry.get("name"))).findFirst().orElseThrow();
    }

    @Test void everyCapabilityIsDescribedWithAKindAndAnExplicitAvailability() {
        var catalog = new CapabilityCatalog(registry(), mock(JdbcTemplate.class)).catalog();
        var kinds = new CapabilityKind[]{CapabilityKind.COMMAND, CapabilityKind.CLI, CapabilityKind.MCP, CapabilityKind.HTTP};
        var knownKindIds = Arrays.stream(kinds).map(CapabilityKind::id).toList();

        assertEquals(ExpertGraph.CAPABILITIES.size(), items(catalog).size(),
                "每个已注册能力都必须有一条目录条目");
        for (var entry : items(catalog)) {
            assertTrue(knownKindIds.contains(entry.get("kind")), "能力种类必须来自声明的枚举：" + entry);
            assertNotNull(entry.get("title"));
            assertNotNull(entry.get("executor"));
            assertTrue(List.of("available", "missing-binary", "not-configured").contains(entry.get("availability")),
                    "可用性必须是显式状态，不能靠猜：" + entry);
        }
    }

    @Test void capabilityKindsSeparateBuiltInCommandsFromLocalCliTools() {
        var catalog = new CapabilityCatalog(registry(), mock(JdbcTemplate.class)).catalog();
        assertEquals(CapabilityKind.COMMAND.id(), item(catalog, "sql.parse").get("kind"));
        assertEquals(CapabilityKind.COMMAND.id(), item(catalog, "database.explain").get("kind"));
        assertEquals(CapabilityKind.CLI.id(), item(catalog, "git-status").get("kind"));
        assertEquals(CapabilityKind.CLI.id(), item(catalog, "rg-search").get("kind"));

        var kinds = (List<Map<String, Object>>) catalog.get("kinds");
        assertEquals(CapabilityKind.ORDER.size(), kinds.size(), "目录必须列出全部种类，包括尚未配置的 MCP");
        assertEquals(0, kinds.stream().filter(kind -> CapabilityKind.MCP.id().equals(kind.get("id")))
                .findFirst().orElseThrow().get("count"), "当前没有注册 MCP 能力时应如实报告 0");
    }

    /** The fact vocabulary and the handlers' declared publications must agree in both directions. */
    @SuppressWarnings("unchecked")
    @Test void declaredFactsAndPublishedFactsAgree() {
        var catalog = new CapabilityCatalog(registry(), mock(JdbcTemplate.class)).catalog();
        for (var producer : SqlFactVocabulary.producers()) {
            var entry = item(catalog, producer);
            var declared = SqlFactVocabulary.factsOf(producer).stream().map(SqlFactVocabulary.Fact::key).sorted().toList();
            assertEquals(declared, ((List<String>) entry.get("facts")).stream().sorted().toList(),
                    producer + " 在词表中声明发布的事实必须与目录报告的一致");
        }
        for (var entry : items(catalog)) {
            for (var fact : (List<String>) entry.get("facts")) {
                assertTrue(SqlFactVocabulary.FACTS_BY_KEY.containsKey(fact),
                        "目录报告了未登记的事实：" + fact);
                assertEquals(entry.get("name"), SqlFactVocabulary.FACTS_BY_KEY.get(fact).producedBy(),
                        "事实的产出能力必须与目录一致：" + fact);
            }
        }
    }

    @Test void declaredVocabularyAndRegisteredHandlersNeverDiverge() {
        var catalog = new CapabilityCatalog(registry(), mock(JdbcTemplate.class)).catalog();
        assertEquals(List.of(), catalog.get("unregistered"), "声明的能力必须都有实现");
        assertEquals(List.of(), catalog.get("undeclared"), "实现的能力必须都在声明词表中");
    }

    @Test void everyFactProducerIsADeclaredCapability() {
        assertTrue(ExpertGraph.CAPABILITIES.containsAll(SqlFactVocabulary.producers()),
                "事实的产出能力必须是专家清单可以引用的能力，否则规则包的需求永远无法被满足");
    }

    @Test void catalogReportsWhichExpertsDependOnACapability() {
        var jdbc = mock(JdbcTemplate.class);
        var row = new LinkedHashMap<String, Object>();
        row.put("id", "orders-sql");
        row.put("enabled", true);
        row.put("manifest", """
                {"apiVersion":"eap/v1","kind":"Expert","id":"orders-sql","name":"订单库",
                 "steps":[{"id":"parse","capability":"sql.parse","required":true}],"edges":[],
                 "rules":["database.credentials.never-expose"]}
                """);
        when(jdbc.queryForList(anyString())).thenReturn(List.of(row));
        var catalog = new CapabilityCatalog(registry(), jdbc).catalog();
        assertEquals(List.of("orders-sql"), item(catalog, "sql.parse").get("usedBy"));
        assertEquals(List.of(), item(catalog, "rg-search").get("usedBy"));
    }
}
