package com.lh.eap.ai;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.openai.client.OpenAIClient;
import com.openai.core.http.StreamResponse;
import com.openai.models.responses.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.messages.*;
import org.springframework.ai.chat.prompt.Prompt;

class ChatGptPlanChatModelTest {
    @Test void mapsSpringMemoryToResponsesInputWithoutSendingUnsupportedSystemItemsOrStorage() {
        var params = ChatGptPlanChatModel.parameters(new Prompt(List.of(new SystemMessage("Keep conventions"), new UserMessage("First"), new AssistantMessage("Answer"), new UserMessage("Next"))), "account-model");
        assertEquals(false, params.store().orElseThrow());
        assertEquals("Keep conventions\n", params.instructions().orElseThrow());
        assertEquals(3, params.input().orElseThrow().asResponse().size());
        assertTrue(params.previousResponseId().isEmpty()); assertTrue(params.maxOutputTokens().isEmpty());
        assertTrue(params.temperature().isEmpty());
    }
    @Test void acceptsTextOnlyAfterACompletedStreamAndRejectsTruncatedStreams() {
        var client = mock(OpenAIClient.class, RETURNS_DEEP_STUBS);
        @SuppressWarnings("unchecked") StreamResponse<ResponseStreamEvent> stream = mock(StreamResponse.class);
        var delta = mock(ResponseStreamEvent.class); var text = mock(ResponseTextDeltaEvent.class);
        when(text.delta()).thenReturn("proposed code"); when(delta.outputTextDelta()).thenReturn(Optional.of(text));
        var completed = mock(ResponseStreamEvent.class); when(completed.completed()).thenReturn(Optional.of(mock(ResponseCompletedEvent.class)));
        when(client.responses().createStreaming(any(ResponseCreateParams.class))).thenReturn(stream);
        when(stream.stream()).thenReturn(java.util.stream.Stream.of(delta, completed));
        var model = new ChatGptPlanChatModel(client, "account-model");
        assertEquals("proposed code", model.call(new Prompt("request")).getResult().getOutput().getText());
        when(stream.stream()).thenReturn(java.util.stream.Stream.of(delta));
        assertThrows(IllegalStateException.class, () -> model.call(new Prompt("request")));
    }
}
