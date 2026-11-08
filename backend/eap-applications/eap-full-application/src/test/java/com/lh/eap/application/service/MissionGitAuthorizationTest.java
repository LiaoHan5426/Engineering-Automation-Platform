package com.lh.eap.application.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class MissionGitAuthorizationTest {
    private final Path root = Path.of("F:/workspace");
    private final Path workspace = root.resolve("repo");

    @Test
    void resolvingAHandlerIsNotAuthorization() {
        var decision = MissionGitAuthorization.decide(true, true, true, true, null, workspace);
        assertFalse(decision.allowed());
        assertEquals("AUTHORIZED_ROOT_MISSING", decision.reason());
    }

    @Test
    void pathBoundaryIsNotAGrant() {
        var decision = MissionGitAuthorization.decide(true, true, true, true, root, Path.of("F:/elsewhere"));
        assertEquals("WORKSPACE_ESCAPES_ROOT", decision.reason());
    }

    @Test
    void disabledCapabilityIsSeparateFromPathDenial() {
        var decision = MissionGitAuthorization.decide(false, true, false, true, root, workspace);
        assertEquals("CAPABILITY_DISABLED", decision.reason());
    }
}
