package com.lh.eap.web;

import com.lh.eap.api.*;
import com.lh.eap.core.CapabilityRegistry;
import org.springframework.web.bind.annotation.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.file.Path;
import java.time.Instant;
import java.util.*;

@RestController
@RequestMapping("/api")
public class RuntimeController {
    private static final Logger log = LoggerFactory.getLogger(RuntimeController.class);
    private final CapabilityRegistry registry;
    private final CapabilityCatalog catalog;
    private final ProcessExecutor executor;
    private final Path workspace;
    private final TaskRepository taskRepository;

    public RuntimeController(CapabilityRegistry registry, CapabilityCatalog catalog, ProcessExecutor executor, Path workspace, TaskRepository taskRepository) {
        this.registry = registry;
        this.catalog = catalog;
        this.executor = executor;
        this.workspace = workspace;
        this.taskRepository = taskRepository;
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "ok", "service", "eap-runtime");
    }

    /**
     * The capability catalog: one entry per capability with its kind (built-in command / local CLI /
     * MCP tool / HTTP service), what it needs, what it publishes and which experts use it.
     */
    @GetMapping("/capabilities")
    public Map<String, Object> capabilities() {
        return catalog.catalog();
    }

    @GetMapping("/tasks")
    public Map<String, Object> tasks() {
        return Map.of("items", taskRepository.findAll(), "message", "Task persistence is backed by PostgreSQL");
    }

    @PostMapping("/tasks")
    public Map<String, Object> createTask(@RequestBody TaskRequest request) {
        if (request.goal() == null || request.goal().isBlank() || request.goal().length()>8000) throw new IllegalArgumentException("需求不能为空，最多8000字符");
        request=new TaskRequest(SensitiveData.redact(request.goal()));
        var id = UUID.randomUUID();
        log.info("Task {} started: goalLength={}", id, request.goal().length());
        var plan = DeterministicTaskPlanner.plan(request.goal());
        if (plan.capability() == null) {
            log.info("Task {} requires planning: no deterministic capability matched", id);
            var result = new LinkedHashMap<String, Object>();
            result.put("id", id); result.put("goal", request.goal()); result.put("status", "needs-planning"); result.put("decision", "needs-review"); result.put("createdAt", Instant.now().toString()); result.put("observations", List.of());
            taskRepository.save(id, request.goal(), "needs-planning", "needs-review", List.of());
            return result;
        }
        log.info("Task {} planned capability={}", id, plan.capability());
        var observations = List.of(registry.require(plan.capability()).execute(new ExecutionContext(workspace, executor), plan.args().toArray(String[]::new)));
        var success = observations.stream().allMatch(Observation::success);
        var result = new LinkedHashMap<String, Object>();
        result.put("id", id);
        result.put("goal", request.goal());
        result.put("status", success ? "completed" : "failed");
        result.put("decision", success ? "accepted" : "rejected");
        result.put("createdAt", Instant.now().toString());
        result.put("observations", observations);
        taskRepository.save(id, request.goal(), (String) result.get("status"), (String) result.get("decision"), observations);
        log.info("Task {} completed: status={}, decision={}, observations={}", id, result.get("status"), result.get("decision"), observations.size());
        return result;
    }

    public record TaskRequest(String goal) {
    }
    @GetMapping("/tasks/{id}")
    public Map<String,Object> task(@PathVariable UUID id) {
        return taskRepository.findById(id).orElseThrow(()->new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND,"任务不存在"));
    }
}
