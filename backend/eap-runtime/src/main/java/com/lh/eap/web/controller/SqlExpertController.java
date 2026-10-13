package com.lh.eap.web.controller;

import com.lh.eap.web.dto.SqlAnalysisRequest;

import com.lh.eap.application.service.ExpertExecutionService;

import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/sql")
public class SqlExpertController {
    private final ExpertExecutionService execution;
    public SqlExpertController(ExpertExecutionService execution){this.execution=execution;}
    @PostMapping("/analyze")
    public Map<String,Object> analyze(@RequestBody SqlAnalysisRequest request){
        return execution.execute(request.expertId()==null||request.expertId().isBlank()?"sql-expert":request.expertId(),
                new ExpertExecutionService.Request(request.sql(),request.question(),request.databaseId(),request.explainPlan(),request.enhanceWithModel(),request.pattern()));
    }
}
