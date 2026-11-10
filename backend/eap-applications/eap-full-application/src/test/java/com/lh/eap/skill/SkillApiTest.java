package com.lh.eap.skill;

import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.Path;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import org.springframework.http.MediaType;
import com.lh.eap.config.RuntimeWorkspace;
import com.lh.eap.runtime.handler.CapabilityHandlerRegistry;
import com.lh.eap.web.controller.ApiErrorHandler;

class SkillApiTest {
    @TempDir Path root;
    @Test void browserWritesRequireLocalJsonOrigin() throws Exception {
        var skills = org.mockito.Mockito.mock(SkillService.class);
        var mvc = MockMvcBuilders.standaloneSetup(new SkillController(skills)).setControllerAdvice(new ApiErrorHandler())
                .addFilters(new com.lh.eap.web.AiBrowserRequestGuard()).build();
        mvc.perform(post("/api/skills").contentType(MediaType.APPLICATION_JSON).content("{}").header("Origin","https://evil.example"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/skills/preview").contentType(MediaType.TEXT_PLAIN).content("{}"))
                .andExpect(status().isUnsupportedMediaType());
        org.mockito.Mockito.verifyNoInteractions(skills);
    }
    @Test void missingBodyUsesSkillErrorContract() throws Exception {
        var mvc = MockMvcBuilders.standaloneSetup(new SkillController(org.mockito.Mockito.mock(SkillService.class)))
                .setControllerAdvice(new ApiErrorHandler()).build();
        mvc.perform(post("/api/skills/preview").contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("INVALID_SKILL_INPUT"));
    }
    @Test void previewUsesBoundRootAndNeverTrustsTheClientOrTouchesStorage() throws Exception {
        var jdbc = org.mockito.Mockito.mock(JdbcTemplate.class);
        var service = new SkillService(jdbc, new SkillTextParser(), RuntimeWorkspace.colocated(root, ""), new CapabilityHandlerRegistry(List.of()));
        var controller = new SkillController(service);
        var mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new ApiErrorHandler()).build();
        String json = tools.jackson.databind.json.JsonMapper.builder().build().writeValueAsString(SkillTextParserTest.input("---\nname: good\ndescription: ok\n---\nbody"));
        mvc.perform(post("/api/skills/preview").contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value("good"))
                .andExpect(jsonPath("$.schemaVersion").value(1)).andExpect(jsonPath("$.entry").value("SKILL.md"))
                .andExpect(jsonPath("$.enabled").value(false)).andExpect(jsonPath("$.trust").doesNotExist())
                .andExpect(jsonPath("$.dependencies[0].status").value("unknown"));
        mvc.perform(post("/api/skills/preview").contentType(MediaType.APPLICATION_JSON).content(("{\"scope\":\"forged\"," + json.substring(1))))
                .andExpect(status().isBadRequest());
        org.mockito.Mockito.verifyNoInteractions(jdbc);
    }
}
