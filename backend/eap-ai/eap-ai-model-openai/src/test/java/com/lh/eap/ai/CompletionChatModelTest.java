package com.lh.eap.ai;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.core.read.ListAppender;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.prompt.ChatOptions;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Flux;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.any;

class CompletionChatModelTest {
    @Test void aggregatorNeverSeesProviderSecretInMessageOrCause() {
        var raw = mock(ChatModel.class);
        when(raw.getOptions()).thenReturn(ChatOptions.builder().build());
        when(raw.stream(any(Prompt.class))).thenReturn(Flux.error(new IllegalStateException("fixture-secret")));
        var logger = (Logger) LoggerFactory.getLogger("org.springframework.ai.chat.model.MessageAggregator");
        var events = new ListAppender<ch.qos.logback.classic.spi.ILoggingEvent>();
        events.start(); logger.addAppender(events);
        try {
            var client = ChatClient.builder(new CompletionChatModel(raw)).build();
            var failure = assertThrows(ResponseStatusException.class,
                    () -> client.prompt().user("source").stream().content().blockLast(Duration.ofSeconds(3)));
            assertEquals("AI_PROVIDER_ERROR", failure.getReason());
            assertNull(failure.getCause());
            assertFalse(events.list.isEmpty());
            for (var event : events.list) {
                assertFalse(event.getFormattedMessage().contains("fixture-secret"));
                if (event.getThrowableProxy() != null) {
                    assertFalse(event.getThrowableProxy().getMessage().contains("fixture-secret"));
                    assertNull(event.getThrowableProxy().getCause());
                }
            }
        } finally { logger.detachAppender(events); events.stop(); }
    }

    @Test void controlledProtocolFailureRetainsIllegalStateExceptionAndDropsCause() {
        for (String code : java.util.List.of("AI_RESPONSE_FAILED", "AI_RESPONSE_INCOMPLETE", "AI_RESPONSE_ITEMS_INVALID",
                "AI_RESPONSE_OUTPUT_LIMIT", "AI_RESPONSE_TOOL_INVALID", "AI_RESPONSE_TOOL_UNSUPPORTED")) {
            var raw = mock(ChatModel.class);
            when(raw.call(any(Prompt.class))).thenThrow(new IllegalStateException(code, new RuntimeException("fixture-secret")));
            when(raw.stream(any(Prompt.class))).thenReturn(Flux.error(new IllegalStateException(code, new RuntimeException("fixture-secret"))));
            var wrapper = new CompletionChatModel(raw);
            var callError = assertThrows(IllegalStateException.class, () -> wrapper.call(new Prompt("text")));
            assertEquals(code, callError.getMessage());
            assertNull(callError.getCause());
            var streamError = assertThrows(IllegalStateException.class,
                    () -> wrapper.stream(new Prompt("text")).blockLast(Duration.ofSeconds(3)));
            assertEquals(code, streamError.getMessage());
            assertNull(streamError.getCause());
        }
    }

    @Test void nearMatchProtocolMessageDoesNotPassTheWhitelist() {
        var raw = mock(ChatModel.class);
        when(raw.call(any(Prompt.class))).thenThrow(new IllegalStateException("AI_RESPONSE_FAILED fixture-secret"));
        var error = assertThrows(ResponseStatusException.class, () -> new CompletionChatModel(raw).call(new Prompt("text")));
        assertEquals("AI_PROVIDER_ERROR", error.getReason());
        assertNull(error.getCause());
    }

    @Test void cancellationAndTimeoutKeepTheirSemanticsAndDropDiagnostics() {
        var raw = mock(ChatModel.class);
        when(raw.stream(any(Prompt.class))).thenReturn(Flux.error(new java.util.concurrent.CancellationException("fixture-secret")));
        var wrapper = new CompletionChatModel(raw);
        var cancelled = assertThrows(java.util.concurrent.CancellationException.class,
                () -> wrapper.stream(new Prompt("text")).blockLast(Duration.ofSeconds(3)));
        assertEquals("AI_CANCELLED", cancelled.getMessage());
        assertNull(cancelled.getCause());
        when(raw.stream(any(Prompt.class))).thenReturn(Flux.error(new java.util.concurrent.TimeoutException("fixture-secret")));
        var timeout = assertThrows(ResponseStatusException.class,
                () -> wrapper.stream(new Prompt("text")).blockLast(Duration.ofSeconds(3)));
        assertEquals(HttpStatus.GATEWAY_TIMEOUT, timeout.getStatusCode());
        assertEquals("AI_TIMED_OUT", timeout.getReason());
        assertNull(timeout.getCause());
    }

    @Test void retainsDeclaredStatusAndMachineCodeButDropsSensitiveCause() {
        var raw = mock(ChatModel.class);
        when(raw.call(any(Prompt.class))).thenThrow(new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                "AI_RATE_LIMITED", new IllegalStateException("fixture-secret")));
        var error = assertThrows(ResponseStatusException.class, () -> new CompletionChatModel(raw).call(new Prompt("text")));
        assertEquals(HttpStatus.TOO_MANY_REQUESTS, error.getStatusCode());
        assertEquals("AI_RATE_LIMITED", error.getReason());
        assertNull(error.getCause());
    }
}
