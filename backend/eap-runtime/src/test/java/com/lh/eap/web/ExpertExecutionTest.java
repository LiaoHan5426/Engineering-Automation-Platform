package com.lh.eap.web;

import com.lh.eap.api.*;
import com.lh.eap.core.CapabilityRegistry;
import java.nio.file.Path;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import org.springframework.jdbc.core.JdbcTemplate;

class ExpertExecutionTest {
    @Test void requiredFailureBlocksDependentsAndPersistsEvidence(){
        var definitions=mock(ExpertDefinitionService.class);
        var knowledge=mock(KnowledgeRepository.class);
        var tasks=mock(TaskRepository.class);
        var model=mock(SqlExpertService.class);
        var manifest=new ExpertManifest("eap/v1","Expert","test","Test",List.of(),List.of(),
                List.of(new ExpertManifest.Step("knowledge","Knowledge","knowledge.search",true),new ExpertManifest.Step("parse","Parse","sql.parse",true)),
                List.of(new ExpertManifest.Edge("parse","knowledge")),List.of("database.credentials.never-expose"));
        when(definitions.require("test",true)).thenReturn(manifest);
        when(definitions.knowledgeGrants("test")).thenReturn(List.of());
        var execution=new ExpertExecutionService(definitions,knowledge,tasks,mock(JdbcTemplate.class),new CapabilityRegistry(),mock(ProcessExecutor.class),Path.of("."),model);
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
        var advice=SqlMetadataInspector.inspectIndexes(List.of(Map.of("table","task_observation","name","idx_task_id","columns",List.of("task_id"))),analysis);
        assertTrue(advice.getFirst().contains("idx_task_id"));
        assertTrue(advice.getFirst().contains("task_observation.task_id"));
    }
}
