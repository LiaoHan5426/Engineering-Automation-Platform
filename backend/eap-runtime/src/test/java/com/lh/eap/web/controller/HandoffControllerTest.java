package com.lh.eap.web.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.lh.eap.application.service.Handoff;
import com.lh.eap.application.service.HandoffService;
import com.lh.eap.application.service.HandoffStore;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class HandoffControllerTest {
    @Test
    void postRecordsChatTextWithoutStartingWork() throws Exception {
        var mvc = mvc();
        mvc.perform(post("/api/handoffs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"source\":\"chat\",\"sourceRef\":\"draft\",\"summary\":\"请以后再看这段说明\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.execution").value("not_started"))
                .andExpect(jsonPath("$.grant").value("none"))
                .andExpect(jsonPath("$.approval").value("not_requested"));
    }

    @Test
    void rejectsForgedStatusAndGrantFieldsWithoutStoring() throws Exception {
        var rows = new ArrayList<Handoff>();
        var mvc = mvc(rows);
        mvc.perform(post("/api/handoffs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"source":"builder","sourceRef":"builder-alpha","summary":"草稿","status":"completed","execution":"started","grant":"repository.write"}
                                """))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/handoffs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"source\":\"mission\",\"sourceRef\":\"builder-alpha\",\"summary\":\"草稿\"}"))
                .andExpect(status().isBadRequest());
        org.junit.jupiter.api.Assertions.assertTrue(rows.isEmpty());
    }

    private static MockMvc mvc() {
        return mvc(new ArrayList<>());
    }

    private static MockMvc mvc(List<Handoff> rows) {
        var service = new HandoffService(new HandoffStore() {

            @Override
            public void insert(Handoff handoff) {
                rows.add(handoff);
            }

            @Override
            public List<Handoff> list() {
                return List.copyOf(rows);
            }

            @Override
            public Optional<Handoff> find(UUID id) {
                return rows.stream().filter(item -> item.id().equals(id)).findFirst();
            }
        });
        return MockMvcBuilders.standaloneSetup(new HandoffController(service))
                .setControllerAdvice(new ApiErrorHandler())
                .build();
    }
}
