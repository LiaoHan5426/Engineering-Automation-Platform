package com.lh.eap.persistence.mapper;

import com.lh.eap.web.controller.RuntimeController;
import com.lh.eap.domain.model.TaskStatistics;
import com.lh.eap.common.SensitiveData;

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

    /**
     * Persist one execution together with the route it took.
     *
     * <p>{@code modelEnhancement} is the same vocabulary the execution response reports, so the console
     * can compute how often a model call was actually spent. A caller with no judgment stage (the
     * planner tasks in {@link RuntimeController}) passes {@code null} rather than a value that would
     * look like a skipped model call.
     */
    @Transactional
    public void save(UUID id, String goal, String status, String decision, String modelEnhancement, List<Observation> observations) {
        jdbc.update("INSERT INTO eap.task(id, goal, status, decision, model_enhancement) VALUES (?, ?, ?, ?, ?)", id, SensitiveData.redact(goal), status, decision, modelEnhancement);
        for (var item : observations) {
            jdbc.update("INSERT INTO eap.task_observation(task_id, capability, success, exit_code, stdout, stderr, metadata) VALUES (?, ?, ?, ?, ?, ?, ?::jsonb)", id, item.capability(), item.success(), item.exitCode(), SensitiveData.redact(item.stdout()), SensitiveData.redact(item.stderr()), JSON.writeValueAsString(item.metadata()));
        }
    }

    public List<Map<String, Object>> findAll() {
        return jdbc.query("SELECT id, goal, status, decision, model_enhancement, created_at FROM eap.task ORDER BY created_at DESC LIMIT 100", (rs, row) -> Map.of("id", rs.getObject("id"), "goal", SensitiveData.redact(rs.getString("goal")), "status", rs.getString("status"), "decision", rs.getString("decision"), "modelEnhancement", rs.getString("model_enhancement") == null ? "" : rs.getString("model_enhancement"), "createdAt", rs.getObject("created_at")));
    }

    public Optional<Map<String,Object>> findById(UUID id) {
        var rows=jdbc.queryForList("SELECT id,goal,status,decision,model_enhancement AS \"modelEnhancement\",created_at AS \"createdAt\" FROM eap.task WHERE id=?",id);
        if(rows.isEmpty())return Optional.empty();
        var result=new LinkedHashMap<>(rows.getFirst());
        if(result.get("modelEnhancement")==null)result.put("modelEnhancement","");
        result.put("goal",SensitiveData.redact((String)result.get("goal")));
        result.put("observations",jdbc.query("SELECT capability,success,exit_code,stdout,stderr,metadata::text AS metadata FROM eap.task_observation WHERE task_id=? ORDER BY id",
                (rs,row)->Map.of("capability",rs.getString("capability"),"success",rs.getBoolean("success"),"exitCode",rs.getInt("exit_code"),"stdout",SensitiveData.redact(rs.getString("stdout")),"stderr",SensitiveData.redact(rs.getString("stderr")),"metadata",JSON.readValue(rs.getString("metadata"),Map.class)),id));
        return Optional.of(result);
    }

    /**
     * Counts for the overview, computed in the database rather than sampled in the browser.
     *
     * <p>Everything is windowed by the same {@code windowDays} so the cards on one screen describe one
     * period; {@code tasksTotal} is the only all-time figure, and it is labeled as such.
     */
    public TaskStatistics statistics(int windowDays) {
        int days = Math.max(1, Math.min(windowDays, 365));
        var totals = jdbc.queryForMap("""
                SELECT count(*) AS total,
                       count(*) FILTER (WHERE created_at >= now() - make_interval(days => ?)) AS in_window,
                       count(*) FILTER (WHERE created_at >= now() - make_interval(days => ?) AND model_enhancement IS NOT NULL) AS recorded,
                       count(*) FILTER (WHERE created_at >= now() - make_interval(days => ?) AND model_enhancement = 'unverified-observation') AS model_calls
                FROM eap.task
                """, days, days, days);
        var observations = jdbc.queryForObject(
                "SELECT count(*) FROM eap.task_observation o JOIN eap.task t ON t.id = o.task_id WHERE t.created_at >= now() - make_interval(days => ?)",
                Long.class, days);
        return new TaskStatistics(days, asLong(totals.get("total")), asLong(totals.get("in_window")),
                observations == null ? 0L : observations, asLong(totals.get("recorded")),
                asLong(totals.get("model_calls")), windowedCounts("status", days), windowedCounts("decision", days));
    }

    /**
     * Windowed counts grouped by one task column.
     *
     * <p>{@code column} is only ever a literal from this class ({@code status} / {@code decision}) — it is
     * an identifier, so it cannot be bound, and it must never come from a request.
     */
    private Map<String, Long> windowedCounts(String column, int days) {
        var counts = new TreeMap<String, Long>();
        for (var row : jdbc.queryForList("SELECT " + column + " AS key, count(*) AS total FROM eap.task WHERE created_at >= now() - make_interval(days => ?) GROUP BY " + column + " ORDER BY " + column, days)) {
            counts.put(String.valueOf(row.get("key")), asLong(row.get("total")));
        }
        return counts;
    }

    private static long asLong(Object value) {
        return value instanceof Number number ? number.longValue() : 0L;
    }
}
