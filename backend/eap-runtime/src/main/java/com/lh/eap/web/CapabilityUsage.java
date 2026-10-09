package com.lh.eap.web;

import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Which experts reference which capability, read from {@code expert_definition}.
 *
 * <p>Two answers, deliberately kept apart: {@code usedBy} counts only experts that are actually enabled,
 * so it is the set that makes disabling a capability unsafe; {@code declaredBy} includes drafts, so an
 * operator can see who is planning to use it. Conflating the two is how a platform ends up refusing an
 * action because of a draft nobody ever enabled.
 *
 * <p>Extracted from the catalog because two other places need the same answer and must not drift from
 * it: {@link CapabilitySettings} refuses to disable a capability an enabled expert runs, and
 * {@code McpServerService} refuses to delete a server whose tools an enabled expert was granted.
 */
@Service
public class CapabilityUsage {
    private final JdbcTemplate jdbc;

    public CapabilityUsage(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** @param usedBy enabled experts; @param declaredBy every expert including drafts */
    public record Usage(Map<String, List<String>> usedBy, Map<String, List<String>> declaredBy) {
        public List<String> enabledFor(String capability) { return usedBy.getOrDefault(capability, List.of()); }
        public List<String> declaredFor(String capability) { return declaredBy.getOrDefault(capability, List.of()); }
    }

    public Usage usage() {
        var enabled = new LinkedHashMap<String, List<String>>();
        var all = new LinkedHashMap<String, List<String>>();
        List<Map<String, Object>> rows;
        try {
            rows = jdbc.queryForList("SELECT id,enabled,manifest::text AS manifest FROM eap.expert_definition");
        } catch (RuntimeException error) {
            return new Usage(enabled, all);
        }
        if (rows == null) return new Usage(enabled, all);
        for (var row : rows) {
            ExpertManifest manifest;
            try {
                manifest = ExpertManifest.parse(String.valueOf(row.get("manifest")));
            } catch (RuntimeException ignored) {
                continue;
            }
            var id = String.valueOf(row.get("id"));
            boolean isEnabled = Boolean.TRUE.equals(row.get("enabled"));
            var capabilities = new LinkedHashSet<String>();
            for (var step : manifest.steps() == null ? List.<ExpertManifest.Step>of() : manifest.steps()) {
                if (step != null && step.capability() != null) capabilities.add(step.capability());
            }
            // Declared expert-scoped tools count as usage too: an expert authorised for an MCP tool is
            // depending on that server existing, exactly like a node depends on a command.
            capabilities.addAll(manifest.expertScopedCapabilities());
            for (var capability : capabilities) {
                all.computeIfAbsent(capability, key -> new ArrayList<>());
                if (!all.get(capability).contains(id)) all.get(capability).add(id);
                if (isEnabled) {
                    enabled.computeIfAbsent(capability, key -> new ArrayList<>());
                    if (!enabled.get(capability).contains(id)) enabled.get(capability).add(id);
                }
            }
        }
        enabled.replaceAll((key, value) -> List.copyOf(value));
        all.replaceAll((key, value) -> List.copyOf(value));
        return new Usage(enabled, all);
    }

    public List<String> enabledExpertsUsing(String capability) { return usage().enabledFor(capability); }
}
