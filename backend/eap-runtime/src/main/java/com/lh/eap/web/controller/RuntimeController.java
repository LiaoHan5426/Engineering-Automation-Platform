package com.lh.eap.web.controller;

import com.lh.eap.application.service.CapabilityCatalog;
import com.lh.eap.application.service.TaskService;
import com.lh.eap.web.dto.TaskRequest;
import java.util.Map;
import java.util.UUID;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class RuntimeController {
    private final CapabilityCatalog catalog;
    private final TaskService tasks;
    public RuntimeController(CapabilityCatalog catalog,TaskService tasks) { this.catalog=catalog;this.tasks=tasks; }
    @GetMapping("/health") public Map<String,String> health() { return Map.of("status","ok","service","eap-runtime"); }
    @GetMapping("/capabilities") public Map<String,Object> capabilities() { return catalog.catalog(); }
    @GetMapping("/tasks") public Map<String,Object> tasks() { return tasks.list(); }
    @GetMapping("/stats") public Map<String,Object> stats(@RequestParam(defaultValue="7") int windowDays) { return tasks.statistics(windowDays); }
    @PostMapping("/tasks") public Map<String,Object> createTask(@RequestBody TaskRequest request) { return tasks.createTask(request); }
    @GetMapping("/tasks/{id}") public Map<String,Object> task(@PathVariable UUID id) { return tasks.detail(id); }
}
