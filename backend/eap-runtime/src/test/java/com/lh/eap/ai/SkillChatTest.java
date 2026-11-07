package com.lh.eap.ai;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.lh.eap.skill.*;
import java.nio.file.Path;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

class SkillChatTest {
    @TempDir Path root;
    static final SkillRef REF = new SkillRef("review", "1.0.0", "a".repeat(64), 2);
    static final String SEND = "{\"message\":\"ordinary\",\"toolMode\":\"none\",\"context\":{\"skillRef\":{\"id\":\"review\",\"version\":\"1.0.0\",\"digest\":\"" + "a".repeat(64) + "\",\"stateRevision\":2},\"skillResourcePaths\":[\"guide.md\"]}}";
    static final SkillService.Context MATERIAL = new SkillService.Context(REF, "skill-private-guidance", List.of(new SkillTextParser.Resource("guide.md", "text/markdown", "resource-private")), List.of(new SkillService.Dependency("missing", "unknown")));
    AiChatApplicationTest helper() { var h = new AiChatApplicationTest(); h.root = root; return h; }
    @Test void duplicateJsonReferenceFieldsAreRejectedBeforeAnyModel() {
        var h = helper(); var app = h.app(p -> fail("must not call model"),true,root,null);
        var skills = mock(SkillService.class); when(skills.resolve(REF,List.of("guide.md"))).thenReturn(MATERIAL);
        ReflectionTestUtils.setField(app,"skills",skills);
        var id=app.open("{}").conversationId();
        assertEquals("INVALID_CHAT_REQUEST",assertThrows(ResponseStatusException.class,
                ()->app.send(id,SEND.replace("\"stateRevision\":2","\"stateRevision\":1,\"stateRevision\":2"))).getReason());
        verifyNoInteractions(skills);
    }
    @Test void acceptsExactSkillReferenceAsTaskMaterialRatherThanSystemGuidance() throws Exception {
        assertDoesNotThrow(() -> TaskContext.parse(Map.of("skillRef", Map.of("id","review","version","1.0.0","digest","a".repeat(64),"stateRevision",2))));
        var h = helper(); var prompts = new ArrayList<org.springframework.ai.chat.prompt.Prompt>();
        var app = h.app(p -> { prompts.add(p); return FakeChatModels.text("derived-private"); }, true, root, null);
        var skills = mock(SkillService.class); when(skills.resolve(REF,List.of("guide.md"))).thenReturn(MATERIAL);
        ReflectionTestUtils.setField(app,"skills",skills);
        var id = app.open("{}").conversationId();
        app.send(id, ExpertKnowledgeChatTest.PLAIN); // Seed ordinary memory before first skill.
        var registry = (AiConversationRegistry)ReflectionTestUtils.getField(app,"conversations");
        var memory = (org.springframework.ai.chat.memory.ChatMemory)ReflectionTestUtils.getField(registry,"memory");
        memory.add(EngineeringChatService.memoryKey(AiConversationRegistry.PRINCIPAL,id),new org.springframework.ai.chat.messages.UserMessage("previous-private"));
        var sent = app.send(id, SEND);
        assertEquals("skill-private-guidance", sent.skillContext().instructions());
        assertTrue(sent.contextMemoryCleared());
        assertTrue(prompts.getLast().getUserMessage().getText().contains("resource-private"));
        assertFalse(prompts.getLast().getSystemMessage().getText().contains("skill-private"));
        assertFalse(prompts.getLast().toString().contains("previous-private"));
        app.send(id,ExpertKnowledgeChatTest.PLAIN);
        assertFalse(prompts.getLast().toString().contains("skill-private"));
        assertFalse(prompts.getLast().toString().contains("derived-private"));
        assertFalse(prompts.getLast().toString().contains("resource-private"));
    }
    @Test void rejectsMalformedOrMixedModesWithoutModelOrToolsAndClearsStickyMemory() throws Exception {
        var h = helper(); var calls = new java.util.concurrent.atomic.AtomicInteger(); var tools = new java.util.concurrent.atomic.AtomicInteger();
        var app = h.app(p -> { calls.incrementAndGet(); return FakeChatModels.text("derived-private"); },true,root,tools);
        var skills = mock(SkillService.class); when(skills.resolve(REF,List.of("guide.md"))).thenReturn(MATERIAL);
        ReflectionTestUtils.setField(app,"skills",skills);
        assertTrue(app.status().tools().get("git_status"));
        var id = app.open("{}").conversationId(); app.send(id,SEND);
        var invalid = new LinkedHashMap<String,String>();
        invalid.put("{", "INVALID_CHAT_REQUEST");
        invalid.put(SEND.replace("\"none\"","\"git_status\""), "SKILL_CONTEXT_MODE_UNSUPPORTED");
        invalid.put(SEND.replace("\"skillRef\"", "\"mode\":\"code\",\"skillRef\""), "SKILL_CONTEXT_MODE_UNSUPPORTED");
        invalid.put(SEND.replace("\"skillRef\"", "\"knowledgeExpertRef\":{\"id\":\"expert\",\"revision\":1},\"skillRef\""), "SKILL_CONTEXT_MODE_UNSUPPORTED");
        invalid.put(SEND.replace("\"skillRef\"", "\"taskRef\":{},\"skillRef\""), "SKILL_CONTEXT_MODE_UNSUPPORTED");
        invalid.put(SEND.replace("\"stateRevision\":2", "\"stateRevision\":2,\"instructions\":\"forged\""), "INVALID_SKILL_REF");
        invalid.put(SEND.replace("\"ordinary\"", "\" \""), "INVALID_CHAT_REQUEST");
        invalid.put("{\"message\":\"x\",\"toolMode\":\"none\",\"context\":{\"skillRef\":null}}", "INVALID_SKILL_REF");
        for (var entry : invalid.entrySet()) {
            h.mvc(app).perform(post("/api/ai/conversations/"+id+"/messages").contentType(MediaType.APPLICATION_JSON).content(entry.getKey()))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value(entry.getValue()))
                    .andExpect(jsonPath("$.contextMemoryCleared").value(true));
        }
        assertEquals(1,calls.get()); assertEquals(0,tools.get()); verify(skills,times(1)).resolve(any(),any());
    }
}
