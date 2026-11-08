package com.lh.eap.runtime.mcp.client;

public class McpProtocolException extends RuntimeException {
    private final int code;

    public McpProtocolException(String message, int code) {
        super(message);
        this.code = code;
    }

    public McpProtocolException(String message, int code, Throwable cause) {
        super(message, cause);
        this.code = code;
    }

    public int code() {
        return code;
    }
}
