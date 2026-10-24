package com.lh.eap.web.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.lh.eap.application.service.PrototypeDelivery;
import com.lh.eap.application.service.PrototypeDeliveryStore;
import com.lh.eap.application.service.PrototypeVersion;
import com.lh.eap.application.service.PrototypeVersionService;
import com.lh.eap.application.service.PrototypeVersionStore;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class PrototypeVersionControllerTest {
    @Test
    void forgedHashRepositoryAndInteractionDoNotInsert() throws Exception {
        var rows = new ArrayList<PrototypeVersion>();
        var mvc = mvc(rows);
        mvc.perform(post("/api/prototype-versions").contentType(MediaType.APPLICATION_JSON).content("""
                {"sourceRef":"builder-alpha","title":"结算页","body":"正文","buttonPresses":0,"acceptance":[],
                 "contentHash":"forged","interaction":"客户端说明","mockRepositoryLabel":"模拟 · ledger","path":"F:/repo"}
                """)).andExpect(status().isBadRequest());
        mvc.perform(post("/api/prototype-deliveries").contentType(MediaType.APPLICATION_JSON).content("""
                {"versionId":"00000000-0000-0000-0000-000000000000","remote":"git@example","grant":"repository.write"}
                """)).andExpect(status().isBadRequest());
        org.junit.jupiter.api.Assertions.assertTrue(rows.isEmpty());
        mvc.perform(post("/api/prototype-versions").contentType(MediaType.APPLICATION_JSON).content("""
                {"sourceRef":"builder-alpha","title":"结算页","body":"正文","buttonPresses":1,"acceptance":["看标题"]}
                """)).andExpect(status().isOk())
                .andExpect(jsonPath("$.interaction").value("预览按钮使计数加一"))
                .andExpect(jsonPath("$.buttonPresses").value(1));
        org.junit.jupiter.api.Assertions.assertEquals(1, rows.size());
    }

    private static MockMvc mvc(List<PrototypeVersion> rows) {
        var service = new PrototypeVersionService(new PrototypeVersionStore() {
            @Override public void insert(PrototypeVersion version) { rows.add(version); }
            @Override public Optional<PrototypeVersion> find(UUID id) { return Optional.empty(); }
            @Override public List<PrototypeVersion> list(String sourceRef) { return List.of(); }
        }, new PrototypeDeliveryStore() {
            @Override public void insert(PrototypeDelivery delivery) {}
            @Override public Optional<PrototypeDelivery> findByVersion(UUID versionId) { return Optional.empty(); }
        });
        return MockMvcBuilders.standaloneSetup(new PrototypeVersionController(service))
                .setControllerAdvice(new ApiErrorHandler())
                .build();
    }
}
