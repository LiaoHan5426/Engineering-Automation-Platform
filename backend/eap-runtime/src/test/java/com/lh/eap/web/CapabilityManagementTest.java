package com.lh.eap.web;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.*;

import com.lh.eap.api.Observation;
import com.lh.eap.api.ProcessExecutor;
import com.lh.eap.core.CapabilityRegistry;
import java.nio.file.Path;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Every kind of capability has to have an answer to "where do I change it", and that answer has to be
 * true. These tests pin the three surfaces — the platform switch, the CLI channel and the MCP server
 * registry — plus the boundary each one refuses to cross: a built-in command is code, a CLI capability's
 * command line is code, and an MCP tool belongs to a server nobody can conjure by naming it.
 */
class CapabilityManagementTest {

    private static final String EXPERT_SQL = "FROM eap.expert_definition";

    private static JdbcTemplate jdbcWhere(String fragment, List<Map<String, Object>> rows) {
        var jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(argThat((String sql) -> sql != null && sql.contains(fragment)))).thenReturn(rows);
        return jdbc;
    }

    private static Map<String, Object> expert(String id, boolean enabled, String manifest) {
        var row = new LinkedHashMap<String, Object>();
        row.put("id", id);
        row.put("enabled", enabled);
        row.put("manifest", manifest);
        return row;
    }

    private static String manifestWith(String capability) {
        return """
                {"apiVersion":"eap/v1","kind":"Expert","id":"orders-sql","name":"订单库",
                 "steps":[{"id":"parse","capability":"%s","required":true}],"edges":[],
                 "rules":["database.credentials.never-expose"]}
                """.formatted(capability);
    }

    private static CapabilityHandlerRegistry registry(JdbcTemplate jdbc, CapabilitySettings settings) {
        return new CapabilityHandlerRegistry(List.of(
                new SqlParseHandler(),
                new KnowledgeSearchHandler(mock(KnowledgeRepository.class)),
                new DatabaseMetadataHandler(mock(JdbcTemplate.class), mock(ExpertDefinitionService.class)),
                new DatabaseExplainHandler(),
                new GitInspectionHandler(new CapabilityRegistry(), mock(ProcessExecutor.class)),
                new WorkspaceSearchHandler(new CapabilityRegistry(), mock(ProcessExecutor.class))), settings);
    }

    private static Map<String, Object> settingRow(String capability, boolean enabled) {
        var row = new LinkedHashMap<String, Object>();
        row.put("capability", capability);
        row.put("enabled", enabled);
        row.put("notes", "本机没有快照来源");
        row.put("updated_at", "2026-10-09T10:00:00Z");
        return row;
    }

    // ---------------------------------------------------------------- 内置命令：平台开关

    /** Turning off a capability an enabled expert runs would break that expert, so it is refused. */
    @Test void disablingACapabilityAnEnabledExpertRunsIsRefused() {
        var jdbc = jdbcWhere(EXPERT_SQL, List.of(expert("orders-sql", true, manifestWith("sql.parse"))));
        var settings = new CapabilitySettings(jdbc, new CapabilityUsage(jdbc));

        var error = assertThrows(IllegalStateException.class, () -> settings.save("sql.parse", false, "不需要"));
        assertTrue(error.getMessage().contains("orders-sql"), "拒绝时必须点名是哪位专家：" + error.getMessage());
        assertTrue(error.getMessage().contains("sql.parse"));
        verify(jdbc, never()).update(anyString(), any(), any(), any());
    }

    /** A draft that references it does not block anything: drafts do not run. */
    @Test void aDraftReferenceDoesNotBlockTheSwitch() {
        var jdbc = jdbcWhere(EXPERT_SQL, List.of(expert("draft-sql", false, manifestWith("sql.parse"))));
        var settings = new CapabilitySettings(jdbc, new CapabilityUsage(jdbc));

        settings.save("sql.parse", false, "暂时停用");
        verify(jdbc).update(argThat((String sql) -> sql != null && sql.contains("capability_setting")),
                any(), any(), any());
    }

    /** The reason travels with the state, so a switch nobody explained cannot become folklore. */
    @Test void theSwitchStoresTheReasonAndTheCatalogReportsIt() {
        var jdbc = jdbcWhere("capability_setting", List.of(settingRow("database.explain", false)));
        var usage = new CapabilityUsage(jdbc);
        var settings = new CapabilitySettings(jdbc, usage);
        var catalog = new CapabilityCatalog(registry(jdbc, settings), jdbc, new McpServerRegistry(jdbc),
                new CliChannels(jdbc), usage).catalog();

        var item = itemNamed(catalog, "database.explain");
        assertEquals(false, item.get("enabled"));
        assertEquals(CapabilityAvailability.DISABLED.id(), item.get("availability"));
        assertEquals("本机没有快照来源", item.get("notes"));
        assertEquals(false, item.get("globallyRunnable"), "停用的能力不能自称可全局运行");
        assertEquals(List.of("database.explain"), catalog.get("disabledPlatform"));
        assertFalse(((List<?>) catalog.get("globallyUsable")).contains("database.explain"),
                "停用的能力不能出现在专家编辑器的可选词表里");
    }

    /**
     * A switched-off capability is not a missing one. Reporting it as "未实现" would send the reader
     * hunting for a bug instead of flipping a switch back.
     */
    @Test void aManifestReferencingADisabledCapabilityIsRejectedWithTheRealReason() {
        var manifest = ExpertManifest.parse(manifestWith("sql.parse"));
        var errors = ExpertGraph.validate(manifest, ExpertGraph.CAPABILITIES, Map.of(),
                Set.of(), Set.of("sql.parse"));

        assertEquals(1, errors.size());
        assertTrue(errors.getFirst().contains("已在平台停用"), errors.toString());
        assertFalse(errors.getFirst().contains("未实现"), "停用不是未实现，措辞必须区分：" + errors.getFirst());
    }

    /** Even though the handler exists, a disabled capability resolves to nothing for every expert. */
    @Test void aDisabledCapabilityDoesNotResolveAtRuntime() {
        var jdbc = jdbcWhere("capability_setting", List.of(settingRow("sql.parse", false)));
        var settings = new CapabilitySettings(jdbc, new CapabilityUsage(jdbc));
        var handlers = registry(jdbc, settings);
        var manifest = ExpertManifest.parse(manifestWith("sql.parse"));

        assertTrue(handlers.find("sql.parse").isPresent(), "处理器仍在注册表里");
        assertTrue(handlers.disabled("sql.parse"));
        assertTrue(handlers.resolveFor(manifest, "sql.parse").isEmpty(), "停用的能力不得执行");
    }

    // ---------------------------------------------------------------- 每一种能力的管理方式

    @Test void everyKindDeclaresHowItsCapabilitiesComeIntoExistence() {
        var jdbc = mock(JdbcTemplate.class);
        var catalog = new CapabilityCatalog(registry(jdbc, new CapabilitySettings(jdbc, new CapabilityUsage(jdbc))),
                jdbc).catalog();

        var kinds = kindList(catalog);
        for (var kind : kinds) {
            @SuppressWarnings("unchecked") var management = (Map<String, Object>) kind.get("management");
            assertNotNull(management.get("id"), "每种能力都必须声明管理方式：" + kind);
            assertNotNull(management.get("label"));
            assertNotNull(management.get("description"), "要能回答“这里能改什么”");
            assertNotNull(management.get("creation"), "要能回答“它是怎么来的”");
        }
        assertEquals("settings", managementOf(kinds, "command").get("id"));
        assertEquals("cli-channel", managementOf(kinds, "cli").get("id"));
        assertEquals("server-registry", managementOf(kinds, "mcp").get("id"));
        assertEquals("none", managementOf(kinds, "http").get("id"));
        assertEquals(false, managementOf(kinds, "http").get("manageable"),
                "没有管理入口的种类不应给出一个点了没有反应的页面");
    }

    /**
     * A kind earns a page when there is something to manage, even while it is empty: that page is the
     * entry point that makes it stop being empty. HTTP has neither, so it gets no page.
     */
    @Test void akindWithAManagementSurfaceIsVisibleEvenWhenEmpty() {
        var jdbc = mock(JdbcTemplate.class);
        var catalog = new CapabilityCatalog(registry(jdbc, new CapabilitySettings(jdbc, new CapabilityUsage(jdbc))),
                jdbc).catalog();
        var kinds = kindList(catalog);

        assertEquals(0, kindOf(kinds, "mcp").get("count"), "没有服务器时如实报告 0");
        assertEquals(true, kindOf(kinds, "mcp").get("visible"), "MCP 有管理入口，必须可见");
        assertEquals(false, kindOf(kinds, "http").get("visible"), "既无入口也无内容，不应占一个页签");
        assertEquals(true, kindOf(kinds, "command").get("visible"));
        assertEquals(true, kindOf(kinds, "cli").get("visible"));
    }

    /** The overview has to show, per kind, how many are runnable and how many were switched off. */
    @Test void kindAvailabilityCountsAreReported() {
        var jdbc = jdbcWhere("capability_setting", List.of(settingRow("sql.parse", false)));
        var usage = new CapabilityUsage(jdbc);
        var catalog = new CapabilityCatalog(registry(jdbc, new CapabilitySettings(jdbc, usage)), jdbc,
                new McpServerRegistry(jdbc), new CliChannels(jdbc), usage).catalog();

        @SuppressWarnings("unchecked") var availability = (Map<String, Object>) kindOf(kindList(catalog), "command").get("availability");
        assertEquals(5, availability.get("total"));
        assertEquals(1, availability.get("disabled"));
        assertEquals(4, availability.get("available"));
    }

    // ---------------------------------------------------------------- 本地 CLI：通道

    @Test void anOperatorOverrideReplacesTheShippedBinaryAndIsReportedAsSuch() {
        var jdbc = jdbcWhere("cli_channel", List.of(Map.of("capability", "rg-search", "binary", "rg")));
        var channels = new CliChannels(jdbc);

        assertEquals("rg", channels.binaryFor("rg-search", "rg"), "覆盖值生效");
        assertEquals("git", channels.binaryFor("git-status", "git"), "未覆盖的仍用随能力声明的默认值");

        var channel = channels.channel("rg-search", "rg");
        assertEquals("operator", channel.source());
        assertTrue(channel.overridden());
        var fallback = channels.channel("git-status", "git");
        assertEquals("shipped", fallback.source());
        assertFalse(fallback.overridden());
    }

    /** A binary that cannot be found is reported as missing, and the shipped default is named. */
    @Test void aChannelThatCannotBeFoundIsReportedWithItsPathAbsent() {
        var jdbc = jdbcWhere("cli_channel", List.of(Map.of("capability", "rg-search", "binary", "eap-no-such-binary")));
        var channel = new CliChannels(jdbc).channel("rg-search", "rg");

        assertNull(channel.resolvedPath());
        assertEquals(CapabilityAvailability.MISSING_BINARY, channel.availability());
    }

    /** The channel accepts a name or a path, and refuses anything that is not a binary location. */
    @Test void changingTheChannelRejectsValuesThatAreNotABinaryLocation() {
        var jdbc = mock(JdbcTemplate.class);
        var channels = new CliChannels(jdbc);

        assertEquals("二进制位置不能以 - 开头",
                assertThrows(IllegalArgumentException.class, () -> channels.configure("rg-search", "--exec=evil")).getMessage());
        assertEquals("二进制位置不能包含控制字符",
                assertThrows(IllegalArgumentException.class, () -> channels.configure("rg-search", "rg\nrm -rf /")).getMessage());
        assertEquals("二进制位置不能包含凭据",
                assertThrows(IllegalArgumentException.class, () -> channels.configure("rg-search", "http://x?token=abc")).getMessage());

        channels.configure("rg-search", "C:/tools/rg.exe");
        verify(jdbc).update(argThat((String sql) -> sql != null && sql.contains("cli_channel")),
                eq("rg-search"), eq("C:/tools/rg.exe"));
    }

    /** Blank clears the override, so the shipped default applies again instead of a broken value sticking. */
    @Test void clearingTheChannelRemovesTheOverride() {
        var jdbc = mock(JdbcTemplate.class);
        new CliChannels(jdbc).configure("rg-search", "   ");
        verify(jdbc).update(argThat((String sql) -> sql != null && sql.toLowerCase(Locale.ROOT).contains("delete from")),
                eq("rg-search"));
    }

    /**
     * The probe is the one place a binary is executed for a management question, so it has to be explicit
     * about what it ran — and it must not run anything when there is nothing to run.
     */
    @Test void theProbeRunsTheBinaryWithAVersionFlagAndReportsIt() {
        var java = Path.of(System.getProperty("java.home"), "bin", System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win") ? "java.exe" : "java");
        var jdbc = jdbcWhere("cli_channel", List.of(Map.of("capability", "rg-search", "binary", java.toString())));
        var commands = new ArrayList<List<String>>();
        ProcessExecutor executor = (capability, directory, command) -> {
            commands.add(List.copyOf(command));
            return new Observation(capability, true, 0, "ripgrep 14.0.0\n", "", Map.of());
        };
        var result = new CliChannels(jdbc, executor).probe("rg-search", "rg", Path.of("."));

        assertEquals(true, result.get("executed"));
        assertEquals(true, result.get("success"));
        assertEquals(List.of(java.toString(), "--version"), commands.getFirst(),
                "探测必须用参数数组传 --version，不经过 shell");
        assertTrue(String.valueOf(result.get("output")).contains("ripgrep 14.0.0"));
    }

    @Test void theProbeOfAMissingBinaryExecutesNothing() {
        var jdbc = jdbcWhere("cli_channel", List.of(Map.of("capability", "rg-search", "binary", "eap-no-such-binary")));
        var executed = new ArrayList<String>();
        ProcessExecutor executor = (capability, directory, command) -> {
            executed.add(capability);
            return new Observation(capability, true, 0, "", "", Map.of());
        };
        var result = new CliChannels(jdbc, executor).probe("rg-search", "rg", Path.of("."));

        assertEquals(false, result.get("executed"));
        assertTrue(executed.isEmpty(), "找不到二进制时不应执行任何东西");
        assertTrue(String.valueOf(result.get("message")).contains("未找到可执行文件"));
    }

    // ---------------------------------------------------------------- MCP：服务器登记

    private static McpServerService mcpService(JdbcTemplate jdbc) {
        var usage = new CapabilityUsage(jdbc);
        return new McpServerService(jdbc, new McpServerRegistry(jdbc), usage);
    }

    /** A server id and a tool name both become part of a capability id, so both are validated now. */
    @Test void registeringAServerValidatesIdsToolsAndTheTransportTarget() {
        var jdbc = mock(JdbcTemplate.class);
        var service = mcpService(jdbc);

        assertTrue(assertThrows(IllegalArgumentException.class,
                () -> service.save("Bad Server", "x", "stdio", "npx server", List.of("search"), false, false))
                .getMessage().contains("mcp.<服务器>.<工具>"));
        assertTrue(assertThrows(IllegalArgumentException.class,
                () -> service.save("files", "x", "stdio", "npx server", List.of("searchIssues"), false, false))
                .getMessage().contains("不合法"), "大写工具名会拼出非法能力标识，必须当场拒绝");
        assertTrue(assertThrows(IllegalArgumentException.class,
                () -> service.save("files", "x", "stdio", "  ", List.of("search"), false, false))
                .getMessage().contains("启动命令"));
        assertTrue(assertThrows(IllegalArgumentException.class,
                () -> service.save("files", "x", "http", "files.example.com/mcp", List.of("search"), false, false))
                .getMessage().contains("http://"));
        assertTrue(assertThrows(IllegalArgumentException.class,
                () -> service.save("files", "x", "stdio", "npx server --api_key=abc123", List.of("search"), false, false))
                .getMessage().contains("不能包含凭据"), "平台不保存凭据，配置里出现就要拒绝");
        assertTrue(assertThrows(IllegalArgumentException.class,
                () -> service.save("files", "x", "carrier-pigeon", "x", List.of("search"), false, false))
                .getMessage().contains("传输方式"));
        verify(jdbc, never()).update(anyString(), any(), any(), any(), any(), any(), any(), any());
    }

    /** Registering is not authorising: the server arrives disabled and untrusted. */
    @Test void aRegisteredServerIsStoredAsDisabledAndUntrusted() {
        var jdbc = mock(JdbcTemplate.class);
        mcpService(jdbc).save("files", "文件服务器", "stdio", "npx -y mcp-files", List.of("search", "read"), false, false);

        verify(jdbc).update(argThat((String sql) -> sql != null && sql.contains("mcp_server")),
                eq("files"), eq("文件服务器"), eq("stdio"), eq("npx -y mcp-files"),
                eq(false), eq(false), argThat((String json) -> json != null && json.contains("search") && json.contains("read")));
    }

    /** A server an enabled expert is authorised for cannot be deleted out from under it. */
    @Test void deletingAServerAnEnabledExpertUsesIsRefused() {
        var serverRow = new LinkedHashMap<String, Object>();
        serverRow.put("id", "files");
        serverRow.put("name", "文件服务器");
        serverRow.put("transport", "stdio");
        serverRow.put("endpoint", "npx -y mcp-files");
        serverRow.put("trusted", true);
        serverRow.put("enabled", true);
        serverRow.put("tool_names", "search");
        var jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(argThat((String sql) -> sql != null && sql.contains("jsonb_array_elements"))))
                .thenReturn(List.of(serverRow));
        when(jdbc.queryForList(argThat((String sql) -> sql != null && sql.contains(EXPERT_SQL))))
                .thenReturn(List.of(expert("orders-sql", true, """
                        {"apiVersion":"eap/v1","kind":"Expert","id":"orders-sql","name":"订单库",
                         "steps":[],"edges":[],"rules":["database.credentials.never-expose"],
                         "mcpTools":["mcp.files.search"]}
                        """)));

        var error = assertThrows(IllegalStateException.class, () -> mcpService(jdbc).delete("files"));
        assertTrue(error.getMessage().contains("mcp.files.search"), error.getMessage());
        verify(jdbc, never()).update(argThat((String sql) -> sql != null && sql.startsWith("DELETE FROM eap.mcp_server")), eq("files"));
    }

    /** The probe says what it did not do: no protocol client exists, so the tool list stays a claim. */
    @Test void theServerProbeReportsThatToolListsAreUnverified() {
        var serverRow = new LinkedHashMap<String, Object>();
        serverRow.put("id", "files");
        serverRow.put("name", "文件服务器");
        serverRow.put("transport", "stdio");
        serverRow.put("endpoint", "eap-no-such-command --serve");
        serverRow.put("trusted", true);
        serverRow.put("enabled", true);
        serverRow.put("tool_names", "search");
        var jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(argThat((String sql) -> sql != null && sql.contains("jsonb_array_elements"))))
                .thenReturn(List.of(serverRow));

        var result = mcpService(jdbc).probe("files");
        assertEquals(false, result.get("verified"), "没有协议握手就不能自称已验证");
        assertEquals(false, result.get("reachable"), "启动命令不存在时必须如实报告");
        assertTrue(String.valueOf(result.get("message")).contains("未经协议验证"), String.valueOf(result.get("message")));
    }

    /**
     * A registered server's tools get catalog entries immediately — otherwise the MCP page would be empty
     * for exactly the operator who just registered one — and each entry admits it has no implementation.
     */
    @Test void registeredToolsAppearInTheCatalogEvenWithoutAHandler() {
        var serverRow = new LinkedHashMap<String, Object>();
        serverRow.put("id", "files");
        serverRow.put("name", "文件服务器");
        serverRow.put("transport", "stdio");
        serverRow.put("endpoint", "npx -y mcp-files");
        serverRow.put("trusted", true);
        serverRow.put("enabled", true);
        serverRow.put("tool_names", "read,search");
        var jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(argThat((String sql) -> sql != null && sql.contains("jsonb_array_elements"))))
                .thenReturn(List.of(serverRow));
        var usage = new CapabilityUsage(jdbc);
        var catalog = new CapabilityCatalog(registry(jdbc, new CapabilitySettings(jdbc, usage)), jdbc,
                new McpServerRegistry(jdbc), new CliChannels(jdbc), usage).catalog();

        var item = itemNamed(catalog, "mcp.files.search");
        assertEquals(false, item.get("registered"), "没有处理器时必须承认");
        assertEquals(true, item.get("expertScoped"), "MCP 工具永远是专家级");
        assertEquals(false, item.get("globallyRunnable"));
        assertEquals(CapabilityAvailability.NOT_CONFIGURED.id(), item.get("availability"));
        assertTrue(String.valueOf(item.get("summary")).contains("尚未实现"), String.valueOf(item.get("summary")));
        assertEquals(2, kindOf(kindList(catalog), "mcp").get("count"));
        assertEquals(1, ((List<?>) catalog.get("mcpServers")).size());
    }

    // ---------------------------------------------------------------- 目录词汇

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> kindList(Map<String, Object> catalog) {
        return (List<Map<String, Object>>) catalog.get("kinds");
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> kindOf(List<Map<String, Object>> kinds, String id) {
        return kinds.stream().filter(entry -> id.equals(entry.get("id"))).findFirst().orElseThrow();
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> managementOf(List<Map<String, Object>> kinds, String id) {
        return (Map<String, Object>) kindOf(kinds, id).get("management");
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> itemNamed(Map<String, Object> catalog, String name) {
        var items = (List<Map<String, Object>>) catalog.get("items");
        return items.stream().filter(entry -> name.equals(entry.get("name"))).findFirst().orElseThrow();
    }
}
