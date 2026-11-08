package com.lh.eap.application.service;

import com.lh.eap.application.dto.ScenarioConfiguration;
import com.lh.eap.application.dto.ScenarioConfiguration.Snapshot;
import com.lh.eap.application.dto.ScenarioConfiguration.Write;
import java.util.*;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

/** Local scenario configuration, separate from resource activation and execution permissions. */
@Service
public class ScenarioService {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final JdbcTemplate jdbc;
    public ScenarioService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public List<Snapshot> list() {
        try {
            return jdbc.queryForList("SELECT id,revision,definition::text AS definition FROM eap.scenario_definition WHERE NOT deleted ORDER BY id")
                    .stream().map(this::snapshot).toList();
        } catch (DataAccessException error) { throw unavailable(); }
    }
    public Snapshot get(String id) {
        validateId(id);
        try {
            return jdbc.queryForList("SELECT id,revision,definition::text AS definition FROM eap.scenario_definition WHERE id=? AND NOT deleted", id)
                    .stream().map(this::snapshot).findFirst().orElseThrow(() -> failure(HttpStatus.NOT_FOUND, "SCENARIO_NOT_FOUND"));
        } catch (DataAccessException error) { throw unavailable(); }
    }
    public Snapshot save(String id, Write request) {
        validateId(id);
        if (request == null || request.revision() == null || request.revision() < 0 || request.revision() == Long.MAX_VALUE)
            throw invalid();
        validate(request.definition());
        String json = JSON.writeValueAsString(request.definition());
        try {
            // Atomic CAS includes deletion state. A deleted ID cannot be recreated at revision zero (ABA).
            var rows = request.revision() == 0
                    ? jdbc.queryForList("INSERT INTO eap.scenario_definition(id,revision,definition) VALUES (?,1,?::jsonb) ON CONFLICT(id) DO NOTHING RETURNING id,revision,definition::text AS definition", id, json)
                    : jdbc.queryForList("UPDATE eap.scenario_definition SET definition=?::jsonb,revision=revision+1,updated_at=now() WHERE id=? AND revision=? AND NOT deleted RETURNING id,revision,definition::text AS definition", json, id, request.revision());
            if (rows.isEmpty()) throw failure(HttpStatus.CONFLICT, "SCENARIO_STALE");
            return snapshot(rows.getFirst());
        } catch (DataAccessException error) { throw unavailable(); }
    }
    public void delete(String id, long revision) {
        validateId(id);
        if (revision < 1 || revision == Long.MAX_VALUE) throw invalid();
        try {
            if (jdbc.update("UPDATE eap.scenario_definition SET deleted=true,revision=revision+1,updated_at=now() WHERE id=? AND revision=? AND NOT deleted", id, revision) != 1)
                throw failure(HttpStatus.CONFLICT, "SCENARIO_STALE");
        } catch (DataAccessException error) { throw unavailable(); }
    }
    private Snapshot snapshot(Map<String,Object> row) {
        return new Snapshot(row.get("id").toString(), ((Number) row.get("revision")).longValue(),
                JSON.readValue(row.get("definition").toString(), ScenarioConfiguration.class));
    }
    private static void validateId(String id) {
        if (id == null || !id.matches("custom-[A-Za-z0-9][A-Za-z0-9-]{0,92}")) throw invalid();
    }
    private static void validate(ScenarioConfiguration d) {
        if (d == null) throw invalid();
        text(d.name(), 80, true); text(d.summary(), 400, false); text(d.instructions(), 4000, false);
        if (d.status() == null || !Set.of("partial", "missing", "disabled").contains(d.status())) throw invalid();
        if (d.modes() == null || d.modes().isEmpty() || d.modes().size() > 2
                || new HashSet<>(d.modes()).size() != d.modes().size()
                || d.modes().stream().anyMatch(mode -> !"code".equals(mode) && !"work".equals(mode))) throw invalid();
        for (var values : Arrays.asList(d.tools(), d.skills(), d.mcp())) {
            if (values == null || values.size() > 30) throw invalid();
            values.forEach(value -> text(value, 200, true));
        }
        if (d.workflow() != null && !"prototype-to-code".equals(d.workflow())) throw invalid();
        if (d.dependencies() == null || d.dependencies().size() > 30) throw invalid();
        for (var dep : d.dependencies()) {
            if (dep == null || dep.state() == null || !Set.of("installed", "missing", "unconfigured", "denied").contains(dep.state())) throw invalid();
            text(dep.name(), 200, true); text(dep.where(), 1000, false);
        }
    }
    private static void text(String value, int max, boolean required) {
        if (value == null || value.length() > max || (required && value.isBlank()) || value.indexOf('\0') >= 0) throw invalid();
    }
    private static ResponseStatusException invalid() { return failure(HttpStatus.BAD_REQUEST, "INVALID_SCENARIO_INPUT"); }
    private static ResponseStatusException unavailable() { return failure(HttpStatus.SERVICE_UNAVAILABLE, "SCENARIO_STORE_UNAVAILABLE"); }
    private static ResponseStatusException failure(HttpStatus status, String code) { return new ResponseStatusException(status, code); }
}
