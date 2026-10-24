package com.lh.eap.application.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.fail;

import com.lh.eap.persistence.mapper.JdbcPrototypeDeliveryStore;
import com.lh.eap.persistence.mapper.JdbcPrototypeVersionStore;
import java.sql.DriverManager;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicReference;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.core.env.MapPropertySource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;

/** Disposable-database acceptance. Ordinary runs skip this class and do not open a connection. */
@EnabledIfEnvironmentVariable(named = "EAP_RUN_CLI_INTEGRATION", matches = "true")
class PrototypeDeliveryAcceptanceTest {
    @Test
    void saveReopenAndConcurrentDeliveryLeaveTheFirstVersionAndExistingHandoff() throws Exception {
        var adminUrl = required("EAP_DB_URL");
        var user = required("EAP_DB_USERNAME");
        var password = required("EAP_DB_PASSWORD");
        if (!adminUrl.startsWith("jdbc:postgresql://127.0.0.1:") && !adminUrl.startsWith("jdbc:postgresql://localhost:")) {
            fail("集成测试仅允许本机 PostgreSQL");
        }
        var database = "eap_prototype_qa_" + UUID.randomUUID().toString().replace("-", "");
        var authorityEnd = adminUrl.indexOf('/', "jdbc:postgresql://".length());
        if (authorityEnd < 0) fail("数据库地址缺少库名");
        var testUrl = adminUrl.substring(0, authorityEnd + 1) + database + "?currentSchema=eap";
        try (var admin = DriverManager.getConnection(adminUrl, user, password)) {
            try (var statement = admin.createStatement()) {
                statement.execute("CREATE DATABASE \"" + database + "\"");
            }
            AnnotationConfigApplicationContext context = null;
            try {
                Flyway.configure().dataSource(testUrl, user, password).schemas("eap").defaultSchema("eap")
                        .locations("classpath:db/migration").load().migrate();
                context = new AnnotationConfigApplicationContext();
                context.register(IsolatedDb.class);
                context.getEnvironment().getPropertySources().addFirst(new MapPropertySource("prototype-test", Map.of(
                        "eap.test.db.url", testUrl,
                        "eap.test.db.username", user,
                        "eap.test.db.password", password)));
                context.refresh();
                var jdbc = context.getBean(JdbcTemplate.class);
                var service = new PrototypeVersionService(context.getBean(PrototypeVersionStore.class), context.getBean(PrototypeDeliveryStore.class));
                var handoff = UUID.randomUUID();
                jdbc.update("INSERT INTO eap.handoff(id, source, source_ref, summary) VALUES (?, 'builder', 'builder-alpha', ?)",
                        handoff, "自建交接摘要");
                var before = jdbc.queryForObject("SELECT count(*) FROM eap.handoff", Integer.class);
                var summary = jdbc.queryForObject("SELECT summary FROM eap.handoff WHERE id = ?", String.class, handoff);
                var first = service.save("builder-alpha", " 验收标题 \r\n", "验收正文", 3, java.util.List.of("看标题"));
                var reopened = service.find(first.id());
                assertEquals(first.contentHash(), reopened.contentHash());
                assertEquals(first.title(), reopened.title());
                assertEquals(first.body(), reopened.body());
                assertEquals(first.buttonPresses(), reopened.buttonPresses());
                assertEquals(PrototypeCanonical.INTERACTION, reopened.interaction());
                assertEquals(first.acceptance(), reopened.acceptance());
                assertEquals(reopened.contentHash(), PrototypeCanonical.of(reopened.sourceRef(), reopened.title(), reopened.body(),
                        reopened.buttonPresses(), reopened.acceptance()).hash());

                var second = service.save("builder-alpha", "验收标题", "另一段正文", 3, java.util.List.of("看标题"));
                var still = service.find(first.id());
                assertEquals(first.contentHash(), still.contentHash());
                assertEquals("验收正文", still.body());
                assertNotEquals(first.id(), second.id());

                var ready = new CountDownLatch(2);
                var start = new CountDownLatch(1);
                var left = new AtomicReference<PrototypeDelivery>();
                var right = new AtomicReference<PrototypeDelivery>();
                var firstWorker = new Thread(() -> deliver(service, first.id(), ready, start, left));
                var secondWorker = new Thread(() -> deliver(service, first.id(), ready, start, right));
                firstWorker.start();
                secondWorker.start();
                ready.await();
                start.countDown();
                firstWorker.join(10_000);
                secondWorker.join(10_000);
                assertEquals(left.get().id(), right.get().id());
                assertEquals(first.id(), left.get().versionId());
                assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM eap.prototype_delivery WHERE version_id = ?", Integer.class, first.id()));
                assertEquals(before, jdbc.queryForObject("SELECT count(*) FROM eap.handoff", Integer.class));
                assertEquals(summary, jdbc.queryForObject("SELECT summary FROM eap.handoff WHERE id = ?", String.class, handoff));
            } finally {
                if (context != null) context.close();
                if (!database.matches("eap_prototype_qa_[a-f0-9]{32}")) throw new IllegalStateException("拒绝清理非测试数据库");
                try (var terminate = admin.prepareStatement(
                        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = ? AND pid <> pg_backend_pid()")) {
                    terminate.setString(1, database);
                    terminate.execute();
                }
                try (var statement = admin.createStatement()) {
                    statement.execute("DROP DATABASE \"" + database + "\"");
                }
            }
        }
    }

    private static void deliver(PrototypeVersionService service, UUID versionId, CountDownLatch ready, CountDownLatch start,
                                AtomicReference<PrototypeDelivery> slot) {
        ready.countDown();
        try {
            start.await();
            slot.set(service.deliver(versionId));
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }

    private static String required(String name) {
        var value = System.getenv(name);
        if (value == null || value.isBlank()) fail(name + " 必须显式设置，测试不读取 application.yml，也不连接默认库");
        return value;
    }

    @Configuration
    @EnableTransactionManagement
    static class IsolatedDb {
        @Bean
        DataSource dataSource(Environment environment) {
            var source = new DriverManagerDataSource();
            source.setUrl(environment.getRequiredProperty("eap.test.db.url"));
            source.setUsername(environment.getRequiredProperty("eap.test.db.username"));
            source.setPassword(environment.getRequiredProperty("eap.test.db.password"));
            return source;
        }

        @Bean
        JdbcTemplate jdbcTemplate(DataSource dataSource) { return new JdbcTemplate(dataSource); }

        @Bean
        PlatformTransactionManager transactionManager(DataSource dataSource) { return new DataSourceTransactionManager(dataSource); }

        @Bean
        PrototypeVersionStore versions(JdbcTemplate jdbc) { return new JdbcPrototypeVersionStore(jdbc); }

        @Bean
        PrototypeDeliveryStore deliveries(JdbcTemplate jdbc) { return new JdbcPrototypeDeliveryStore(jdbc); }
    }
}
