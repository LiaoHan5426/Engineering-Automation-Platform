package com.lh.eap.web.controller;
import com.lh.eap.application.service.BoardTaskService;
import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/board/tasks")
public class BoardTaskController {
    private final BoardTaskService tasks;
    public BoardTaskController(BoardTaskService tasks) { this.tasks = tasks; }
    @GetMapping public Map<String, Object> list(@RequestParam String projectId) { return Map.of("items", tasks.list(projectId)); }
    @PostMapping public BoardTaskService.Task create(@RequestBody BoardTaskService.Draft draft) { return tasks.create(draft); }
    @PostMapping("/{id}") public BoardTaskService.Task update(@PathVariable UUID id, @RequestBody BoardTaskService.Update update) { return tasks.update(id, update); }
}
