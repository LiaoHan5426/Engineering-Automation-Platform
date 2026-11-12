package com.lh.eap.ai;
import com.lh.eap.error.ChatErrors;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * CE-01 character-budget accounting for the existing chat assembly path.
 * Metering is CHAR_ESTIMATE (not provider tokens). Observations never retain body text.
 */
public final class ContextBudget {
    public static final int PLATFORM_CONTEXT_CHARS = 96000;
    public static final int INPUT_MATERIAL_LIMIT = 64000;
    public static final int OUTPUT_RESERVE_CHARS = 16384;
    public static final String METERING_CHAR_ESTIMATE = "CHAR_ESTIMATE";
    public static final String METERING_UNKNOWN = "UNKNOWN";

    private ContextBudget() {}

    public record SourceUsage(String source, int chars, String metering, String disposition) {}

    public record Observation(
            int platformLimit,
            int outputReserve,
            int inputMaterialLimit,
            int usedChars,
            int materialChars,
            int remainingChars,
            String metering,
            List<SourceUsage> sources,
            List<String> notes) {}

    public static final class Account {
        private final Map<String, SourceUsage> sources = new LinkedHashMap<>();
        private final List<String> notes = new ArrayList<>();

        public Account include(String source, String content) {
            int chars = content == null ? 0 : content.length();
            sources.put(source, new SourceUsage(source, chars, METERING_CHAR_ESTIMATE, "included"));
            return this;
        }

        public Account includeChars(String source, int chars) {
            if (chars < 0) throw new IllegalArgumentException("Negative context size");
            sources.put(source, new SourceUsage(source, chars, METERING_CHAR_ESTIMATE, "included"));
            return this;
        }

        public Account unknown(String source, String reason) {
            sources.put(source, new SourceUsage(source, 0, METERING_UNKNOWN, reason));
            return this;
        }

        public Account detail(String source, int chars) {
            sources.put(source, new SourceUsage(source, Math.max(0, chars), METERING_CHAR_ESTIMATE, "detail"));
            return this;
        }

        public Account dropped(String source, int chars, String reason) {
            sources.put(source, new SourceUsage(source, Math.max(0, chars), METERING_CHAR_ESTIMATE, reason));
            return this;
        }

        public Account note(String code) {
            if (code != null && !code.isBlank() && !notes.contains(code)) notes.add(code);
            return this;
        }

        public Observation enforce() {
            note("COMPRESSION_NOT_ENABLED");
            int material = included("user");
            int used = (int) Math.min(Integer.MAX_VALUE,
                    (long) included("system") + material + included("history"));
            boolean hasUnknown = sources.values().stream().anyMatch(s -> METERING_UNKNOWN.equals(s.metering()));
            String metering = hasUnknown ? METERING_UNKNOWN : METERING_CHAR_ESTIMATE;
            int remaining = PLATFORM_CONTEXT_CHARS - OUTPUT_RESERVE_CHARS - used;
            var observation = new Observation(
                    PLATFORM_CONTEXT_CHARS,
                    OUTPUT_RESERVE_CHARS,
                    INPUT_MATERIAL_LIMIT,
                    used,
                    material,
                    remaining,
                    metering,
                    List.copyOf(sources.values()),
                    List.copyOf(notes));
            if (material > INPUT_MATERIAL_LIMIT || (long) used + OUTPUT_RESERVE_CHARS > PLATFORM_CONTEXT_CHARS) {
                throw exceeded(observation);
            }
            return observation;
        }

        private int included(String source) {
            var usage = sources.get(source);
            if (usage == null || !"included".equals(usage.disposition())) return 0;
            return usage.chars();
        }
    }

    public static Account account() {
        return new Account();
    }

    public static ResponseStatusException exceeded(Observation observation) {
        var rejected = new ResponseStatusException(HttpStatus.BAD_REQUEST, ChatErrors.CONTEXT_BUDGET_EXCEEDED.code());
        rejected.getBody().setProperty("error", ChatErrors.CONTEXT_BUDGET_EXCEEDED.code());
        rejected.getBody().setProperty("contextBudget", observation);
        return rejected;
    }
}
