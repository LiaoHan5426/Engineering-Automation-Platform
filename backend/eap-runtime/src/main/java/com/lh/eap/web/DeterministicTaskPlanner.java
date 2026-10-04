package com.lh.eap.web;

import java.util.*;

final class DeterministicTaskPlanner {
    private DeterministicTaskPlanner() { }

    static Plan plan(String goal) {
        var text = goal.toLowerCase(Locale.ROOT);
        if (containsAny(text, "status", "状态", "仓库状态", "workspace")) return new Plan("git-status", List.of());
        if (containsAny(text, "diff", "变更", "修改范围", "差异")) return new Plan("git-diff", List.of("--stat"));
        if (containsAny(text, "search", "搜索", "查找", "grep", "ripgrep")) return new Plan("rg-search", List.of(goal));
        return new Plan(null, List.of());
    }

    private static boolean containsAny(String value, String... terms) {
        return Arrays.stream(terms).anyMatch(value::contains);
    }

    record Plan(String capability, List<String> args) { }
}
