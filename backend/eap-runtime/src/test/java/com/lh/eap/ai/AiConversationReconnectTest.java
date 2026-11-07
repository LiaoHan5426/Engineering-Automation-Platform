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

    @Test void strictConfirmationAndWorkspaceGuardRejectBeforeAnyRegistryAccess() throws Exception {
        var registry = mock(AiConversationRegistry.class);
        var chat = mock(EngineeringChatService.class);
        var connections = mock(ModelConnections.class);
        var app = new AiChatApplication(mock(AiConnectionStatus.class), registry, chat, root, connections);
        var mvc = MockMvcBuilders.standaloneSetup(new AiChatController(app)).setControllerAdvice(new ApiErrorHandler()).build();
        String label = tools.jackson.databind.json.JsonMapper.builder().build().writeValueAsString(AiConnectionStatus.workspaceLabel(root));
        String valid = "{\"confirmContextReset\":true,\"expectedWorkspaceLabel\":" + label + "}";
        String endpoint = "/api/ai/conversations/" + UUID.randomUUID() + "/reconnect";
        for (String body : java.util.List.of("", "{}", "null", "[]", "{", "{\"confirmContextReset\":true}",
                "{\"expectedWorkspaceLabel\":" + label + "}", valid.replace("true", "false"),
                valid.replace("true", "\"true\""), valid.replace("true", "null"),
                valid.replace(label, "null"), valid.replace(label, "42"), valid.replace(label, "\" \""),
                valid + " {}", valid.replace("}", ",\"extra\":true}"), valid.replace("}", ",\"confirmContextReset\":true}"))) {
            mvc.perform(post(endpoint).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest());
        }
        mvc.perform(post(endpoint).contentType(MediaType.APPLICATION_JSON).content(valid.replace(label, "\"old-workspace\"")))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.detail").value("CONVERSATION_WORKSPACE_CHANGED"));
        mvc.perform(post("/api/ai/conversations/not-a-uuid/reconnect").contentType(MediaType.APPLICATION_JSON).content(valid))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(registry, chat, connections);
    }

    @Test void missingSessionRecreatedWithSameIdentityEmptyMemoryAndNoDefaultOrModelCalls() throws Exception {
        var memory = MessageWindowChatMemory.builder().build();
        var registry = new AiConversationRegistry(memory);
        var chat = mock(EngineeringChatService.class);
        var connections = mock(ModelConnections.class);
        var statusService = mock(AiConnectionStatus.class);
        var app = new AiChatApplication(statusService, registry, chat, root, connections);
        var mvc = MockMvcBuilders.standaloneSetup(new AiChatController(app)).setControllerAdvice(new ApiErrorHandler()).build();
        var id = UUID.randomUUID();
        var key = EngineeringChatService.memoryKey(AiConversationRegistry.PRINCIPAL, id);
        memory.add(key, new UserMessage("orphan transcript"));
        String body = tools.jackson.databind.json.JsonMapper.builder().build().writeValueAsString(java.util.Map.of(
                "confirmContextReset", true, "expectedWorkspaceLabel", AiConnectionStatus.workspaceLabel(root)));
        mvc.perform(post("/api/ai/conversations/" + id + "/reconnect").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.conversationId").value(id.toString()))
                .andExpect(jsonPath("$.workspaceLabel").value(AiConnectionStatus.workspaceLabel(root)))
                .andExpect(jsonPath("$.memory").value(AiConversationRegistry.MEMORY_NOTE))
                .andExpect(jsonPath("$.contextReset").value(true)).andExpect(jsonPath("$.connectionId").isEmpty());
        assertEquals(root, registry.require(id).workspace);
        assertTrue(memory.get(key).isEmpty());
        mvc.perform(post("/api/ai/conversations/" + id + "/reconnect").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.contextReset").value(false));
        verifyNoInteractions(chat, connections, statusService);
    }
}
