package com.lh.eap.application.service;
import com.lh.eap.error.ResourceErrors;

import java.util.Set;
import java.util.Map;
import java.util.LinkedHashMap;
import java.util.HashSet;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Server-side publication boundary for the same semantic schema rendered by the workbench. */
public final class SemanticPrototype {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final Set<String> KINDS = Set.of("page", "section", "text", "heading", "button", "input", "textarea", "link", "list",
            "form", "select", "checkbox", "dialog", "task-list");
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
            var nodes = new LinkedHashMap<String, JsonNode>();
            requireNode(schema.path("root"), 0, nodes);
            for (var node : nodes.values()) requireInteraction(node, nodes);
        } catch (RuntimeException invalid) {
            throw new IllegalArgumentException(ResourceErrors.PROTOTYPE_SEMANTIC_DESIGN_REQUIRED.code());
        }
    }

    private static void requireNode(JsonNode node, int depth, Map<String, JsonNode> nodes) {
        if (nodes.size() >= 500 || depth > 24 || !node.path("id").isString()
                || !node.path("id").asString().matches("[A-Za-z][A-Za-z0-9_-]{0,79}")
                || !KINDS.contains(node.path("kind").asString()) || !node.path("props").isObject()
                || !node.path("children").isArray()) throw new IllegalArgumentException();
        if (nodes.putIfAbsent(node.path("id").asString(), node) != null) throw new IllegalArgumentException();
        for (var child : node.path("children")) requireNode(child, depth + 1, nodes);
    }

    private static void requireTaskList(JsonNode node) {
        var props = node.path("props");
        // Both capabilities are opt-in (absent means false) and independent.
        for (String key : Set.of("editable", "creatable"))
            if (props.has(key) && !props.path(key).isBoolean()) throw new IllegalArgumentException();
        var items = props.path("items");
        if (!node.path("children").isEmpty() || !items.isArray() || items.size() > 30)
            throw new IllegalArgumentException();
        var keys = Set.of("id", "name", "status", "priority", "summary", "goal", "acceptanceCriteria");
        var ids = new HashSet<String>();
        for (var item : items) {
            if (!item.isObject() || item.size() != keys.size()) throw new IllegalArgumentException();
            for (var key : keys) if (!item.path(key).isString()) throw new IllegalArgumentException();
            String id = item.path("id").asString();
            if (!id.matches("[A-Za-z][A-Za-z0-9_-]{0,79}") || !ids.add(id)
                    || !BoardTaskColumn.isKnown(item.path("status").asString())) throw new IllegalArgumentException();
            BoardTaskService.validatePriority(item.path("priority").asString());
            requireTaskText(item.path("name"), 120, true);
            requireTaskText(item.path("summary"), 240, false);
            requireTaskText(item.path("goal"), 2000, true);
            requireTaskText(item.path("acceptanceCriteria"), 2000, true);
        }
    }

    private static void requireTaskText(JsonNode value, int limit, boolean required) {
        String text = value.asString();
        if (text.length() > limit || (required && text.isBlank())) throw new IllegalArgumentException();
    }

    private static void requireInteraction(JsonNode node, Map<String, JsonNode> nodes) {
        var props = node.path("props");
        String kind = node.path("kind").asString();
        if (props.has("action")) {
            var action = props.path("action");
            if (!kind.equals("button") || !action.isObject() || action.size() != 2
                    || !action.path("target").isString() || !action.path("type").isString())
                throw new IllegalArgumentException();
            var type = PrototypeActionType.valueOf(action.path("type").asString());
            var target = nodes.get(action.path("target").asString());
            if (target == null || (type == PrototypeActionType.TOGGLE
                    ? !Set.of("dialog", "section").contains(target.path("kind").asString())
                    : !target.path("kind").asString().equals("form"))) throw new IllegalArgumentException();
        }
        for (String key : Set.of("required", "checked", "initiallyVisible"))
            if (props.has(key) && !props.path(key).isBoolean()) throw new IllegalArgumentException();
        if (props.has("initialValue") && (!props.path("initialValue").isString()
                || props.path("initialValue").asString().length() > 2000)) throw new IllegalArgumentException();
        if (kind.equals("task-list")) requireTaskList(node);
        if (kind.equals("select")) {
            var options = props.path("options");
            if (!options.isArray() || options.isEmpty() || options.size() > 30) throw new IllegalArgumentException();
            var values = new HashSet<String>();
            for (var option : options) {
                if (!option.isString() || option.asString().isBlank() || option.asString().length() > 200
                        || !values.add(option.asString())) throw new IllegalArgumentException();
            }
            if (props.has("initialValue") && !props.path("initialValue").asString().isEmpty()
                    && !values.contains(props.path("initialValue").asString())) throw new IllegalArgumentException();
        }
    }
}
