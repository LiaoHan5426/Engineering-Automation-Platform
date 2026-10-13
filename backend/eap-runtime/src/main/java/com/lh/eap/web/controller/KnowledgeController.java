package com.lh.eap.web.controller;

import com.lh.eap.application.service.KnowledgeManagementService;
import com.lh.eap.web.dto.KnowledgeBaseRequest;
import com.lh.eap.web.dto.KnowledgeDocumentRequest;
import java.util.Map;
import java.util.UUID;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/knowledge")
public class KnowledgeController {
    private final KnowledgeManagementService service;
    public KnowledgeController(KnowledgeManagementService service) { this.service = service; }
    @GetMapping
    public Map<String,Object> list() { return service.list(); }
    @PostMapping
    public Map<String,Object> create(@RequestBody KnowledgeBaseRequest request) { return service.create(request); }
    @GetMapping("/{id}/documents")
    public Map<String,Object> documents(@PathVariable UUID id) { return service.documents(id); }
    @PostMapping("/{id}/documents")
    public Map<String,Object> addDocument(@PathVariable UUID id, @RequestBody KnowledgeDocumentRequest request) throws java.security.NoSuchAlgorithmException { return service.addDocument(id,request); }
    @GetMapping("/search")
    public Map<String,Object> search(@RequestParam String q, @RequestParam(defaultValue="5") int limit) { return service.search(q,limit); }
    @PutMapping("/{id}")
    public Map<String,Object> rename(@PathVariable UUID id, @RequestBody KnowledgeBaseRequest request) { return service.rename(id,request); }
    @DeleteMapping("/{id}")
    public Map<String,Object> remove(@PathVariable UUID id) { return service.remove(id); }
    @DeleteMapping("/{id}/documents/{documentId}")
    public Map<String,Object> removeDocument(@PathVariable UUID id, @PathVariable UUID documentId) { return service.removeDocument(id,documentId); }
}
