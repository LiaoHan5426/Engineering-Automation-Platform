package com.lh.eap.runtime.mcp.client;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.regex.Pattern;

/**
 * Parses a registered stdio endpoint into argv. No shell expansion; rejects control and meta characters.
 */
public final class StdioMcpCommand {
    private static final Pattern SAFE_TOKEN = Pattern.compile("[\\p{L}\\p{N}._/@:+\\\\-]{1,200}");
    private static final int MAX_TOKENS = 32;

    private StdioMcpCommand() {}

    public static List<String> parse(String endpoint) {
        if (endpoint == null || endpoint.isBlank()) {
            throw new IllegalArgumentException("MCP_STDIO_COMMAND_REQUIRED");
        }
        var trimmed = endpoint.trim();
        if (trimmed.length() > 300) throw new IllegalArgumentException("MCP_STDIO_COMMAND_TOO_LONG");
        if (trimmed.chars().anyMatch(ch -> Character.isISOControl(ch) || "|;&`$<>".indexOf(ch) >= 0)) {
            throw new IllegalArgumentException("MCP_STDIO_COMMAND_UNSAFE");
        }
        var tokens = new ArrayList<String>();
        for (var raw : trimmed.split("\\s+")) {
            if (raw.isBlank()) continue;
            if (!SAFE_TOKEN.matcher(raw).matches()) {
                throw new IllegalArgumentException("MCP_STDIO_TOKEN_UNSAFE");
            }
            tokens.add(raw);
            if (tokens.size() > MAX_TOKENS) throw new IllegalArgumentException("MCP_STDIO_TOO_MANY_ARGS");
        }
        if (tokens.isEmpty()) throw new IllegalArgumentException("MCP_STDIO_COMMAND_REQUIRED");
        var first = tokens.getFirst().toLowerCase(Locale.ROOT);
        if (first.equals("cmd") || first.equals("cmd.exe") || first.equals("powershell")
                || first.equals("powershell.exe") || first.equals("pwsh") || first.equals("bash")
                || first.equals("sh") || first.equals("zsh")) {
            throw new IllegalArgumentException("MCP_STDIO_SHELL_FORBIDDEN");
        }
        return List.copyOf(tokens);
    }

    public static boolean looksLikeNotification(String requestJson) {
        Objects.requireNonNull(requestJson, "requestJson");
        return !requestJson.contains("\"id\"");
    }
}
