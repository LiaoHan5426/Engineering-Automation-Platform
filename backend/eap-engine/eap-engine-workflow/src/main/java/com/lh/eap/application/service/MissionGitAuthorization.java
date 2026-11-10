package com.lh.eap.application.service;
import com.lh.eap.error.WorkspaceErrors;
import com.lh.eap.error.ToolErrors;

import java.nio.file.Path;

/**
 * Starting git-status requires a resolved handler and a separate server policy.
 * A non-empty resolveFor result is not authorization. The git command itself stays in GitCapability.
 */
public final class MissionGitAuthorization {
    public record Decision(boolean allowed, String reason) {}

    private MissionGitAuthorization() {}

    public static Decision decide(boolean handlerResolved, boolean gitInspectionHandler, boolean capabilityEnabled,
                                  boolean gitCapability, Path authorizedRoot, Path workspace) {
        if (!capabilityEnabled) {
            return new Decision(false, ToolErrors.CAPABILITY_DISABLED.code());
        }
        if (!handlerResolved) {
            return new Decision(false, ToolErrors.CAPABILITY_UNRESOLVED.code());
        }
        if (!gitInspectionHandler) {
            return new Decision(false, "CAPABILITY_HANDLER");
        }
        if (!gitCapability) {
            return new Decision(false, "CAPABILITY_IMPLEMENTATION");
        }
        if (authorizedRoot == null) {
            return new Decision(false, WorkspaceErrors.AUTHORIZED_ROOT_MISSING.code());
        }
        if (workspace == null || !inside(workspace, authorizedRoot)) {
            return new Decision(false, WorkspaceErrors.WORKSPACE_ESCAPES_ROOT.code());
        }
        return new Decision(true, "SERVER_POLICY");
    }

    private static boolean inside(Path workspace, Path root) {
        var directory = workspace.toAbsolutePath().normalize();
        var boundary = root.toAbsolutePath().normalize();
        return directory.startsWith(boundary);
    }
}
