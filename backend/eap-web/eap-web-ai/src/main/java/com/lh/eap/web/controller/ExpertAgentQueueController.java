package com.lh.eap.web.controller;

import com.lh.eap.ai.SqlExpertAgentScheduler;
import com.lh.eap.ai.SqlExpertAgentService;
import com.lh.eap.core.ExpertAgentJournal;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class ExpertAgentQueueController {
    private final SqlExpertAgentScheduler scheduler;
    private final ExpertAgentJournal journal;
    public ExpertAgentQueueController(SqlExpertAgentScheduler scheduler, ExpertAgentJournal journal) {
        this.scheduler = scheduler; this.journal = journal;
    }
    @PostMapping("/experts/{expertId}/agent-runs/{id}/queue")
    public ResponseEntity<ExpertAgentJournal.Entry> enqueue(@PathVariable String expertId, @PathVariable UUID id,
            @RequestBody SqlExpertAgentService.Request request) {
        return ResponseEntity.accepted().body(scheduler.enqueue(expertId, id, request));
    }
    @GetMapping("/expert-agent-runs")
    public Map<String,Object> list(@RequestParam(defaultValue = "50") int limit) {
        journal.recoverExpired();
        return Map.of("items", journal.list(limit), "automaticScheduling", scheduler.available());
    }
}
