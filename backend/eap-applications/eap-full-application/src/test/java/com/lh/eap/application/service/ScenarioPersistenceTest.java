package com.lh.eap.application.service;

import static org.junit.jupiter.api.Assertions.*;
import com.lh.eap.application.dto.ScenarioConfiguration;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.web.server.ResponseStatusException;

/** Existing migrated localhost database only; owns and removes only its randomized sample row. */
@EnabledIfEnvironmentVariable(named = "EAP_RUN_BOARD_PERSISTENCE", matches = "true")
class ScenarioPersistenceTest {
    final String id = "custom-fixture-" + UUID.randomUUID();
    JdbcTemplate jdbc;
    ScenarioService service;
    @BeforeEach void connect() throws Exception {
        var env = new StandardEnvironment();
        for (var source : new YamlPropertySourceLoader().load("application", new ClassPathResource("application.yml")))
            env.getPropertySources().addLast(source);
        var url = env.getProperty("spring.datasource.url");
        assertTrue(url != null && (url.startsWith("jdbc:postgresql://localhost:") || url.startsWith("jdbc:postgresql://127.0.0.1:")));
        jdbc = new JdbcTemplate(new DriverManagerDataSource(url, env.getProperty("spring.datasource.username"), env.getProperty("spring.datasource.password")));
        service = new ScenarioService(jdbc);
    }
    @AfterEach void cleanup() {
        if (jdbc != null) jdbc.update("DELETE FROM eap.scenario_definition WHERE id=?", id);
    }
    @Test void persistsAcrossServiceRecreationAndRejectsStaleDeleteAndRecreation() {
        var definition = ScenarioServiceTest.definition("Fixture");
        var saved = service.save(id, new ScenarioConfiguration.Write(0L, definition));
        assertEquals(1, saved.revision());
        var reopened = new ScenarioService(jdbc).get(id);
        assertEquals(saved, reopened);
        assertTrue(service.list().contains(saved));
        assertEquals("SCENARIO_STALE", assertThrows(ResponseStatusException.class,
                () -> service.save(id, new ScenarioConfiguration.Write(0L, definition))).getReason());
        service.save(id, new ScenarioConfiguration.Write(1L, ScenarioServiceTest.definition("Updated")));
        assertEquals("SCENARIO_STALE", assertThrows(ResponseStatusException.class, () -> service.delete(id, 1)).getReason());
        service.delete(id, 2);
        assertEquals(404, assertThrows(ResponseStatusException.class, () -> service.get(id)).getStatusCode().value());
        assertFalse(service.list().stream().anyMatch(item -> item.id().equals(id)));
        assertEquals("SCENARIO_STALE", assertThrows(ResponseStatusException.class,
                () -> service.save(id, new ScenarioConfiguration.Write(0L, definition))).getReason());
    }
    @Test void concurrentUpdatesHaveExactlyOneWinner() throws Exception {
        service.save(id, new ScenarioConfiguration.Write(0L, ScenarioServiceTest.definition("Fixture")));
        var start = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            Callable<String> action = () -> {
                start.await();
                try { service.save(id, new ScenarioConfiguration.Write(1L, ScenarioServiceTest.definition("Changed"))); return "saved"; }
                catch (ResponseStatusException error) { return error.getReason(); }
            };
            var a = pool.submit(action); var b = pool.submit(action); start.countDown();
            var results = List.of(a.get(10, TimeUnit.SECONDS), b.get(10, TimeUnit.SECONDS));
            assertEquals(1, results.stream().filter("saved"::equals).count());
            assertEquals(1, results.stream().filter("SCENARIO_STALE"::equals).count());
            assertEquals(2, service.get(id).revision());
        }
    }
}
