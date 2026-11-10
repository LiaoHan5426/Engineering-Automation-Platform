package com.lh.eap.ai;
import com.lh.eap.error.ModelErrors;

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
            if (cause instanceof InterruptedException || cause instanceof CancellationException) return ModelErrors.AI_CANCELLED.code();
            if (cause instanceof TimeoutException || cause instanceof SocketTimeoutException || cause instanceof HttpTimeoutException)
                return ModelErrors.AI_TIMED_OUT.code();
            if (cause instanceof OpenAIServiceException response) {
                if (response.code().filter("model_not_found"::equals).isPresent()) return ModelErrors.AI_MODEL_UNAVAILABLE.code();
                return http(response.statusCode());
            }
            if (cause instanceof RestClientResponseException response) return http(response.getStatusCode().value());
        }
        return ModelErrors.AI_PROVIDER_ERROR.code();
    }
    private static String http(int status) {
        return switch (status) {
            case 401 -> ModelErrors.AI_AUTHENTICATION_FAILED.code();
            case 403 -> ModelErrors.AI_PROVIDER_PERMISSION_DENIED.code();
            case 404 -> ModelErrors.AI_RESOURCE_NOT_FOUND.code(); // Endpoint failure alone does not prove a model is missing.
            case 408, 504 -> ModelErrors.AI_TIMED_OUT.code();
            case 429 -> ModelErrors.AI_RATE_LIMITED.code();
            default -> ModelErrors.AI_PROVIDER_ERROR.code();
        };
    }
}
