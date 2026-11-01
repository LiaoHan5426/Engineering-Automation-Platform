package com.lh.eap.ai;

import com.openai.errors.OpenAIServiceException;
import java.net.SocketTimeoutException;
import java.net.http.HttpTimeoutException;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.concurrent.CancellationException;
import java.util.concurrent.TimeoutException;
import org.springframework.web.client.RestClientResponseException;

/** Safe boundary classification, shared by chat and the SQL compatibility bridge. Never emits bodies. */
public final class AiErrors {
    private AiErrors() {}
    public static String classify(Throwable failure) {
        var visited = Collections.newSetFromMap(new IdentityHashMap<Throwable, Boolean>());
        for (var cause = failure; cause != null && visited.add(cause); cause = cause.getCause()) {
            if (cause instanceof InterruptedException || cause instanceof CancellationException) return "AI_CANCELLED";
            if (cause instanceof TimeoutException || cause instanceof SocketTimeoutException || cause instanceof HttpTimeoutException)
                return "AI_TIMED_OUT";
            if (cause instanceof OpenAIServiceException response) {
                if (response.code().filter("model_not_found"::equals).isPresent()) return "AI_MODEL_UNAVAILABLE";
                return http(response.statusCode());
            }
            if (cause instanceof RestClientResponseException response) return http(response.getStatusCode().value());
        }
        return "AI_PROVIDER_ERROR";
    }
    private static String http(int status) {
        return switch (status) {
            case 401 -> "AI_AUTHENTICATION_FAILED";
            case 403 -> "AI_PROVIDER_PERMISSION_DENIED";
            case 404 -> "AI_RESOURCE_NOT_FOUND"; // Endpoint failure alone does not prove a model is missing.
            case 408, 504 -> "AI_TIMED_OUT";
            case 429 -> "AI_RATE_LIMITED";
            default -> "AI_PROVIDER_ERROR";
        };
    }
}
