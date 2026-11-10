package com.lh.eap.delivery;
import com.lh.eap.error.GitErrors;
import com.lh.eap.error.ExecutionErrors;
import com.lh.eap.error.ToolErrors;
import com.lh.eap.delivery.CodeChangeService;

import com.lh.eap.api.ExecutionContext;
import com.lh.eap.api.ProcessExecutor;
import com.lh.eap.application.service.CapabilitySettings;
import com.lh.eap.capability.GitCapability;
import com.lh.eap.core.CapabilityRegistry;
import com.lh.eap.common.SensitiveData;
import java.io.IOException;
import java.nio.file.Path;
import org.springframework.stereotype.Component;

/** Dirty inspection uses the registered Git policy, live CLI channel and bounded platform executor. */
@Component
public final class CapabilityDirtyRunner implements CodeChangeService.DirtyRunner {
    private final CapabilitySettings settings;
    private final CapabilityRegistry registry;
    private final ProcessExecutor executor;

    public CapabilityDirtyRunner(CapabilitySettings settings, CapabilityRegistry registry, ProcessExecutor executor) {
        this.settings = settings;
        this.registry = registry;
        this.executor = executor;
    }

    @Override public String porcelain(Path workspace) throws IOException {
        if (!settings.enabled("git-status")) throw new IOException(ToolErrors.CAPABILITY_DISABLED.code());
        if (!(registry.require("git-status") instanceof GitCapability git)) throw new IOException(GitErrors.GIT_STATUS_UNAVAILABLE.code());
        if (!git.runnable()) throw new IOException(ExecutionErrors.BINARY_MISSING.code());
        var result = git.execute(new ExecutionContext(workspace, executor), "--porcelain=v1");
        if (!result.success() || !"SUCCEEDED".equals(result.metadata().get("executorStatus"))
                || !Boolean.TRUE.equals(result.metadata().get("processExited"))
                || !Boolean.TRUE.equals(result.metadata().get("processTreeCleanup"))) {
            throw new IOException(GitErrors.GIT_STATUS_UNCONFIRMED.code());
        }
        if (Boolean.TRUE.equals(result.metadata().get("truncated")) || result.stdout().length() > 32768) throw new IOException(GitErrors.GIT_STATUS_TRUNCATED.code());
        return SensitiveData.redact(result.stdout());
    }
}
