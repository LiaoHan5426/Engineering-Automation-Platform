package com.lh.eap.llm;

/**
 * A model provider is the only place in the runtime that talks to a language model.
 *
 * <p>Providers are optional and must fail closed: a timeout, an outage or a malformed response
 * yields a failed {@link Result} that the {@link LlmGateway} converts into "no model output",
 * never into a fabricated answer. Provider output is always an unverified observation.
 */
public interface LlmProvider {
    /** Stable provider identifier used in audit records. */
    String id();

    /** Whether the provider is configured and permitted to run. */
    boolean available();

    /** Human-readable model identifier for audit records. */
    String model();

    /** Perform a single completion. Implementations must honour their own timeouts. */
    Result complete(Request request);

    /** A single completion request. Prompts are already preprocessed and token-bounded. */
    record Request(String systemPrompt, String userPrompt, double temperature, int maxTokens, String cacheKey) { }

    /** The outcome of a completion. {@code ok=false} means the caller must fall back to deterministic output. */
    record Result(boolean ok, String text, String providerId, String model, long latencyMs,
                  int promptTokens, int completionTokens, String error) {
        public static Result failure(String providerId, String error) {
            return new Result(false, null, providerId, null, 0, 0, 0, error);
        }
    }
}
