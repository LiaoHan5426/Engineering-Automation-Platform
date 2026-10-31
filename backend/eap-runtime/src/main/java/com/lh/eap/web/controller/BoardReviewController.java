package com.lh.eap.web.controller;

import com.lh.eap.application.service.BoardReviewService;
import com.lh.eap.application.service.GitReviewCapture;
import java.util.*;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.json.JsonMapper;

@RestController
@RequestMapping("/api/board/tasks/{taskId}/runs/{executionId}/review")
public class BoardReviewController {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final BoardReviewService reviews;
    public BoardReviewController(BoardReviewService reviews) { this.reviews = reviews; }
    @GetMapping public BoardReviewService.Page get(@PathVariable UUID taskId, @PathVariable UUID executionId, @RequestParam String projectId) { return reviews.get(taskId, executionId, projectId); }
    @PostMapping public GitReviewCapture.Evidence collect(@PathVariable UUID taskId, @PathVariable UUID executionId, @RequestBody String body) {
        final Object parsed;
        try { parsed = JSON.readValue(body, Object.class); }
        catch (RuntimeException invalid) { throw new IllegalArgumentException("INVALID_BOARD_REVIEW_REQUEST"); }
        if (!(parsed instanceof Map<?,?> fields) || !fields.keySet().equals(Set.of("projectId", "workspacePath"))
                || !(fields.get("projectId") instanceof String project) || !(fields.get("workspacePath") instanceof String workspace)) throw new IllegalArgumentException("INVALID_BOARD_REVIEW_REQUEST");
        return reviews.collect(taskId, executionId, new BoardReviewService.Request(project, workspace));
    }
}
