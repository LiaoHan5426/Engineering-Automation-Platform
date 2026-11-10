package com.lh.eap.persistence.mapper;

import com.lh.eap.api.*;
import com.lh.eap.application.service.*;
import com.lh.eap.capability.GitCapability;
import com.lh.eap.config.RuntimeWorkspace;
import com.lh.eap.core.*;
import com.lh.eap.runtime.handler.*;
import com.lh.eap.web.AiBrowserRequestGuard;
import com.lh.eap.web.controller.ToolExecutionController;
import java.lang.reflect.*;
import java.nio.file.*;
import java.sql.Connection;
import java.time.Duration;
import java.util.*;
import javax.sql.DataSource;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import tools.jackson.databind.json.JsonMapper;

/** Test-only socket host: real service/controller/JDBC with explicit Java-substitute and unchanged-Git fault modes. */
public final class ToolUnknownReviewFixture {
    static final JsonMapper JSON = JsonMapper.builder().build();
    static Path session;
    static String schema;
    static boolean interrupt;
    static boolean realGit;
    static String operation;

    public static void main(String[] args) throws Exception {
        session = Path.of(args[0]).toAbsolutePath().normalize();
        schema = args[1];
        if (!schema.matches("eap_unknown_qa_[a-f0-9]{32}")) throw new IllegalArgumentException("Unowned schema");
        interrupt = Boolean.parseBoolean(args[2]);
        realGit = "real-git".equals(args[2]);
        operation = args.length > 3 ? args[3] : "git-status";
        if (!List.of("git-status", "git-diff").contains(operation)) throw new IllegalArgumentException("Unsupported fixture operation");
        System.setProperty("spring.devtools.restart.enabled", "false");
        var context = new SpringApplicationBuilder(Host.class).run(
                "--spring.config.name=tool-unknown-fixture", "--server.address=127.0.0.1", "--server.port=0",
                "--spring.flyway.enabled=false", "--spring.main.banner-mode=off",
                "--spring.ai.model.chat=none", "--spring.ai.model.embedding=none", "--spring.ai.model.image=none",
                "--spring.ai.model.audio.speech=none", "--spring.ai.model.audio.transcription=none", "--spring.ai.model.moderation=none",
                "--spring.mvc.problemdetails.enabled=true", "--eap.web.allowed-origins=http://127.0.0.1:5187");
        var port = context.getEnvironment().getProperty("local.server.port");
        Files.writeString(session.resolve("host.tmp"), JSON.writeValueAsString(Map.of("port", Integer.parseInt(port),
                "pid", ProcessHandle.current().pid())));
        Files.move(session.resolve("host.tmp"), session.resolve("host.json"), StandardCopyOption.ATOMIC_MOVE);
    }

    @Configuration(proxyBeanMethods = false) @EnableAutoConfiguration @EnableTransactionManagement
    @Import({ToolExecutionController.class, AiBrowserRequestGuard.class})
    static class Host {
        @Bean DataSource dataSource() { return scopedDataSource(schema); }
        @Bean PlatformTransactionManager transactionManager(DataSource source) { return new DataSourceTransactionManager(source); }
        @Bean JdbcToolExecutionStore store(DataSource source) { return new JdbcToolExecutionStore(new JdbcTemplate(source)); }
        @Bean CapabilitySettings settings(DataSource source) { return new CapabilitySettings(new JdbcTemplate(source), null); }
        @Bean CapabilityRegistry registry() {
            return new CapabilityRegistry().register(new GitCapability("status")).register(new GitCapability("diff"));
        }
        @Bean(destroyMethod = "close") DefaultProcessExecutor processExecutor() { return new DefaultProcessExecutor(Duration.ofMinutes(3)); }
        @Bean ToolExecutionService service(JdbcToolExecutionStore store, CapabilitySettings settings,
                                           CapabilityRegistry registry, DefaultProcessExecutor executor) {
            ProcessExecutor controlled = new ProcessExecutor() {
                public Observation run(String name, Path directory, List<String> command) { throw new UnsupportedOperationException(); }
                public Observation runManaged(UUID id, String name, Path directory, List<String> command,
                                               Map<String,String> environment, ManagedProcessControl control) {
                    if (realGit && command.contains(operation.substring(4))) {
                        // Preserve the actual Git executable, argument array, environment and executor.
                        var result = executor.runManaged(id, name, directory, command, environment, new ManagedProcessControl() {
                            public boolean cancellationRequested() { return control.cancellationRequested(); }
                            public void descendantsObserved(Map<String,Object> evidence) { control.descendantsObserved(evidence); }
                            public void started(Map<String,Object> identity) {
                                control.started(identity);
                                try {
                                    Files.writeString(session.resolve("git-started.tmp"), JSON.writeValueAsString(Map.of("identity", identity, "command", command)));
                                    Files.move(session.resolve("git-started.tmp"), session.resolve("git-started.json"), StandardCopyOption.ATOMIC_MOVE);
                                    long deadline = System.nanoTime() + Duration.ofSeconds(40).toNanos();
                                    while (!Files.exists(session.resolve("git-resume.request")) && System.nanoTime() < deadline) Thread.sleep(10);
                                    if (!Files.exists(session.resolve("git-resume.request"))) throw new IllegalStateException("Git fault handshake timed out");
                                } catch (Exception error) { throw new IllegalStateException("Git start gate failed", error); }
                            }
                        });
                        try {
                            Files.writeString(session.resolve("git-exited.tmp"), JSON.writeValueAsString(result));
                            Files.move(session.resolve("git-exited.tmp"), session.resolve("git-exited.json"), StandardCopyOption.ATOMIC_MOVE);
                            // Crash before workflow sees the actual abnormal exit; durable step stays RUNNING.
                            Thread.sleep(120_000);
                        } catch (Exception error) { throw new IllegalStateException("Git result gate interrupted", error); }
                        return result;
                    }
                    if (!interrupt) return executor.runManaged(id, name, directory, command, environment, control);
                    var java = Path.of(System.getProperty("java.home"), "bin", "java").toString();
                    var substitute = List.of(java, "-cp", System.getProperty("java.class.path"), Parent.class.getName(), session.toString());
                    return executor.runManaged(id, name, directory, substitute, environment, new ManagedProcessControl() {
                        public boolean cancellationRequested() { return control.cancellationRequested(); }
                        public void started(Map<String,Object> identity) { control.started(identity); }
                        public void descendantsObserved(Map<String,Object> evidence) {
                            control.descendantsObserved(evidence);
                            var children = (List<?>) evidence.get("processDescendants");
                            if (children.stream().noneMatch(value -> value instanceof Map<?,?> child
                                    && List.of("java", "java.exe").contains(Path.of(String.valueOf(child.get("processExecutable")))
                                            .getFileName().toString().toLowerCase(Locale.ROOT)))) return;
                            try {
                                long deadline = System.nanoTime() + Duration.ofSeconds(5).toNanos();
                                while (!Files.exists(session.resolve("child-ready.json")) && System.nanoTime() < deadline) Thread.sleep(10);
                                if (!Files.exists(session.resolve("child-ready.json"))) throw new IllegalStateException("Owned child did not initialize");
                                Files.writeString(session.resolve("captured.json"), JSON.writeValueAsString(evidence));
                                // Deliberately hold the execution at this committed evidence boundary until the host is killed.
                                Thread.sleep(120_000);
                            } catch (Exception error) { throw new IllegalStateException("Controlled crash gate interrupted", error); }
                        }
                    });
                }
            };
            var handlers = new CapabilityHandlerRegistry(List.of(new GitInspectionHandler(registry, executor)), settings);
            return new ToolExecutionService(store, RuntimeWorkspace.colocated(session.resolve("workspace"), "", ""),
                    settings, handlers, registry, controlled);
        }
    }

    static DriverManagerDataSource originalDataSource() {
        var env = System.getenv();
        var url = env.getOrDefault("EAP_DB_URL", "jdbc:postgresql://localhost:54321/postgres?currentSchema=eap");
        if (!url.startsWith("jdbc:postgresql://localhost:") && !url.startsWith("jdbc:postgresql://127.0.0.1:"))
            throw new IllegalArgumentException("Only the approved local test datasource");
        return new DriverManagerDataSource(url, env.getOrDefault("EAP_DB_USERNAME", "postgres"), env.get("EAP_DB_PASSWORD"));
    }
    static DataSource scopedDataSource(String ownedSchema) {
        if (!ownedSchema.matches("eap_unknown_qa_[a-f0-9]{32}")) throw new IllegalArgumentException("Unowned schema");
        var original = originalDataSource();
        return new AbstractDataSource() {
            public Connection getConnection() throws java.sql.SQLException { return relocate(original.getConnection(), ownedSchema); }
            public Connection getConnection(String user, String password) throws java.sql.SQLException {
                return relocate(original.getConnection(user, password), ownedSchema);
            }
        };
    }
    private static Connection relocate(Connection connection, String ownedSchema) {
        return (Connection) Proxy.newProxyInstance(Connection.class.getClassLoader(), new Class<?>[]{Connection.class},
                (proxy, method, args) -> {
                    if (args != null && args.length > 0 && args[0] instanceof String sql && method.getName().equals("prepareStatement")) {
                        args = args.clone(); args[0] = sql.replace("eap.", ownedSchema + ".");
                    }
                    try {
                        var result = method.invoke(connection, args);
                        if (method.getName().equals("createStatement")) {
                            var statement = (java.sql.Statement) result;
                            return Proxy.newProxyInstance(java.sql.Statement.class.getClassLoader(), new Class<?>[]{java.sql.Statement.class},
                                    (p, operation, values) -> {
                                        if (values != null && values.length > 0 && values[0] instanceof String sql) {
                                            values = values.clone(); values[0] = sql.replace("eap.", ownedSchema + ".");
                                        }
                                        try { return operation.invoke(statement, values); }
                                        catch (InvocationTargetException error) { throw error.getCause(); }
                                    });
                        }
                        return result;
                    }
                    catch (InvocationTargetException error) { throw error.getCause(); }
                });
    }

    public static class Parent {
        public static void main(String[] args) throws Exception {
            new ProcessBuilder(Path.of(System.getProperty("java.home"), "bin", "java").toString(),
                    "-cp", System.getProperty("java.class.path"), Child.class.getName(), args[0]).start();
            Thread.sleep(120_000);
        }
    }
    public static class Child {
        public static void main(String[] args) throws Exception {
            Files.writeString(Path.of(args[0]).resolve("child-ready.json"), "{\"pid\":" + ProcessHandle.current().pid() + "}");
            Thread.sleep(120_000);
        }
    }
}
