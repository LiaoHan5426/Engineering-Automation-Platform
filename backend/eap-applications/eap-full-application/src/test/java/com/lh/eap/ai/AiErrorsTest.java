package com.lh.eap.ai;

import static org.junit.jupiter.api.Assertions.*;
import java.util.concurrent.CancellationException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class AiErrorsTest {
    @ParameterizedTest
    @CsvSource({"401,AI_AUTHENTICATION_FAILED", "403,AI_PROVIDER_PERMISSION_DENIED",
            "404,AI_RESOURCE_NOT_FOUND", "408,AI_TIMED_OUT", "429,AI_RATE_LIMITED", "500,AI_PROVIDER_ERROR"})
    void publicHttpFailureStatusHasSafeStableClassification(int status, String expected) {
        var failure = new org.springframework.web.client.RestClientResponseException(
                "api_key=never-output", status, "failure", null, null, null);
        assertEquals(expected, AiErrors.classify(new RuntimeException("wrapped", failure)));
        var result = FakeChatModels.sqlBridge(FakeChatModels.scripted(p -> { throw failure; }))
                .complete(new com.lh.eap.llm.LlmProvider.Request("s", "u", 0.1, 100, null));
        assertFalse(result.ok()); assertEquals(expected, result.error());
    }
    @Test void publicSdkModelNotFoundCodeIsDifferentFromGeneric404() {
        var error = com.openai.models.ErrorObject.builder().code("model_not_found")
                .message("secret=never-output").param("model").type("invalid_request_error").build();
        var failure = com.openai.errors.NotFoundException.builder().headers(com.openai.core.http.Headers.builder().build()).error(error).build();
        assertEquals("AI_MODEL_UNAVAILABLE", AiErrors.classify(failure));
    }
    @Test void wrappedTimeoutAndCancellationAreRecognizedWithoutRecordingMessage() {
        assertEquals("AI_TIMED_OUT", AiErrors.classify(new RuntimeException(new java.net.SocketTimeoutException("secret"))));
        assertEquals("AI_CANCELLED", AiErrors.classify(new CancellationException("secret")));
    }
}
