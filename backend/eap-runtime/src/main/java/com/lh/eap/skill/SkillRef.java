package com.lh.eap.skill;

import java.util.*;

public record SkillRef(String id, String version, String digest, long stateRevision) {
    public SkillRef {
        if (!SkillTextParser.validId(id) || !SkillTextParser.validVersion(version) || digest == null
                || !digest.matches("[0-9a-f]{64}") || stateRevision < 1 || stateRevision == Long.MAX_VALUE)
            throw SkillTextParser.invalid("INVALID_SKILL_REF");
    }
    public static SkillRef parse(Object value) {
        var fields = SkillTextParser.fields(value, Set.of("id", "version", "digest", "stateRevision"), "INVALID_SKILL_REF");
        return new SkillRef(SkillTextParser.text(fields.get("id"), 64, false, "INVALID_SKILL_REF"),
                SkillTextParser.text(fields.get("version"), 32, false, "INVALID_SKILL_REF"),
                SkillTextParser.text(fields.get("digest"), 64, false, "INVALID_SKILL_REF"),
                SkillService.positiveRevision(fields.get("stateRevision"), "INVALID_SKILL_REF"));
    }
    public static List<String> paths(Object value) {
        if (!(value instanceof List<?> entries) || entries.size() > 4) throw SkillTextParser.invalid("INVALID_SKILL_RESOURCE_PATHS");
        var paths = new ArrayList<String>(); var folded = new HashSet<String>();
        for (var entry : entries) {
            final String path;
            try { path = SkillTextParser.resourcePath(entry); }
            catch (org.springframework.web.server.ResponseStatusException invalid) { throw SkillTextParser.invalid("INVALID_SKILL_RESOURCE_PATHS"); }
            if (!folded.add(path.toLowerCase(Locale.ROOT))) throw SkillTextParser.invalid("INVALID_SKILL_RESOURCE_PATHS");
            paths.add(path);
        }
        return List.copyOf(paths);
    }
}
