package com.lh.eap.application.service;
import com.lh.eap.error.KnowledgeErrors;

import com.lh.eap.application.dto.*;
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
    public record DocumentUpdate(String title, String content, String expectedHash) {}
    @Transactional
    public Map<String, Object> updateDocument(UUID base, UUID document, DocumentUpdate request) throws NoSuchAlgorithmException {
        if (request.title() == null || request.title().isBlank() || request.title().length() > 1000 || request.content() == null || request.content().isBlank() || request.content().length() > 200000 || request.expectedHash() == null || !request.expectedHash().matches("[a-f0-9]{64}"))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, KnowledgeErrors.KNOWLEDGE_DOCUMENT_INVALID.code());
        if (SensitiveData.containsSecret(request.title()) || SensitiveData.containsSecret(request.content()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, KnowledgeErrors.KNOWLEDGE_CONTENT_SECRET.code());
        var current = mapper.lockDocument(base, document);
        if (current.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, KnowledgeErrors.KNOWLEDGE_DOCUMENT_NOT_FOUND.code());
        if (!current.getFirst().equals(request.expectedHash()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, KnowledgeErrors.KNOWLEDGE_DOCUMENT_CHANGED.code());
        String hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(request.content().getBytes(StandardCharsets.UTF_8)));
        mapper.replaceDocument(base, document, request.title(), hash);
        int index = insertChunks(document, request.content());
        return Map.of("id", document, "chunks", index);
    }
    private int insertChunks(UUID document, String content) {
        int index = 0;
        for (int offset = 0; offset < content.length();) {
            int end = Math.min(offset + 1500, content.length());
            if (end < content.length() && Character.isHighSurrogate(content.charAt(end - 1))) end--;
            mapper.insertChunk(document, index++, content.substring(offset, end));
            offset = end;
        }
        return index;
    }
    private final KnowledgeRepository repository;
    private final KnowledgeManagementMapper mapper;
    public KnowledgeManagementService(KnowledgeRepository repository, KnowledgeManagementMapper mapper) { this.repository = repository; this.mapper = mapper; }

    public Map<String, Object> list() { return Map.of("items", mapper.list()); }

    public Map<String, Object> create(KnowledgeBaseRequest request) {
        if(SensitiveData.containsSecret(request.name())||SensitiveData.containsSecret(request.description()))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,KnowledgeErrors.KNOWLEDGE_CONTENT_SECRET.code());
        if (request.name() == null || request.name().isBlank() || request.name().length()>200) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,KnowledgeErrors.KNOWLEDGE_NAME_INVALID.code());
        var id = UUID.randomUUID();
        mapper.insertBase(id,request.name(),request.description());
        return Map.of("id", id);
    }

    public Map<String, Object> documents(UUID id) { return Map.of("items", mapper.documents(id)); }

    @Transactional
    public Map<String, Object> addDocument(UUID id, KnowledgeDocumentRequest request) throws NoSuchAlgorithmException {
        if(SensitiveData.containsSecret(request.title())||SensitiveData.containsSecret(request.content()))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,KnowledgeErrors.KNOWLEDGE_CONTENT_SECRET.code());
        if(!mapper.exists(id))throw new ResponseStatusException(HttpStatus.NOT_FOUND,KnowledgeErrors.KNOWLEDGE_BASE_NOT_FOUND.code());
        if (request.title() == null || request.title().isBlank() || request.title().length()>1000 || request.content() == null || request.content().isBlank() || request.content().length() > 200000) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,KnowledgeErrors.KNOWLEDGE_DOCUMENT_INVALID.code());
        var document = UUID.randomUUID();
        var hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(request.content().getBytes(StandardCharsets.UTF_8)));
        mapper.insertDocument(document,id,request.title(),hash);
        int index = insertChunks(document, request.content());
        return Map.of("id",document,"chunks",index);
    }

    public Map<String, Object> search(String q, int limit) { return Map.of("query", q, "items", repository.search(q, Math.min(Math.max(limit, 1), 20))); }

    public Map<String, Object> search(String q, int limit, UUID baseId) {
        if (baseId == null) return search(q, limit);
        if (!mapper.exists(baseId)) throw new ResponseStatusException(HttpStatus.NOT_FOUND,KnowledgeErrors.KNOWLEDGE_BASE_NOT_FOUND.code());
        return Map.of("query", q, "items", repository.searchAuthorized(q, Math.clamp(limit, 1, 20), List.of(baseId)));
    }

    public Map<String, Object> rename(UUID id, KnowledgeBaseRequest request) {
        if(SensitiveData.containsSecret(request.name())||SensitiveData.containsSecret(request.description()))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,KnowledgeErrors.KNOWLEDGE_CONTENT_SECRET.code());
        if (request.name() == null || request.name().isBlank() || request.name().length() > 200) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,KnowledgeErrors.KNOWLEDGE_NAME_INVALID.code());
        if (mapper.rename(id,request.name(),request.description()) == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND,KnowledgeErrors.KNOWLEDGE_BASE_NOT_FOUND.code());
        return Map.of("id", id, "status", "updated");
    }

    /** Refuses to delete a knowledge base that an enabled expert still depends on. */

    @Transactional
    public Map<String, Object> remove(UUID id) {
        var referenced = mapper.enabledReferences(id);
        if (!referenced.isEmpty()) throw new ResponseStatusException(HttpStatus.CONFLICT,KnowledgeErrors.KNOWLEDGE_BASE_IN_USE.code());
        if (mapper.deleteBase(id) == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND,KnowledgeErrors.KNOWLEDGE_BASE_NOT_FOUND.code());
        return Map.of("id", id, "status", "deleted");
    }

    @Transactional
    public Map<String, Object> removeDocument(UUID id, UUID documentId) {
        if (mapper.deleteDocument(id,documentId) == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,KnowledgeErrors.KNOWLEDGE_DOCUMENT_NOT_FOUND.code());
        }
        return Map.of("id", documentId, "status", "deleted");
    }
}
