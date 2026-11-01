package com.lh.eap.ai;

import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class KnowledgeExpertContextTest {
    @Test void chatAcceptsOnlyAnExactExpertIdentityAndRevision() {
        var context = assertDoesNotThrow(() -> TaskContext.parse(Map.of("knowledgeExpertRef", Map.of("id", "expert-a", "revision", 2))));
        assertEquals("chat", context.mode());
        for (Object ref : Arrays.asList(null, "expert-a", Map.of("id", "expert-a"),
                Map.of("id", "expert-a", "revision", 0), Map.of("id", "expert-a", "revision", 1.0),
                Map.of("id", "expert-a", "revision", "1"), Map.of("id", " expert-a", "revision", 1),
                Map.of("id", "expert-a", "revision", 1, "excerpt", "forged"))) {
            var data = new HashMap<String,Object>(); data.put("knowledgeExpertRef", ref);
            assertThrows(ResponseStatusException.class, () -> TaskContext.parse(data));
        }
        assertThrows(ResponseStatusException.class, () -> TaskContext.parse(Map.of("mode", "code", "knowledgeExpertRef", Map.of("id", "expert-a", "revision", 1))));
    }
}
