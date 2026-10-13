package com.lh.eap.web.controller;

import com.lh.eap.application.service.ExpertManagementService;
import com.lh.eap.web.dto.ExpertDefinitionRequest;
import com.lh.eap.web.dto.ExpertActivationRequest;
import java.util.Map;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/experts")
public class ExpertController {
    private final ExpertManagementService service;
    public ExpertController(ExpertManagementService service) { this.service = service; }
    @GetMapping
    public Map<String,Object> list() { return service.list(); }
    @GetMapping("/catalog")
    public Map<String,Object> catalog() { return service.catalog(); }
    @PostMapping("/validate")
    public Map<String,Object> validate(@RequestBody ExpertDefinitionRequest request) { return service.validate(request); }
    @PostMapping
    public Map<String,Object> save(@RequestBody ExpertDefinitionRequest request) { return service.save(request); }
    @PutMapping("/{id}/activation")
    public Map<String,Object> activate(@PathVariable String id, @RequestBody ExpertActivationRequest request) { return service.activate(id,request); }
}
