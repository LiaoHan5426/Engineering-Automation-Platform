package com.lh.eap.application.service;
import com.lh.eap.error.ResourceErrors;

import java.util.Set;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Server-side publication boundary for the same semantic schema rendered by the workbench. */
public final class SemanticPrototype {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final Set<String> KINDS = Set.of("page", "section", "text", "heading", "button", "input", "link", "list");
    private SemanticPrototype() {}

    public static void require(String body) {
        try {
            if (body == null || body.length() > 160000) throw new IllegalArgumentException();
            var envelope = JSON.readTree(body);
            var schema = envelope.path("schema");
            if (!"eap-prototype-v1".equals(envelope.path("format").asString())
                    || !schema.path("version").isIntegralNumber() || schema.path("version").asInt() != 1
                    || !schema.path("title").isString() || !schema.path("grapesProject").isObject()
                    || !schema.path("unknownMappings").isArray() || !schema.path("unknownMappings").isEmpty()
                    || !schema.path("root").path("children").isArray() || schema.path("root").path("children").isEmpty())
                throw new IllegalArgumentException();
            requireNode(schema.path("root"), 0, new int[1]);
        } catch (RuntimeException invalid) {
            throw new IllegalArgumentException(ResourceErrors.PROTOTYPE_SEMANTIC_DESIGN_REQUIRED.code());
        }
    }

    private static void requireNode(JsonNode node, int depth, int[] count) {
        if (++count[0] > 500 || depth > 24 || !node.path("id").isString()
                || !KINDS.contains(node.path("kind").asString()) || !node.path("props").isObject()
                || !node.path("children").isArray()) throw new IllegalArgumentException();
        for (var child : node.path("children")) requireNode(child, depth + 1, count);
    }
}
