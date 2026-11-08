package com.lh.eap.ai;

import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

class TaskBindingContextTest {
    @Test void codeContextAcceptsExactTaskIdentityWithoutClientTaskText() {
        var id = UUID.randomUUID().toString();
        var context = TaskContext.parse(Map.of("mode", "code", "taskRef", Map.of("projectId", "project", "taskId", id, "revision", 2)));
        var json = JsonMapper.builder().build().valueToTree(context);
        assertEquals(id, json.path("taskRef").path("taskId").asString());
        assertEquals(2, json.path("taskRef").path("revision").asInt());
    }
    @Test void taskReferenceRejectsNullUnknownKeysNonIntegralRevisionAndNonCodeMode() {
        var valid = Map.<String,Object>of("projectId", "project", "taskId", UUID.randomUUID().toString(), "revision", 1);
        for (Object bad : Arrays.asList(null, Map.of(), Map.of("projectId", "project", "taskId", "1-1-1-1-1", "revision", 1),
                Map.of("projectId", "project", "taskId", UUID.randomUUID().toString(), "revision", 0),
                Map.of("projectId", "project", "taskId", UUID.randomUUID().toString(), "revision", 1.5),
                Map.of("projectId", "project", "taskId", UUID.randomUUID().toString(), "revision", 1, "goal", "forged"))) {
            var data = new HashMap<String,Object>(); data.put("mode", "code"); data.put("taskRef", bad);
            assertEquals("INVALID_TASK_CONTEXT", assertThrows(ResponseStatusException.class, () -> TaskContext.parse(data)).getReason());
        }
        assertThrows(ResponseStatusException.class, () -> TaskContext.parse(Map.of("taskRef", valid)));
    }
}
