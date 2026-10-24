package com.lh.eap.application.service;

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
            return new Decision(false, "CAPABILITY_DISABLED");
        }
        if (!handlerResolved) {
            return new Decision(false, "CAPABILITY_UNRESOLVED");
        }
        if (!gitInspectionHandler) {
            return new Decision(false, "CAPABILITY_HANDLER");
        }
        if (!gitCapability) {
            return new Decision(false, "CAPABILITY_IMPLEMENTATION");
        }
        if (authorizedRoot == null) {
            return new Decision(false, "AUTHORIZED_ROOT_MISSING");
        }
        if (workspace == null || !inside(workspace, authorizedRoot)) {
            return new Decision(false, "WORKSPACE_ESCAPES_ROOT");
        }
        return new Decision(true, "SERVER_POLICY");
    }

    private static boolean inside(Path workspace, Path root) {
        var directory = workspace.toAbsolutePath().normalize();
        var boundary = root.toAbsolutePath().normalize();
        return directory.startsWith(boundary);
    }
}
