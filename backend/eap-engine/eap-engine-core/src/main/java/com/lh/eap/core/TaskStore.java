package com.lh.eap.core;

import com.lh.eap.api.Observation;
import com.lh.eap.domain.model.TaskStatistics;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

public interface TaskStore {
    void save(UUID id, String goal, String status, String decision, String modelEnhancement, List<Observation> observations);

    boolean startAgent(UUID id, String goal);

    boolean finishAgent(UUID id, String status, String modelEnhancement, List<Observation> observations);

    List<Map<String, Object>> findAll();

    Optional<Map<String, Object>> findById(UUID id);

    TaskStatistics statistics(int windowDays);
}
