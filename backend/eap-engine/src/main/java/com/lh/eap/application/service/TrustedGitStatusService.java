package com.lh.eap.application.service;

import com.lh.eap.config.RuntimeWorkspace;
import com.lh.eap.domain.model.ExpertManifest;
import com.lh.eap.domain.model.CapabilityContext;
import com.lh.eap.runtime.handler.CapabilityHandlerRegistry;
import com.lh.eap.runtime.handler.GitInspectionHandler;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/** TC-01: single read-only git-status invocation via existing handler; no new execution port. */
@Service
public class TrustedGitStatusService {
    private final CapabilityHandlerRegistry handlers;
    private final CapabilitySettings settings;
    private final RuntimeWorkspace runtime;

    public TrustedGitStatusService(CapabilityHandlerRegistry handlers, CapabilitySettings settings,
                                   RuntimeWorkspace runtime) {
        this.handlers = handlers;
        this.settings = settings;
        this.runtime = runtime;
    }

    public Map<String, Object> invoke() {
        if (!settings.enabled("git-status")) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "CAPABILITY_DISABLED");
        }
        var root = authorizedWorkspace();
        var resolved = handlers.resolveFor(null, "git-status")
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "GIT_STATUS_HANDLER_MISSING"));
        if (!(resolved instanceof GitInspectionHandler)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "GIT_STATUS_HANDLER_TYPE");
        }
        var context = new CapabilityContext(
                new ExpertManifest.Step("trusted-git", "Git status", "git-status", true),
                null,
                "",
                "",
                "trusted-tool",
                UUID.randomUUID(),
                java.util.List.of(),
                new java.util.HashMap<>(),
                new java.util.HashMap<>(),
                new java.util.ArrayList<>(),
                new java.util.ArrayList<>(),
                java.util.List.of(),
                root);
        var outcome = resolved.handle(context);
        var payload = new LinkedHashMap<String, Object>();
        payload.put("capability", "git-status");
        payload.put("success", outcome.success());
        payload.put("message", outcome.message());
        if (outcome.data() instanceof Map<?, ?> data) {
            for (var entry : data.entrySet()) {
                if (entry.getKey() instanceof String key) payload.put(key, entry.getValue());
            }
        }
        return Map.copyOf(payload);
    }

    private Path authorizedWorkspace() {
        var decision = runtime.root();
        if (!decision.allowed() || decision.path() == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, decision.denial() == null ? "AUTHORIZED_ROOT_MISSING" : decision.denial());
        }
        try {
            if (!Files.isDirectory(decision.path())) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "AUTHORIZED_ROOT_MISSING");
            }
            return decision.path().toRealPath();
        } catch (IOException failure) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "AUTHORIZED_ROOT_MISSING");
        }
    }
}
