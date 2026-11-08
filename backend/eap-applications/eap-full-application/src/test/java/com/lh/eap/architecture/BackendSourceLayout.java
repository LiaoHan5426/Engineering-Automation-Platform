package com.lh.eap.architecture;

import java.nio.file.Files;
import java.nio.file.Path;
import java.io.IOException;
import java.util.List;

/** Locates source roots independently of application nesting and Maven invocation directory. */
public final class BackendSourceLayout {
    private BackendSourceLayout() {}
    public static Path backend() {
        for (Path path = Path.of("").toAbsolutePath().normalize(); path != null; path = path.getParent()) {
            if (Files.isRegularFile(path.resolve("pom.xml")) && Files.isDirectory(path.resolve("eap-api"))) return path;
        }
        throw new IllegalStateException("Cannot locate backend reactor");
    }
    public static List<Path> mainSourceRoots() throws IOException {
        try (var paths = Files.walk(backend())) {
            return paths.filter(p -> p.endsWith(Path.of("src", "main", "java")))
                    .filter(p -> !backend().relativize(p).toString().contains("target"))
                    .sorted().toList();
        }
    }
}
