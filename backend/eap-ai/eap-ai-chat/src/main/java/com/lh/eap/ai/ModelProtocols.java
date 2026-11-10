package com.lh.eap.ai;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import com.lh.eap.error.ModelErrors;

public final class ModelProtocols {
    private ModelProtocols() {}
    public static final String CHATGPT_KIND = "chatgpt-plan";
    public static String checkedWireApi(String value) {
        if (value == null) return "chat-completions";
        if (!Set.of("chat-completions", "responses").contains(value))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ModelErrors.INVALID_WIRE_API.code());
        return value;
    }

}
