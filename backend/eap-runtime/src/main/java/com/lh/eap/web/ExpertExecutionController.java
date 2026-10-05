package com.lh.eap.web;

import java.util.Map;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/experts")
public class ExpertExecutionController {
    private final ExpertExecutionService execution;
    public ExpertExecutionController(ExpertExecutionService execution){this.execution=execution;}
    @PostMapping("/{id}/execute")
    public Map<String,Object> execute(@PathVariable String id,@RequestBody ExpertExecutionService.Request request){return execution.execute(id,request);}
}
