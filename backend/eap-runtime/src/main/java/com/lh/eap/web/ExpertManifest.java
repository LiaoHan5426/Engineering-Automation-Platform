package com.lh.eap.web;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;
import tools.jackson.databind.json.JsonMapper;

/**
 * The declarative definition of an expert.
 *
 * <p>An expert is data, not code. It declares which capabilities to run, which rule packs define its
 * judgement, and which knowledge bases it may consult. Nothing here is specialised for SQL: the same
 * schema describes any expert, and a new expert can be added through the API without a code change.
 *
 * <ul>
 *   <li>{@code steps}/{@code edges} — the capability graph the runtime executes.</li>
 *   <li>{@code rulePacks} — ids of declarative rule packs (built-in JSON or operator-authored).</li>
 *   <li>{@code knowledgeBases}/{@code databaseProfiles} — resource references, granted on activation.</li>
 *   <li>{@code mcpTools} — expert-scoped capabilities (MCP tools, remote endpoints) this expert is
 *       allowed to call. These are never enabled globally: the declaration here is the authorisation,
 *       activation records it as a grant, and the graph may only contain nodes that appear in it.</li>
 *   <li>{@code rules} — platform invariants that must hold for every expert.</li>
 * </ul>
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record ExpertManifest(String apiVersion, String kind, String id, String name,
        List<String> knowledgeBases, List<String> databaseProfiles, List<Step> steps,
        List<Edge> edges, List<String> rules, List<String> rulePacks, List<String> mcpTools) {
    private static final JsonMapper JSON = JsonMapper.builder().build();

    public ExpertManifest {
        rulePacks = rulePacks == null ? List.of() : List.copyOf(rulePacks);
        mcpTools = mcpTools == null ? List.of() : List.copyOf(mcpTools);
    }

    /** Backwards compatible shape for manifests authored before MCP tools existed. */
    public ExpertManifest(String apiVersion, String kind, String id, String name, List<String> knowledgeBases,
            List<String> databaseProfiles, List<Step> steps, List<Edge> edges, List<String> rules,
            List<String> rulePacks) {
        this(apiVersion, kind, id, name, knowledgeBases, databaseProfiles, steps, edges, rules, rulePacks, List.of());
    }

    /** Backwards compatible shape for manifests authored before rule packs existed. */
    public ExpertManifest(String apiVersion, String kind, String id, String name, List<String> knowledgeBases,
            List<String> databaseProfiles, List<Step> steps, List<Edge> edges, List<String> rules) {
        this(apiVersion, kind, id, name, knowledgeBases, databaseProfiles, steps, edges, rules, List.of(), List.of());
    }

    /**
     * Capabilities this expert explicitly authorised that are not platform-level. Shipped as
     * {@code mcpTools} in the manifest; kept behind an accessor so the rest of the runtime does not have
     * to know which transport an expert-scoped capability uses.
     */
    public List<String> expertScopedCapabilities() { return mcpTools; }

    public static ExpertManifest parse(String json) { return JSON.readValue(json, ExpertManifest.class); }

    public static String serialize(ExpertManifest manifest) { return JSON.writeValueAsString(manifest); }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Step(String id, String label, String capability, Boolean required) { }
    public record Edge(String source, String target) { }
}
