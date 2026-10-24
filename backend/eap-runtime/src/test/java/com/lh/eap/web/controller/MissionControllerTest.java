package com.lh.eap.web.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.lh.eap.application.service.Handoff;
import com.lh.eap.application.service.HandoffStore;
import com.lh.eap.application.service.Mission;
import com.lh.eap.application.service.MissionService;
import com.lh.eap.application.service.MissionStore;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class MissionControllerTest {
    @Test
    void postCreatesAShellFromAHandoffAndRepeatReturnsIt() throws Exception {
        var handoffId = UUID.randomUUID();
        var rows = new ArrayList<Mission>();
        var mvc = mvc(List.of(handoff(handoffId)), rows, false);
        var created = mvc.perform(post("/api/missions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"handoffId\":\"" + handoffId + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("created"))
                .andExpect(jsonPath("$.execution").value("not_started"))
                .andExpect(jsonPath("$.approval").value("not_requested"))
                .andExpect(jsonPath("$.grant").value("none"))
                .andExpect(jsonPath("$.verification").value("not_requested"))
                .andReturn();
        mvc.perform(post("/api/missions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"handoffId\":\"" + handoffId + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(jsonId(created.getResponse().getContentAsString())));
        assertEquals(1, rows.size());
    }

    @Test
    void rejectsForgedFieldsAndAMissingHandoffWithoutStoring() throws Exception {
        var rows = new ArrayList<Mission>();
        var handoffId = UUID.randomUUID();
        var mvc = mvc(List.of(handoff(handoffId)), rows, false);
        mvc.perform(post("/api/missions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"handoffId\":\"" + handoffId + "\",\"status\":\"completed\",\"grant\":\"repository.write\",\"verification\":\"passed\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/missions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"handoffId\":\"" + UUID.randomUUID() + "\"}"))
                .andExpect(status().isNotFound());
        assertTrue(rows.isEmpty());
    }

    @Test
    void databaseFailureStaysAnError() throws Exception {
        var handoffId = UUID.randomUUID();
        var mvc = mvc(List.of(handoff(handoffId)), new ArrayList<>(), true);
        mvc.perform(post("/api/missions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"handoffId\":\"" + handoffId + "\"}"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.detail").value("数据服务暂不可用，请检查数据库、迁移和后端日志"));
    }

    private static String jsonId(String body) {
        var marker = "\"id\":\"";
        var start = body.indexOf(marker) + marker.length();
        return body.substring(start, body.indexOf('"', start));
    }

    private static Handoff handoff(UUID id) {
        return new Handoff(id, "builder", "builder-alpha", "结算页已改", "recorded", "not_started", "not_requested", "none", Instant.now());
    }

    private static MockMvc mvc(List<Handoff> handoffs, List<Mission> rows, boolean databaseDown) {
        var service = new MissionService(new HandoffStore() {
            @Override
            public void insert(Handoff handoff) {
                throw new UnsupportedOperationException();
            }

            @Override
            public List<Handoff> list() {
                return List.copyOf(handoffs);
            }

            @Override
            public Optional<Handoff> find(UUID id) {
                return handoffs.stream().filter(item -> item.id().equals(id)).findFirst();
            }
        }, new MissionStore() {
            @Override
            public void insert(Mission mission) {
                if (databaseDown) throw new DataAccessResourceFailureException("database down");
                if (rows.stream().anyMatch(item -> item.handoffId().equals(mission.handoffId()))) {
                    throw new org.springframework.dao.DuplicateKeyException("mission_handoff_id_key");
                }
                rows.add(mission);
            }

            @Override
            public List<Mission> list() {
                return List.copyOf(rows);
            }

            @Override
            public Optional<Mission> find(UUID id) {
                return rows.stream().filter(item -> item.id().equals(id)).findFirst();
            }

            @Override
            public Optional<Mission> findByHandoff(UUID handoffId) {
                return rows.stream().filter(item -> item.handoffId().equals(handoffId)).findFirst();
            }
        });
        return MockMvcBuilders.standaloneSetup(new MissionController(service))
                .setControllerAdvice(new ApiErrorHandler())
                .build();
    }
}
