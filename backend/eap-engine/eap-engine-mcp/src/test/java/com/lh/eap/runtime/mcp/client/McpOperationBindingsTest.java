package com.lh.eap.runtime.mcp.client;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.lh.eap.persistence.mapper.McpServerRegistry;
import com.lh.eap.application.service.McpServerService;
import com.lh.eap.core.CapabilityUsageQuery;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class McpOperationBindingsTest {
    static Map<String,Object> asr(){return Map.of("operation","ASR","tool","transcribe","expertId","voice-expert","approved",false,
            "inputSchema",Map.of("type","object","properties",Map.of("audio",Map.of("type","string"),"mime",Map.of("type","string")),"required",List.of("audio","mime")),
            "audioArgument","audio","mimeArgument","mime","textField","transcript","resultFormat","JSON");}
    @Test void typedSpeechRoundTripsAndRejectsWebFieldsUnknownOperationsAndUnmappedRequiredInputs(){
        var b=McpOperationBinding.parse(asr());assertInstanceOf(McpOperationBinding.Speech.class,b);assertEquals(asr(),b.wire());
        var bad=new HashMap<>(asr());bad.put("urlField","url");assertThrows(IllegalArgumentException.class,()->McpOperationBinding.parse(bad));
        var wrong=new HashMap<>(asr());wrong.put("operation","asr");assertThrows(IllegalArgumentException.class,()->McpOperationBinding.parse(wrong));
        var unknown=new HashMap<>(asr());unknown.put("inputSchema",Map.of("type","object","properties",Map.of("audio",Map.of("type","string"),"mime",Map.of("type","string")),"required",List.of("path")));
        assertThrows(IllegalArgumentException.class,()->McpOperationBinding.parse(unknown));
        assertThrows(IllegalArgumentException.class,()->McpOperationBinding.parseList(List.of(asr(),asr())));
    }
    @Test void draftSaveUsesCasAndNeverCreatesExpertGrants(){
        var jdbc=mock(JdbcTemplate.class);var registry=mock(McpServerRegistry.class);
        var service=new McpServerService(jdbc,registry,mock(CapabilityUsageQuery.class));
        when(jdbc.queryForList("SELECT id FROM eap.mcp_server WHERE id=? FOR UPDATE","chosen")).thenReturn(List.of(Map.of("id","chosen")));
        when(registry.find("chosen")).thenReturn(Optional.of(new McpServerRegistry.McpServer("chosen","Chosen","http","https://chosen.example/mcp",false,false,List.of())));
        assertThrows(org.springframework.web.server.ResponseStatusException.class,()->service.saveOperationBindings("chosen",7,List.of(asr())));
        verify(registry,never()).grants(any());
        verify(jdbc).update(contains("binding_revision=?"),any(),eq("chosen"),eq(7L));
    }
}
