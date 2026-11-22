package com.lh.eap.persistence.jdbc;

import com.lh.eap.core.BoardPrototypeSelectionStore;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.json.JsonMapper;

@Repository
public class JdbcBoardPrototypeSelectionStore implements BoardPrototypeSelectionStore {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final JdbcTemplate jdbc;

    public JdbcBoardPrototypeSelectionStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void linkVersion(UUID taskId, String projectId, UUID versionId, List<String> events) {
        jdbc.update("UPDATE eap.board_task SET prototype_version_id=?,revision=revision+1,events=?::jsonb WHERE id=? AND project_id=?",
                versionId, JSON.writeValueAsString(events), taskId, projectId);
    }
}
