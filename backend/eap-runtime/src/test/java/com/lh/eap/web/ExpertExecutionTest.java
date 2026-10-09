package com.lh.eap.web;

import com.lh.eap.api.*;
import com.lh.eap.core.CapabilityRegistry;
import com.lh.eap.llm.LlmGateway;
import com.lh.eap.rules.RulePackService;
import java.nio.file.Path;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import org.springframework.jdbc.core.JdbcTemplate;

class ExpertExecutionTest {
    private static CapabilityHandlerRegistry handlers(KnowledgeRepository knowledge, JdbcTemplate jdbc,
            ExpertDefinitionService definitions) {
        var registry = new CapabilityRegistry();
        var executor = mock(ProcessExecutor.class);
        return new CapabilityHandlerRegistry(List.of(
                new SqlParseHandler(),
                new KnowledgeSearchHandler(knowledge),
                new DatabaseMetadataHandler(jdbc, definitions),
                new DatabaseExplainHandler(),
                new GitInspectionHandler(registry, executor),
                new WorkspaceSearchHandler(registry, executor)));
    }

    /** The same registry plus one registered-but-expert-scoped MCP tool. */
    private static CapabilityHandlerRegistry handlersWithMcp(KnowledgeRepository knowledge, JdbcTemplate jdbc,
            ExpertDefinitionService definitions, FakeMcpToolHandler mcp) {
        var registry = new CapabilityRegistry();
        var executor = mock(ProcessExecutor.class);
        return new CapabilityHandlerRegistry(List.of(
                new SqlParseHandler(),
                new KnowledgeSearchHandler(knowledge),
                new DatabaseMetadataHandler(jdbc, definitions),
                new DatabaseExplainHandler(),
                new GitInspectionHandler(registry, executor),
                new WorkspaceSearchHandler(registry, executor),
                mcp));
    }

    @Test void requiredFailureBlocksDependentsAndPersistsEvidence(){
        var definitions=mock(ExpertDefinitionService.class);
        var knowledge=mock(KnowledgeRepository.class);
        var tasks=mock(TaskRepository.class);
        var model=mock(SqlExpertService.class);
        var jdbc=mock(JdbcTemplate.class);
        var manifest=new ExpertManifest("eap/v1","Expert","test","Test",List.of(),List.of(),
                List.of(new ExpertManifest.Step("knowledge","Knowledge","knowledge.search",true),new ExpertManifest.Step("parse","Parse","sql.parse",true)),
                List.of(new ExpertManifest.Edge("parse","knowledge")),List.of("database.credentials.never-expose"));
        when(definitions.require("test",true)).thenReturn(manifest);
        when(definitions.knowledgeGrants("test")).thenReturn(List.of());
        var execution=new ExpertExecutionService(definitions,tasks,
                handlers(knowledge,jdbc,definitions),new RulePackService(jdbc),Path.of("."),model,new McpSessionRegistry());
        var result=execution.execute("test",new ExpertExecutionService.Request("SELECT FROM !","优化查询",null,null,false,null));
        assertEquals("failed",result.get("status"));
        var observations=(List<?>)result.get("observations");
        assertEquals("sql.parse",((Observation)observations.getFirst()).capability());
        assertEquals("blocked",((Observation)observations.get(1)).metadata().get("state"));
        verifyNoInteractions(knowledge,model);
        verify(tasks).save(any(),eq("优化查询"),eq("failed"),eq("rejected"),anyList());
    }

    @Test void snapshotIndexAdviceNamesTheConcreteColumnAndIndex(){
        var analysis=Map.<String,Object>of("joinColumns",List.of(Map.of("table","task_observation","column","task_id","condition","a.id=b.task_id")));
        var inspection=SqlMetadataInspector.inspectIndexes(List.of(Map.of("table","task_observation","name","idx_task_id","columns",List.of("task_id"))),analysis);
        assertTrue(inspection.advice().getFirst().contains("idx_task_id"));
        assertTrue(inspection.advice().getFirst().contains("task_observation.task_id"));
        assertEquals(true,inspection.facts().get("index.loaded"));
        assertEquals(true,inspection.facts().get("index.leadingColumnMatch"));
    }

    @Test void snapshotMissingLeadingColumnBecomesAFactNotJustAdviceText(){
        var analysis=Map.<String,Object>of("joinColumns",List.of(Map.of("table","orders","column","customer_id","condition","o.customer_id=c.id")));
        var inspection=SqlMetadataInspector.inspectIndexes(List.of(),analysis);
        assertEquals("orders.customer_id",inspection.facts().get("index.uncoveredJoinColumn"));
        assertEquals(false,inspection.facts().get("index.leadingColumnMatch"));
    }

    @Test void declaredCapabilityVocabularyMatchesRegisteredHandlers(){
        var registry=handlers(mock(KnowledgeRepository.class),mock(JdbcTemplate.class),mock(ExpertDefinitionService.class));
        assertEquals(ExpertGraph.CAPABILITIES,registry.names(),
                "声明的能力词表必须与已注册的处理器一一对应，否则专家清单可以引用一个无法执行的节点");
    }

    @Test void unresolvedRulePackIsReportedInsteadOfSilentlySkipped(){
        var definitions=mock(ExpertDefinitionService.class);
        var tasks=mock(TaskRepository.class);
        var jdbc=mock(JdbcTemplate.class);
        var manifest=new ExpertManifest("eap/v1","Expert","test","Test",List.of(),List.of(),
                List.of(new ExpertManifest.Step("parse","Parse","sql.parse",true)),List.of(),
                List.of("database.credentials.never-expose"),List.of("does-not-exist"));
        when(definitions.require("test",true)).thenReturn(manifest);
        when(definitions.knowledgeGrants("test")).thenReturn(List.of());
        var execution=new ExpertExecutionService(definitions,tasks,
                handlers(mock(KnowledgeRepository.class),jdbc,definitions),new RulePackService(jdbc),Path.of("."),mock(SqlExpertService.class),new McpSessionRegistry());
        var result=execution.execute("test",new ExpertExecutionService.Request("select id from users","",null,null,false,null));
        assertEquals("partial",result.get("status"));
        assertTrue(result.get("advice").toString().contains("does-not-exist"));
        assertEquals(List.of(),result.get("rulePacks"));
    }

    @Test void gatewayWithoutProvidersIsNotUsedAndNeverBlocksDeterministicResult(){
        var gateway=new LlmGateway(List.of(),8);
        assertFalse(gateway.available());
    }

    private static ExpertManifest manifestWithMcpNode(List<String> mcpTools){
        return new ExpertManifest("eap/v1","Expert","test","Test",List.of(),List.of(),
                List.of(new ExpertManifest.Step("parse","Parse","sql.parse",true),
                        new ExpertManifest.Step("mcp","Query","mcp.registrydb.query",false)),
                List.of(new ExpertManifest.Edge("parse","mcp")),
                List.of("database.credentials.never-expose"),List.of(),mcpTools);
    }

    @Test void anExpertThatDidNotDeclareAMcpToolCannotRunItEvenThoughTheHandlerExists(){
        var definitions=mock(ExpertDefinitionService.class);
        var jdbc=mock(JdbcTemplate.class);
        var sessions=new McpSessionRegistry();
        var mcp=new FakeMcpToolHandler(sessions);
        when(definitions.require("test",true)).thenReturn(manifestWithMcpNode(List.of()));
        var execution=new ExpertExecutionService(definitions,mock(TaskRepository.class),
                handlersWithMcp(mock(KnowledgeRepository.class),jdbc,definitions,mcp),new RulePackService(jdbc),
                Path.of("."),mock(SqlExpertService.class),sessions);

        var error=assertThrows(org.springframework.web.server.ResponseStatusException.class,
                ()->execution.execute("test",new ExpertExecutionService.Request("select id from users","",null,null,false,null)));
        assertTrue(error.getReason().contains("不会在运行时全局启用"),error.getReason());
        assertEquals(List.of(),mcp.calls,"未授权的专家绝不能触达 MCP 工具——这正是“不全局启用”的含义");
        assertEquals(0,sessions.openSessionCount());
    }

    @Test void aDeclaredMcpToolRunsInASessionOwnedByThatExpertAndIsClosedWithTheRun(){
        var definitions=mock(ExpertDefinitionService.class);
        var jdbc=mock(JdbcTemplate.class);
        var sessions=new McpSessionRegistry();
        var mcp=new FakeMcpToolHandler(sessions);
        when(definitions.require("test",true)).thenReturn(manifestWithMcpNode(List.of("mcp.registrydb.query")));
        when(definitions.knowledgeGrants("test")).thenReturn(List.of());
        var execution=new ExpertExecutionService(definitions,mock(TaskRepository.class),
                handlersWithMcp(mock(KnowledgeRepository.class),jdbc,definitions,mcp),new RulePackService(jdbc),
                Path.of("."),mock(SqlExpertService.class),sessions);

        var result=execution.execute("test",new ExpertExecutionService.Request("select id from users","",null,null,false,null));

        assertEquals(1,mcp.calls.size(),"声明并授权的专家可以调用该工具");
        assertEquals("test",mcp.calls.getFirst().expertId());
        assertEquals("registrydb",mcp.calls.getFirst().serverId());
        assertEquals(1,mcp.opened.size());
        assertTrue(mcp.opened.getFirst().closed,"执行结束后必须关闭该专家的会话，不能让状态留给下一位专家");
        assertEquals(0,sessions.openSessionCount());
        var nodes=(List<?>)result.get("nodes");
        assertEquals("succeeded",((Map<?,?>)nodes.get(1)).get("state"));
    }
}
