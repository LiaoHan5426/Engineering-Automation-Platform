package com.lh.eap.web.controller;

import com.lh.eap.application.dto.ScenarioConfiguration;
import com.lh.eap.application.dto.ScenarioWorkflowDependencies;
import com.lh.eap.application.service.ScenarioService;
import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/scenarios")
public class ScenarioController {
    private final ScenarioService service;
    public ScenarioController(ScenarioService service) { this.service = service; }
    @GetMapping
    public Map<String,Object> list() { return Map.of("items", service.list()); }
    @GetMapping("/workflows/{workflow}/dependencies")
    public ScenarioWorkflowDependencies dependencies(@PathVariable String workflow) {
        return service.dependencies(workflow);
    }
    @GetMapping("/{id}")
    public ScenarioConfiguration.Snapshot get(@PathVariable String id) { return service.get(id); }
    @PutMapping("/{id}")
    public ScenarioConfiguration.Snapshot save(@PathVariable String id, @RequestBody ScenarioConfiguration.Write request) {
        return service.save(id, request);
    }
    @DeleteMapping("/{id}")
    public Map<String,Object> delete(@PathVariable String id, @RequestParam long revision) {
        service.delete(id, revision);
        return Map.of("deleted", true);
    }
}
