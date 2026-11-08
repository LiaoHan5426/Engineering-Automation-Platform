package com.lh.eap.web.controller;

import com.lh.eap.application.service.RuntimeDataLayoutService;
import com.lh.eap.application.service.TrustedGitStatusService;
import com.lh.eap.application.service.TrustedToolCatalogService;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/runtime")
public class RuntimeDataController {
    private final RuntimeDataLayoutService layout;
    private final TrustedToolCatalogService trustedTools;
    private final TrustedGitStatusService gitStatus;

    public RuntimeDataController(RuntimeDataLayoutService layout, TrustedToolCatalogService trustedTools,
                                 TrustedGitStatusService gitStatus) {
        this.layout = layout;
        this.trustedTools = trustedTools;
        this.gitStatus = gitStatus;
    }

    @GetMapping("/data-layout")
    public Map<String, Object> dataLayout() {
        return layout.layout();
    }

    @GetMapping("/trusted-tools")
    public Map<String, Object> trustedTools() {
        return trustedTools.catalog();
    }

    /** TD-01: explicit {@code --version} probe with in-process catalog writeback. */
    @PostMapping("/trusted-tools/{id}/probe-version")
    public Map<String, Object> probeTrustedToolVersion(@PathVariable String id) {
        return trustedTools.probeVersion(id);
    }

    /** TD-01: drop durable probe snapshots; bindings and enablement unchanged. */
    @PostMapping("/trusted-tools/probe-cache/clear")
    public Map<String, Object> clearTrustedToolProbeCache() {
        return trustedTools.clearProbeCache();
    }

    @PostMapping("/trusted-tools/git-status/invoke")
    public Map<String, Object> invokeGitStatus() {
        return gitStatus.invoke();
    }
}
