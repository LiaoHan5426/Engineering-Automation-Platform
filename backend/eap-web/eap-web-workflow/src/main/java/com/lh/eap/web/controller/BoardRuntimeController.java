package com.lh.eap.web.controller;

import com.lh.eap.application.service.BoardRuntimeService;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** Core observation remains readable when the bundled board UI contribution is disabled. */
@RestController
@RequestMapping("/api/board/runtime")
public class BoardRuntimeController {
    private final BoardRuntimeService service;
    public BoardRuntimeController(BoardRuntimeService service) { this.service = service; }
    @GetMapping public BoardRuntimeService.Snapshot inspect(@RequestParam String projectId) { return service.inspect(projectId); }
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String,String>> invalid() { return ResponseEntity.badRequest().body(Map.of("detail", "INVALID_BOARD_FIELD")); }
    @ExceptionHandler(org.springframework.dao.DataAccessException.class)
    public ResponseEntity<Map<String,String>> unavailable() {
        return ResponseEntity.status(503).body(Map.of("detail", "BOARD_RUNTIME_OBSERVATION_UNAVAILABLE"));
    }
}
