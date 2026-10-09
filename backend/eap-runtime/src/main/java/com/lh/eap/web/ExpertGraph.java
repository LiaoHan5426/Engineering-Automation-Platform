package com.lh.eap.web;

import java.util.*;

public final class ExpertGraph {
    /**
     * Declared capability vocabulary. This is the single source of truth for what an expert manifest
     * may reference; {@code CapabilityHandlerRegistry} must cover exactly this set (asserted by test),
     * and the console renders its capability picker from the same list.
     */
    public static final Set<String> CAPABILITIES = Set.of("sql.parse", "knowledge.search",
            "database.schema.read", "database.index.read", "database.explain",
            "git-status", "git-diff", "rg-search");
    public static final Set<String> RULES = Set.of("database.credentials.never-expose",
            "candidate-sql.must-preserve-semantics");

    /**
     * Expert-scoped capability ids are namespaced by server, so two servers publishing a tool with the
     * same name can never collide and an operator can always tell which server a node would call.
     */
    static final java.util.regex.Pattern MCP_CAPABILITY =
            java.util.regex.Pattern.compile("mcp\\.[a-z0-9][a-z0-9_-]{0,60}\\.[a-z0-9][a-z0-9_-]{0,60}");

    private ExpertGraph() { }

    public static List<String> validate(ExpertManifest manifest) {
        return validate(manifest, CAPABILITIES, Map.of());
    }

    public static List<String> validate(ExpertManifest manifest, Set<String> knownCapabilities) {
        return validate(manifest, knownCapabilities, Map.of(), Set.of());
    }

    public static List<String> validate(ExpertManifest manifest, Set<String> knownCapabilities,
                                        Map<String, Set<String>> packRequirements) {
        return validate(manifest, knownCapabilities, packRequirements, Set.of());
    }

    /**
     * Validates the graph, the capability requirements of the rule packs it references, and the
     * authorisation of expert-scoped capabilities.
     *
     * @param packRequirements      rule pack id → capabilities that pack needs in order to produce
     *                              findings. A pack whose capabilities have no node in this graph would
     *                              silently never fire, so it is rejected here instead of showing up as
     *                              "nothing found".
     * @param expertScopedCapabilities capabilities that exist but are never enabled globally (MCP
     *                              tools, remote endpoints). A node may only use one if the manifest
     *                              declares it in {@code mcpTools}; the declaration is the grant, and the
     *                              tool itself must already be published by a registered, trusted server.
     */
    public static List<String> validate(ExpertManifest manifest, Set<String> knownCapabilities,
                                        Map<String, Set<String>> packRequirements,
                                        Set<String> expertScopedCapabilities) {
        return validate(manifest, knownCapabilities, packRequirements, expertScopedCapabilities, Set.of());
    }

    /**
     * Validates the graph, the capability requirements of the rule packs it references, the
     * authorisation of expert-scoped capabilities, and the operator's own switches.
     *
     * @param packRequirements   rule pack id → capabilities that pack needs in order to produce
     *                              findings. A pack whose capabilities have no node in this graph would
     *                              silently never fire, so it is rejected here instead of showing up as
     *                              "nothing found".
     * @param expertScopedCapabilities capabilities that exist but are never enabled globally (MCP
     *                              tools, remote endpoints). A node may only use one if the manifest
     *                              declares it in {@code mcpTools}; the declaration is the grant, and the
     *                              tool itself must already be published by a registered, trusted server.
     * @param disabledCapabilities  capabilities the operator switched off. They are registered, so
     *                              "未实现的能力" would be a false explanation — the manifest is rejected
     *                              with the actual reason instead, at save time rather than as a failed
     *                              node later.
     */
    public static List<String> validate(ExpertManifest manifest, Set<String> knownCapabilities,
                                        Map<String, Set<String>> packRequirements,
                                        Set<String> expertScopedCapabilities,
                                        Set<String> disabledCapabilities) {
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
            if (!knownCapabilities.contains(Objects.toString(step.capability(), ""))) errors.add("未实现的能力：" + step.capability());
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
        errors.addAll(validateCapabilitySwitches(manifest, disabledCapabilities));
        errors.addAll(validateExpertScopedAuthorisation(manifest, knownCapabilities, expertScopedCapabilities));
        errors.addAll(validateCapabilityRequirements(manifest, packRequirements));
        if (!errors.isEmpty()) return errors;
        if (manifest.steps().stream().filter(step -> manifest.edges().stream().noneMatch(edge -> edge.target().equals(step.id()))).count() != 1) errors.add("流程必须有且只有一个入口，请连接断开的节点");
        if (order(manifest).size() != manifest.steps().size()) errors.add("流程存在循环连线");
        return errors;
    }

    /**
     * A switch an operator flipped is not a missing implementation, and saying so would send the reader
     * looking for a bug that does not exist. The capability is registered; this installation has decided
     * not to offer it, and the node would fail at run time.
     */
    private static List<String> validateCapabilitySwitches(ExpertManifest manifest, Set<String> disabledCapabilities) {
        var errors = new ArrayList<String>();
        if (disabledCapabilities == null || disabledCapabilities.isEmpty()) return errors;
        var reported = new LinkedHashSet<String>();
        for (var step : manifest.steps()) {
            if (step == null || step.capability() == null) continue;
            if (!disabledCapabilities.contains(step.capability()) || !reported.add(step.capability())) continue;
            errors.add("能力 " + step.capability() + " 已在平台停用，引用它的节点不会执行。"
                    + "请在能力目录中重新启用该能力，或从流程中移除这个节点后再保存。");
        }
        for (var tool : manifest.expertScopedCapabilities()) {
            if (tool == null || !disabledCapabilities.contains(tool) || !reported.add(tool)) continue;
            errors.add("专家级能力 " + tool + " 已在平台停用，本专家的授权不会生效。");
        }
        return errors;
    }

    /**
     * The expert-scope contract: an MCP tool (or any other expert-scoped capability) is never globally
     * enabled, so two things must hold before a graph may contain one.
     *
     * <p>First, the expert must declare it — the declaration is the authorisation, and it is what
     * activation records as a grant. Second, the platform must already know the tool, which means an
     * operator registered the server and allow-listed the tool: a manifest cannot bring a server into
     * existence by naming it.
     */
    private static List<String> validateExpertScopedAuthorisation(ExpertManifest manifest,
                                                                 Set<String> knownCapabilities,
                                                                 Set<String> expertScopedCapabilities) {
        var errors = new ArrayList<String>();
        var declared = new LinkedHashSet<String>();
        for (var tool : manifest.expertScopedCapabilities()) {
            if (tool == null || tool.isBlank()) { errors.add("mcpTools 不能包含空项"); continue; }
            if (!declared.add(tool)) { errors.add("mcpTools 存在重复声明：" + tool); continue; }
            if (!MCP_CAPABILITY.matcher(tool).matches()) {
                errors.add("mcpTools 必须使用 mcp.<服务器>.<工具> 形式的能力标识：" + tool);
                continue;
            }
            if (!knownCapabilities.contains(tool)) {
                errors.add("mcpTools 声明的工具未在任何已启用并信任的 MCP 服务器中发布：" + tool
                        + "。请先在平台登记该服务器及其工具白名单；清单不能凭名字让一个服务器存在。");
            }
        }
        if (declared.size() > 50) errors.add("mcpTools 最多声明50项");
        for (var step : manifest.steps()) {
            if (step == null || step.capability() == null) continue;
            if (!expertScopedCapabilities.contains(step.capability()) || declared.contains(step.capability())) continue;
            errors.add("流程节点 " + step.id() + " 使用了专家级能力 " + step.capability()
                    + "。MCP/远端工具不会在运行时全局启用，必须由本专家在清单中显式声明授权："
                    + "\"mcpTools\": [\"" + step.capability() + "\"]，缺少声明时该节点不会执行，"
                    + "也不会因为“平台注册过”就对所有专家生效。");
        }
        return errors;
    }


    /**
     * The rule pack ↔ capability contract: a pack is only as good as the nodes that can feed it.
     *
     * <p>Referencing a pack without the capabilities it needs is the failure mode this check exists for:
     * the pack loads, the run succeeds, and the findings are simply missing.
     */
    private static List<String> validateCapabilityRequirements(ExpertManifest manifest,
                                                              Map<String, Set<String>> packRequirements) {
        var errors = new ArrayList<String>();
        if (packRequirements == null || packRequirements.isEmpty()) return errors;
        var provided = new LinkedHashSet<String>();
        for (var step : manifest.steps()) {
            if (step != null && step.capability() != null) provided.add(step.capability());
        }
        for (var entry : packRequirements.entrySet()) {
            var missing = new TreeSet<>(entry.getValue() == null ? Set.<String>of() : entry.getValue());
            missing.removeAll(provided);
            if (missing.isEmpty()) continue;
            errors.add("规则包 " + entry.getKey() + " 需要能力 " + String.join("、", missing)
                    + " 来产出它所依赖的事实，但流程中没有对应节点；缺失时该规则包的这些规则永远不会命中，"
                    + "请添加对应能力节点或从清单中移除该规则包。");
        }
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
