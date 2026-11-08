package com.lh.eap.application.service;

import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

/** Opt-in against an existing migrated local DB. No database/schema creation, reset or migration.
 * Owns only rows under one random project per test; removes exactly that project's rows afterward. */
@EnabledIfEnvironmentVariable(named = "EAP_RUN_BOARD_PERSISTENCE", matches = "true")
class BoardTaskPersistenceTest {
    private JdbcTemplate jdbc;
    private TransactionTemplate transaction;
    private BoardTaskService service;
    private final String project = "board-test-" + UUID.randomUUID();

    @BeforeEach void connect() throws Exception {
        var env = new StandardEnvironment();
        for (var source : new YamlPropertySourceLoader().load("application", new ClassPathResource("application.yml"))) env.getPropertySources().addLast(source);
        String url = env.getProperty("spring.datasource.url");
        assertTrue(url.startsWith("jdbc:postgresql://localhost:") || url.startsWith("jdbc:postgresql://127.0.0.1:"), "Only an existing local PostgreSQL is supported");
        var dataSource = new DriverManagerDataSource(url, env.getProperty("spring.datasource.username"), env.getProperty("spring.datasource.password"));
        jdbc = new JdbcTemplate(dataSource);
        transaction = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
        transaction.setTimeout(10);
        service = new BoardTaskService(jdbc);
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM information_schema.columns WHERE table_schema='eap' AND table_name='board_task' AND column_name='request_fingerprint'", Integer.class), "Apply the committed incremental migrations before running this test");
    }
    @AfterEach void removeOwnedRows() {
        if (jdbc != null) jdbc.update("DELETE FROM eap.board_task WHERE project_id=?", project);
    }
    private BoardTaskService.Draft draft() {
        return new BoardTaskService.Draft(project, "Persistent board test", "session-reference", "planned", "Implement a bounded task", "Build and test evidence is reviewable", UUID.randomUUID());
    }
    private BoardTaskService.Task create(BoardTaskService.Draft draft) {
        return transaction.execute(status -> service.create(draft));
    }
    private BoardTaskService.Task update(BoardTaskService.Task task, String notes) {
        return transaction.execute(status -> service.update(task.id(), new BoardTaskService.Update(project, task.revision(), "ready", notes, "p1", null, null)));
    }
    @Test void savesReopensAndRetriesOriginalCreationAfterEdits() {
        var request = draft(); var task = create(request);
        var saved = update(task, "independently checked");
        var reopened = new BoardTaskService(jdbc).list(project).getFirst();
        assertEquals(saved, reopened); assertEquals(request.goal(), reopened.goal());
        assertEquals(request.acceptanceCriteria(), reopened.acceptanceCriteria());
        assertEquals("ready", reopened.column()); assertEquals(2, reopened.revision());
        assertEquals(saved, create(request));
        assertEquals(1, service.list(project).size());
        assertTrue(service.list(project + "-other").isEmpty());
        assertEquals(404, assertThrows(ResponseStatusException.class, () -> transaction.execute(status -> service.update(task.id(), new BoardTaskService.Update(project + "-other", 2, "planned", null, null, null, null)))).getStatusCode().value());
        var changed = new BoardTaskService.Draft(project, "changed request", request.sessionId(), request.column(), request.goal(), request.acceptanceCriteria(), request.requestId());
        assertEquals("BOARD_REQUEST_CONFLICT", assertThrows(ResponseStatusException.class, () -> create(changed)).getReason());
    }
    @Test void concurrentCreationOfTheSameRequestProducesOneTask() throws Exception {
        var request = draft(); var barrier = new CyclicBarrier(2);
        try (var pool = Executors.newFixedThreadPool(2)) {
            Callable<BoardTaskService.Task> action = () -> { barrier.await(5, TimeUnit.SECONDS); return create(request); };
            var first = pool.submit(action); var second = pool.submit(action);
            assertEquals(first.get(15, TimeUnit.SECONDS).id(), second.get(15, TimeUnit.SECONDS).id());
            assertEquals(1, service.list(project).size());
        }
    }
    @Test void concurrentUpdatesHaveOneWinnerAndOrderedEvidence() throws Exception {
        var task = create(draft()); var barrier = new CyclicBarrier(2);
        try (var pool = Executors.newFixedThreadPool(2)) {
            Callable<String> action = () -> {
                barrier.await(5, TimeUnit.SECONDS);
                try { update(task, Thread.currentThread().getName()); return "saved"; }
                catch (ResponseStatusException conflict) { return conflict.getReason(); }
            };
            var first = pool.submit(action); var second = pool.submit(action);
            assertEquals(Set.of("saved", "BOARD_REVISION_CONFLICT"), Set.of(first.get(15, TimeUnit.SECONDS), second.get(15, TimeUnit.SECONDS)));
            var saved = service.list(project).getFirst();
            assertEquals(2, saved.revision());
            assertEquals(List.of("created", "ready", "notes_updated", "priority_updated"), saved.events());
        }
    }
}
