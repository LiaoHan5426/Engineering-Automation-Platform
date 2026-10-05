package com.lh.eap.web;

import org.springframework.web.bind.annotation.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

@RestController
@RequestMapping("/api/knowledge")
public class KnowledgeController {
    private final KnowledgeRepository repository;
    private final JdbcTemplate jdbc;
    public KnowledgeController(KnowledgeRepository repository, JdbcTemplate jdbc) { this.repository = repository; this.jdbc = jdbc; }
    @GetMapping
    public Map<String, Object> list() { return Map.of("items", jdbc.queryForList("SELECT b.id,b.name,b.description,count(d.id) AS documents FROM eap.knowledge_base b LEFT JOIN eap.knowledge_document d ON d.knowledge_base_id=b.id GROUP BY b.id ORDER BY b.created_at DESC")); }
    @PostMapping
    public Map<String, Object> create(@RequestBody BaseRequest request) {
        if(SensitiveData.containsSecret(request.name())||SensitiveData.containsSecret(request.description()))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"名称或说明包含凭据，请脱敏后保存");
        if (request.name() == null || request.name().isBlank() || request.name().length()>200) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "知识库名称不能为空，最多200字符");
        var id = UUID.randomUUID();
        jdbc.update("INSERT INTO eap.knowledge_base(id,name,description) VALUES (?,?,?)", id, request.name(), request.description());
        return Map.of("id", id);
    }
    @GetMapping("/{id}/documents")
    public Map<String, Object> documents(@PathVariable UUID id) { return Map.of("items", jdbc.queryForList("SELECT d.id,d.object_key AS title,string_agg(c.content, '' ORDER BY c.chunk_index) AS content FROM eap.knowledge_document d LEFT JOIN eap.knowledge_chunk c ON c.document_id=d.id WHERE d.knowledge_base_id=? GROUP BY d.id ORDER BY d.created_at DESC", id)); }
    @PostMapping("/{id}/documents")
    @Transactional
    public Map<String, Object> addDocument(@PathVariable UUID id, @RequestBody DocumentRequest request) throws NoSuchAlgorithmException {
        if(SensitiveData.containsSecret(request.title())||SensitiveData.containsSecret(request.content()))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"知识文档含凭据或连接字符串，请脱敏后保存");
        if(!Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM eap.knowledge_base WHERE id=?)",Boolean.class,id)))throw new ResponseStatusException(HttpStatus.NOT_FOUND,"知识库不存在");
        if (request.title() == null || request.title().isBlank() || request.title().length()>1000 || request.content() == null || request.content().isBlank() || request.content().length() > 200000) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "标题最多1000字符，正文最多20万字符，请填写完整");
        var document = UUID.randomUUID();
        var hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(request.content().getBytes(StandardCharsets.UTF_8)));
        jdbc.update("INSERT INTO eap.knowledge_document(id,knowledge_base_id,object_key,content_sha256,media_type) VALUES (?,?,?,?,?)", document,id,request.title(),hash,"text/plain");
        int index = 0;
        for (int offset = 0; offset < request.content().length();) {
            int end=Math.min(offset+1500,request.content().length());
            if(end<request.content().length()&&Character.isHighSurrogate(request.content().charAt(end-1)))end--;
            jdbc.update("INSERT INTO eap.knowledge_chunk(id,document_id,chunk_index,content,embedding_model) VALUES (?,?,?,?,?)", UUID.randomUUID(),document,index++,request.content().substring(offset,end),"not-embedded");
            offset=end;
        }
        return Map.of("id",document,"chunks",index);
    }
    public record BaseRequest(String name, String description) { }
    public record DocumentRequest(String title, String content) { }
    @GetMapping("/search")
    public Map<String, Object> search(@RequestParam String q, @RequestParam(defaultValue = "5") int limit) { return Map.of("query", q, "items", repository.search(q, Math.min(Math.max(limit, 1), 20))); }
}
