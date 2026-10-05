package com.lh.eap.web;

import java.util.*;

public final class ExpertGraph {
    public static final Set<String> CAPABILITIES = Set.of("sql.parse", "knowledge.search",
            "database.schema.read", "database.index.read", "database.explain",
            "git-status", "git-diff", "rg-search");
    public static final Set<String> RULES = Set.of("database.credentials.never-expose",
            "candidate-sql.must-preserve-semantics");
    private ExpertGraph() { }
    public static List<String> validate(ExpertManifest manifest) {
        var errors = new ArrayList<String>();
        if (!"eap/v1".equals(manifest.apiVersion()) || !"Expert".equals(manifest.kind())) errors.add("定义必须为 eap/v1 Expert");
        if (manifest.steps() == null || manifest.steps().isEmpty() || manifest.steps().size() > 100) {
            errors.add("流程必须包含1至100个节点"); return errors;
        }
        if (manifest.edges() == null || manifest.edges().size() > 500) { errors.add("必须显式定义 edges，最多500条连线"); return errors; }
        var ids = new HashSet<String>();
        for (var step : manifest.steps()) {
            if (step == null) {errors.add("节点不能为空"); continue;}
            if (step.id() == null || step.id().isBlank() || !ids.add(step.id())) errors.add("节点标识不能为空或重复");
            if (!CAPABILITIES.contains(Objects.toString(step.capability(), ""))) errors.add("未实现的能力：" + step.capability());
            if (step.required() == null) errors.add("节点必须定义 required");
        }
        var pairs = new HashSet<ExpertManifest.Edge>();
        for (var edge : manifest.edges()) {
            if (edge == null) {errors.add("连线不能为空"); continue;}
            if (!ids.contains(edge.source()) || !ids.contains(edge.target())) errors.add("连线引用了不存在的节点");
            if (Objects.equals(edge.source(), edge.target())) errors.add("节点不能连接自身");
            if (!pairs.add(edge)) errors.add("存在重复连线");
        }
        if (manifest.rules() == null || !manifest.rules().contains("database.credentials.never-expose")) errors.add("必须保留禁止暴露凭据规则");
        if (manifest.rules() != null && manifest.rules().stream().anyMatch(rule -> !RULES.contains(Objects.toString(rule, "")))) errors.add("存在运行时不支持的规则");
        if (!errors.isEmpty()) return errors;
        if (manifest.steps().stream().filter(step -> manifest.edges().stream().noneMatch(edge -> edge.target().equals(step.id()))).count() != 1) errors.add("流程必须有且只有一个入口，请连接断开的节点");
        if (order(manifest).size() != manifest.steps().size()) errors.add("流程存在循环连线");
        return errors;
    }
    public static List<ExpertManifest.Step> order(ExpertManifest manifest) {
        var pending = new LinkedHashMap<String, ExpertManifest.Step>();
        manifest.steps().forEach(step -> pending.put(step.id(), step));
        var result = new ArrayList<ExpertManifest.Step>();
        while (!pending.isEmpty()) {
            var ready = pending.values().stream().filter(step -> manifest.edges().stream()
                    .noneMatch(edge -> edge.target().equals(step.id()) && pending.containsKey(edge.source()))).toList();
            if (ready.isEmpty()) break;
            for (var step : ready) {result.add(step); pending.remove(step.id());}
        }
        return result;
    }
}
