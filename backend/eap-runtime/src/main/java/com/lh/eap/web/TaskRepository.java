package com.lh.eap.web;

import com.lh.eap.api.Observation;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.util.*;

@Repository
public class TaskRepository {
    private final JdbcTemplate jdbc;
    public TaskRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public void save(UUID id, String goal, String status, String decision, List<Observation> observations) {
        jdbc.update("INSERT INTO task(id, goal, status, decision) VALUES (?, ?, ?, ?)", id, goal, status, decision);
        for (var item : observations) {
            jdbc.update("INSERT INTO task_observation(task_id, capability, success, exit_code, stdout, stderr, metadata) VALUES (?, ?, ?, ?, ?, ?, ?::jsonb)", id, item.capability(), item.success(), item.exitCode(), item.stdout(), item.stderr(), jsonWrite(item.metadata()));
        }
    }

    public List<Map<String, Object>> findAll() {
        return jdbc.query("SELECT id, goal, status, decision, created_at FROM task ORDER BY created_at DESC", (rs, row) -> Map.of("id", rs.getObject("id"), "goal", rs.getString("goal"), "status", rs.getString("status"), "decision", rs.getString("decision"), "createdAt", rs.getObject("created_at")));
    }

    private static String jsonWrite(Map<String, Object> value) {
        return value.entrySet().stream().map(entry -> "\"" + escape(entry.getKey()) + "\":\"" + escape(String.valueOf(entry.getValue())) + "\"").collect(java.util.stream.Collectors.joining(",", "{", "}"));
    }

    private static String escape(String value) { return value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r"); }
}
