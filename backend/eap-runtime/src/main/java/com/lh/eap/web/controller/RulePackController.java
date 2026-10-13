package com.lh.eap.web.controller;

import com.lh.eap.application.service.RulePackManagementService;
import com.lh.eap.web.dto.RulePackRequest;
import com.lh.eap.web.dto.RuleActivationRequest;
import com.lh.eap.web.dto.RuleDryRunRequest;
import java.util.Map;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/rule-packs")
public class RulePackController {
    private final RulePackManagementService service;
    public RulePackController(RulePackManagementService service) { this.service = service; }
    @GetMapping
    public Map<String,Object> list() { return service.list(); }
    @GetMapping("/vocabulary")
    public Map<String,Object> vocabulary() { return service.vocabulary(); }
    @GetMapping("/{id}")
    public Map<String,Object> get(@PathVariable String id) { return service.get(id); }
    @PostMapping("/validate")
    public Map<String,Object> validate(@RequestBody RulePackRequest request) { return service.validate(request); }
    @PostMapping
    public Map<String,Object> create(@RequestBody RulePackRequest request) { return service.create(request); }
    @PutMapping("/{id}")
    public Map<String,Object> update(@PathVariable String id,@RequestBody RulePackRequest request) { return service.update(id,request); }
    @PutMapping("/{id}/activation")
    public Map<String,Object> activate(@PathVariable String id,@RequestBody RuleActivationRequest request) { return service.activate(id,request); }
    @DeleteMapping("/{id}")
    public Map<String,Object> delete(@PathVariable String id) { return service.delete(id); }
    @PostMapping("/dry-run")
    public Map<String,Object> dryRun(@RequestBody RuleDryRunRequest request) { return service.dryRun(request); }
}
