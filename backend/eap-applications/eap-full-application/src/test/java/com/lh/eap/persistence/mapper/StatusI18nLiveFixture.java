package com.lh.eap.persistence.mapper;

import com.lh.eap.EapApplication;
import com.lh.eap.ai.*;
import com.lh.eap.application.service.*;
import com.lh.eap.config.RuntimeWorkspace;
import com.lh.eap.delivery.*;
import java.lang.reflect.*;
import java.nio.file.*;
import java.sql.Connection;
import java.time.*;
import java.util.*;
import java.util.concurrent.atomic.*;
import javax.sql.DataSource;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.datasource.AbstractDataSource;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.json.JsonMapper;

/** Full product composition over an owned schema; only clock, provider and SQL failure are deterministic fixtures. */
public final class StatusI18nLiveFixture {
    static final JsonMapper JSON = JsonMapper.builder().build();
    static final AtomicReference<Instant> CLOCK = new AtomicReference<>(Instant.now());
    static final AtomicBoolean STORE_FAILURE = new AtomicBoolean();
    static final AtomicInteger MODEL_CALLS = new AtomicInteger();
    static String schema;

    public static void main(String[] args) throws Exception {
        var session = Path.of(args[0]).toAbsolutePath().normalize();
        schema = args[1];
        CurrentContractTestSchema.migrate(session, schema);
        System.setProperty("spring.devtools.restart.enabled", "false");
        var context = new SpringApplicationBuilder(EapApplication.class, Overrides.class).run(
                "--server.address=127.0.0.1", "--server.port=0", "--spring.flyway.enabled=false",
                "--spring.main.banner-mode=off", "--eap.ai.connection-store=" + session.resolve("connections.json"),
                "--eap.ai.artifact-root=" + session.resolve("artifacts"),
                "--eap.web.allowed-origins=http://127.0.0.1:5174");
        var connections = context.getBean(ModelConnections.class);
        var connection = connections.create("Deterministic provider failure fixture", "https://127.0.0.1:9/v1", "fixture-only", true, true);
        connections.configureModels(connection.id(), List.of(new ModelOption("fixture", List.of())), List.of("fixture"), "fixture");
        var app = context.getBean(AiChatApplication.class);
        var conversation = app.open("{}").conversationId();
        var changes = context.getBean(CodeChangeService.class);
        var generation = changes.prepareGeneration(RuntimeWorkspace.OPERATOR_LABEL, conversation, "frontend/source.ts", "", "");
        var proposal = changes.proposePrepared(RuntimeWorkspace.OPERATOR_LABEL, conversation, generation.id(),
                JSON.writeValueAsString(Map.of("summary", "Deterministic baseline-conflict fixture", "files", List.of(Map.of(
                        "path", "frontend/source.ts", "content", "export const value = 2;\n")))), true);
        var generationEn = changes.prepareGeneration(RuntimeWorkspace.OPERATOR_LABEL, conversation, "frontend/source.ts", "", "");
        var proposalEn = changes.proposePrepared(RuntimeWorkspace.OPERATOR_LABEL, conversation, generationEn.id(),
                JSON.writeValueAsString(Map.of("summary", "Deterministic English baseline-conflict fixture", "files", List.of(Map.of(
                        "path", "frontend/source.ts", "content", "export const value = 2;\n")))), true);
        Files.writeString(context.getBean(RuntimeWorkspace.class).workspace().resolve("frontend/source.ts"), "export const value = 3;\n");
        var tool = new ToolExecution(UUID.randomUUID(), UUID.randomUUID(), "git", "git-status",
                context.getBean(RuntimeWorkspace.class).workspace().toRealPath().toString(), "git", "UNKNOWN", false,
                Instant.now(), null, null, "", "", false, null, "SERVICE_RESTART_EXIT_UNCONFIRMED", List.of());
        context.getBean(ToolExecutionStore.class).insert(tool);
        // Own rows for the real aggregate query and workspace interlock: no process dispatch.
        var task = context.getBean(BoardTaskService.class).create(new BoardTaskService.Draft("status-i18n-qa", "Contract QA", "", "ready", "Verify contract", "Stable machine identity in both languages", UUID.randomUUID()));
        var manifest = new LinkedHashMap<String,Object>();
        manifest.put("pid", ProcessHandle.current().pid());manifest.put("port", context.getEnvironment().getProperty("local.server.port"));
        manifest.put("schema", schema);manifest.put("conversationId", conversation);manifest.put("proposalId", proposal.id());
        manifest.put("proposalIdEn", proposalEn.id());
        manifest.put("toolExecutionId", tool.id());manifest.put("taskId", task.id());manifest.put("modelConnectionId", connection.id());
        manifest.put("kind", "Full application, real JDBC and HTTP; deterministic clock/provider/failure injection; no external model");
        Files.writeString(session.resolve("host.json"), JSON.writeValueAsString(manifest));
    }

    @Configuration(proxyBeanMethods = false) @Import(Control.class)
    static class Overrides {
        @Bean @Primary DataSource qaDataSource() {
            var source = ToolUnknownReviewFixture.scopedDataSource(schema);
            return new AbstractDataSource() {
                public Connection getConnection() throws java.sql.SQLException { return guarded(source.getConnection()); }
                public Connection getConnection(String user, String password) throws java.sql.SQLException { return guarded(source.getConnection(user, password)); }
            };
        }
        @Bean @Primary AiConversationRegistry qaConversations(ChatMemory memory, WorkingMemoryStore store) {
            return new AiConversationRegistry(memory, CLOCK::get, store);
        }
        @Bean @Primary ModelClientSource qaClients() {
            return new ModelClientSource() {
                public ChatClient conversational(ModelConnectionSnapshot snapshot) {
                    ChatModel model = new ChatModel() {
                        public org.springframework.ai.chat.model.ChatResponse call(org.springframework.ai.chat.prompt.Prompt prompt) {
                            MODEL_CALLS.incrementAndGet(); throw new IllegalStateException("private fixture SQL and provider text");
                        }
                        public reactor.core.publisher.Flux<org.springframework.ai.chat.model.ChatResponse> stream(org.springframework.ai.chat.prompt.Prompt prompt) {
                            return reactor.core.publisher.Flux.defer(() -> {
                                MODEL_CALLS.incrementAndGet(); return reactor.core.publisher.Flux.error(new IllegalStateException("private fixture SQL and provider text"));
                            });
                        }
                    };
                    return ChatClient.builder(model).build();
                }
                public ChatClient completion(ModelConnectionSnapshot snapshot) { return conversational(snapshot); }
            };
        }
    }

    static Connection guarded(Connection connection) {
        return (Connection)Proxy.newProxyInstance(Connection.class.getClassLoader(), new Class<?>[]{Connection.class}, (proxy, method, args) -> {
            if (STORE_FAILURE.get() && method.getName().equals("prepareStatement") && args[0] instanceof String sql && sql.contains("tool_execution"))
                throw new java.sql.SQLException("private deterministic database failure", "08006");
            try { return method.invoke(connection, args); }
            catch (InvocationTargetException error) { throw error.getCause(); }
        });
    }

    @RestController @RequestMapping("/qa/status-i18n")
    static class Control {
        private final ChatExecutionJournal journal;
        Control(ChatExecutionJournal journal) { this.journal = journal; }
        @PostMapping("/store-failure") Map<String,Object> failure(@RequestBody Map<String,Boolean> body) {
            STORE_FAILURE.set(Boolean.TRUE.equals(body.get("enabled"))); return Map.of("enabled", STORE_FAILURE.get());
        }
        @PostMapping("/expire") Map<String,Object> expire() { CLOCK.updateAndGet(now -> now.plus(Duration.ofMinutes(31))); return Map.of("advancedMinutes", 31); }
        @GetMapping("/evidence") Map<String,Object> evidence() { return Map.of("modelCalls", MODEL_CALLS.get(), "storeFailure", STORE_FAILURE.get()); }
        @GetMapping("/journal") Map<String,Object> journal(@RequestParam UUID conversationId, @RequestParam UUID executionId) throws Exception {
            byte[] digest = java.security.MessageDigest.getInstance("SHA-256").digest(JSON.writeValueAsBytes(journal.snapshot(conversationId, executionId, 0)));
            return Map.of("sha256", java.util.HexFormat.of().formatHex(digest));
        }
    }
}
