package com.lh.eap.llm;

import java.util.Locale;

/**
 * Rough token estimator used to enforce a prompt budget before a model call. It is deliberately
 * conservative: CJK characters count as one token each and other characters are grouped by four.
 * It does not need to match the provider tokenizer exactly; its job is to bound cost and to
 * quantify how much the preprocessing step compressed the request.
 */
public final class ContextBudget {
    private ContextBudget() { }

    public static int estimateTokens(String text) {
        if (text == null || text.isEmpty()) return 0;
        int cjk = 0;
        int other = 0;
        for (int index = 0; index < text.length(); ) {
            int codePoint = text.codePointAt(index);
            if (isCjk(codePoint)) cjk++;
            else other++;
            index += Character.charCount(codePoint);
        }
        return cjk + (int) Math.ceil(other / 4.0);
    }

    public static boolean isCjk(int codePoint) {
        var block = Character.UnicodeBlock.of(codePoint);
        return block == Character.UnicodeBlock.CJK_UNIFIED_IDEOGRAPHS
                || block == Character.UnicodeBlock.CJK_UNIFIED_IDEOGRAPHS_EXTENSION_A
                || block == Character.UnicodeBlock.CJK_SYMBOLS_AND_PUNCTUATION
                || block == Character.UnicodeBlock.HALFWIDTH_AND_FULLWIDTH_FORMS
                || block == Character.UnicodeBlock.HIRAGANA
                || block == Character.UnicodeBlock.KATAKANA;
    }

    /** Truncate to at most {@code maxChars} characters without splitting a surrogate pair. */
    public static String clip(String text, int maxChars) {
        if (text == null) return "";
        if (text.length() <= maxChars) return text;
        int end = maxChars;
        if (end > 0 && Character.isHighSurrogate(text.charAt(end - 1))) end--;
        return text.substring(0, end) + "…";
    }

    public static String lower(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT).trim();
    }
}
