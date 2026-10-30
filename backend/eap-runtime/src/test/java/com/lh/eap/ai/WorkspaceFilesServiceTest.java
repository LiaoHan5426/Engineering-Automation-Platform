package com.lh.eap.ai;
import com.lh.eap.config.RuntimeWorkspace;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

class WorkspaceFilesServiceTest {
    @TempDir Path root;
    @Test void listsBoundedReadOnlyEntriesAndRejectsTraversal() throws Exception {
        Files.createDirectory(root.resolve("src")); Files.writeString(root.resolve("src/App.vue"), "sample");
        Files.createDirectory(root.resolve("node_modules")); Files.writeString(root.resolve(".env"), "private");
        var service = new WorkspaceFilesService(new RuntimeWorkspace(root, root.toString(), ""));
        assertEquals(1, service.list("").entries().size());
        assertEquals("src/App.vue", service.list("src").entries().getFirst().path());
        assertEquals("INVALID_DIRECTORY_PATH", service.list("../outside").denial());
        assertEquals("INVALID_DIRECTORY_PATH", service.list(".git").denial());
        assertFalse(service.list("missing").denial().isEmpty());
        assertEquals("sample", Files.readString(root.resolve("src/App.vue")));
    }
    @Test void deniesMissingAuthorityAndLimitsEntries() throws Exception {
        assertEquals("AUTHORIZED_ROOT_MISSING", new WorkspaceFilesService(new RuntimeWorkspace(root, "", "")).list("").denial());
        for (int i = 0; i < 205; i++) Files.writeString(root.resolve("item" + i), "");
        var listing = new WorkspaceFilesService(new RuntimeWorkspace(root, root.toString(), "")).list("");
        assertEquals(200, listing.entries().size()); assertTrue(listing.truncated());
    }
}
