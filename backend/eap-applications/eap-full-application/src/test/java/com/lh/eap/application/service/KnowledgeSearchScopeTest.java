package com.lh.eap.application.service;

import com.lh.eap.persistence.mapper.KnowledgeManagementMapper;
import com.lh.eap.persistence.mapper.KnowledgeRepository;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import java.util.List;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class KnowledgeSearchScopeTest {
    @Test void scopedSearchUsesOnlyRequestedExistingBase() {
        var repository = mock(KnowledgeRepository.class);
        var mapper = mock(KnowledgeManagementMapper.class);
        var service = new KnowledgeManagementService(repository, mapper);
        var id = UUID.randomUUID();
        when(mapper.exists(id)).thenReturn(true);
        when(repository.searchAuthorized("marker", 20, List.of(id))).thenReturn(List.of());
        assertEquals(List.of(), service.search("marker", 99, id).get("items"));
        verify(repository).searchAuthorized("marker", 20, List.of(id));
        verify(repository, never()).search(anyString(), anyInt());
    }
    @Test void missingBaseDoesNotFallBackToGlobalSearch() {
        var repository = mock(KnowledgeRepository.class);
        var service = new KnowledgeManagementService(repository, mock(KnowledgeManagementMapper.class));
        assertThrows(ResponseStatusException.class, () -> service.search("marker", 5, UUID.randomUUID()));
        verifyNoInteractions(repository);
    }
}
