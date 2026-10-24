package com.lh.eap.application.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.List;
import org.junit.jupiter.api.Test;

class PrototypeCanonicalTest {
    @Test
    void formattingDifferencesKeepTheSameHashAndTheServerOwnsTheInteraction() {
        var spaced = PrototypeCanonical.of("builder-alpha", " 结算页 \r\n", "正文\r第二行", 2, List.of(" 看标题 ", ""));
        var compact = PrototypeCanonical.of("builder-alpha", "结算页", "正文\n第二行", 2, List.of("看标题"));
        assertEquals(compact.hash(), spaced.hash());
        assertEquals(PrototypeCanonical.INTERACTION, compact.interaction());
        assertEquals("结算页", compact.title());
        assertEquals("正文\n第二行", compact.body());
        assertEquals(List.of("看标题"), compact.acceptance());
        var reopened = PrototypeCanonical.of(compact.sourceRef(), compact.title(), compact.body(), compact.buttonPresses(), compact.acceptance());
        assertEquals(compact.hash(), reopened.hash());
        assertEquals(compact.title(), reopened.title());
    }

    @Test
    void aDifferentBodyIsADifferentHash() {
        var first = PrototypeCanonical.of("builder-alpha", "结算页", "正文", 0, List.of());
        var second = PrototypeCanonical.of("builder-alpha", "结算页", "另一段", 0, List.of());
        assertNotEquals(first.hash(), second.hash());
    }

    @Test
    void blankContentAndUnknownInstancesAreRejected() {
        assertThrows(IllegalArgumentException.class, () -> PrototypeCanonical.of("builder-alpha", " ", "\n", 0, List.of(" ")));
        assertThrows(IllegalArgumentException.class, () -> PrototypeCanonical.of("repo", "标题", "正文", 0, List.of()));
    }

    @Test
    void jacksonKeepsThePreviousFieldOrderAndEscapes() {
        var samples = List.of(
                PrototypeCanonical.of("builder-alpha", "结算页", "正文", 0, List.of()),
                PrototypeCanonical.of("builder-alpha", "说\"你好\"", "a\\b", 1, List.of("引号\"", "斜杠\\")),
                PrototypeCanonical.of("builder-beta", "café雪", "第一行\n第二行\t缩进", 4, List.of("café", "雪")),
                PrototypeCanonical.of("builder-alpha", "控制\u0001\u0007", "结束", 0, List.of("\u0001")));
        for (var content : samples) {
            assertEquals(historicalJson(content), PrototypeCanonical.json(content));
            assertEquals(0, PrototypeCanonical.json(content).indexOf("{\"sourceRef\":"));
            assertEquals(content.hash(), PrototypeCanonical.of(content.sourceRef(), content.title(), content.body(),
                    content.buttonPresses(), content.acceptance()).hash());
        }
    }

    @Test
    void backspaceAndFormFeedUseJacksonEscapesWithoutRewritingStoredHashes() {
        var content = PrototypeCanonical.of("builder-alpha", "退格\b中\f间", "正文", 0, List.of("项\b"));
        var current = PrototypeCanonical.json(content);
        var historical = historicalJson(content);
        assertNotEquals(historical, current);
        assertEquals(true, current.contains("\\b") && current.contains("\\f"), current);
        assertEquals(true, historical.contains("\\u0008") && historical.contains("\\u000c"), historical);
        assertNotEquals(sha256(historical), content.hash());
        assertEquals(sha256(current), content.hash());
    }

    @Test
    void secretsAreRedactedBeforeTheHash() {
        var content = PrototypeCanonical.of("builder-alpha", "password='hidden'", "jdbc:postgresql://db/app", 0, List.of("token=\"secret\""));
        assertFalse(content.title().contains("hidden"));
        assertFalse(content.body().contains("postgresql"));
        assertFalse(content.acceptance().getFirst().contains("secret"));
        assertEquals(content.hash(), PrototypeCanonical.of(content.sourceRef(), content.title(), content.body(),
                content.buttonPresses(), content.acceptance()).hash());
        assertFalse(PrototypeCanonical.json(content).contains("hidden"));
    }

    /** The handwritten escaper used before Jackson. It stays here to pin stored-hash compatibility. */
    private static String historicalJson(PrototypeCanonical.Content content) {
        var acceptance = new StringBuilder("[");
        for (var i = 0; i < content.acceptance().size(); i++) {
            if (i > 0) acceptance.append(',');
            acceptance.append(historicalQuote(content.acceptance().get(i)));
        }
        acceptance.append(']');
        return "{\"sourceRef\":" + historicalQuote(content.sourceRef())
                + ",\"title\":" + historicalQuote(content.title())
                + ",\"body\":" + historicalQuote(content.body())
                + ",\"buttonPresses\":" + content.buttonPresses()
                + ",\"interaction\":" + historicalQuote(content.interaction())
                + ",\"acceptance\":" + acceptance + "}";
    }

    private static String historicalQuote(String value) {
        var out = new StringBuilder("\"");
        for (var i = 0; i < value.length(); i++) {
            var c = value.charAt(i);
            switch (c) {
                case '"' -> out.append("\\\"");
                case '\\' -> out.append("\\\\");
                case '\n' -> out.append("\\n");
                case '\t' -> out.append("\\t");
                default -> {
                    if (c < 0x20) out.append(String.format("\\u%04x", (int) c));
                    else out.append(c);
                }
            }
        }
        return out.append('"').toString();
    }

    private static String sha256(String json) {
        try {
            var digest = java.security.MessageDigest.getInstance("SHA-256").digest(json.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            return java.util.HexFormat.of().formatHex(digest);
        } catch (java.security.NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }
}
