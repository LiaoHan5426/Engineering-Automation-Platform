package com.lh.eap.web.controller;

import com.lh.eap.application.service.DatabaseProfileService;
import com.lh.eap.web.dto.DatabaseProfileRequest;
import java.util.Map;
import java.util.UUID;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/databases")
public class DatabaseInfoController {
    private final DatabaseProfileService service;
    public DatabaseInfoController(DatabaseProfileService service) { this.service = service; }
    @GetMapping
    public Map<String,Object> list() { return service.list(); }
    @GetMapping("/{id}")
    public Map<String,Object> detail(@PathVariable UUID id) { return service.detail(id); }
    @PostMapping
    public Map<String,Object> create(@RequestBody DatabaseProfileRequest request) { return service.create(request); }
    @PutMapping("/{id}")
    public Map<String,Object> update(@PathVariable UUID id, @RequestBody DatabaseProfileRequest request) { return service.update(id,request); }
    @DeleteMapping("/{id}")
    public Map<String,Object> remove(@PathVariable UUID id) { return service.remove(id); }
}
