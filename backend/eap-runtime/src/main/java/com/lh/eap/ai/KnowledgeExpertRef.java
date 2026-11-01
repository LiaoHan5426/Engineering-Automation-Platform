package com.lh.eap.ai;

import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** Identity only: never accepts client-supplied grants, instructions or retrieved text. */
public record KnowledgeExpertRef(String id, long revision) {
    public KnowledgeExpertRef {
        if (id == null || id.length() > 120 || !id.matches("[a-z0-9]+(?:-[a-z0-9]+)*") || revision < 1) throw invalid();
    }
    public static KnowledgeExpertRef parse(Object value) {
        if (!(value instanceof Map<?, ?> fields) || !fields.keySet().equals(Set.of("id", "revision"))
                || !(fields.get("id") instanceof String id)
                || !(fields.get("revision") instanceof Integer || fields.get("revision") instanceof Long)) throw invalid();
        return new KnowledgeExpertRef(id, ((Number) fields.get("revision")).longValue());
    }
    static ResponseStatusException invalid() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "INVALID_EXPERT_CONTEXT");
    }
}
