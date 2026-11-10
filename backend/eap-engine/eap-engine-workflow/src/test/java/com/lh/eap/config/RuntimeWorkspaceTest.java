package com.lh.eap.config;
import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
class RuntimeWorkspaceTest {
    @TempDir Path root;
    @Test void missingRootIsDeniedOutsideColocatedMode() {
        assertFalse(RuntimeWorkspace.decide(" ").allowed());
        assertEquals("AUTHORIZED_ROOT_MISSING", RuntimeWorkspace.decide(null).denial());
    }
    @Test void explicitRootUsesItsRealDirectoryAndDoesNotExposeThePath() throws Exception {
        var nested=Files.createDirectory(root.resolve("nested"));
        var runtime=new RuntimeWorkspace(root,nested.toString());
        assertEquals(nested.toRealPath(),runtime.root().path());
        assertTrue(runtime.workspaceLabel().startsWith("ws-"));
        assertFalse(runtime.workspaceLabel().contains(root.toString()));
    }
    @Test void colocatedBindsOnlyMissingConfigurationAndNeverReplacesInvalidExplicitRoot() throws Exception {
        assertEquals(root.toRealPath(),RuntimeWorkspace.colocated(root,"").root().path());
        assertFalse(RuntimeWorkspace.colocated(root,root.resolve("missing").toString()).root().allowed());
        assertFalse(RuntimeWorkspace.colocated(root,Files.createFile(root.resolve("file")).toString()).root().allowed());
    }
}
