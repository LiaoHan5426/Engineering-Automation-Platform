package com.lh.eap.application.service;

import java.nio.file.*;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

class FileExecutionArtifactStoreTest {
    @TempDir Path root;
    @Test void rejectsUnknownKindsAndDoesNotOverwrite()throws Exception{
        var store=new FileExecutionArtifactStore(root.resolve("evidence"));var id=UUID.randomUUID();
        assertThrows(java.io.IOException.class,()->store.save(id,"../../escape",new byte[0]));
        var first=store.save(id,"stderr","first".getBytes());var second=store.save(id,"stderr","second".getBytes());
        assertNotEquals(first.relativePath(),second.relativePath());
        assertEquals("first",Files.readString(root.resolve("evidence").resolve(first.relativePath())));
    }
    @Test void rejectsJunctionOutsideArtifactRoot()throws Exception{
        var storage=Files.createDirectory(root.resolve("evidence"));var outside=Files.createDirectory(root.resolve("outside"));
        var id=UUID.randomUUID();var junction=storage.resolve(id.toString());
        var process=new ProcessBuilder("cmd.exe","/d","/c","mklink","/J",junction.toString(),outside.toString()).start();
        assertEquals(0,process.waitFor());
        try{
            var store=new FileExecutionArtifactStore(storage);
            assertThrows(java.io.IOException.class,()->store.save(id,"stderr","secret".getBytes()));
            try(var files=Files.list(outside)){assertEquals(0,files.count());}
        }finally{Files.delete(junction);}
    }
}
