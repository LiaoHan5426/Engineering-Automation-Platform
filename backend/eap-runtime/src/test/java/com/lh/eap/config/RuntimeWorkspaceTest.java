package com.lh.eap.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class RuntimeWorkspaceTest {
    @TempDir Path root;
    @TempDir Path other;

    @Test
    void emptyRootsStayDenied() {
        var decision = RuntimeWorkspace.decide(" ", null);
        assertFalse(decision.allowed());
        assertEquals("AUTHORIZED_ROOT_MISSING", decision.denial());
    }

    @Test
    void legacyKeyIsOnlyAFallback() throws Exception {
        var decision = RuntimeWorkspace.decide("", root.toString());
        assertTrue(decision.allowed());
        assertEquals(root.toRealPath(), decision.path());
    }

    @Test
    void sameRealPathIsNotWidenedAndDifferentPathsConflict() throws Exception {
        var nested = Files.createDirectory(root.resolve("repo"));
        var same = RuntimeWorkspace.decide(root.toString(), root.toRealPath().toString());
        assertTrue(same.allowed());
        assertEquals(root.toRealPath(), same.path());
        var conflict = RuntimeWorkspace.decide(nested.toString(), other.toString());
        assertEquals("ROOT_CONFLICT", conflict.denial());
        assertFalse(conflict.allowed());
    }

    @Test
    void labelDoesNotExposeThePath() {
        var label = new RuntimeWorkspace(root, root.toString(), "").workspaceLabel();
        assertTrue(label.startsWith("ws-"));
        assertFalse(label.contains(root.toString()));
    }
}
