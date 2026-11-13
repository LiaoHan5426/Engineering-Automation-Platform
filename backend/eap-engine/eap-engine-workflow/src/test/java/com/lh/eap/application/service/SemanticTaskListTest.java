package com.lh.eap.application.service;

import static org.junit.jupiter.api.Assertions.*;
import com.lh.eap.error.ResourceErrors;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class SemanticTaskListTest {
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private static Map<String, Object> item(int index) {
        var item = new LinkedHashMap<String, Object>();
        item.put("id", "task_" + index);
        item.put("name", "任务 " + index);
        item.put("status", BoardTaskColumn.values()[index % BoardTaskColumn.values().length].wire());
        item.put("priority", List.of("none", "p0", "p1", "p2").get(index % 4));
        item.put("summary", "");
        item.put("goal", "完成任务目标\n保留中文");
        item.put("acceptanceCriteria", "结果经过验收");
        return item;
    }

    private static List<Map<String, Object>> items(int count) {
        var items = new ArrayList<Map<String, Object>>();
        for (int index = 0; index < count; index++) items.add(item(index));
        return items;
    }

    private static String body(Object items) {
        return body(Map.of("items", items), List.of());
    }

    private static String body(Map<String, Object> props, List<?> children) {
        var tasks = Map.of("id", "tasks", "kind", "task-list", "props", props, "children", children);
        var root = Map.of("id", "root", "kind", "page", "props", Map.of(), "children", List.of(tasks));
        var schema = Map.of("version", 1, "title", "任务列表", "grapesProject", Map.of("pages", List.of(Map.of("name", "任务列表"))),
                "unknownMappings", List.of(), "root", root);
        return JSON.writeValueAsString(Map.of("format", "eap-prototype-v1", "schema", schema));
    }

    private static void invalid(String body) {
        var error = assertThrows(IllegalArgumentException.class, () -> SemanticPrototype.require(body));
        assertEquals(ResourceErrors.PROTOTYPE_SEMANTIC_DESIGN_REQUIRED.code(), error.getMessage());
    }

    @Test void acceptsZeroSixAndThirtyRecordsAndEveryExistingBoardVocabulary() {
        for (int count : List.of(0, 6, 30)) assertDoesNotThrow(() -> SemanticPrototype.require(body(items(count))));
    }

    @Test void enforcesTextAndIdentifierUpperBounds() {
        var record = item(0);
        record.put("id", "T" + "x".repeat(79));
        record.put("name", "名".repeat(120));
        record.put("summary", "摘".repeat(240));
        record.put("goal", "目".repeat(2000));
        record.put("acceptanceCriteria", "验".repeat(2000));
        assertDoesNotThrow(() -> SemanticPrototype.require(body(List.of(record))));
        for (var entry : Map.of("id", 81, "name", 121, "summary", 241, "goal", 2001, "acceptanceCriteria", 2001).entrySet()) {
            var oversized = item(0);
            oversized.put(entry.getKey(), "x".repeat(entry.getValue()));
            invalid(body(List.of(oversized)));
        }
        invalid(body(items(31)));
    }

    @Test void rejectsEveryMissingAndNonStringFieldAndUnknownRecordKeys() {
        for (var key : item(0).keySet()) {
            var missing = item(0);
            missing.remove(key);
            invalid(body(List.of(missing)));
            for (var malformed : List.of(42, true, List.of(), Map.of())) {
                var wrong = item(0);
                wrong.put(key, malformed);
                invalid(body(List.of(wrong)));
            }
            var nil = item(0);
            nil.put(key, null);
            invalid(body(List.of(nil)));
            var substituted = item(0);
            substituted.remove(key);
            substituted.put("unknown", "value");
            invalid(body(List.of(substituted)));
        }
        var extra = item(0);
        extra.put("script", "alert(1)");
        invalid(body(List.of(extra)));
    }

    @Test void rejectsBlankRequiredFieldsInvalidVocabulariesIdentifiersAndDuplicates() {
        for (var key : List.of("id", "name", "status", "priority", "goal", "acceptanceCriteria")) {
            for (var blank : List.of("", " \n\t")) {
                var wrong = item(0);
                wrong.put(key, blank);
                invalid(body(List.of(wrong)));
            }
        }
        for (var entry : Map.of("id", "1-task", "status", "PLANNED", "priority", "P0").entrySet()) {
            var wrong = item(0);
            wrong.put(entry.getKey(), entry.getValue());
            invalid(body(List.of(wrong)));
        }
        invalid(body(List.of(item(0), item(0))));
    }

    @Test void requiresItemsArrayAndLeafChildren() {
        invalid(body(Map.of(), List.of()));
        for (var malformed : List.of("items", 42, true, Map.of())) invalid(body(malformed));
        invalid(body(Map.of("items", List.of()), List.of(Map.of("id", "child", "kind", "text", "props", Map.of(), "children", List.of()))));
        invalid(body(List.of("record")));
        invalid(body(List.of(List.of())));
    }

    @Test void keepsExistingListAndTextareaContracts() {
        assertDoesNotThrow(() -> SemanticPrototype.require(body(Map.of(), List.of()).replace("\"kind\":\"task-list\"", "\"kind\":\"list\"")));
        assertDoesNotThrow(() -> SemanticPrototype.require(body(Map.of("required", true, "initialValue", "第一行\n第二行"), List.of())
                .replace("\"kind\":\"task-list\"", "\"kind\":\"textarea\"")));
    }

    @Test void immutablePublicationRetainsRecordsAndGrapesAndHashesTheirChanges() {
        String body = body(items(6));
        var service = new PrototypeVersionService(new PrototypePublicationServiceTest.Store(), null);
        var version = service.save(UUID.randomUUID(), "builder-alpha", "任务列表", body, List.of("查看筛选与编辑模拟任务"));
        assertEquals(version, service.find(version.id()));
        assertEquals(body, service.find(version.id()).body());
        assertEquals(6, JSON.readTree(version.body()).path("schema").path("root").path("children").get(0).path("props").path("items").size());
        assertNotEquals(version.contentHash(), PrototypeCanonical.of(version.sourceRef(), version.title(), body.replace("任务 0", "任务修改"), version.acceptance()).hash());
    }
    @Test void creatableAndEditableAreIndependentOptionalBooleans() {
        for (Object creatable : List.of("absent", false, true)) {
            for (Object editable : List.of("absent", false, true)) {
                var props = new LinkedHashMap<String, Object>();
                if (creatable instanceof Boolean) props.put("creatable", creatable);
                if (editable instanceof Boolean) props.put("editable", editable);
                for (int count : List.of(0, 6, 30)) {
                    props.put("items", items(count));
                    assertDoesNotThrow(() -> SemanticPrototype.require(body(props, List.of())));
                }
                props.put("items", items(31));
                invalid(body(props, List.of()));
                var extra = item(0);
                extra.put("creatable", true);
                props.put("items", List.of(extra));
                invalid(body(props, List.of()));
            }
        }
    }

    @Test void rejectsMalformedCreatableRegardlessOfEditable() {
        for (Object editable : List.of("absent", false, true)) {
            var props = new LinkedHashMap<String, Object>();
            props.put("items", items(1));
            if (editable instanceof Boolean) props.put("editable", editable);
            for (Object wrong : List.of("true", "false", "", 0, 1, 1.5, List.of(), Map.of())) {
                props.put("creatable", wrong);
                invalid(body(props, List.of()));
            }
            props.put("creatable", null);
            invalid(body(props, List.of()));
        }
        for (boolean creatable : List.of(false, true)) {
            var props = new LinkedHashMap<String, Object>();
            props.put("items", items(1));
            props.put("creatable", creatable);
            for (Object wrong : List.of("true", 1)) {
                props.put("editable", wrong);
                invalid(body(props, List.of()));
            }
            props.put("editable", null);
            invalid(body(props, List.of()));
        }
    }

    @Test void creatableDoesNotPermitUnknownMappings() {
        for (boolean creatable : List.of(false, true)) {
            var envelope = JSON.readTree(body(Map.of("items", items(1), "creatable", creatable), List.of()));
            var schema = (tools.jackson.databind.node.ObjectNode) envelope.path("schema");
            schema.putArray("unknownMappings").add("unmapped-task-action");
            invalid(JSON.writeValueAsString(envelope));
        }
    }

    @Test void editableIsAnExplicitOptionalBooleanAndDoesNotWeakenItems() {
        for (boolean editable : List.of(true, false)) {
            assertDoesNotThrow(() -> SemanticPrototype.require(body(Map.of("items", items(6), "editable", editable), List.of())));
            invalid(body(Map.of("items", items(31), "editable", editable), List.of()));
            var extra = item(0);
            extra.put("editable", true);
            invalid(body(Map.of("items", List.of(extra), "editable", editable), List.of()));
        }
        for (Object wrong : List.of("true", "false", 0, 1, List.of(), Map.of()))
            invalid(body(Map.of("items", items(1), "editable", wrong), List.of()));
        var props = new LinkedHashMap<String, Object>();
        props.put("items", items(1));
        props.put("editable", null);
        invalid(body(props, List.of()));
    }
}
