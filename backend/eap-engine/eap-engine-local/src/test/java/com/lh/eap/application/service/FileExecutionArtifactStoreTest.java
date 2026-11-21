package com.lh.eap.application.service;

import java.nio.file.*;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

class FileExecutionArtifactStoreTest {
    @TempDir Path root;

    /** A directory alias pointing outside the artifact root: Windows junction, POSIX symlink. */
    private static void createDirectoryAlias(Path alias, Path target) throws Exception {
        if (System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win")) {
            var process = new ProcessBuilder("cmd.exe", "/d", "/c", "mklink", "/J",
                    alias.toString(), target.toString()).start();
            assertTrue(process.waitFor(5, TimeUnit.SECONDS));
            assertEquals(0, process.exitValue());
        } else {
            try { Files.createSymbolicLink(alias, target); }
            catch (java.io.IOException | UnsupportedOperationException unavailable) {
                Assumptions.abort("OS does not permit directory symlink fixture");
            }
        }
    }
    @Test void rejectsUnknownKindsAndDoesNotOverwrite()throws Exception{
        var store=new FileExecutionArtifactStore(root.resolve("evidence"));var id=UUID.randomUUID();
        assertThrows(java.io.IOException.class,()->store.save(id,"../../escape",new byte[0]));
        var first=store.save(id,"stderr","first".getBytes());var second=store.save(id,"stderr","second".getBytes());
        assertNotEquals(first.relativePath(),second.relativePath());
        assertEquals("first",Files.readString(root.resolve("evidence").resolve(first.relativePath())));
    }
    @Test void rejectsJunctionOutsideArtifactRoot()throws Exception{
        var storage=Files.createDirectory(root.resolve("evidence"));var outside=Files.createDirectory(root.resolve("outside"));
        var id=UUID.randomUUID();var alias=storage.resolve(id.toString());
        createDirectoryAlias(alias, outside);
        try{
            var store=new FileExecutionArtifactStore(storage);
            assertThrows(java.io.IOException.class,()->store.save(id,"stderr","secret".getBytes()));
            try(var files=Files.list(outside)){assertEquals(0,files.count());}
        }finally{Files.delete(alias);}
    }
}
