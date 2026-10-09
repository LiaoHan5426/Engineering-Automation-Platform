package com.lh.eap.rules;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import tools.jackson.databind.json.JsonMapper;

/**
 * Ship-time rule packs: classpath resources under {@code rules/*.json}.
 *
 * <p>Built-in packs give a fresh install a working expert without any database rows, exactly like
 * built-in expert manifests under {@code experts/*.json}. Everything they contain is still plain
 * configuration: an operator can copy a built-in pack, edit it through the API, and reference the
 * edited copy from their own expert.
 *
 * <p>It also owns the capability-requirement contract: which facts a pack references, which
 * capabilities those facts come from, and whether the pack declared them.
 */
public final class RulePacks {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final String LOCATION = "classpath*:rules/*.json";
    private static volatile List<RulePack> cached;

    private RulePacks() { }

    public static RulePack parse(String json) {
        return JSON.readValue(json, RulePack.class);
    }

    public static String serialize(RulePack pack) {
        return JSON.writeValueAsString(pack);
    }

    /** All built-in packs, ordered by resource name so behaviour is deterministic. */
    public static List<RulePack> builtin() {
        var result = cached;
        if (result != null) return result;
        synchronized (RulePacks.class) {
            if (cached != null) return cached;
            var loaded = new ArrayList<RulePack>();
            try {
                var resources = new PathMatchingResourcePatternResolver(RulePacks.class.getClassLoader())
                        .getResources(LOCATION);
                var sorted = new TreeMap<String, Resource>();
                for (var resource : resources) sorted.put(String.valueOf(resource.getFilename()), resource);
                for (var resource : sorted.values()) {
                    try (var stream = resource.getInputStream()) {
                        loaded.add(parse(new String(stream.readAllBytes(), StandardCharsets.UTF_8)));
                    }
                }
            } catch (IOException error) {
                throw new IllegalStateException("内置规则包无法读取", error);
            }
            cached = List.copyOf(loaded);
            return cached;
        }
    }

    public static Optional<RulePack> builtinById(String id) {
        return builtin().stream().filter(pack -> Objects.equals(pack.id(), id)).findFirst();
    }

    /** A single pack whose rule list and policy are the union of the given packs. */
    public static RulePack merged(List<RulePack> packs) {
        if (packs == null || packs.isEmpty()) return new RulePack("eap/v1", "RulePack", "merged",
                "Merged rule packs", 1, null, null, List.of());
        if (packs.size() == 1) return packs.getFirst();
        var rules = new ArrayList<RulePack.Rule>();
        RulePack.Policy policy = null;
        var capabilities = new LinkedHashSet<String>();
        for (var pack : packs) {
            if (pack == null) continue;
            if (policy == null) policy = pack.policy();
            if (pack.rules() != null) rules.addAll(pack.rules());
            capabilities.addAll(requiredCapabilities(pack));
        }
        return new RulePack("eap/v1", "RulePack", "merged", "Merged rule packs", 1, null, policy,
                List.copyOf(rules), new RulePack.Requires(List.copyOf(capabilities), "由多个规则包合并而来"));
    }

    /**
     * Every fact key a pack reads: rule conditions, severity escalations and the policy's complexity
     * inputs. This is what capability requirements are derived from.
     */
    public static Set<String> referencedFacts(RulePack pack) {
        var facts = new TreeSet<String>();
        if (pack == null) return facts;
        if (pack.rules() != null) {
            for (var rule : pack.rules()) {
                if (rule == null) continue;
                collectFacts(rule.when(), facts);
                if (rule.severityWhen() != null) {
                    for (var override : rule.severityWhen()) {
                        if (override != null) collectFacts(override.when(), facts);
                    }
                }
            }
        }
        var policy = pack.policy();
        if (policy != null && policy.complexity() != null) {
            if (policy.complexity().weights() != null) facts.addAll(policy.complexity().weights().keySet());
            if (policy.complexity().multiTableFact() != null) facts.add(policy.complexity().multiTableFact());
        }
        return facts;
    }

    /**
     * The capabilities a pack needs. Preference order: what the pack declared (validated against the
     * derived set), otherwise what its facts imply — so an invalid hand-written pack still reports the
     * capabilities it would need instead of pretending it needs none.
     */
    public static Set<String> requiredCapabilities(RulePack pack) {
        var declared = pack == null ? List.<String>of() : pack.declaredCapabilities();
        if (!declared.isEmpty()) return new TreeSet<>(declared);
        return SqlFactVocabulary.producersOf(referencedFacts(pack));
    }

    static void collectFacts(RulePack.Condition condition, Set<String> target) {
        if (condition == null) return;
        if (condition.all() != null) { condition.all().forEach(child -> collectFacts(child, target)); return; }
        if (condition.any() != null) { condition.any().forEach(child -> collectFacts(child, target)); return; }
        if (condition.not() != null) { collectFacts(condition.not(), target); return; }
        if (condition.fact() != null && !condition.fact().isBlank()) target.add(condition.fact());
    }

    /** Structural validation of a pack, including its capability-requirement declaration. */
    public static List<String> validate(RulePack pack) {
        var errors = new ArrayList<String>();
        if (pack == null) { errors.add("规则包为空"); return errors; }
        if (pack.id() == null || !pack.id().matches("[a-z0-9]+(?:-[a-z0-9]+)*") || pack.id().length() > 100) {
            errors.add("规则包标识必须为小写英文数字和连字符，最多100字符");
        }
        if (pack.name() == null || pack.name().isBlank() || pack.name().length() > 200) {
            errors.add("规则包名称不能为空，最多200字符");
        }
        var rules = pack.rules();
        if (rules == null || rules.isEmpty()) { errors.add("规则包至少需要一条规则"); return errors; }
        if (rules.size() > 500) { errors.add("规则包最多500条规则"); return errors; }
        var ids = new HashSet<String>();
        for (var rule : rules) {
            if (rule == null) { errors.add("规则不能为空"); continue; }
            if (rule.id() == null || rule.id().isBlank() || rule.id().length() > 120) {
                errors.add("规则标识不能为空且最多120字符");
            } else if (!ids.add(rule.id())) {
                errors.add("规则标识重复：" + rule.id());
            }
            errors.addAll(validateCondition(rule.when(), "规则 " + rule.id()));
            if (rule.severityWhen() != null) {
                for (var override : rule.severityWhen()) {
                    if (override != null) errors.addAll(validateCondition(override.when(), "规则 " + rule.id() + " 的升级条件"));
                }
            }
            if (rule.suggestion() == null || rule.suggestion().isBlank()) errors.add("规则 " + rule.id() + " 缺少建议文本");
        }
        var policy = pack.policy();
        if (policy != null && policy.complexity() != null && policy.complexity().weights() != null) {
            for (var fact : policy.complexity().weights().keySet()) {
                if (!SqlFactVocabulary.FACTS_BY_KEY.containsKey(fact)) errors.add("复杂度权重引用了未知事实：" + fact);
            }
        }
        errors.addAll(validateRequirements(pack));
        return errors;
    }

    /**
     * The capability-requirement contract.
     *
     * <p>Derived from the facts the rules reference, so the author is never asked to guess; the
     * declaration exists so the mismatch is caught here instead of showing up as a rule that silently
     * never fires because the expert never ran the capability that produces its facts.
     */
    private static List<String> validateRequirements(RulePack pack) {
        var errors = new ArrayList<String>();
        var derived = SqlFactVocabulary.producersOf(referencedFacts(pack));
        var declared = pack.declaredCapabilities();
        if (declared.isEmpty()) {
            errors.add("规则包必须声明所需能力 requires.capabilities；按规则引用的事实推导，至少需要："
                    + String.join("、", derived) + "。缺少该声明时，专家编排无法校验流程是否真的能产出这些事实。");
            return errors;
        }
        for (var capability : declared) {
            if (capability == null || capability.isBlank()) { errors.add("requires.capabilities 不能包含空项"); continue; }
            if (!SqlFactVocabulary.producers().contains(capability)) {
                errors.add("requires.capabilities 引用了不发布事实的能力：" + capability
                        + "。规则包只能依赖发布事实的能力，否则规则无法通过事实获得证据。");
            }
        }
        var missing = new TreeSet<>(derived);
        missing.removeAll(declared);
        if (!missing.isEmpty()) {
            errors.add("requires.capabilities 缺少规则实际依赖的能力：" + String.join("、", missing)
                    + "。这些规则引用了由它们产出的事实，缺失时对应规则永远不会命中。");
        }
        return errors;
    }

    private static List<String> validateCondition(RulePack.Condition condition, String owner) {
        var errors = new ArrayList<String>();
        if (condition == null) return errors;
        if (condition.all() != null) { condition.all().forEach(child -> errors.addAll(validateCondition(child, owner))); return errors; }
        if (condition.any() != null) { condition.any().forEach(child -> errors.addAll(validateCondition(child, owner))); return errors; }
        if (condition.not() != null) return validateCondition(condition.not(), owner);
        if (condition.fact() == null || condition.fact().isBlank()) {
            errors.add(owner + " 的条件缺少 fact");
            return errors;
        }
        if (!SqlFactVocabulary.FACTS_BY_KEY.containsKey(condition.fact())) {
            errors.add(owner + " 引用了未知事实：" + condition.fact());
        }
        var op = condition.op() == null ? "eq" : condition.op();
        if (!SqlFactVocabulary.OPERATORS.contains(op)) errors.add(owner + " 使用了不支持的运算符：" + op);
        return errors;
    }
}
