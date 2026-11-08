package com.lh.eap.web.controller;

import com.lh.eap.application.service.BoardRunService;
import java.util.UUID;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/board/tasks/{taskId}/runs")
public class BoardRunController {
    private final BoardRunService runs;
    public BoardRunController(BoardRunService runs) { this.runs = runs; }
    @GetMapping public BoardRunService.Page list(@PathVariable UUID taskId, @RequestParam String projectId) { return runs.list(taskId, projectId); }
    @PostMapping public BoardRunService.Run start(@PathVariable UUID taskId, @RequestBody BoardRunService.Start request) { return runs.start(taskId, request); }
}
