package com.lh.eap.ai;

import com.lh.eap.error.ModelErrors;
import java.util.concurrent.CancellationException;
import java.util.concurrent.TimeoutException;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.prompt.ChatOptions;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Flux;

/** Redacts provider failures before ChatClient aggregation can log their message or cause. */
final class CompletionChatModel implements ChatModel {
    private final ChatModel delegate;
    CompletionChatModel(ChatModel delegate) { this.delegate = delegate; }
    @Override public ChatOptions getOptions() { return delegate.getOptions(); }
    @Override public ChatResponse call(Prompt prompt) {
        try { return delegate.call(prompt); }
        catch (RuntimeException failure) { throw redacted(failure); }
    }
    @Override public Flux<ChatResponse> stream(Prompt prompt) {
        return Flux.defer(() -> delegate.stream(prompt)).onErrorMap(CompletionChatModel::redacted);
    }
    private static RuntimeException redacted(Throwable failure) {
        if (failure instanceof CancellationException) return new CancellationException(ModelErrors.AI_CANCELLED.code());
        if (failure instanceof TimeoutException || failure instanceof java.net.http.HttpTimeoutException)
            return new ResponseStatusException(HttpStatus.GATEWAY_TIMEOUT, ModelErrors.AI_TIMED_OUT.code());
        if (failure instanceof IllegalStateException && java.util.Set.of(
                ModelErrors.AI_RESPONSE_FAILED.code(), ModelErrors.AI_RESPONSE_INCOMPLETE.code(),
                ModelErrors.AI_RESPONSE_ITEMS_INVALID.code(), ModelErrors.AI_RESPONSE_OUTPUT_LIMIT.code(),
                ModelErrors.AI_RESPONSE_TOOL_INVALID.code(), ModelErrors.AI_RESPONSE_TOOL_UNSUPPORTED.code())
                .contains(failure.getMessage() == null ? "" : failure.getMessage()))
            return new IllegalStateException(failure.getMessage());
        String declared = failure instanceof ResponseStatusException status ? status.getReason() : failure.getMessage();
        String code = ModelErrors.AI_PROVIDER_ERROR.code();
        for (var candidate : ModelErrors.values()) {
            if (candidate.code().equals(declared)) { code = candidate.code(); break; }
        }
        return new ResponseStatusException(failure instanceof ResponseStatusException status
                ? status.getStatusCode() : HttpStatus.BAD_GATEWAY, code);
    }
}
