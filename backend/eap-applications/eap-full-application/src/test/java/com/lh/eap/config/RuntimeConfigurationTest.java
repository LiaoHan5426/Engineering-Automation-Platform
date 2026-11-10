package com.lh.eap.config;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.env.MockEnvironment;
import static org.junit.jupiter.api.Assertions.*;
class RuntimeConfigurationTest {
    @TempDir Path root;
    @Test void onlyCurrentKeyCanSelectTheRoot() throws Exception {
        Path other=Files.createDirectory(root.resolve("other"));
        var config=new RuntimeConfiguration();
        var oldOnly=new MockEnvironment().withProperty("eap.ai.authorized-root",other.toString());
        assertEquals(root.toRealPath(),config.runtimeWorkspace(root,oldOnly).root().path());
        var current=new MockEnvironment().withProperty("eap.runtime.authorized-root",other.toString())
                .withProperty("eap.ai.authorized-root",root.resolve("missing").toString());
        assertEquals(other.toRealPath(),config.runtimeWorkspace(root,current).root().path());
        current.setProperty("eap.runtime.authorized-root",root.resolve("missing").toString());
        assertFalse(config.runtimeWorkspace(root,current).root().allowed());
    }
}
