package com.lh.eap.web;

import java.util.*;

/**
 * Turns the operator-registered schema/index snapshot into facts and advice.
 *
 * <p>It only ever reads the human-curated snapshot — never the business database — and every statement
 * it makes is scoped to "what the snapshot records", because a snapshot is evidence, not a measurement.
 *
 * <p>Facts and advice are produced together on purpose: the facts are what rule packs can reason about
 * (so a rule can exist without a Java change), the advice keeps the existing human-readable text for
 * operators who just want the conclusion.
 */
final class SqlMetadataInspector {
    private SqlMetadataInspector() { }

    record Inspection(Map<String, Object> facts, List<String> advice) { }

    @SuppressWarnings("unchecked")
    static Inspection inspectIndexes(Object snapshot, Map<String, Object> analysis) {
        if (!(snapshot instanceof List<?> indexes)) {
            return new Inspection(Map.of("index.loaded", false), List.of("索引资料格式不正确，需要索引列表。"));
        }
        var advice = new ArrayList<String>();
        var uncovered = new ArrayList<String>();
        for (var item : (List<Map<String, String>>) analysis.getOrDefault("joinColumns", List.of())) {
            var table = item.get("table");
            var column = item.get("column");
            var candidates = indexes.stream().filter(index -> index instanceof Map<?, ?> map
                    && Objects.equals(map.get("table"), table)
                    && map.get("columns") instanceof List<?> columns && !columns.isEmpty()
                    && Objects.equals(columns.getFirst(), column)).toList();
            if (candidates.isEmpty()) {
                uncovered.add(table + "." + column);
                advice.add("所选快照未记录以 " + table + "." + column + " 为前导列的索引。这不是实时缺失结论；"
                        + "先核对现有索引，再用计划评估是否需要新增。");
            } else {
                for (var candidate : candidates) {
                    var index = (Map<?, ?>) candidate;
                    advice.add("快照中的索引 " + index.get("name") + " 以 " + table + "." + column
                            + " 为前导列，可作为连接访问路径候选；仍需执行计划确认是否使用。");
                }
            }
        }
        var facts = new LinkedHashMap<String, Object>();
        facts.put("index.loaded", true);
        facts.put("index.count", indexes.size());
        facts.put("index.leadingColumnMatch", uncovered.isEmpty());
        if (!uncovered.isEmpty()) facts.put("index.uncoveredJoinColumn", String.join("、", uncovered));
        return new Inspection(facts, List.copyOf(advice));
    }

    @SuppressWarnings("unchecked")
    static Inspection inspectSchema(Object snapshot, Map<String, Object> analysis) {
        if (!(snapshot instanceof List<?> tables)) {
            return new Inspection(Map.of("schema.loaded", false), List.of("表结构资料格式不正确，需要表列表。"));
        }
        var advice = new ArrayList<String>();
        var unresolved = new ArrayList<String>();
        var types = new LinkedHashMap<String, List<String>>();
        for (var item : (List<Map<String, String>>) analysis.getOrDefault("joinColumns", List.of())) {
            var owners = tables.stream().filter(table -> table instanceof Map<?, ?> map
                    && Objects.equals(map.get("name"), item.get("table"))).toList();
            if (owners.size() != 1) {
                unresolved.add(String.valueOf(item.get("table")));
                advice.add("快照中不能唯一定位表 " + item.get("table") + "；请使用与 SQL 一致的完整表名。");
                continue;
            }
            var owner = (Map<?, ?>) owners.getFirst();
            if (owner.get("columns") instanceof List<?> columns) {
                var matches = columns.stream().filter(column -> column instanceof Map<?, ?> map
                        && Objects.equals(map.get("name"), item.get("column"))).toList();
                if (matches.size() != 1) {
                    unresolved.add(item.get("table") + "." + item.get("column"));
                    advice.add("快照未能定位关联列 " + item.get("table") + "." + item.get("column")
                            + "，不能据此推荐索引。");
                    continue;
                }
                var column = (Map<?, ?>) matches.getFirst();
                var type = Objects.toString(column.get("type"), "").toLowerCase(Locale.ROOT).trim();
                if (!type.isBlank()) types.computeIfAbsent(item.get("condition"), key -> new ArrayList<>()).add(type);
            }
        }
        var mismatched = new ArrayList<String>();
        for (var entry : types.entrySet()) {
            if (entry.getValue().size() == 2 && !entry.getValue().get(0).equals(entry.getValue().get(1))) {
                mismatched.add(entry.getKey());
                advice.add("关联 " + entry.getKey() + " 的登记类型不同：" + entry.getValue()
                        + "。请核对方言转换规则及计划中的隐式转换，不能直接假定类型转换一定降低性能。");
            }
        }
        var facts = new LinkedHashMap<String, Object>();
        facts.put("schema.loaded", true);
        facts.put("schema.tableCount", tables.size());
        if (!unresolved.isEmpty()) facts.put("schema.unresolvedColumn", String.join("、", unresolved));
        if (!mismatched.isEmpty()) facts.put("schema.typeMismatch", String.join("、", mismatched));
        return new Inspection(facts, List.copyOf(advice));
    }
}
