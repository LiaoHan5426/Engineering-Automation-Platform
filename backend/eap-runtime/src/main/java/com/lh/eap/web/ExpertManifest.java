package com.lh.eap.web;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;
import tools.jackson.databind.json.JsonMapper;

@JsonIgnoreProperties(ignoreUnknown = true)
public record ExpertManifest(String apiVersion, String kind, String id, String name,
        List<String> knowledgeBases, List<String> databaseProfiles, List<Step> steps,
        List<Edge> edges, List<String> rules) {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    public static ExpertManifest parse(String json) { return JSON.readValue(json, ExpertManifest.class); }
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Step(String id, String label, String capability, Boolean required) { }
    public record Edge(String source, String target) { }
}
