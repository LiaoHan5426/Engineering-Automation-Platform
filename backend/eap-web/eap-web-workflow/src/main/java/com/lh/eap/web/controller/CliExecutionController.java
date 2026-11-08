package com.lh.eap.web.controller;

import com.lh.eap.api.*;
import java.util.UUID;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@RestController
@RequestMapping("/api/cli-executions")
public class CliExecutionController {
    private final ProcessExecutor executor;
    public CliExecutionController(ProcessExecutor executor){this.executor=executor;}
    @GetMapping public java.util.List<CliExecution.Snapshot> list(){return executor.snapshots();}
    @GetMapping("/{id}") public CliExecution.Snapshot status(@PathVariable UUID id){
        return executor.status(id).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND));
    }
    @PostMapping("/{id}/cancel") public CliExecution.Snapshot cancel(@PathVariable UUID id){
        return executor.cancel(id).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND));
    }
}
