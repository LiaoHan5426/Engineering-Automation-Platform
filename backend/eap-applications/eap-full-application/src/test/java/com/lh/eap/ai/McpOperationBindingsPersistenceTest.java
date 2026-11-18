package com.lh.eap.ai;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import com.lh.eap.application.service.McpServerService;
import com.lh.eap.core.CapabilityUsageQuery;
import com.lh.eap.persistence.mapper.McpServerRegistry;
import com.lh.eap.web.controller.*;
import com.lh.eap.web.i18n.*;
import org.junit.jupiter.api.*;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.transaction.interceptor.*;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import tools.jackson.databind.json.JsonMapper;

/** Actual isolated H2 + V4 DDL. PostgreSQL driver behavior is not claimed by this test. */
class McpOperationBindingsPersistenceTest {
    JdbcTemplate jdbc;McpServerRegistry registry;McpServerService service;MockMvc mvc;
    @BeforeEach void setup(){
        var data=new DriverManagerDataSource("jdbc:h2:mem:mcp_"+UUID.randomUUID()+";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1","sa","");
        // H2 treats a JDBC String cast to JSON as a JSON string. Binary binding is H2's native raw JSON bridge.
        jdbc=new JdbcTemplate(data){@Override public int update(String sql,Object...args){
            if(sql.contains("operation_bindings=?::jsonb")&&args[0] instanceof String json){args=args.clone();args[0]=json.getBytes(StandardCharsets.UTF_8);}return super.update(sql,args);
        }};
        jdbc.execute("CREATE SCHEMA eap");
        jdbc.execute("CREATE TABLE eap.mcp_server(id VARCHAR PRIMARY KEY,name VARCHAR,transport VARCHAR,endpoint VARCHAR,trusted BOOLEAN,enabled BOOLEAN,tools VARCHAR)");
        jdbc.execute("CREATE TABLE eap.expert_mcp_grant(expert_id VARCHAR,capability VARCHAR)");
        new ResourceDatabasePopulator(new ClassPathResource("db/migration/V4__mcp_operation_bindings.sql")).execute(data);
        jdbc.update("INSERT INTO eap.mcp_server(id,name,transport,endpoint,trusted,enabled,tools) VALUES(?,?,?,?,?,?,?)","voice","Voice","http","http://127.0.0.1:1/mcp",true,true,"[\"transcribe\"]");
        jdbc.update("UPDATE eap.mcp_server SET operation_bindings=?::jsonb WHERE id=?","[]","voice");
        jdbc.update("INSERT INTO eap.expert_mcp_grant VALUES(?,?)","expert","mcp.voice.transcribe");
        registry=new McpServerRegistry(jdbc);
        var source=new AnnotationTransactionAttributeSource();
        var proxy=new ProxyFactory(new McpServerService(jdbc,registry,mock(CapabilityUsageQuery.class)));proxy.setProxyTargetClass(true);
        proxy.addAdvice(new TransactionInterceptor(new DataSourceTransactionManager(data),source));service=(McpServerService)proxy.getProxy();
        var problems=new ProblemResponses(PlatformMessagesConfiguration.source(PlatformMessagesConfiguration.PRODUCT_BASENAMES));
        mvc=MockMvcBuilders.standaloneSetup(new McpManagementController(service)).setControllerAdvice(new ApiErrorHandler(problems)).build();
    }
    @Test void operatorHttpSaveCasSurvivesRegistryRecreationAndCapturesEndpoint() throws Exception {
        var binding=binding();
        mvc.perform(put("/api/mcp-servers/voice/operation-bindings").contentType(MediaType.APPLICATION_JSON).content(json(Map.of("expectedRevision",0,"bindings",List.of(binding)))))
            .andExpect(status().isOk()).andExpect(jsonPath("$.revision").value(1)).andExpect(jsonPath("$.bindings[0].expertId").value("expert"));
        mvc.perform(get("/api/mcp-servers/voice/operation-bindings")).andExpect(status().isOk()).andExpect(jsonPath("$.bindings[0].operation").value("ASR"));
        var reloaded=new McpServerRegistry(jdbc).operationBindings("voice");assertEquals(1,reloaded.revision());assertEquals("http://127.0.0.1:1/mcp",reloaded.endpoint());assertEquals("http",reloaded.transport());
        mvc.perform(put("/api/mcp-servers/voice/operation-bindings").contentType(MediaType.APPLICATION_JSON).content(json(Map.of("expectedRevision",0,"bindings",List.of()))))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("TOOL_BINDING_CHANGED"));
        assertEquals(1,new McpServerRegistry(jdbc).operationBindings("voice").bindings().size());
    }
    @Test void endpointReplacementKeepsOldApprovalPinnedAndRejectsStaleEditorPut() throws Exception {
        var editorA=service.saveOperationBindings("voice",0,List.of(binding()));long draftRevision=((Number)editorA.get("revision")).longValue();
        // H2 cannot execute PostgreSQL ON CONFLICT DO UPDATE. This exercises the HTTP CAS after a committed endpoint edit;
        // actual McpServerService.save upsert revision increment is reserved for the PostgreSQL integration harness.
        new org.springframework.transaction.support.TransactionTemplate(new DataSourceTransactionManager(jdbc.getDataSource())).executeWithoutResult(tx->
            jdbc.update("UPDATE eap.mcp_server SET endpoint=?,binding_revision=binding_revision+1 WHERE id=?","http://127.0.0.1:2/mcp","voice"));
        assertEquals("http://127.0.0.1:1/mcp",registry.operationBindings("voice").endpoint());
        assertEquals("http://127.0.0.1:2/mcp",registry.find("voice").orElseThrow().endpoint());
        mvc.perform(put("/api/mcp-servers/voice/operation-bindings").contentType(MediaType.APPLICATION_JSON).content(json(Map.of("expectedRevision",draftRevision,"bindings",List.of(binding())))))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("TOOL_BINDING_CHANGED"));
        assertEquals(draftRevision+1,registry.operationBindings("voice").revision());assertEquals("http://127.0.0.1:1/mcp",registry.operationBindings("voice").endpoint());
    }
    @Test void missingGrantAndForgedEndpointAreRejectedWithoutChangingAuthority() throws Exception {
        jdbc.update("DELETE FROM eap.expert_mcp_grant");
        mvc.perform(put("/api/mcp-servers/voice/operation-bindings").contentType(MediaType.APPLICATION_JSON).content(json(Map.of("expectedRevision",0,"bindings",List.of(binding())))))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("MCP_TOOL_NOT_AUTHORIZED"));
        var forged=new LinkedHashMap<>(binding());forged.put("endpoint","http://forged.invalid");
        mvc.perform(put("/api/mcp-servers/voice/operation-bindings").contentType(MediaType.APPLICATION_JSON).content(json(Map.of("expectedRevision",0,"bindings",List.of(forged)))))
            .andExpect(status().isBadRequest());assertEquals(0,registry.operationBindings("voice").revision());
    }
    static Map<String,Object> binding(){return Map.of("operation","ASR","tool","transcribe","expertId","expert","approved",true,
        "inputSchema",Map.of("type","object","properties",Map.of("audio",Map.of("type","string"),"mime",Map.of("type","string")),"required",List.of("audio","mime"),"additionalProperties",false),
        "audioArgument","audio","mimeArgument","mime","textField","text","resultFormat","JSON");}
    static String json(Object value){return JsonMapper.builder().build().writeValueAsString(value);}
}
