package com.lh.eap.llm;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Turns deterministic evidence into a compact, token-bounded, structured prompt.
 *
 * <p>This is the "preprocess before calling the model" stage that the platform is built around.
 * Instead of forwarding raw SQL plus every retrieved document, it:
 * <ul>
 *   <li>selects only the decisive evidence (findings ranked by severity, top-k knowledge excerpts);</li>
 *   <li>clips every section and enforces a hard prompt token budget;</li>
 *   <li>reports how much the request was compressed versus a naive "send everything" prompt.</li>
 * </ul>
 * The result is deterministic: the same evidence always yields the same prompt, which lets the
 * gateway cache it and keeps model output auditable.
 */
@Service
public class PromptPreprocessor {
    private static final String SYSTEM = """
            You are a senior database performance reviewer working inside an offline engineering tool.
            Hard rules:
            - Use ONLY the evidence provided. Never invent tables, columns, indexes, statistics or timings.
            - The deterministic findings were produced by a local SQL AST analyzer; treat them as facts.
            - If evidence is insufficient, list what is missing under openQuestions instead of guessing.
            - Never emit an executable DDL/DML statement that changes data.
            Output STRICT JSON only, no prose, with this shape:
            {"verdict":string,"optimizations":[{"title":string,"rationale":string,"risk":"low|medium|high",
            "confidence":number,"requiresIndex":boolean}],"openQuestions":[string],"uncertainty":string}""";

    private final int maxPromptTokens;

    public PromptPreprocessor(@Value("${eap.llm.max-prompt-tokens:1800}") int maxPromptTokens) {
        this.maxPromptTokens = Math.max(200, maxPromptTokens);
    }

    public record SqlEvidence(String sql, String question, Map<String, Object> analysis,
                              List<Map<String, Object>> knowledge, List<String> notes, List<String> rules) { }

    public record PreparedPrompt(String systemPrompt, String userPrompt, int estimatedTokens,
                                 int baselineTokens, double compressionRatio,
                                 List<String> includedSections, List<String> droppedSections) { }

    @SuppressWarnings("unchecked")
    public PreparedPrompt prepare(SqlEvidence evidence) {
        var analysis = evidence.analysis() == null ? Map.<String, Object>of() : evidence.analysis();
        var findings = analysis.get("findings") instanceof List<?> list
                ? (List<Map<String, Object>>) list : List.<Map<String, Object>>of();
        var joinKeys = analysis.get("joinKeys") instanceof List<?> list
                ? list.stream().map(String::valueOf).toList() : List.<String>of();
        var notes = evidence.notes() == null ? List.<String>of() : evidence.notes();
        var rules = evidence.rules() == null ? List.<String>of() : evidence.rules();
        List<Map<String, Object>> knowledge = evidence.knowledge() == null ? List.of() : evidence.knowledge();

        var sql = ContextBudget.clip(evidence.sql() == null ? "" : evidence.sql().trim(), 4000);
        var question = ContextBudget.clip(evidence.question() == null ? "" : evidence.question().trim(), 600);

        int baseline = ContextBudget.estimateTokens(
                sql + " " + question + " " + findings + " " + knowledge + " " + notes + " " + rules);

        int knowledgeBudget = 3;
        int excerptChars = 600;
        int noteBudget = 6;
        String prompt = "";
        for (int attempt = 0; attempt < 5; attempt++) {
            prompt = build(sql, question, findings, joinKeys, knowledge, notes, rules,
                    knowledgeBudget, excerptChars, noteBudget);
            if (ContextBudget.estimateTokens(prompt) + ContextBudget.estimateTokens(SYSTEM) <= maxPromptTokens) break;
            if (knowledgeBudget > 0) knowledgeBudget--;
            else if (noteBudget > 2) noteBudget -= 2;
            else excerptChars = Math.max(200, excerptChars - 150);
        }

        var included = new ArrayList<String>();
        if (!question.isBlank()) included.add("goal");
        if (!sql.isBlank()) included.add("sql");
        if (!findings.isEmpty()) included.add("findings");
        if (!joinKeys.isEmpty()) included.add("joinKeys");
        if (!knowledge.isEmpty() && knowledgeBudget > 0) included.add("knowledge");
        if (!notes.isEmpty() && noteBudget > 0) included.add("metadata");
        included.add("rules");

        var dropped = new ArrayList<String>();
        if (!knowledge.isEmpty() && knowledgeBudget <= 0) dropped.add("knowledge");
        else if (knowledge.size() > knowledgeBudget && knowledgeBudget > 0) dropped.add("knowledge-overflow");
        if (!notes.isEmpty() && noteBudget <= 0) dropped.add("metadata");
        else if (notes.size() > noteBudget && noteBudget > 0) dropped.add("metadata-overflow");

        int preparedTokens = ContextBudget.estimateTokens(prompt) + ContextBudget.estimateTokens(SYSTEM);
        double ratio = baseline <= 0 ? 0 : Math.max(0, 1 - (double) preparedTokens / baseline);
        return new PreparedPrompt(SYSTEM, prompt, preparedTokens, baseline, ratio,
                List.copyOf(included), List.copyOf(dropped));
    }

    private String build(String sql, String question, List<Map<String, Object>> findings, List<String> joinKeys,
                         List<Map<String, Object>> knowledge, List<String> notes, List<String> rules,
                         int knowledgeBudget, int excerptChars, int noteBudget) {
        var prompt = new StringBuilder();
        prompt.append("# Goal\n").append(question.isBlank() ? "(未提供，请仅基于 SQL 结构分析)" : question).append("\n\n");
        prompt.append("# Normalized SQL\n```sql\n").append(sql.isBlank() ? "-- 未提供 SQL" : sql).append("\n```\n\n");

        prompt.append("# Deterministic findings (facts)\n");
        if (findings.isEmpty()) prompt.append("- 无规则命中\n");
        for (var finding : findings) {
            prompt.append("- [").append(finding.get("severity")).append("] ")
                    .append(finding.get("code")).append(": ").append(finding.get("evidence")).append("\n");
        }
        prompt.append("\n");

        prompt.append("# Join keys\n");
        if (joinKeys.isEmpty()) prompt.append("- (none detected)\n");
        for (var key : joinKeys) prompt.append("- ").append(key).append("\n");
        prompt.append("\n");

        if (knowledgeBudget > 0 && !knowledge.isEmpty()) {
            prompt.append("# Retrieved knowledge (source-cited, may be stale)\n");
            int shown = 0;
            for (var item : knowledge) {
                if (shown++ >= knowledgeBudget) break;
                prompt.append("[").append(shown).append("] ")
                        .append(item.get("knowledgeBase")).append(" / ").append(item.get("source")).append(": ")
                        .append(ContextBudget.clip(String.valueOf(item.get("excerpt")), excerptChars)).append("\n");
            }
            prompt.append("\n");
        }

        if (noteBudget > 0 && !notes.isEmpty()) {
            prompt.append("# Schema / index notes (human-registered snapshot)\n");
            int shown = 0;
            for (var note : notes) {
                if (shown++ >= noteBudget) break;
                prompt.append("- ").append(ContextBudget.clip(note, 240)).append("\n");
            }
            prompt.append("\n");
        }

        prompt.append("# Rules to respect\n");
        if (rules.isEmpty()) prompt.append("- 不得泄露凭据；不得自动执行 SQL\n");
        for (var rule : rules) prompt.append("- ").append(rule).append("\n");
        return prompt.toString();
    }

    /** Convenience view used by tests and diagnostics. */
    public Map<String, Object> describe(PreparedPrompt prompt) {
        var map = new LinkedHashMap<String, Object>();
        map.put("estimatedTokens", prompt.estimatedTokens());
        map.put("baselineTokens", prompt.baselineTokens());
        map.put("compressionRatio", Math.round(prompt.compressionRatio() * 1000) / 1000.0);
        map.put("includedSections", prompt.includedSections());
        map.put("droppedSections", prompt.droppedSections());
        return map;
    }
}
