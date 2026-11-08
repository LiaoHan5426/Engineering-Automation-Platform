package com.lh.eap.application.service;

import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class MissionService {
    static final String HANDOFF_UNIQUE = "mission_handoff_id_key";
    private final HandoffStore handoffs;
    private final MissionStore missions;

    public MissionService(HandoffStore handoffs, MissionStore missions) {
        this.handoffs = handoffs;
        this.missions = missions;
    }

    public Mission create(UUID handoffId) {
        try {
            var handoff = handoffs.find(handoffId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "交接不存在"));
            var created = shell(handoff);
            try {
                missions.insert(created);
                return created;
            } catch (DuplicateKeyException conflict) {
                if (!handoffConflict(conflict)) {
                    throw conflict;
                }
                return missions.findByHandoff(handoffId).orElseThrow(() -> conflict);
            }
        } catch (ResponseStatusException expected) {
            throw expected;
        } catch (DataAccessException failure) {
            if ("23503".equals(sqlState(failure))) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "交接不存在");
            }
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "数据服务暂不可用，请检查数据库、迁移和后端日志");
        }
    }

    public List<Mission> list() {
        return missions.list();
    }

    public Mission detail(UUID id) {
        return missions.find(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "任务壳不存在"));
    }

    private static Mission shell(Handoff handoff) {
        return new Mission(
                UUID.randomUUID(),
                handoff.id(),
                handoff.source(),
                handoff.sourceRef(),
                handoff.summary(),
                "created",
                "not_started",
                "not_requested",
                "none",
                "not_requested",
                Instant.now());
    }

    static boolean handoffConflict(DataAccessException conflict) {
        var specific = conflict.getMostSpecificCause();
        if (specific instanceof SQLException sql && sql.getMessage() != null && sql.getMessage().contains(HANDOFF_UNIQUE)) {
            return true;
        }
        var text = conflict.getMessage();
        return text != null && text.contains(HANDOFF_UNIQUE);
    }

    private static String sqlState(DataAccessException failure) {
        var cause = failure.getMostSpecificCause();
        return cause instanceof SQLException sql ? sql.getSQLState() : "";
    }
}
