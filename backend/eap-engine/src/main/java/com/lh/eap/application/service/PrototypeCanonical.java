package com.lh.eap.application.service;

import com.lh.eap.common.SensitiveData;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import tools.jackson.databind.json.JsonMapper;

/** One canonical form for both the stored version and the reopened preview. */
public final class PrototypeCanonical {
    public static final String INTERACTION = "预览按钮使计数加一";

    public record Content(String sourceRef, String title, String body, int buttonPresses,
                          String interaction, List<String> acceptance, String hash) {}

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private PrototypeCanonical() {}

    public static Content of(String sourceRef, String title, String body, int buttonPresses, List<String> acceptance) {
        if (!"builder-alpha".equals(sourceRef) && !"builder-beta".equals(sourceRef)) {
            throw new IllegalArgumentException("原型版本只属于 builder-alpha 或 builder-beta");
        }
        if (buttonPresses < 0) {
            throw new IllegalArgumentException("按钮次数不能为负");
        }
        var normalizedTitle = text(title);
        var normalizedBody = text(body);
        if (normalizedTitle.isBlank() && normalizedBody.isBlank()) {
            throw new IllegalArgumentException("标题和正文不能同时为空");
        }
        var conditions = new ArrayList<String>();
        if (acceptance != null) {
            for (var item : acceptance) {
                var normalized = text(item);
                if (!normalized.isBlank()) conditions.add(normalized);
            }
        }
        var content = new Content(sourceRef, normalizedTitle, normalizedBody, buttonPresses, INTERACTION,
                List.copyOf(conditions), "");
        return new Content(content.sourceRef(), content.title(), content.body(), content.buttonPresses(),
                content.interaction(), content.acceptance(), sha256(json(content)));
    }

    /** Field order is part of the hash. Jackson only supplies escaping and UTF-8 bytes. */
    public static String json(Content content) {
        var fields = new LinkedHashMap<String, Object>();
        fields.put("sourceRef", content.sourceRef());
        fields.put("title", content.title());
        fields.put("body", content.body());
        fields.put("buttonPresses", content.buttonPresses());
        fields.put("interaction", content.interaction());
        fields.put("acceptance", content.acceptance());
        return JSON.writeValueAsString(fields);
    }

    private static String text(String value) {
        var redacted = SensitiveData.redact(value == null ? "" : value);
        var newlines = redacted.replace("\r\n", "\n").replace('\r', '\n');
        return Normalizer.normalize(newlines, Normalizer.Form.NFC).strip();
    }

    private static String sha256(String json) {
        try {
            var digest = MessageDigest.getInstance("SHA-256").digest(json.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }
}
