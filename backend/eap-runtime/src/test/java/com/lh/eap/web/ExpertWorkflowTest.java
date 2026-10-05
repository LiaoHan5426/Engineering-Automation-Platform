package com.lh.eap.web;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import org.springframework.jdbc.core.JdbcTemplate;
import java.util.*;

class ExpertWorkflowTest {
    private ExpertManifest graph(List<ExpertManifest.Step> steps,List<ExpertManifest.Edge> edges){
        return new ExpertManifest("eap/v1","Expert","test","Test",List.of(),List.of(),steps,edges,List.of("database.credentials.never-expose"));
    }
    private ExpertManifest.Step node(String id){return new ExpertManifest.Step(id,id,"sql.parse",true);}
    @Test void ordersByDependenciesNotNames(){
        var manifest=graph(List.of(node("last"),node("first"),node("middle")),List.of(new ExpertManifest.Edge("first","middle"),new ExpertManifest.Edge("middle","last")));
        assertTrue(ExpertGraph.validate(manifest).isEmpty());
        assertEquals(List.of("first","middle","last"),ExpertGraph.order(manifest).stream().map(ExpertManifest.Step::id).toList());
    }
    @Test void rejectsDisconnectedAndCyclicGraphs(){
        assertFalse(ExpertGraph.validate(graph(List.of(node("a"),node("b")),List.of())).isEmpty());
        assertTrue(ExpertGraph.validate(graph(List.of(node("a"),node("b")),List.of(new ExpertManifest.Edge("a","b"),new ExpertManifest.Edge("b","a")))).contains("流程存在循环连线"));
    }
    @Test void rejectsUnknownCapabilitiesAndMissingPrivacyRule(){
        var manifest=graph(List.of(new ExpertManifest.Step("a","A","shell.eval",true)),List.of());
        assertFalse(ExpertGraph.validate(manifest).isEmpty());
        assertFalse(ExpertGraph.validate(new ExpertManifest("eap/v1","Expert","test","Test",List.of(),List.of(),List.of(node("a")),List.of(),List.of())).isEmpty());
    }
    @Test void sqlUsesActualJoinColumns(){
        var result=DeterministicSqlAnalyzer.analyze("select a.id,b.success from task a join task_observation b on a.id=b.task_id");
        assertEquals("valid",result.get("parseStatus"));
        assertEquals(List.of("task","task_observation"),result.get("tables"));
        assertTrue(result.get("joinKeys").toString().contains("b.task_id"));
        assertTrue(result.get("suggestions").toString().contains("a.id = b.task_id"));
    }
    @Test void syntaxFailuresAreExplicit(){
        assertEquals("invalid",DeterministicSqlAnalyzer.analyze("SELECT FROM !").get("parseStatus"));
    }
    @Test void secretsAreRedactedAndMetadataRejectsCredentials(){
        assertFalse(SensitiveData.redact("password='hidden' jdbc:postgresql://private/db").contains("hidden"));
        assertFalse(SensitiveData.redact("password='hidden' jdbc:postgresql://private/db").contains("private/db"));
        assertTrue(SensitiveData.containsSecret(Map.of("tables",List.of(Map.of("password","hidden")))));
        assertFalse(SensitiveData.containsSecret(Map.of("tables",List.of(Map.of("name","orders")))));
        assertFalse(SensitiveData.redact("{\"password\":\"hidden\"}").contains("hidden"));
        assertEquals("valid",DeterministicSqlAnalyzer.analyze(SensitiveData.redact("select id from users where password='hidden'")).get("parseStatus"));
    }
    @Test void noKnowledgeGrantMeansNoDatabaseRead(){
        var jdbc=mock(JdbcTemplate.class);
        assertTrue(new KnowledgeRepository(jdbc).searchAuthorized("索引优化",5,List.of()).isEmpty());
        verifyNoInteractions(jdbc);
    }
    @Test void chineseRetrievalUsesLocalTerms(){
        assertTrue(KnowledgeRepository.terms("如何优化关联查询 索引").contains("索引"));
        assertFalse(KnowledgeRepository.terms("如何优化查询").contains("如何"));
    }
    @Test void manifestParserAcceptsEditorCoordinates(){
        var parsed=ExpertManifest.parse("""
          {"apiVersion":"eap/v1","kind":"Expert","id":"test","name":"Test","steps":[{"id":"a","capability":"sql.parse","required":true,"x":10,"y":20}],"edges":[],"rules":["database.credentials.never-expose"]}
          """);
        assertTrue(ExpertGraph.validate(parsed).isEmpty());
    }
}
