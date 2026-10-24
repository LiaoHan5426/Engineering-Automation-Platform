package com.lh.eap.ai;

import static org.junit.jupiter.api.Assertions.*;
import com.lh.eap.application.service.FileExecutionArtifactStore;
import com.lh.eap.config.RuntimeWorkspace;
import com.lh.eap.runtime.handler.CapabilityHandlerRegistry;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.memory.MessageWindowChatMemory;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

class EngineeringTaskFlowTest {
    @TempDir Path root;
    private static final String CODE = "{\"summary\":\"Vue component\",\"files\":[{\"path\":\"src/components/Checkout.vue\",\"content\":\"<template><button>Checkout</button></template>\"}]}";

    @Test void selectedExpertAndFilesReachModelAndExplicitReviewWritesSource() throws Exception {
        var observed = new AtomicReference<org.springframework.ai.chat.prompt.Prompt>();
        var handlers = new CapabilityHandlerRegistry(List.of());
        var memory = MessageWindowChatMemory.builder().maxMessages(20).build();
        var client = EngineeringAiConfiguration.createClient(ChatClient.builder(FakeChatModels.scripted(prompt -> {
            observed.set(prompt);
            return FakeChatModels.text(CODE);
        })), memory);
        var service = new EngineeringChatService(client, handlers, null, new FileExecutionArtifactStore(root.resolve("artifacts")));
        var status = new AiConnectionStatus(handlers, root, null, "openai", "offline", "https://api.openai.com", true);
        var app = new AiChatApplication(status, new AiConversationRegistry(memory), service, root);
        var changes = new CodeChangeService(new RuntimeWorkspace(root, root.toString(), ""));
        ReflectionTestUtils.setField(app, "codeChanges", changes);
        var versions = org.mockito.Mockito.mock(com.lh.eap.application.service.PrototypeVersionService.class);
        var versionId = UUID.fromString("116967fb-fcc8-49ec-a8a4-2042ae80ecb0");
        org.mockito.Mockito.when(versions.find(versionId)).thenReturn(new com.lh.eap.application.service.PrototypeVersion(
                versionId, "builder-alpha", "Saved checkout", "A saved design", 1, "button increments", List.of("Accessible button"), "hash", java.time.Instant.now()));
        ReflectionTestUtils.setField(app, "prototypes", versions);
        var id = app.open("{}").conversationId();
        var response = app.send(id, """
            {"message":"Implement checkout","toolMode":"none","context":{
              "mode":"code","expert":"frontend","instructions":"Use accessible labels",
              "prototypeVersionId":"116967fb-fcc8-49ec-a8a4-2042ae80ecb0",
              "files":[{"name":"design.md","content":"A checkout button"}]}}
            """);
        assertTrue(observed.get().getSystemMessage().getText().contains("Vue 3"));
        assertTrue(observed.get().getSystemMessage().getText().contains("accessible labels"));
        assertTrue(observed.get().getUserMessage().getText().contains("A checkout button"));
        assertTrue(observed.get().getUserMessage().getText().contains("Saved checkout"));
        assertTrue(observed.get().getUserMessage().getText().contains("Accessible button"));
        assertNotNull(response.proposal());
        assertFalse(Files.exists(root.resolve("src/components/Checkout.vue")));
        assertThrows(ResponseStatusException.class, () -> app.apply(id, response.proposal().id(), "{\"confirmed\":false}"));
        var result = app.apply(id, response.proposal().id(), "{\"confirmed\":true}");
        assertEquals(List.of("src/components/Checkout.vue"), result.written());
        assertEquals("not_requested", result.verification());
        assertEquals("<template><button>Checkout</button></template>", Files.readString(root.resolve(result.written().getFirst())));
    }

    @Test void readOnlyAndMissingRootCannotBeBypassedByApplyRequest() {
        var changes = new CodeChangeService(new RuntimeWorkspace(root, root.toString(), ""));
        var id = UUID.randomUUID();
        var readOnly = changes.propose(id, CODE, false);
        assertEquals("READ_ONLY_PROPOSAL", assertThrows(ResponseStatusException.class,
                () -> changes.apply(id, readOnly.id(), true)).getReason());
        var noRoot = new CodeChangeService(new RuntimeWorkspace(root, "", ""));
        var proposal = noRoot.propose(id, CODE);
        assertEquals("WORKSPACE_WRITE_NOT_AUTHORIZED", assertThrows(ResponseStatusException.class,
                () -> noRoot.apply(id, proposal.id(), true)).getReason());
    }

    @Test void userEditsAndCrossConversationRequestsArePreserved() throws Exception {
        Files.createDirectories(root.resolve("src/components"));
        Path target = root.resolve("src/components/Checkout.vue");
        Files.writeString(target, "before");
        var changes = new CodeChangeService(new RuntimeWorkspace(root, root.toString(), ""));
        var id = UUID.randomUUID();
        var proposal = changes.propose(id, CODE);
        Files.writeString(target, "user edit");
        assertThrows(ResponseStatusException.class, () -> changes.apply(UUID.randomUUID(), proposal.id(), true));
        assertEquals("FILE_CHANGED_SINCE_PROPOSAL", assertThrows(ResponseStatusException.class,
                () -> changes.apply(id, proposal.id(), true)).getReason());
        assertEquals("user edit", Files.readString(target));
    }

    @Test void unsafePathsAndOversizedContextAreRejected() {
        var changes = new CodeChangeService(new RuntimeWorkspace(root, root.toString(), ""));
        for (String path : List.of("../outside.ts", ".git/config", "C:/outside.ts", "src/../../file.ts", "package.json")) {
            assertThrows(ResponseStatusException.class, () -> changes.propose(UUID.randomUUID(), CODE.replace("src/components/Checkout.vue", path)));
        }
        assertThrows(ResponseStatusException.class, () -> TaskContext.parse(Map.of("files", List.of(Map.of("name", "large", "content", "x".repeat(16001))))));
        assertThrows(ResponseStatusException.class, () -> TaskContext.parse(Map.of("workspace", root.toString())));
    }
}
