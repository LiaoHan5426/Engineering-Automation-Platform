package com.lh.eap.application.service;

import com.lh.eap.common.SensitiveData;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class HandoffService {
    private static final Set<String> SOURCES = Set.of("chat", "builder");
    private static final Pattern SOURCE_REF = Pattern.compile("[A-Za-z0-9_.:-]{1,200}");
    private final HandoffStore store;

    public HandoffService(HandoffStore store) {
        this.store = store;
    }

    public Handoff record(String source, String sourceRef, String summary) {
        if (source == null || !SOURCES.contains(source)) {
            throw new IllegalArgumentException("交接来源只能是 chat 或 builder");
        }
        if (sourceRef == null || !SOURCE_REF.matcher(sourceRef).matches()) {
            throw new IllegalArgumentException("交接引用无效");
        }
        if (summary == null || summary.isBlank() || summary.length() > 8000) {
            throw new IllegalArgumentException("交接摘要不能为空，最多8000字符");
        }
        var handoff = new Handoff(
                UUID.randomUUID(),
                source,
                sourceRef,
                SensitiveData.redact(summary.trim()),
                "recorded",
                "not_started",
                "not_requested",
                "none",
                Instant.now());
        store.insert(handoff);
        return handoff;
    }

    public List<Handoff> list() {
        return store.list();
    }

    public Handoff detail(UUID id) {
        return store.find(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "交接不存在"));
    }
}
