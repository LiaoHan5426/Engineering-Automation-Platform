package com.lh.eap.application.service;

import com.lh.eap.web.dto.*;
import org.springframework.stereotype.Service;

import com.lh.eap.persistence.mapper.KnowledgeRepository;
import com.lh.eap.common.SensitiveData;

import java.util.*;
import com.lh.eap.persistence.mapper.KnowledgeManagementMapper;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

@Service

public class KnowledgeManagementService {
    private final KnowledgeRepository repository;
    private final KnowledgeManagementMapper mapper;
    public KnowledgeManagementService(KnowledgeRepository repository, KnowledgeManagementMapper mapper) { this.repository = repository; this.mapper = mapper; }

    public Map<String, Object> list() { return Map.of("items", mapper.list()); }

    public Map<String, Object> create(KnowledgeBaseRequest request) {
        if(SensitiveData.containsSecret(request.name())||SensitiveData.containsSecret(request.description()))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"名称或说明包含凭据，请脱敏后保存");
        if (request.name() == null || request.name().isBlank() || request.name().length()>200) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "知识库名称不能为空，最多200字符");
        var id = UUID.randomUUID();
        mapper.insertBase(id,request.name(),request.description());
        return Map.of("id", id);
    }

    public Map<String, Object> documents(UUID id) { return Map.of("items", mapper.documents(id)); }

    @Transactional
    public Map<String, Object> addDocument(UUID id, KnowledgeDocumentRequest request) throws NoSuchAlgorithmException {
        if(SensitiveData.containsSecret(request.title())||SensitiveData.containsSecret(request.content()))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"知识文档含凭据或连接字符串，请脱敏后保存");
        if(!mapper.exists(id))throw new ResponseStatusException(HttpStatus.NOT_FOUND,"知识库不存在");
        if (request.title() == null || request.title().isBlank() || request.title().length()>1000 || request.content() == null || request.content().isBlank() || request.content().length() > 200000) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "标题最多1000字符，正文最多20万字符，请填写完整");
        var document = UUID.randomUUID();
        var hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(request.content().getBytes(StandardCharsets.UTF_8)));
        mapper.insertDocument(document,id,request.title(),hash);
        int index = 0;
        for (int offset = 0; offset < request.content().length();) {
            int end=Math.min(offset+1500,request.content().length());
            if(end<request.content().length()&&Character.isHighSurrogate(request.content().charAt(end-1)))end--;
            mapper.insertChunk(document,index++,request.content().substring(offset,end));
            offset=end;
        }
        return Map.of("id",document,"chunks",index);
    }

    public Map<String, Object> search(String q, int limit) { return Map.of("query", q, "items", repository.search(q, Math.min(Math.max(limit, 1), 20))); }

    public Map<String, Object> rename(UUID id, KnowledgeBaseRequest request) {
        if(SensitiveData.containsSecret(request.name())||SensitiveData.containsSecret(request.description()))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"名称或说明包含凭据，请脱敏后保存");
        if (request.name() == null || request.name().isBlank() || request.name().length() > 200) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "知识库名称不能为空，最多200字符");
        if (mapper.rename(id,request.name(),request.description()) == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "知识库不存在");
        return Map.of("id", id, "status", "updated");
    }

    /** Refuses to delete a knowledge base that an enabled expert still depends on. */

    @Transactional
    public Map<String, Object> remove(UUID id) {
        var referenced = mapper.enabledReferences(id);
        if (!referenced.isEmpty()) throw new ResponseStatusException(HttpStatus.CONFLICT, "知识库正被已启用的专家引用：" + referenced);
        if (mapper.deleteBase(id) == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "知识库不存在");
        return Map.of("id", id, "status", "deleted");
    }

    @Transactional
    public Map<String, Object> removeDocument(UUID id, UUID documentId) {
        if (mapper.deleteDocument(id,documentId) == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "知识文档不存在");
        }
        return Map.of("id", documentId, "status", "deleted");
    }
}
