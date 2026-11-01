package com.lh.eap.skill;

import java.util.*;
import java.time.Instant;
import com.lh.eap.config.RuntimeWorkspace;
import com.lh.eap.runtime.handler.CapabilityHandlerRegistry;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class SkillService {
    public record Dependency(String id, String status) {}
    public record Trust(String operator, Instant confirmedAt) {}
    public record Summary(String id, String version, String description, String digest, boolean enabled,
                          long stateRevision, String sourceLabel, Instant createdAt, List<Dependency> dependencies) {}
    public record Snapshot(String id, String version, String description, String digest, boolean enabled,
                           long stateRevision, String sourceLabel, Instant createdAt, List<Dependency> dependencies,
                           int schemaVersion, String entry, String rawSkillMd, String instructions,
                           List<SkillTextParser.Resource> resources, List<String> requiredCapabilities, String scope, Trust trust) {}
    private final JdbcTemplate jdbc;
    private final SkillTextParser parser;
    private final RuntimeWorkspace workspace;
    private final CapabilityHandlerRegistry capabilities;
    public SkillService(JdbcTemplate jdbc, SkillTextParser parser, RuntimeWorkspace workspace, CapabilityHandlerRegistry capabilities) {
        this.jdbc = jdbc; this.parser = parser; this.workspace = workspace; this.capabilities = capabilities;
    }
    private static final tools.jackson.databind.json.JsonMapper JSON = tools.jackson.databind.json.JsonMapper.builder().build();
    public record Listing(List<Summary> items) {}
    @org.springframework.transaction.annotation.Transactional(timeout = 10)
    public Snapshot save(Object value) {
        var request = SkillTextParser.fields(value, Set.of("input", "expectedDigest", "confirmed"), "INVALID_SKILL_IMPORT");
        if (!Boolean.TRUE.equals(request.get("confirmed"))) throw SkillTextParser.invalid("INVALID_SKILL_CONFIRMATION");
        String expected = SkillTextParser.text(request.get("expectedDigest"), 64, false, "INVALID_SKILL_DIGEST");
        if (!expected.matches("[0-9a-f]{64}")) throw SkillTextParser.invalid("INVALID_SKILL_DIGEST");
        var parsed = parser.parse(request.get("input"), scope());
        if (!expected.equals(parsed.digest())) throw failure(org.springframework.http.HttpStatus.CONFLICT, "SKILL_DIGEST_MISMATCH");
        jdbc.update("""
                INSERT INTO eap.skill_version(scope,id,version,description,digest,source_label,raw_skill_md,resources,required_capabilities,enabled,state_revision,confirmed_by)
                VALUES (?,?,?,?,?,?,?,?::jsonb,?::jsonb,false,1,?) ON CONFLICT (scope,id,version) DO NOTHING
                """, parsed.scope(), parsed.id(), parsed.version(), parsed.description(), parsed.digest(), parsed.sourceLabel(), parsed.rawSkillMd(),
                JSON.writeValueAsString(parsed.resources()), JSON.writeValueAsString(parsed.requiredCapabilities()), workspace.operatorLabel());
        var saved = get(parsed.id(), parsed.version());
        if (!saved.digest().equals(expected)) throw failure(org.springframework.http.HttpStatus.CONFLICT, "SKILL_VERSION_CONFLICT");
        return saved;
    }
    @org.springframework.transaction.annotation.Transactional(readOnly = true, timeout = 10)
    public Snapshot get(String id, String version) { return read(id, version, false); }
    private Snapshot read(String id, String version, boolean lock) {
        identity(id, version);
        var rows = jdbc.queryForList("SELECT * FROM eap.skill_version WHERE scope=? AND id=? AND version=?" + (lock ? " FOR SHARE" : ""), scope(), id, version);
        if (rows.isEmpty()) throw failure(org.springframework.http.HttpStatus.NOT_FOUND, "SKILL_NOT_FOUND");
        var row = rows.getFirst();
        var parsed = parser.parse(Map.of("rawSkillMd", row.get("raw_skill_md"), "version", row.get("version"), "sourceLabel", row.get("source_label"),
                "resources", JSON.readValue(row.get("resources").toString(), Object.class),
                "requiredCapabilities", JSON.readValue(row.get("required_capabilities").toString(), Object.class)), scope());
        if (!parsed.id().equals(id) || !parsed.digest().equals(row.get("digest")) || !parsed.description().equals(row.get("description")))
            throw failure(org.springframework.http.HttpStatus.CONFLICT, "SKILL_CONTENT_MISMATCH");
        return snapshot(parsed, (Boolean) row.get("enabled"), ((Number) row.get("state_revision")).longValue(),
                ((java.sql.Timestamp) row.get("created_at")).toInstant(), new Trust((String) row.get("confirmed_by"), ((java.sql.Timestamp) row.get("confirmed_at")).toInstant()));
    }
    @org.springframework.transaction.annotation.Transactional(timeout = 10)
    public Snapshot activate(String id, String version, Object value) {
        identity(id, version);
        var body = SkillTextParser.fields(value, Set.of("enabled", "stateRevision"), "INVALID_SKILL_ACTIVATION");
        if (!(body.get("enabled") instanceof Boolean enabled)) throw SkillTextParser.invalid("INVALID_SKILL_ACTIVATION");
        long revision = positiveRevision(body.get("stateRevision"), "INVALID_SKILL_ACTIVATION");
        int updated = jdbc.update("UPDATE eap.skill_version SET enabled=?,state_revision=state_revision+1 WHERE scope=? AND id=? AND version=? AND state_revision=?",
                enabled, scope(), id, version, revision);
        if (updated == 0) { get(id, version); throw failure(org.springframework.http.HttpStatus.CONFLICT, "SKILL_STATE_STALE"); }
        return get(id, version);
    }
    @org.springframework.transaction.annotation.Transactional(readOnly = true, timeout = 10)
    public Listing list() {
        var rows = jdbc.queryForList("SELECT id,version,description,digest,enabled,state_revision,source_label,created_at,required_capabilities FROM eap.skill_version WHERE scope=? ORDER BY created_at DESC,id,version", scope());
        return new Listing(rows.stream().map(row -> new Summary((String) row.get("id"), (String) row.get("version"), (String) row.get("description"), (String) row.get("digest"),
                (Boolean) row.get("enabled"), ((Number) row.get("state_revision")).longValue(), (String) row.get("source_label"), ((java.sql.Timestamp) row.get("created_at")).toInstant(),
                dependencies(JSON.readValue(row.get("required_capabilities").toString(), new tools.jackson.core.type.TypeReference<List<String>>() {})))).toList());
    }
    static long positiveRevision(Object value, String code) {
        if (!(value instanceof Integer || value instanceof Long) || ((Number) value).longValue() < 1 || ((Number)value).longValue() == Long.MAX_VALUE) throw SkillTextParser.invalid(code);
        return ((Number)value).longValue();
    }
    private static void identity(String id, String version) {
        if (!SkillTextParser.validId(id) || !SkillTextParser.validVersion(version)) throw SkillTextParser.invalid("INVALID_SKILL_REF");
    }
    private static org.springframework.web.server.ResponseStatusException failure(org.springframework.http.HttpStatus status, String code) {
        return new org.springframework.web.server.ResponseStatusException(status, code);
    }
    public record Context(SkillRef skillRef, String instructions, List<SkillTextParser.Resource> resources, List<Dependency> dependencies) {}
    @org.springframework.transaction.annotation.Transactional(timeout = 10)
    public Context previewContext(Object value) {
        var body = SkillTextParser.fields(value, Set.of("skillRef", "resourcePaths"), "INVALID_SKILL_CONTEXT");
        return resolve(SkillRef.parse(body.get("skillRef")), SkillRef.paths(body.get("resourcePaths")));
    }
    /** Snapshot lock ends before the external model call. Disable cannot recall material already sent. */
    @org.springframework.transaction.annotation.Transactional(timeout = 10)
    public Context resolve(SkillRef ref, List<String> paths) {
        if (ref == null) throw SkillTextParser.invalid("INVALID_SKILL_REF");
        paths = SkillRef.paths(paths);
        var snapshot = read(ref.id(), ref.version(), true);
        if (!snapshot.digest().equals(ref.digest()) || snapshot.stateRevision() != ref.stateRevision())
            throw failure(org.springframework.http.HttpStatus.CONFLICT, "SKILL_REF_STALE");
        if (!snapshot.enabled()) throw failure(org.springframework.http.HttpStatus.CONFLICT, "SKILL_DISABLED");
        var resources = new ArrayList<SkillTextParser.Resource>();
        for (var path : paths) resources.add(snapshot.resources().stream().filter(r -> r.path().equals(path)).findFirst()
                .orElseThrow(() -> SkillTextParser.invalid("INVALID_SKILL_RESOURCE_PATHS")));
        return new Context(ref, snapshot.instructions(), List.copyOf(resources), snapshot.dependencies());
    }
    public Snapshot preview(Object input) { return snapshot(parser.parse(input, scope()), false, 1, null, null); }
    private String scope() {
        if (!workspace.root().allowed()) throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT, "SKILL_SCOPE_UNAVAILABLE");
        return "workspace:" + SkillTextParser.digest(List.of(workspace.root().path().toString()));
    }
    private List<Dependency> dependencies(List<String> ids) {
        return ids.stream().map(id -> new Dependency(id, capabilities.find(id).isEmpty() ? "unknown" : capabilities.disabled(id) ? "disabled" : "available")).toList();
    }
    private Snapshot snapshot(SkillTextParser.Parsed p, boolean enabled, long revision, Instant created, Trust trust) {
        return new Snapshot(p.id(), p.version(), p.description(), p.digest(), enabled, revision, p.sourceLabel(), created,
                dependencies(p.requiredCapabilities()), 1, "SKILL.md", p.rawSkillMd(), p.instructions(), p.resources(), p.requiredCapabilities(), p.scope(), trust);
    }
}
