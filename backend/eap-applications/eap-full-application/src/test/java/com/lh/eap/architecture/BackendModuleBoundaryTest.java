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
                // ChatMessageGraphStore is the JDBC adapter for the CT-02 sent-message authority;
                // JdbcChatExecutionStore is the CT-01 execution-log evidence adapter. Both are
                // deliberately kept here (composition layer) so domain modules stay free of
                // persistence technology, matching the working-memory adapter placement.
                assertTrue(List.of("EapApplication.java", "RuntimeConfiguration.java", "BuiltinResourceSeeder.java", "CliRetentionConfiguration.java", "FullApplicationConfiguration.java", "ChatMessageGraphStore.java", "JdbcChatExecutionStore.java").contains(name), source.toString());
            }
        }
        try (var migrations = Files.list(Path.of("src/main/resources/db/migration"))) {
            // V2 = CT-02 message graph; V3 = CT-01 execution log; V4 = Mission UNKNOWN resolution;
            // V5 = SQL expert UNKNOWN resolution. V1 baseline is untouched.
            assertEquals(List.of("V1__initial_schema.sql", "V2__chat_message_graph.sql", "V3__chat_execution_log.sql", "V4__mission_unknown_resolution.sql", "V5__expert_agent_unknown_resolution.sql"),
                    migrations.filter(Files::isRegularFile)
                            .map(path -> path.getFileName().toString()).sorted().toList());
        }
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

    @Test void orchestrationDoesNotCompileAgainstSqlOrMcpImplementationModules() throws Exception {
        // Input port (DatabaseEvidenceInput) and MCP catalog port (McpCatalogQuery) live in core;
        // no SQL/MCP implementation type should leak back into workflow, or a removed edge returns.
        String pom = Files.readString(backend.resolve("eap-engine/eap-engine-workflow/pom.xml"));
        assertFalse(pom.contains("<artifactId>eap-engine-sql</artifactId>"),
                "workflow must not declare a compile dependency on the SQL implementation module");
        assertFalse(pom.contains("<artifactId>eap-engine-mcp</artifactId>"),
                "workflow must not declare a compile dependency on the MCP implementation module");
        try (var sources = Files.walk(backend.resolve("eap-engine/eap-engine-workflow/src"))) {
            for (var source : sources.filter(p -> p.toString().endsWith(".java")).toList()) {
                String text = Files.readString(source);
                assertFalse(text.contains("import com.lh.eap.sql."), source + " imports the SQL implementation package");
                for (String forbidden : List.of("import com.lh.eap.runtime.mcp.",
                        "import com.lh.eap.persistence.mapper.McpServerRegistry",
                        "import com.lh.eap.application.service.McpServerService")) {
                    assertFalse(text.contains(forbidden), source + " imports " + forbidden);
                }
            }
        }
    }

    @Test void localContractsLiveInCoreAndWorkflowDoesNotImportThem() throws Exception {
        // WorkspaceSearchInput/CliChannelStore/LocalProcessIdentityInspector are pure contracts or
        // stateless tools: they belong in core, not the local capability module. Behavioural
        // capabilities (GitCapability/RuntimeWorkspace/CliChannels) legitimately stay in local
        // under neutral packages and are intentionally out of scope for this guard.
        var core = backend.resolve("eap-engine/eap-engine-core/src/main/java/com/lh/eap");
        for (String contract : List.of("domain/model/WorkspaceSearchInput.java",
                "domain/model/CliChannelStore.java", "core/LocalProcessIdentityInspector.java")) {
            assertTrue(Files.isRegularFile(core.resolve(contract)), "core must own " + contract);
        }
        var oldLocal = backend.resolve("eap-engine/eap-engine-local/src/main/java/com/lh/eap/local");
        if (Files.isDirectory(oldLocal)) {
            try (var stale = Files.list(oldLocal)) {
                assertTrue(stale.findAny().isEmpty(),
                        "com.lh.eap.local production package must be empty after contract relocation");
            }
        }
        try (var sources = Files.walk(backend.resolve("eap-engine/eap-engine-workflow/src"))) {
            for (var source : sources.filter(p -> p.toString().endsWith(".java")).toList()) {
                assertFalse(Files.readString(source).contains("import com.lh.eap.local."),
                        source + " imports the local capability implementation package");
            }
        }
    }

    @Test void knowledgeAccessPortLivesInCoreAndConsumersDoNotDependOnKnowledgeImplementation() throws Exception {
        // ExpertKnowledgeAccess is a pure port; both its consumer (ai-context) and its adapter
        // (workflow) must depend on core, not on the knowledge implementation module.
        for (String port : List.of("core/ExpertKnowledgeAccess.java", "core/KnowledgeQueryEnricher.java")) {
            assertTrue(Files.isRegularFile(backend.resolve("eap-engine/eap-engine-core/src/main/java/com/lh/eap/" + port)),
                    "core must own " + port);
        }
        for (String stale : List.of(
                "eap-engine/eap-engine-knowledge/src/main/java/com/lh/eap/knowledge/ExpertKnowledgeAccess.java",
                "eap-engine/eap-engine-knowledge/src/main/java/com/lh/eap/runtime/handler/KnowledgeQueryEnricher.java")) {
            assertFalse(Files.exists(backend.resolve(stale)), "knowledge must not keep a duplicate port: " + stale);
        }

        String workflowPom = Files.readString(backend.resolve("eap-engine/eap-engine-workflow/pom.xml"));
        assertFalse(workflowPom.contains("<artifactId>eap-engine-knowledge</artifactId>"),
                "workflow must not declare any dependency on the knowledge implementation module");

        String contextPom = Files.readString(backend.resolve("eap-ai/eap-ai-context/pom.xml"));
        var knowledgeBlock = java.util.regex.Pattern.compile(
                "<dependency>(?:(?!</dependency>).)*<artifactId>eap-engine-knowledge</artifactId>(?:(?!</dependency>).)*</dependency>",
                java.util.regex.Pattern.DOTALL).matcher(contextPom);
        assertTrue(knowledgeBlock.find(), "ai-context should keep a scoped test-only knowledge dependency");
        assertTrue(knowledgeBlock.group().contains("<scope>test</scope>"),
                "ai-context production code must not depend on the knowledge implementation module");

        try (var sources = Files.walk(backend.resolve("eap-engine/eap-engine-workflow/src"))) {
            for (var source : sources.filter(p -> p.toString().endsWith(".java")).toList()) {
                assertFalse(Files.readString(source).contains("import com.lh.eap.knowledge."),
                        source + " imports the knowledge implementation package");
            }
        }
    }

    @Test void deliveryPureContractsLiveInCoreAndDeliveryKeepsNoDuplicates() throws Exception {
        // Pure value/enum/error/port contracts belong in core. Behavioural delivery services
        // (CodeChangeService/CodeVerificationService) and spring-coupled values (ComponentGraph)
        // legitimately stay in the delivery module and are intentionally not guarded here.
        for (String contract : List.of(
                "domain/model/CodeProposalStatus.java",
                "domain/model/SourceDependencyKind.java",
                "domain/model/PrototypeVersion.java",
                "core/PrototypeVersionQuery.java",
                "error/CodeErrors.java")) {
            assertTrue(Files.isRegularFile(backend.resolve("eap-engine/eap-engine-core/src/main/java/com/lh/eap/" + contract)),
                    "core must own " + contract);
        }
        for (String stale : List.of(
                "eap-engine/eap-engine-delivery/src/main/java/com/lh/eap/delivery/CodeProposalStatus.java",
                "eap-engine/eap-engine-delivery/src/main/java/com/lh/eap/delivery/SourceDependencyKind.java",
                "eap-engine/eap-engine-delivery/src/main/java/com/lh/eap/application/service/PrototypeVersion.java",
                "eap-engine/eap-engine-delivery/src/main/java/com/lh/eap/delivery/PrototypeVersionQuery.java",
                "eap-engine/eap-engine-delivery/src/main/java/com/lh/eap/error/CodeErrors.java")) {
            assertFalse(Files.exists(backend.resolve(stale)), "delivery must not keep a duplicate contract: " + stale);
        }
        // No source anywhere may still import the old contract packages. Check actual import
        // statements line-by-line (not raw substring) so this guard's own string literals
        // listing the old imports are not mistaken for real imports.
        var oldImports = List.of(
                "import com.lh.eap.delivery.CodeProposalStatus;",
                "import com.lh.eap.delivery.SourceDependencyKind;",
                "import com.lh.eap.delivery.PrototypeVersionQuery;",
                "import com.lh.eap.application.service.PrototypeVersion;");
        try (var sources = Files.walk(backend)) {
            for (var source : sources.filter(p -> p.toString().endsWith(".java") && !p.toString().contains("target")).toList()) {
                for (String line : Files.readAllLines(source)) {
                    String trimmed = line.trim();
                    for (String oldImport : oldImports) {
                        assertFalse(trimmed.equals(oldImport), source + " still imports relocated contract: " + oldImport);
                    }
                }
            }
        }
    }

    @Test void domainContractsLiveInCoreAndWorkflowKeepsNoDuplicates() throws Exception {
        // Pure domain records/enums and Store ports belong in core; the workflow module keeps only
        // behavioural services and JDBC adapters. These 13 contracts were relocated from the
        // com.lh.eap.application.service package (delivery/JDBC decoupling groundwork).
        String coreModel = "eap-engine/eap-engine-core/src/main/java/com/lh/eap/domain/model/";
        String corePort = "eap-engine/eap-engine-core/src/main/java/com/lh/eap/core/";
        String workflowOld = "eap-engine/eap-engine-workflow/src/main/java/com/lh/eap/application/service/";
        for (String model : List.of("Mission", "MissionExecution", "MissionExecutionStatus",
                "Handoff", "ToolExecution", "ToolExecutionStatus", "PrototypeDelivery")) {
            assertTrue(Files.isRegularFile(backend.resolve(coreModel + model + ".java")), "core must own model " + model);
            assertFalse(Files.exists(backend.resolve(workflowOld + model + ".java")), "workflow must not duplicate " + model);
        }
        for (String port : List.of("MissionStore", "MissionExecutionStore", "HandoffStore",
                "ToolExecutionStore", "PrototypeDeliveryStore", "PrototypeVersionStore")) {
            assertTrue(Files.isRegularFile(backend.resolve(corePort + port + ".java")), "core must own port " + port);
            assertFalse(Files.exists(backend.resolve(workflowOld + port + ".java")), "workflow must not duplicate " + port);
        }
        // Check real import statements line-by-line so this guard's own string literals listing
        // old imports are not mistaken for imports.
        var oldImports = List.of(
                "import com.lh.eap.application.service.Mission;",
                "import com.lh.eap.application.service.MissionExecution;",
                "import com.lh.eap.application.service.MissionExecutionStatus;",
                "import com.lh.eap.application.service.MissionStore;",
                "import com.lh.eap.application.service.MissionExecutionStore;",
                "import com.lh.eap.application.service.Handoff;",
                "import com.lh.eap.application.service.HandoffStore;",
                "import com.lh.eap.application.service.ToolExecution;",
                "import com.lh.eap.application.service.ToolExecutionStatus;",
                "import com.lh.eap.application.service.ToolExecutionStore;",
                "import com.lh.eap.application.service.PrototypeDelivery;",
                "import com.lh.eap.application.service.PrototypeDeliveryStore;",
                "import com.lh.eap.application.service.PrototypeVersionStore;");
        try (var sources = Files.walk(backend)) {
            for (var source : sources.filter(p -> p.toString().endsWith(".java") && !p.toString().contains("target")).toList()) {
                for (String line : Files.readAllLines(source)) {
                    String trimmed = line.trim();
                    for (String oldImport : oldImports) {
                        assertFalse(trimmed.equals(oldImport), source + " still imports relocated contract: " + oldImport);
                    }
                }
            }
        }
    }

    @Test void machineErrorCodesLiveInCoreAndWorkflowKeepsNoDuplicates() throws Exception {
        // Machine error-code enums are pure contracts (PlatformErrorCode) and belong in core's
        // com.lh.eap.error package alongside AgentErrors/ChatErrors/CodeErrors etc. The workflow
        // module keeps only behaviour. Package name is unchanged, so no import rewiring is needed.
        String coreError = "eap-engine/eap-engine-core/src/main/java/com/lh/eap/error/";
        String workflowError = "eap-engine/eap-engine-workflow/src/main/java/com/lh/eap/error/";
        for (String code : List.of("BoardErrors", "BoardDeliveryErrors", "BoardVerificationErrors", "MissionErrors")) {
            assertTrue(Files.isRegularFile(backend.resolve(coreError + code + ".java")), "core must own error code " + code);
            assertFalse(Files.exists(backend.resolve(workflowError + code + ".java")), "workflow must not duplicate error code " + code);
        }
    }

    @Test void wireValueEnumsLiveInCoreAndWorkflowKeepsNoDuplicates() throws Exception {
        // WireValue enums are wire-protocol vocabulary shared with the frontend and persistence;
        // they belong in core's domain.model alongside MissionExecutionStatus/ToolExecutionStatus.
        String coreModel = "eap-engine/eap-engine-core/src/main/java/com/lh/eap/domain/model/";
        String workflowOld = "eap-engine/eap-engine-workflow/src/main/java/com/lh/eap/application/service/";
        var enums = List.of("BoardDeliveryDecision", "BoardDeliverySource", "BoardTaskColumn",
                "BoardVerificationCheckStatus", "BoardVerificationStatus", "PrototypeActionType",
                "ScenarioDependencyStatus", "ScenarioStatus");
        for (String name : enums) {
            assertTrue(Files.isRegularFile(backend.resolve(coreModel + name + ".java")), "core must own wire enum " + name);
            assertFalse(Files.exists(backend.resolve(workflowOld + name + ".java")), "workflow must not duplicate wire enum " + name);
        }
        var oldImports = List.of(
                "import com.lh.eap.application.service.BoardDeliveryDecision;",
                "import com.lh.eap.application.service.BoardDeliverySource;",
                "import com.lh.eap.application.service.BoardTaskColumn;",
                "import com.lh.eap.application.service.BoardVerificationCheckStatus;",
                "import com.lh.eap.application.service.BoardVerificationStatus;",
                "import com.lh.eap.application.service.PrototypeActionType;",
                "import com.lh.eap.application.service.ScenarioDependencyStatus;",
                "import com.lh.eap.application.service.ScenarioStatus;");
        try (var sources = Files.walk(backend)) {
            for (var source : sources.filter(p -> p.toString().endsWith(".java") && !p.toString().contains("target")).toList()) {
                for (String line : Files.readAllLines(source)) {
                    String trimmed = line.trim();
                    for (String oldImport : oldImports) {
                        assertFalse(trimmed.equals(oldImport), source + " still imports relocated wire enum: " + oldImport);
                    }
                }
            }
        }
    }

    @Test void crossModulePureContractsLiveInCore() throws Exception {
        // Wire vocab, machine error codes and CLI domain models are pure contracts shared across
        // modules; all owners depend on core (core depends only on eap-api), so they belong there.
        String coreModel = "eap-engine/eap-engine-core/src/main/java/com/lh/eap/domain/model/";
        String coreError = "eap-engine/eap-engine-core/src/main/java/com/lh/eap/error/";
        // A: AI wire enums (package changed from com.lh.eap.ai / com.lh.eap.skill).
        var wireEnums = List.of("AiToolMode", "ChatExecutionStatus", "TaskMode",
                "ModelConnectionState", "ChatGptLoginStatus", "SkillDependencyStatus");
        for (String name : wireEnums)
            assertTrue(Files.isRegularFile(backend.resolve(coreModel + name + ".java")), "core must own wire enum " + name);
        // B: implementation-module error codes (package com.lh.eap.error unchanged).
        for (String code : List.of("SkillErrors", "KnowledgeErrors", "McpErrors", "DatabaseErrors", "RuleErrors"))
            assertTrue(Files.isRegularFile(backend.resolve(coreError + code + ".java")), "core must own error code " + code);
        // C: CLI domain models (package com.lh.eap.domain.model unchanged).
        for (String model : List.of("CliOperation", "CliProgram", "TaskStatistics"))
            assertTrue(Files.isRegularFile(backend.resolve(coreModel + model + ".java")), "core must own domain model " + model);
        // Old definition files must be gone from their source modules.
        var stale = List.of(
                "eap-ai/eap-ai-chat/src/main/java/com/lh/eap/ai/AiToolMode.java",
                "eap-ai/eap-ai-chat/src/main/java/com/lh/eap/ai/ChatExecutionStatus.java",
                "eap-ai/eap-ai-chat/src/main/java/com/lh/eap/ai/TaskMode.java",
                "eap-ai/eap-ai-codegen/src/main/java/com/lh/eap/ai/ModelConnectionState.java",
                "eap-ai/eap-ai-model-openai/src/main/java/com/lh/eap/ai/ChatGptLoginStatus.java",
                "eap-ai/eap-ai-skill/src/main/java/com/lh/eap/skill/SkillDependencyStatus.java",
                "eap-ai/eap-ai-skill/src/main/java/com/lh/eap/error/SkillErrors.java",
                "eap-engine/eap-engine-knowledge/src/main/java/com/lh/eap/error/KnowledgeErrors.java",
                "eap-engine/eap-engine-mcp/src/main/java/com/lh/eap/error/McpErrors.java",
                "eap-engine/eap-engine-sql/src/main/java/com/lh/eap/error/DatabaseErrors.java",
                "eap-engine/eap-engine-sql/src/main/java/com/lh/eap/error/RuleErrors.java",
                "eap-engine/eap-engine-workflow/src/main/java/com/lh/eap/domain/model/CliOperation.java",
                "eap-engine/eap-engine-workflow/src/main/java/com/lh/eap/domain/model/CliProgram.java",
                "eap-engine/eap-engine-workflow/src/main/java/com/lh/eap/domain/model/TaskStatistics.java");
        for (String old : stale)
            assertFalse(Files.exists(backend.resolve(old)), "source module must not duplicate relocated contract: " + old);
        // A-group old imports must not remain (line-by-line exact match).
        var oldImports = List.of(
                "import com.lh.eap.ai.AiToolMode;", "import com.lh.eap.ai.ChatExecutionStatus;",
                "import com.lh.eap.ai.TaskMode;", "import com.lh.eap.ai.ModelConnectionState;",
                "import com.lh.eap.ai.ChatGptLoginStatus;", "import com.lh.eap.skill.SkillDependencyStatus;");
        try (var sources = Files.walk(backend)) {
            for (var source : sources.filter(p -> p.toString().endsWith(".java") && !p.toString().contains("target")).toList()) {
                for (String line : Files.readAllLines(source)) {
                    String trimmed = line.trim();
                    for (String oldImport : oldImports)
                        assertFalse(trimmed.equals(oldImport), source + " still imports relocated contract: " + oldImport);
                }
            }
        }
    }

    @Test void jdbcAdaptersLiveInDedicatedModuleAfterP0P2() throws Exception {
        var adapters = List.of(
                "JdbcMissionStore", "JdbcMissionExecutionStore", "JdbcHandoffStore", "JdbcToolExecutionStore",
                "JdbcPrototypeDeliveryStore", "JdbcPrototypeVersionStore", "JdbcExpertAgentJournal", "JdbcCliChannelStore",
                "TaskRepository", "CliProgramMapper", "ExpertDefinitionMapper", "CapabilityUsage", "StateBindings");
        var target = backend.resolve("eap-engine/eap-engine-persistence-jdbc/src/main/java/com/lh/eap/persistence/jdbc");
        assertTrue(Files.isDirectory(target), "persistence-jdbc adapter package missing");
        var oldMapper = backend.resolve("eap-engine/eap-engine-workflow/src/main/java/com/lh/eap/persistence/mapper");
        var oldService = backend.resolve("eap-engine/eap-engine-workflow/src/main/java/com/lh/eap/application/service");
        for (String name : adapters) {
            assertTrue(Files.exists(target.resolve(name + ".java")), name + " missing in persistence-jdbc");
            assertFalse(Files.exists(oldMapper.resolve(name + ".java")), name + " still in workflow mapper package");
            assertFalse(Files.exists(oldService.resolve(name + ".java")), name + " still in workflow service package");
        }
        // Only real import statements are checked; string literals in guards are ignored.
        try (var sources = Files.walk(backend)) {
            for (var source : sources.filter(p -> p.toString().endsWith(".java") && !p.toString().contains("target")).toList()) {
                for (String line : Files.readAllLines(source)) {
                    if (!line.trim().startsWith("import ")) continue;
                    for (String name : adapters) {
                        assertFalse(line.contains("com.lh.eap.persistence.mapper." + name), source + " still imports old mapper package: " + name);
                        assertFalse(line.contains("com.lh.eap.application.service." + name), source + " still imports old service package: " + name);
                    }
                }
            }
        }
        var pom = Files.readString(backend.resolve("eap-engine/eap-engine-persistence-jdbc/pom.xml"));
        assertTrue(pom.contains("<artifactId>eap-engine-core</artifactId>"), "adapter module must depend on core");
        assertTrue(pom.contains("<artifactId>spring-boot-starter-jdbc</artifactId>"), "adapter module must own JDBC");
        assertFalse(pom.contains("<artifactId>eap-engine-workflow</artifactId>"), "adapter module must not depend upward on workflow");
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
