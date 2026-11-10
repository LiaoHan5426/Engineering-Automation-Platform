package com.lh.eap.persistence.mapper;

import com.lh.eap.EapApplication;
import com.lh.eap.ai.AiChatApplication;
import com.lh.eap.ai.AiConversationRegistry;
import com.lh.eap.ai.ChatClients;
import com.lh.eap.ai.ModelClientSource;
import com.lh.eap.ai.ModelConnectionSnapshot;
import com.lh.eap.ai.ModelConnections;
import com.lh.eap.ai.ModelOption;
import com.lh.eap.ai.WorkingMemoryStore;
import com.lh.eap.config.RuntimeWorkspace;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import javax.sql.DataSource;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Flux;
import tools.jackson.databind.json.JsonMapper;

/** Real full HTTP composition; only time and provider output are deterministic. No external model calls. */
public final class ConversationRecoveryLiveFixture {
    private static final AtomicReference<Instant> CLOCK = new AtomicReference<>(Instant.now());
    private static final AtomicInteger CALLS = new AtomicInteger();
    private static String schema;

    public static void main(String[] args) throws Exception {
        var session = Path.of(args[0]).toAbsolutePath().normalize();
        schema = "eap_unknown_qa_" + UUID.randomUUID().toString().replace("-", "");
        CurrentContractTestSchema.migrate(session, schema);
        System.setProperty("spring.devtools.restart.enabled", "false");
        var context = new SpringApplicationBuilder(EapApplication.class, Overrides.class).run(
                "--server.address=127.0.0.1", "--server.port=0", "--spring.flyway.enabled=false",
                "--spring.main.banner-mode=off", "--eap.runtime.authorized-root=" + session.resolve("workspace"),
                "--eap.ai.connection-store=" + session.resolve("connections.json"),
                "--eap.ai.artifact-root=" + session.resolve("artifacts"),
                "--eap.web.allowed-origins=http://127.0.0.1:5174");
        if (!context.getBean(RuntimeWorkspace.class).workspace().equals(session.resolve("workspace")))
            throw new IllegalStateException("Fixture workspace not isolated");
        var connections = context.getBean(ModelConnections.class);
        var target = connections.create("Recovery verification fixture", "http://127.0.0.1:9/v1", "fixture-only", true, true);
        connections.configureModels(target.id(), List.of(new ModelOption("fixture", List.of())), List.of("fixture"), "fixture");
        var conversation = context.getBean(AiChatApplication.class).open("{}");
        var manifest = Map.of("pid", ProcessHandle.current().pid(), "port", context.getEnvironment().getProperty("local.server.port"),
                "schema", schema, "conversationId", conversation.conversationId(), "workspaceLabel", conversation.workspaceLabel(),
                "connectionId", target.id(), "model", "fixture", "kind", "Full application, isolated schema/workspace, deterministic streaming provider");
        Files.writeString(session.resolve("host.json"), JsonMapper.builder().build().writeValueAsString(manifest));
    }

    @Configuration(proxyBeanMethods = false)
    @Import(Control.class)
    static class Overrides {
        @Bean @Primary DataSource qaDataSource() { return ToolUnknownReviewFixture.scopedDataSource(schema); }
        @Bean @Primary AiConversationRegistry qaConversations(ChatMemory memory, WorkingMemoryStore store) {
            return new AiConversationRegistry(memory, CLOCK::get, store);
        }
        @Bean @Primary ModelClientSource qaClients(ChatMemory memory) {
            return new ModelClientSource() {
                public ChatClient conversational(ModelConnectionSnapshot snapshot) {
                    return ChatClients.createClient(ChatClient.builder(new ChatModel() {
                        public ChatResponse call(Prompt prompt) { CALLS.incrementAndGet(); return response("verified"); }
                        public Flux<ChatResponse> stream(Prompt prompt) {
                            return Flux.defer(() -> {
                                CALLS.incrementAndGet();
                                return Flux.range(1, 20).delayElements(Duration.ofMillis(15)).map(index -> response("verified "));
                            });
                        }
                    }), memory);
                }
                public ChatClient completion(ModelConnectionSnapshot snapshot) { return conversational(snapshot); }
            };
        }
    }
    static ChatResponse response(String text) { return new ChatResponse(List.of(new Generation(new AssistantMessage(text)))); }

    @RestController
    @RequestMapping("/qa/conversation-recovery")
    static class Control {
        private final ChatMemory memory;
        Control(ChatMemory memory) { this.memory = memory; }
        @PostMapping("/expire") Map<String, Object> expire() {
            CLOCK.updateAndGet(now -> now.plus(Duration.ofMinutes(31)));
            return Map.of("expired", true);
        }
        @GetMapping("/evidence") Map<String, Object> evidence(@RequestParam("conversationId") UUID conversationId) {
            return Map.of("providerCalls", CALLS.get(), "externalModelCalls", 0,
                    "modelWindowMessages", memory.get(ChatClients.memoryKey(AiConversationRegistry.PRINCIPAL, conversationId)).size());
        }
    }
}
