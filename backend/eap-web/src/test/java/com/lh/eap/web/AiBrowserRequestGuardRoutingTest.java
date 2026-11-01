package com.lh.eap.web;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.lh.eap.ai.AiChatApplication;
import com.lh.eap.config.WebConfiguration;
import com.lh.eap.skill.SkillController;
import com.lh.eap.skill.SkillService;
import com.lh.eap.web.controller.AiChatController;
import java.net.URI;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.context.annotation.*;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockServletContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;

class AiBrowserRequestGuardRoutingTest {
    @Configuration(proxyBeanMethods = false)
    @EnableWebMvc
    @Import(WebConfiguration.class)
    static class Config {
        final SkillService skills = mock(SkillService.class);
        final AiChatApplication chat = mock(AiChatApplication.class);
        @Bean SkillController skillsController() { return new SkillController(skills); }
        @Bean AiChatController chatController() { return new AiChatController(chat); }
    }

    private AnnotationConfigWebApplicationContext context;
    private MockMvc guarded;
    private SkillService skills;
    private AiChatApplication chat;

    @BeforeEach void setUp() {
        context = new AnnotationConfigWebApplicationContext();
        context.setServletContext(new MockServletContext());
        context.register(Config.class);
        context.refresh();
        skills = context.getBean(Config.class).skills;
        chat = context.getBean(Config.class).chat;
        guarded = MockMvcBuilders.webAppContextSetup(context).addFilters(new AiBrowserRequestGuard()).build();
    }

    @AfterEach void close() { context.close(); }

    @Test void realRoutingIgnoresMatrixParametersAndSameOriginCorsIsNotAHostGuard() throws Exception {
        var unguarded = MockMvcBuilders.webAppContextSetup(context).build();
        unguarded.perform(post(URI.create("http://evil.example/api/skills;x"))
                .header("Host", "evil.example").header("Origin", "http://evil.example")
                .contentType(MediaType.TEXT_PLAIN).content("{}"))
                .andExpect(status().isOk()).andExpect(handler().handlerType(SkillController.class));
        verify(skills).save(any());
        unguarded.perform(post(URI.create("http://evil.example/api/skills;x/probe/versions/1.0.0/activation"))
                .header("Host", "evil.example").header("Origin", "http://evil.example")
                .contentType(MediaType.TEXT_PLAIN).content("{}"))
                .andExpect(status().isOk()).andExpect(handler().handlerType(SkillController.class));
        verify(skills).activate(eq("probe"), eq("1.0.0"), any());
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/skills;x", "/api/skills;x/probe/versions/1.0.0/activation", "/api/ai;x/conversations"})
    void rejectsMatrixPathsBeforeRoutingEvenForSameOriginForeignHost(String path) throws Exception {
        guarded.perform(post(URI.create("http://evil.example" + path))
                .header("Host", "evil.example").header("Origin", "http://evil.example")
                .contentType(MediaType.TEXT_PLAIN).content("{}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("PATH_REJECTED"));
        verifyNoInteractions(skills, chat);
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api;x/skills", "/api/skills/probe;x/versions/1.0.0/activation",
            "/api/skills%3bx", "/api/skills%3Bx/preview", "/api/ai%3Bx/conversations",
            "/api//skills;x", "/api/skills/preview;x", "/%61pi/skills;x"})
    void rejectsUnsupportedMatrixSyntaxWithTrustedHeadersToo(String path) throws Exception {
        guarded.perform(post(URI.create(path)).header("Host", "localhost")
                .header("Origin", "http://localhost:5173").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("PATH_REJECTED"));
        verifyNoInteractions(skills, chat);
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/skills", "/api/skills/preview", "/api/skills/probe/versions/1.0.0/activation",
            "/api/skills/context/preview", "/api/ai/conversations", "/%61pi/skills", "/api/%73kills", "/api/%61i/conversations"})
    void protectsEveryRoutableWriteAndPreservesLocalJsonRequests(String path) throws Exception {
        guarded.perform(post(URI.create("http://evil.example" + path))
                .header("Host", "evil.example").header("Origin", "http://evil.example")
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.detail").value("HOST_REJECTED"));
        guarded.perform(post(URI.create(path)).header("Host", "localhost")
                .header("Origin", "http://evil.example").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.detail").value("ORIGIN_REJECTED"));
        guarded.perform(post(URI.create(path)).header("Host", "localhost")
                .header("Origin", "http://localhost:5173").contentType(MediaType.TEXT_PLAIN).content("{}"))
                .andExpect(status().isUnsupportedMediaType()).andExpect(jsonPath("$.detail").value("CONTENT_TYPE_REJECTED"));
        verifyNoInteractions(skills, chat);
        var accepted = guarded.perform(post(URI.create(path)).header("Host", "localhost")
                .header("Origin", "http://localhost:5173").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isOk()).andReturn();
        assertInstanceOf(org.springframework.web.method.HandlerMethod.class, accepted.getHandler());
        assertTrue(!mockingDetails(skills).getInvocations().isEmpty() || !mockingDetails(chat).getInvocations().isEmpty());
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api//skills", "/api/skills/", "/api/skills-extra", "/prefix/api/skills",
            "/api/skills%3Bx", "/api%3Bx/skills", "/api%2Fskills", "/api/skills/../skills", "/api/./skills"})
    void nonRoutesCannotBecomeUnprotectedControllerCalls(String path) throws Exception {
        var unguarded = MockMvcBuilders.webAppContextSetup(context).build();
        unguarded.perform(post(URI.create(path)).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isNotFound());
        var result = guarded.perform(post(URI.create("http://evil.example" + path))
                .header("Host", "evil.example").header("Origin", "http://evil.example")
                .contentType(MediaType.TEXT_PLAIN).content("{}"))
                .andReturn();
        assertTrue(result.getResponse().getStatus() >= 400 && result.getResponse().getStatus() < 500);
        verifyNoInteractions(skills, chat);
    }

    @Test void deploymentContextIsExcludedBeforeCheckingTheApiBoundary() throws Exception {
        guarded.perform(post(URI.create("http://evil.example/eap/api/skills")).contextPath("/eap")
                .header("Host", "evil.example").header("Origin", "http://evil.example")
                .contentType(MediaType.TEXT_PLAIN).content("{}"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.detail").value("HOST_REJECTED"));
        guarded.perform(post("/eap/api/skills;x").contextPath("/eap")
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("PATH_REJECTED"));
        verifyNoInteractions(skills, chat);
        guarded.perform(post("/eap/api/skills").contextPath("/eap")
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isOk()).andExpect(handler().handlerType(SkillController.class));
        verify(skills).save(any());
    }

    @Test void ordinaryPathStillRejectsForeignHostBeforeCors() throws Exception {
        guarded.perform(post(URI.create("http://evil.example/api/skills"))
                .header("Host", "evil.example").header("Origin", "http://evil.example")
                .contentType(MediaType.TEXT_PLAIN).content("{}"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.detail").value("HOST_REJECTED"));
        verifyNoInteractions(skills, chat);
    }
}
