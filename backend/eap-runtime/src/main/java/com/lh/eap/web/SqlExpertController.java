package com.lh.eap.web;

import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/sql")
public class SqlExpertController {
    private final ExpertExecutionService execution;
    public SqlExpertController(ExpertExecutionService execution){this.execution=execution;}
    @PostMapping("/analyze")
    public Map<String,Object> analyze(@RequestBody Request request){
        return execution.execute(request.expertId()==null||request.expertId().isBlank()?"sql-expert":request.expertId(),
                new ExpertExecutionService.Request(request.sql(),request.question(),request.databaseId(),request.explainPlan(),request.enhanceWithModel(),request.pattern()));
    }
    public record Request(String sql,String question,String expertId,UUID databaseId,Map<String,Object> explainPlan,Boolean enhanceWithModel,String pattern){}
}
