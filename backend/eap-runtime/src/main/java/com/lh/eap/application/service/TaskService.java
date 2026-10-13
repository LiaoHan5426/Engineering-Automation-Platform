package com.lh.eap.application.service;

import com.lh.eap.api.*;
import com.lh.eap.core.CapabilityRegistry;
import com.lh.eap.persistence.mapper.TaskRepository;
import com.lh.eap.common.SensitiveData;
import com.lh.eap.web.dto.TaskRequest;
import java.nio.file.Path;
import java.time.Instant;
import java.util.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class TaskService {
    private static final Logger log = LoggerFactory.getLogger(TaskService.class);
    private final CapabilityRegistry registry;
    private final ProcessExecutor executor;
    private final Path workspace;
    private final TaskRepository taskRepository;
    private final CapabilitySettings settings;
    public TaskService(CapabilityRegistry registry,ProcessExecutor executor,Path workspace,TaskRepository taskRepository,CapabilitySettings settings) {
        this.registry=registry;this.executor=executor;this.workspace=workspace;this.taskRepository=taskRepository;this.settings=settings;
    }
    public Map<String,Object> list() { return Map.of("items",taskRepository.findAll()); }
    public Map<String,Object> statistics(int days) { return taskRepository.statistics(days).toMap(); }
    public Map<String,Object> detail(UUID id) { return taskRepository.findById(id).orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND,"任务不存在")); }
    public Map<String, Object> createTask(TaskRequest request) {
        if (request.goal() == null || request.goal().isBlank() || request.goal().length()>8000) throw new IllegalArgumentException("需求不能为空，最多8000字符");
        request=new TaskRequest(SensitiveData.redact(request.goal()));
        var id = UUID.randomUUID();
        log.info("Task {} started: goalLength={}", id, request.goal().length());
        var plan = DeterministicTaskPlanner.plan(request.goal());
        if (plan.capability() == null) {
            log.info("Task {} requires planning: no deterministic capability matched", id);
            var result = new LinkedHashMap<String, Object>();
            result.put("id", id); result.put("goal", request.goal()); result.put("status", "needs-planning"); result.put("decision", "needs-review"); result.put("createdAt", Instant.now().toString()); result.put("observations", List.of());
            // null, not "skipped": a planner task never reaches the judgement stage, and recording it as a
            // skipped model call would inflate the deterministic coverage the overview reports.
            taskRepository.save(id, request.goal(), "needs-planning", "needs-review", null, List.of());
            return result;
        }
        if (!settings.enabled(plan.capability())) throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT, "能力已在平台停用：" + plan.capability());
        log.info("Task {} planned capability={}", id, plan.capability());
        var raw = registry.require(plan.capability()).execute(new ExecutionContext(workspace, executor), plan.args().toArray(String[]::new));
        var observations = List.of(new Observation(raw.capability(), raw.success(), raw.exitCode(),
                SensitiveData.redact(raw.stdout()), SensitiveData.redact(raw.stderr()), raw.metadata()));
        var success = observations.stream().allMatch(Observation::success);
        var result = new LinkedHashMap<String, Object>();
        result.put("id", id);
        result.put("goal", request.goal());
        result.put("status", success ? "completed" : "failed");
        result.put("decision", success ? "accepted" : "rejected");
        result.put("createdAt", Instant.now().toString());
        result.put("observations", observations);
        taskRepository.save(id, request.goal(), (String) result.get("status"), (String) result.get("decision"), null, observations);
        log.info("Task {} completed: status={}, decision={}, observations={}", id, result.get("status"), result.get("decision"), observations.size());
        return result;
    }


}
