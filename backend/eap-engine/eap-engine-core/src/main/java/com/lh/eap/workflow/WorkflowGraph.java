package com.lh.eap.workflow;

import java.util.*;

/** Bounded structural validation and stable topological order, independent of domain authorization. */
public final class WorkflowGraph {
    private WorkflowGraph() {}

    public static List<String> validate(WorkflowDefinition workflow) {
        var errors = new ArrayList<String>();
        if (workflow == null || workflow.steps() == null || workflow.steps().isEmpty() || workflow.steps().size() > 100) {
            return List.of("流程必须包含1至100个节点");
        }
        if (workflow.edges() == null || workflow.edges().size() > 500) {
            return List.of("必须显式定义 edges，最多500条连线");
        }
        var ids = new HashSet<String>();
        for (var step : workflow.steps()) {
            if (step == null) { errors.add("节点不能为空"); continue; }
            if (step.id() == null || step.id().isBlank() || !ids.add(step.id())) errors.add("节点标识不能为空或重复");
            if (step.capability() == null || step.capability().isBlank()) errors.add("节点必须指定能力");
            if (step.required() == null) errors.add("节点必须定义 required");
        }
        var pairs = new HashSet<WorkflowDefinition.Edge>();
        for (var edge : workflow.edges()) {
            if (edge == null) { errors.add("连线不能为空"); continue; }
            if (!ids.contains(edge.source()) || !ids.contains(edge.target())) errors.add("连线引用了不存在的节点");
            if (Objects.equals(edge.source(), edge.target())) errors.add("节点不能连接自身");
            if (!pairs.add(edge)) errors.add("存在重复连线");
        }
        if (!errors.isEmpty()) return List.copyOf(errors);
        if (workflow.steps().stream().filter(step -> workflow.edges().stream()
                .noneMatch(edge -> edge.target().equals(step.id()))).count() != 1) {
            errors.add("流程必须有且只有一个入口，请连接断开的节点");
        }
        if (order(workflow).size() != workflow.steps().size()) errors.add("流程存在循环连线");
        return List.copyOf(errors);
    }

    /** Call after structural validation; a cyclic graph returns only the sortable prefix. */
    public static List<WorkflowDefinition.Step> order(WorkflowDefinition workflow) {
        var pending = new LinkedHashMap<String, WorkflowDefinition.Step>();
        workflow.steps().forEach(step -> pending.put(step.id(), step));
        var result = new ArrayList<WorkflowDefinition.Step>();
        while (!pending.isEmpty()) {
            var ready = pending.values().stream().filter(step -> workflow.edges().stream()
                    .noneMatch(edge -> edge.target().equals(step.id()) && pending.containsKey(edge.source()))).toList();
            if (ready.isEmpty()) break;
            for (var step : ready) { result.add(step); pending.remove(step.id()); }
        }
        return List.copyOf(result);
    }
}
