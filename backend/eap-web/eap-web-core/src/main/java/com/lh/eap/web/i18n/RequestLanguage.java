package com.lh.eap.web.i18n;

import java.util.List;
import java.util.Locale;

/** Deterministic product languages; never inherit the server's operating-system locale. */
public final class RequestLanguage {
    public static final Locale CHINESE = Locale.SIMPLIFIED_CHINESE;
    public static final Locale ENGLISH = Locale.US;
    private RequestLanguage() {}

    public static Locale resolve(String acceptLanguage) {
        if (acceptLanguage == null || acceptLanguage.isBlank()) return CHINESE;
        try {
            for (var range : Locale.LanguageRange.parse(acceptLanguage)) {
                if (range.getWeight() == 0) continue;
                String language = range.getRange();
                if (language.equals("zh") || language.startsWith("zh-")) return CHINESE;
                if (language.equals("en") || language.startsWith("en-")) return ENGLISH;
                if (language.equals("*")) return CHINESE;
            }
        } catch (IllegalArgumentException invalid) { /* Malformed headers use the product default. */ }
        return CHINESE;
    }
}
