package com.lh.eap.core;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import com.lh.eap.domain.model.Mission;

public interface MissionStore {
    void insert(Mission mission);

    List<Mission> list();

    Optional<Mission> find(UUID id);

    Optional<Mission> findByHandoff(UUID handoffId);

    void updateExecution(UUID id, String execution);
}
