package com.lh.eap.web;

import com.lh.eap.api.Observation;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.util.*;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

@Repository
public class TaskRepository {
    private final JdbcTemplate jdbc;
    private static final JsonMapper JSON=JsonMapper.builder().build();
    public TaskRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    @Transactional
    public void save(UUID id, String goal, String status, String decision, List<Observation> observations) {
        jdbc.update("INSERT INTO eap.task(id, goal, status, decision) VALUES (?, ?, ?, ?)", id, SensitiveData.redact(goal), status, decision);
        for (var item : observations) {
            jdbc.update("INSERT INTO eap.task_observation(task_id, capability, success, exit_code, stdout, stderr, metadata) VALUES (?, ?, ?, ?, ?, ?, ?::jsonb)", id, item.capability(), item.success(), item.exitCode(), SensitiveData.redact(item.stdout()), SensitiveData.redact(item.stderr()), JSON.writeValueAsString(item.metadata()));
        }
    }

    public List<Map<String, Object>> findAll() {
        return jdbc.query("SELECT id, goal, status, decision, created_at FROM eap.task ORDER BY created_at DESC LIMIT 100", (rs, row) -> Map.of("id", rs.getObject("id"), "goal", SensitiveData.redact(rs.getString("goal")), "status", rs.getString("status"), "decision", rs.getString("decision"), "createdAt", rs.getObject("created_at")));
    }

    public Optional<Map<String,Object>> findById(UUID id) {
        var rows=jdbc.queryForList("SELECT id,goal,status,decision,created_at AS \"createdAt\" FROM eap.task WHERE id=?",id);
        if(rows.isEmpty())return Optional.empty();
        var result=new LinkedHashMap<>(rows.getFirst());
        result.put("goal",SensitiveData.redact((String)result.get("goal")));
        result.put("observations",jdbc.query("SELECT capability,success,exit_code,stdout,stderr,metadata::text AS metadata FROM eap.task_observation WHERE task_id=? ORDER BY id",
                (rs,row)->Map.of("capability",rs.getString("capability"),"success",rs.getBoolean("success"),"exitCode",rs.getInt("exit_code"),"stdout",SensitiveData.redact(rs.getString("stdout")),"stderr",SensitiveData.redact(rs.getString("stderr")),"metadata",JSON.readValue(rs.getString("metadata"),Map.class)),id));
        return Optional.of(result);
    }
}
