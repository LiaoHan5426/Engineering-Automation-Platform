package com.lh.eap.web.controller;
import com.lh.eap.web.i18n.ProblemResponses;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.dao.DataAccessException;
import org.springframework.http.ProblemDetail;
import com.lh.eap.error.BoardErrors;

import com.lh.eap.application.service.BoardRuntimeService;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** Core observation remains readable when the bundled board UI contribution is disabled. */
@RestController
@RequestMapping("/api/board/runtime")
public class BoardRuntimeController {
    private final BoardRuntimeService service;
    private final ProblemResponses problems;
    public BoardRuntimeController(BoardRuntimeService service, ProblemResponses problems) { this.service = service; this.problems = problems; }
    @GetMapping public BoardRuntimeService.Snapshot inspect(@RequestParam String projectId) { return service.inspect(projectId); }
    @ExceptionHandler(IllegalArgumentException.class)
    public ProblemDetail invalid(HttpServletRequest request, HttpServletResponse response) { return problems.create(400, BoardErrors.INVALID_BOARD_FIELD.code(), request, response); }
    @ExceptionHandler(DataAccessException.class)
    public ProblemDetail unavailable(HttpServletRequest request, HttpServletResponse response) {
        return problems.create(503, BoardErrors.BOARD_RUNTIME_OBSERVATION_UNAVAILABLE.code(), request, response);
    }
}
