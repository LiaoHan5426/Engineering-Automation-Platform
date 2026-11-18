package com.lh.eap.ai;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.lh.eap.web.controller.AiChatController;
import com.lh.eap.web.controller.ApiErrorHandler;
import java.nio.file.Path;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.ai.chat.memory.MessageWindowChatMemory;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class AiConversationReconnectTest {
    @TempDir Path root;

    @Test void rejectedTargetDoesNotCreateOrResetAConversation() throws Exception {
        var registry = mock(AiConversationRegistry.class);
        var connections = mock(ModelConnections.class);
        var target = UUID.randomUUID();
        when(connections.requireModel(target, "denied")).thenThrow(new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.FORBIDDEN, "MODEL_NOT_ALLOWED"));
        var app = ChatApplicationTestSupport.graph(new AiChatApplication(mock(AiConnectionStatus.class), registry, mock(EngineeringChatService.class), root, connections));
        var body = tools.jackson.databind.json.JsonMapper.builder().build().writeValueAsString(java.util.Map.of(
                "confirmContextReset", true, "expectedWorkspaceLabel", AiConnectionStatus.workspaceLabel(root),
                "connectionId", target.toString(), "model", "denied"));
        var failure = assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> app.reconnect(UUID.randomUUID(), body));
        assertEquals(403, failure.getStatusCode().value());
        verifyNoInteractions(registry);
        verify(connections).requireModel(target, "denied");
        verifyNoMoreInteractions(connections);
    }

    @Test void strictConfirmationAndWorkspaceGuardRejectBeforeAnyRegistryAccess() throws Exception {
        var registry = mock(AiConversationRegistry.class);
        var chat = mock(EngineeringChatService.class);
        var connections = mock(ModelConnections.class);
        var app = ChatApplicationTestSupport.graph(new AiChatApplication(mock(AiConnectionStatus.class), registry, chat, root, connections));
        var mvc = MockMvcBuilders.standaloneSetup(new AiChatController(app, new com.lh.eap.web.i18n.ProblemResponses(com.lh.eap.web.i18n.PlatformMessagesConfiguration.source(com.lh.eap.web.i18n.PlatformMessagesConfiguration.PRODUCT_BASENAMES)))).setControllerAdvice(new ApiErrorHandler(new com.lh.eap.web.i18n.ProblemResponses(com.lh.eap.web.i18n.PlatformMessagesConfiguration.source(com.lh.eap.web.i18n.PlatformMessagesConfiguration.PRODUCT_BASENAMES)))).build();
        String label = tools.jackson.databind.json.JsonMapper.builder().build().writeValueAsString(AiConnectionStatus.workspaceLabel(root));
        String valid = "{\"confirmContextReset\":true,\"expectedWorkspaceLabel\":" + label + ",\"connectionId\":\"" + UUID.randomUUID() + "\",\"model\":\"m\"}";
        String endpoint = "/api/ai/conversations/" + UUID.randomUUID() + "/reconnect";
        for (String body : java.util.List.of("", "{}", "null", "[]", "{", "{\"confirmContextReset\":true}",
                "{\"expectedWorkspaceLabel\":" + label + "}", valid.replace("true", "false"),
                valid.replace("true", "\"true\""), valid.replace("true", "null"),
                valid.replace(label, "null"), valid.replace(label, "42"), valid.replace(label, "\" \""),
                valid + " {}", valid.replace("}", ",\"extra\":true}"), valid.replace("}", ",\"confirmContextReset\":true}"))) {
            mvc.perform(post(endpoint).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest());
        }
        mvc.perform(post(endpoint).contentType(MediaType.APPLICATION_JSON).content(valid.replace(label, "\"old-workspace\"")))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CONVERSATION_WORKSPACE_CHANGED"));
        mvc.perform(post("/api/ai/conversations/not-a-uuid/reconnect").contentType(MediaType.APPLICATION_JSON).content(valid))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(registry, chat, connections);
    }

    @Test void missingSessionRecreatedAndBoundWithSameIdentityEmptyMemoryAndNoDefaultOrModelCalls() throws Exception {
        var memory = MessageWindowChatMemory.builder().build();
        var registry = new AiConversationRegistry(memory);
        var chat = mock(EngineeringChatService.class);
        var connections = mock(ModelConnections.class);
        var target = new ModelConnectionSnapshot(UUID.randomUUID(), "Explicit", "api-key", true,
                "http://localhost:12345", "m", "test-key", 1, false, "r");
        when(connections.requireModel(target.id, "m")).thenReturn(target);
        var statusService = mock(AiConnectionStatus.class);
        var app = ChatApplicationTestSupport.graph(new AiChatApplication(statusService, registry, chat, root, connections));
        var mvc = MockMvcBuilders.standaloneSetup(new AiChatController(app, new com.lh.eap.web.i18n.ProblemResponses(com.lh.eap.web.i18n.PlatformMessagesConfiguration.source(com.lh.eap.web.i18n.PlatformMessagesConfiguration.PRODUCT_BASENAMES)))).setControllerAdvice(new ApiErrorHandler(new com.lh.eap.web.i18n.ProblemResponses(com.lh.eap.web.i18n.PlatformMessagesConfiguration.source(com.lh.eap.web.i18n.PlatformMessagesConfiguration.PRODUCT_BASENAMES)))).build();
        var id = UUID.randomUUID();
        ChatApplicationTestSupport.rememberConversation(app, id);
        var key = EngineeringChatService.memoryKey(AiConversationRegistry.PRINCIPAL, id);
        memory.add(key, new UserMessage("orphan transcript"));
        String body = tools.jackson.databind.json.JsonMapper.builder().build().writeValueAsString(java.util.Map.of(
                "confirmContextReset", true, "expectedWorkspaceLabel", AiConnectionStatus.workspaceLabel(root),
                "connectionId", target.id.toString(), "model", "m"));
        mvc.perform(post("/api/ai/conversations/" + id + "/reconnect").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.conversationId").value(id.toString()))
                .andExpect(jsonPath("$.workspaceLabel").value(AiConnectionStatus.workspaceLabel(root)))
                .andExpect(jsonPath("$.memory").value(AiConversationRegistry.MEMORY_NOTE))
                .andExpect(jsonPath("$.contextReset").value(true)).andExpect(jsonPath("$.connectionId").value(target.id.toString()));
        assertEquals(root, registry.require(id).workspace);
        assertTrue(memory.get(key).isEmpty());
        mvc.perform(post("/api/ai/conversations/" + id + "/reconnect").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.contextReset").value(false));
        verify(connections, times(2)).requireModel(target.id, "m");
        verify(connections, times(2)).chatClient(target);
        verifyNoMoreInteractions(connections);
        verifyNoInteractions(chat, statusService);
    }
}
