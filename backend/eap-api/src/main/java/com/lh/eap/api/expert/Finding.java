package com.lh.eap.api.expert;

import java.util.Map;

public record Finding(String code, String message, double confidence, Map<String, Object> attributes) {
    public Finding { attributes = Map.copyOf(attributes == null ? Map.of() : attributes); }
}
