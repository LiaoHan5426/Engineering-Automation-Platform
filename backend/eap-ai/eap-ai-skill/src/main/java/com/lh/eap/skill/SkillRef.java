package com.lh.eap.skill;
import org.springframework.web.server.ResponseStatusException;
import com.lh.eap.error.SkillErrors;

import java.util.*;

public record SkillRef(String id, String version, String digest, long stateRevision) {
    public SkillRef {
        if (!SkillTextParser.validId(id) || !SkillTextParser.validVersion(version) || digest == null
                || !digest.matches("[0-9a-f]{64}") || stateRevision < 1 || stateRevision == Long.MAX_VALUE)
            throw SkillTextParser.invalid(SkillErrors.INVALID_SKILL_REF.code());
    }
    public static SkillRef parse(Object value) {
        var fields = SkillTextParser.fields(value, Set.of("id", "version", "digest", "stateRevision"), SkillErrors.INVALID_SKILL_REF.code());
        return new SkillRef(SkillTextParser.text(fields.get("id"), 64, false, SkillErrors.INVALID_SKILL_REF.code()),
                SkillTextParser.text(fields.get("version"), 32, false, SkillErrors.INVALID_SKILL_REF.code()),
                SkillTextParser.text(fields.get("digest"), 64, false, SkillErrors.INVALID_SKILL_REF.code()),
                SkillService.positiveRevision(fields.get("stateRevision"), SkillErrors.INVALID_SKILL_REF.code()));
    }
    public static List<String> paths(Object value) {
        if (!(value instanceof List<?> entries) || entries.size() > 4) throw SkillTextParser.invalid(SkillErrors.INVALID_SKILL_RESOURCE_PATHS.code());
        var paths = new ArrayList<String>(); var folded = new HashSet<String>();
        for (var entry : entries) {
            final String path;
            try { path = SkillTextParser.resourcePath(entry); }
            catch (ResponseStatusException invalid) { throw SkillTextParser.invalid(SkillErrors.INVALID_SKILL_RESOURCE_PATHS.code()); }
            if (!folded.add(path.toLowerCase(Locale.ROOT))) throw SkillTextParser.invalid(SkillErrors.INVALID_SKILL_RESOURCE_PATHS.code());
            paths.add(path);
        }
        return List.copyOf(paths);
    }
}
