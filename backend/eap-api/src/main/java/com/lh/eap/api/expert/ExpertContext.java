package com.lh.eap.api.expert;

import java.util.Map;

public record ExpertContext(String actor, Map<String, Object> authorizedData) {
    public ExpertContext { authorizedData = Map.copyOf(authorizedData == null ? Map.of() : authorizedData); }
}
