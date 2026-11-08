package com.lh.eap.architecture;

import org.junit.jupiter.api.Test;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

/** Build-time ownership guard; does not read application configuration or touch a database. */
class BackendModuleBoundaryTest {
    private final Path backend = BackendSourceLayout.backend();

    @Test void reactorDeclaresLayeredLibrariesAndOneBootHost() throws Exception {
        String reactor = Files.readString(backend.resolve("pom.xml"));
        for (String module : List.of("eap-api", "eap-engine", "eap-ai", "eap-web", "eap-spring", "eap-applications")) {
            assertTrue(reactor.contains("<module>" + module + "</module>"), module);
            assertTrue(Files.isRegularFile(backend.resolve(module + "/pom.xml")), module);
        }
        for (String module : List.of("eap-api", "eap-engine", "eap-ai", "eap-web")) {
            assertFalse(Files.readString(backend.resolve(module + "/pom.xml")).contains("spring-boot-maven-plugin"), module);
        }
    }

    @Test void nestedReactorOwnsEveryPomAndLibrariesNeverDependOnHostsOrAggregators() throws Exception {
        var declared = new java.util.LinkedHashSet<Path>();
        collectModules(backend, declared);
        try (var files = Files.walk(backend)) {
            var actual = files.filter(p -> p.getFileName().toString().equals("pom.xml"))
                    .filter(p -> !backend.relativize(p).toString().contains("target"))
                    .map(Path::getParent).collect(java.util.stream.Collectors.toSet());
            assertEquals(actual, declared, "Every module must participate in reactor verification");
        }
        for (var module : declared) {
            var xml = pom(module);
            String artifact = direct(xml.getDocumentElement(), "artifactId");
            var dependencies = xml.getElementsByTagName("dependency");
            for (int i = 0; i < dependencies.getLength(); i++) {
                var dependency = (org.w3c.dom.Element) dependencies.item(i);
                if (!"com.lh".equals(direct(dependency, "groupId"))) continue;
                var target = direct(dependency, "artifactId");
                assertFalse(java.util.Set.of("eap-engine", "eap-ai", "eap-web", "eap-spring", "eap-applications", "eap-full-application").contains(target), artifact + " -> " + target);
            }
            if (!artifact.equals("eap-full-application"))
                assertFalse(Files.readString(module.resolve("pom.xml")).contains("spring-boot-maven-plugin"), artifact);
        }
        assertFalse(Files.exists(backend.resolve("eap-runtime/pom.xml")));
    }
    private static String direct(org.w3c.dom.Element parent, String name) {
        for (var node = parent.getFirstChild(); node != null; node = node.getNextSibling())
            if (node instanceof org.w3c.dom.Element element && element.getLocalName().equals(name)) return element.getTextContent().trim();
        return "";
    }
    private static org.w3c.dom.Document pom(Path directory) throws Exception {
        var factory = javax.xml.parsers.DocumentBuilderFactory.newInstance();
        factory.setNamespaceAware(true);
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        return factory.newDocumentBuilder().parse(directory.resolve("pom.xml").toFile());
    }
    private static void collectModules(Path directory, java.util.Set<Path> result) throws Exception {
        assertTrue(result.add(directory), "Duplicate reactor module " + directory);
        var modules = pom(directory).getElementsByTagName("module");
        for (int i = 0; i < modules.getLength(); i++) collectModules(directory.resolve(modules.item(i).getTextContent().trim()), result);
    }

    @Test void runtimeOnlyOwnsBootstrapAndMigrations() throws Exception {
        try (var sources = Files.walk(Path.of("src/main/java"))) {
            var classes = sources.filter(p -> p.toString().endsWith(".java")).toList();
            assertFalse(classes.isEmpty());
            for (var source : classes) {
                String name = source.getFileName().toString();
                assertTrue(List.of("EapApplication.java", "RuntimeConfiguration.java", "BuiltinResourceSeeder.java", "CliRetentionConfiguration.java", "FullApplicationConfiguration.java").contains(name), source.toString());
            }
        }
        assertTrue(Files.isRegularFile(Path.of("src/main/resources/db/migration/V19__skill_version_comments.sql")));
    }

    @Test void httpAdaptersDoNotOwnTransactionsOrCallPersistence() throws Exception {
        try (var sources = Files.walk(backend.resolve("eap-web"))) {
            for (var source : sources.filter(p -> p.toString().contains("src") && p.toString().contains("main")
                    && p.toString().endsWith(".java")).toList()) {
                var text = Files.readString(source);
                assertFalse(text.contains("org.springframework.transaction"), source + " owns a business transaction");
                assertFalse(text.contains("com.lh.eap.persistence"), source + " bypasses application services");
            }
        }
    }

    @Test void expertSchedulerUsesAnalysisAndResourcePorts() throws Exception {
        var source = Files.readString(backend.resolve("eap-engine/eap-engine-workflow/src/main/java/com/lh/eap/application/service/ExpertExecutionService.java"));
        for (String implementation : List.of("runtime.sql", "runtime.mcp", "SqlFactVocabulary", "SqlExpertService",
                "RulePackService", "PromptPreprocessor", "RulePacks.")) {
            assertFalse(source.contains(implementation), "Scheduler depends on " + implementation);
        }
    }

    @Test void engineDoesNotImportUpwardImplementations() throws Exception {
        Path engine = backend.resolve("eap-engine");
        assertTrue(Files.isDirectory(engine), "engine source root");
        try (var sources = Files.walk(engine)) {
            for (var source : sources.filter(p -> p.toString().contains("src") && p.toString().contains("main") && p.toString().endsWith(".java")).toList()) {
                String text = Files.readString(source);
                for (String forbidden : List.of("import com.lh.eap.ai.", "import com.lh.eap.web.", "import org.springframework.ai.")) {
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
        for (String module : List.of("api", "engine-core", "engine-local", "engine-workflow", "ai-model-openai", "web-local", "spring-boot-autoconfigure")) {
            assertTrue(include.matcher("file:/C:/repository/eap-" + module + "-0.1.0-SNAPSHOT.jar").find(), module);
        }
        assertFalse(include.matcher("file:/C:/repository/spring-core-7.0.jar").find());
    }
}
