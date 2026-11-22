package com.lh.eap.application.service;
import com.lh.eap.error.ResourceErrors;

import com.lh.eap.application.dto.ScenarioConfiguration;
import com.lh.eap.application.dto.ScenarioConfiguration.Snapshot;
import com.lh.eap.application.dto.ScenarioConfiguration.Write;
import com.lh.eap.application.dto.ScenarioWorkflowDependencies;
import com.lh.eap.core.ScenarioStore;
import java.time.Instant;
import java.util.*;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;
import com.lh.eap.domain.model.ScenarioDependencyStatus;
import com.lh.eap.domain.model.ScenarioStatus;

/** Local scenario configuration, separate from resource activation and execution permissions. */
@Service
public class ScenarioService {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final ScenarioStore store;
    public ScenarioService(ScenarioStore store) { this.store = store; }

    /** Plugin enablement belongs to the local UI host, not stored scenario dependency labels. */
    public ScenarioWorkflowDependencies dependencies(String workflow) {
        if (!"prototype-to-code".equals(workflow))
            throw failure(HttpStatus.NOT_FOUND, ResourceErrors.SCENARIO_WORKFLOW_NOT_FOUND.code());
        try {
            long count = store.countPrototypeVersions();
            return new ScenarioWorkflowDependencies(1, workflow, Instant.now(),
                    List.of(new ScenarioWorkflowDependencies.Plugin("builder", true),
                            new ScenarioWorkflowDependencies.Plugin("board", false)),
                    List.of(new ScenarioWorkflowDependencies.Service("prototype-versions", "READABLE")),
                    List.of(new ScenarioWorkflowDependencies.Resource("prototype-version", true, count)));
        } catch (DataAccessException error) {
            throw failure(HttpStatus.SERVICE_UNAVAILABLE, ResourceErrors.SCENARIO_DEPENDENCY_UNAVAILABLE.code());
        }
    }

    public List<Snapshot> list() {
        try {
            return store.list().stream().map(this::snapshot).toList();
        } catch (DataAccessException error) { throw unavailable(); }
    }
    public Snapshot get(String id) {
        validateId(id);
        try {
            return store.find(id).map(this::snapshot).orElseThrow(() -> failure(HttpStatus.NOT_FOUND, ResourceErrors.SCENARIO_NOT_FOUND.code()));
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
            var stored = request.revision() == 0 ? store.insert(id, json) : store.update(id, request.revision(), json);
            if (stored.isEmpty()) throw failure(HttpStatus.CONFLICT, ResourceErrors.SCENARIO_STALE.code());
            return snapshot(stored.get());
        } catch (DataAccessException error) { throw unavailable(); }
    }
    public void delete(String id, long revision) {
        validateId(id);
        if (revision < 1 || revision == Long.MAX_VALUE) throw invalid();
        try {
            if (!store.delete(id, revision)) throw failure(HttpStatus.CONFLICT, ResourceErrors.SCENARIO_STALE.code());
        } catch (DataAccessException error) { throw unavailable(); }
    }
    private Snapshot snapshot(ScenarioStore.Snapshot row) {
        var definition = row.definition();
        var dependencies = definition.dependencies().stream()
                .map(dep -> new ScenarioConfiguration.Dependency(dep.name(), dep.state(), dep.where()))
                .toList();
        return new Snapshot(row.id(), row.revision(),
                new ScenarioConfiguration(definition.name(), definition.status(), definition.modes(), definition.summary(),
                        definition.instructions(), definition.tools(), definition.skills(), definition.mcp(),
                        dependencies, definition.workflow()));
    }
    private static void validateId(String id) {
        if (id == null || !id.matches("custom-[A-Za-z0-9][A-Za-z0-9-]{0,92}")) throw invalid();
    }
    private static void validate(ScenarioConfiguration d) {
        if (d == null) throw invalid();
        text(d.name(), 80, true); text(d.summary(), 400, false); text(d.instructions(), 4000, false);
        if (d.status() == null || !ScenarioStatus.isKnown(d.status())) throw invalid();
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
            if (dep == null || dep.state() == null || !ScenarioDependencyStatus.isKnown(dep.state())) throw invalid();
            text(dep.name(), 200, true); text(dep.where(), 1000, false);
        }
    }
    private static void text(String value, int max, boolean required) {
        if (value == null || value.length() > max || (required && value.isBlank()) || value.indexOf('\0') >= 0) throw invalid();
    }
    private static ResponseStatusException invalid() { return failure(HttpStatus.BAD_REQUEST, ResourceErrors.INVALID_SCENARIO_INPUT.code()); }
    private static ResponseStatusException unavailable() { return failure(HttpStatus.SERVICE_UNAVAILABLE, ResourceErrors.SCENARIO_STORE_UNAVAILABLE.code()); }
    private static ResponseStatusException failure(HttpStatus status, String code) { return new ResponseStatusException(status, code); }
}
