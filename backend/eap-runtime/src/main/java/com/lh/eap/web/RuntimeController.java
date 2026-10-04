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
    private final ProcessExecutor executor;
    private final Path workspace;
    private final TaskRepository taskRepository;

    public RuntimeController(CapabilityRegistry registry, ProcessExecutor executor, Path workspace, TaskRepository taskRepository) {
        this.registry = registry;
        this.executor = executor;
        this.workspace = workspace;
        this.taskRepository = taskRepository;
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "ok", "service", "eap-runtime");
    }

    @GetMapping("/capabilities")
    public Map<String, List<String>> capabilities() {
        return Map.of("capabilities", registry.all().stream().map(Capability::name).toList());
    }

    @GetMapping("/tasks")
    public Map<String, Object> tasks() {
        return Map.of("items", taskRepository.findAll(), "message", "Task persistence is backed by PostgreSQL");
    }

    @PostMapping("/tasks")
    public Map<String, Object> createTask(@RequestBody TaskRequest request) {
        if (request.goal() == null || request.goal().isBlank()) throw new IllegalArgumentException("goal is required");
        var id = UUID.randomUUID();
        log.info("Task {} started: goal={}", id, request.goal());
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
}
