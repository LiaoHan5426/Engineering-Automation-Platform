package com.lh.eap.web.controller;

import com.lh.eap.ai.TaskDescriptionOptimizer;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import reactor.core.publisher.Mono;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class TaskDescriptionOptimizationControllerTest {
    @Test void jsonContractUsesAuthenticatedPrincipalAndReturnsSuggestionWithoutSaving() throws Exception {
        var optimizer = mock(TaskDescriptionOptimizer.class);
        var id = UUID.randomUUID();
        var connection = UUID.randomUUID();
        when(optimizer.optimize(eq("alice"), eq(id), any())).thenReturn(Mono.just(
                new TaskDescriptionOptimizer.Suggestion("第一行\n第二行", connection, "chosen")));
        var mvc = MockMvcBuilders.standaloneSetup(new TaskDescriptionOptimizationController(optimizer)).build();
        var pending = mvc.perform(post("/api/ai/task-description/optimizations/{id}", id)
                .principal(() -> "alice").contentType("application/json").content("{\"text\":\"原任务\\n第二行\"}"))
                .andExpect(request().asyncStarted()).andReturn();
        mvc.perform(asyncDispatch(pending)).andExpect(status().isOk())
                .andExpect(jsonPath("$.text").value("第一行\n第二行"))
                .andExpect(jsonPath("$.connectionId").value(connection.toString()))
                .andExpect(jsonPath("$.model").value("chosen"));
        verify(optimizer).optimize("alice", id, new TaskDescriptionOptimizer.Request("原任务\n第二行", null, null));
    }

    @Test void detailJsonContractAndCancellationReuseExistingController() throws Exception {
        var optimizer = mock(TaskDescriptionOptimizer.class);
        var id = UUID.randomUUID();
        var connection = UUID.randomUUID();
        when(optimizer.optimizeTaskDetail(eq("alice"), eq(id), any())).thenReturn(Mono.just(
                new TaskDescriptionOptimizer.DetailResult("目标", "验收", connection, "chosen")));
        var mvc = MockMvcBuilders.standaloneSetup(new TaskDescriptionOptimizationController(optimizer)).build();
        var pending = mvc.perform(post("/api/ai/task-detail/optimizations/{id}", id).principal(() -> "alice")
                .contentType("application/json").content("{\"goal\":\"原目标\",\"acceptanceCriteria\":\"原验收\"}"))
                .andExpect(request().asyncStarted()).andReturn();
        mvc.perform(asyncDispatch(pending)).andExpect(status().isOk())
                .andExpect(jsonPath("$.goal").value("目标"))
                .andExpect(jsonPath("$.acceptanceCriteria").value("验收"))
                .andExpect(jsonPath("$.connectionId").value(connection.toString()))
                .andExpect(jsonPath("$.model").value("chosen"));
        verify(optimizer).optimizeTaskDetail("alice", id, new TaskDescriptionOptimizer.DetailRequest("原目标", "原验收", null, null));
        mvc.perform(delete("/api/ai/task-detail/optimizations/{id}", id).principal(() -> "bob"))
                .andExpect(status().isNoContent());
        verify(optimizer).cancel("bob", id);
        mvc.perform(delete("/api/ai/task-detail/optimizations/not-a-uuid")).andExpect(status().isBadRequest());
    }

    @Test void deleteIsIdempotentAndPrincipalScoped() throws Exception {
        var optimizer = mock(TaskDescriptionOptimizer.class);
        var mvc = MockMvcBuilders.standaloneSetup(new TaskDescriptionOptimizationController(optimizer)).build();
        var id = UUID.randomUUID();
        mvc.perform(delete("/api/ai/task-description/optimizations/{id}", id).principal(() -> "bob"))
                .andExpect(status().isNoContent());
        verify(optimizer).cancel("bob", id);
        verifyNoMoreInteractions(optimizer);
    }
}
