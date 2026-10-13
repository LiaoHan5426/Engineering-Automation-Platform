package com.lh.eap.web.controller;

import com.lh.eap.application.service.CliProgramService;
import com.lh.eap.domain.model.CliOperation;
import com.lh.eap.domain.model.CliProgram;
import com.lh.eap.web.dto.CliOperationRequest;
import com.lh.eap.web.dto.CliProgramRequest;
import java.nio.file.Path;
import java.util.Map;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/cli-programs")
public class CliProgramController {
    private final CliProgramService service;
    private final Path workspace;
    public CliProgramController(CliProgramService service, Path workspace) { this.service = service; this.workspace = workspace; }
    @GetMapping public Map<String, Object> list() { return Map.of("items", service.list()); }
    @PostMapping public CliProgram register(@RequestBody CliProgramRequest request) { return service.register(request); }
    @PutMapping("/{id}") public Object configure(@PathVariable String id, @RequestBody CliProgramRequest request) { return service.configure(id, request.binary()); }
    @DeleteMapping("/{id}") public Map<String, String> delete(@PathVariable String id) { service.deleteProgram(id); return Map.of("status", "deleted"); }
    @PostMapping("/{id}/probe") public Map<String, Object> probe(@PathVariable String id) { return service.probe(id, workspace); }
    @PostMapping("/{id}/operations/{capabilityId}") public CliOperation createOperation(@PathVariable String id, @PathVariable String capabilityId, @RequestBody CliOperationRequest request) { return service.saveOperation(id, capabilityId, request, true); }
    @PutMapping("/{id}/operations/{capabilityId}") public CliOperation updateOperation(@PathVariable String id, @PathVariable String capabilityId, @RequestBody CliOperationRequest request) { return service.saveOperation(id, capabilityId, request, false); }
    @DeleteMapping("/{id}/operations/{capabilityId}") public Map<String, String> deleteOperation(@PathVariable String id, @PathVariable String capabilityId) { service.deleteOperation(id, capabilityId); return Map.of("status", "deleted"); }
}
