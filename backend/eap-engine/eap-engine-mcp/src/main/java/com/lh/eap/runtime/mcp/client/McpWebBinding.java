package com.lh.eap.runtime.mcp.client;

import java.util.Map;
import java.util.Objects;

/** Operator-approved mapping to one exact registered service and discovered schema. No inferred tools. */
public record McpWebBinding(String serverId, String endpoint, String transport, Operation operation,
        String tool, boolean approved, Map<String, Object> inputSchema, String inputArgument,
        String ownerPolicyArgument, String resultsField, String titleField, String urlField, String textField) {
    public enum Operation { SEARCH, READ }

    public McpWebBinding {
        Objects.requireNonNull(operation);
        for (var value : new String[]{serverId, endpoint, transport, tool, inputArgument, titleField, urlField, textField}) {
            if (value == null || value.isBlank()) throw new IllegalArgumentException(com.lh.eap.error.McpErrors.MCP_SERVER_INPUT_INVALID.code());
        }
        if (inputSchema == null || !"object".equals(inputSchema.get("type")))
            throw new IllegalArgumentException(com.lh.eap.error.McpErrors.MCP_SERVER_INPUT_INVALID.code());
        inputSchema = Map.copyOf(inputSchema);
        if (!(inputSchema.get("properties") instanceof Map<?, ?> properties)
                || !(properties.get(inputArgument) instanceof Map<?, ?> input)
                || !"string".equals(input.get("type")))
            throw new IllegalArgumentException(com.lh.eap.error.McpErrors.MCP_SERVER_INPUT_INVALID.code());
        if (inputSchema.get("required") instanceof java.util.List<?> required) {
            for (var field : required) {
                if (!inputArgument.equals(field)
                        && !(operation == Operation.READ && Objects.equals(ownerPolicyArgument, field)))
                    throw new IllegalArgumentException(com.lh.eap.error.McpErrors.MCP_SERVER_INPUT_INVALID.code());
            }
        }
        if (operation == Operation.READ && (!(properties.get(ownerPolicyArgument) instanceof Map<?, ?> policy)
                || !"object".equals(policy.get("type"))))
            throw new IllegalArgumentException(com.lh.eap.error.McpErrors.MCP_SERVER_INPUT_INVALID.code());
        if (operation == Operation.READ && (ownerPolicyArgument == null || ownerPolicyArgument.isBlank()
                || ownerPolicyArgument.equals(inputArgument)))
            throw new IllegalArgumentException(com.lh.eap.error.McpErrors.MCP_SERVER_INPUT_INVALID.code());
    }

    public String capability() { return "mcp." + serverId + "." + tool; }
}
