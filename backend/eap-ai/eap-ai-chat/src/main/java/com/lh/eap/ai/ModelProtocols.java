package com.lh.eap.ai;

public final class ModelProtocols {
    private ModelProtocols() {}
    public static final String CHATGPT_KIND = "chatgpt-plan";
    public static String checkedWireApi(String value) {
        if (value == null) return "chat-completions";
        if (!java.util.Set.of("chat-completions", "responses").contains(value))
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "INVALID_WIRE_API");
        return value;
    }

}
