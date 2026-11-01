package com.lh.eap.architecture;

import org.junit.jupiter.api.Test;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

/** Build-time ownership guard; does not read application configuration or touch a database. */
class BackendModuleBoundaryTest {
    private final Path backend = Path.of("..").toAbsolutePath().normalize();

    @Test void reactorDeclaresLayeredLibrariesAndOneBootHost() throws Exception {
        String reactor = Files.readString(backend.resolve("pom.xml"));
        for (String module : List.of("eap-api", "eap-engine", "eap-ai", "eap-web", "eap-runtime")) {
            assertTrue(reactor.contains("<module>" + module + "</module>"), module);
            assertTrue(Files.isRegularFile(backend.resolve(module + "/pom.xml")), module);
        }
        for (String module : List.of("eap-api", "eap-engine", "eap-ai", "eap-web")) {
            assertFalse(Files.readString(backend.resolve(module + "/pom.xml")).contains("spring-boot-maven-plugin"), module);
        }
    }

    @Test void runtimeOnlyOwnsBootstrapAndMigrations() throws Exception {
        try (var sources = Files.walk(Path.of("src/main/java"))) {
            var classes = sources.filter(p -> p.toString().endsWith(".java")).toList();
            assertFalse(classes.isEmpty());
            for (var source : classes) {
                String name = source.getFileName().toString();
                assertTrue(List.of("EapApplication.java", "RuntimeConfiguration.java", "BuiltinResourceSeeder.java", "CliRetentionConfiguration.java").contains(name), source.toString());
            }
        }
        assertTrue(Files.isRegularFile(Path.of("src/main/resources/db/migration/V19__skill_version_comments.sql")));
    }

    @Test void engineDoesNotImportUpwardImplementations() throws Exception {
        Path engine = backend.resolve("eap-engine/src/main/java");
        assertTrue(Files.isDirectory(engine), "engine source root");
        try (var sources = Files.walk(engine)) {
            for (var source : sources.filter(p -> p.toString().endsWith(".java")).toList()) {
                String text = Files.readString(source);
                for (String forbidden : List.of("com.lh.eap.ai.", "com.lh.eap.web.", "org.springframework.ai.")) {
                    assertFalse(text.contains(forbidden), source + " -> " + forbidden);
                }
            }
        }
    }

    @Test void bootstrapScanFindsComponentsAcrossLibraryJars() throws Exception {
        var scanner = new org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider(true);
        var found = scanner.findCandidateComponents("com.lh.eap").stream()
                .map(org.springframework.beans.factory.config.BeanDefinition::getBeanClassName)
                .collect(java.util.stream.Collectors.toSet());
        for (String component : List.of("com.lh.eap.application.service.BoardTaskService",
                "com.lh.eap.ai.AiChatApplication", "com.lh.eap.skill.SkillService",
                "com.lh.eap.skill.SkillController", "com.lh.eap.web.controller.RuntimeController",
                "com.lh.eap.web.AiBrowserRequestGuard", "com.lh.eap.config.WebConfiguration")) {
            assertTrue(found.contains(component), component);
        }
        var loader = getClass().getClassLoader();
        assertEquals(1, java.util.Collections.list(loader.getResources("db/migration/V1__initial_schema.sql")).size());
        assertNotNull(loader.getResource("experts/sql-expert.json"));
        assertNotNull(loader.getResource("chat/expert-profiles.json"));
    }

    @Test void devtoolsKeepsSiblingJarsInOneRestartLoader() throws Exception {
        var properties = new java.util.Properties();
        try (var input = getClass().getClassLoader().getResourceAsStream("META-INF/spring-devtools.properties")) {
            assertNotNull(input);
            properties.load(input);
        }
        var include = java.util.regex.Pattern.compile(properties.getProperty("restart.include.eapmodules"));
        for (String module : List.of("api", "engine", "ai", "web")) {
            assertTrue(include.matcher("file:/C:/repository/eap-" + module + "-0.1.0-SNAPSHOT.jar").find(), module);
        }
        assertFalse(include.matcher("file:/C:/repository/spring-core-7.0.jar").find());
    }
}
