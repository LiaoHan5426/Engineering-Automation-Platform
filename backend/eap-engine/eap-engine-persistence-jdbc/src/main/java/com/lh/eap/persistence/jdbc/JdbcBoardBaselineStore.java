package com.lh.eap.persistence.jdbc;

import com.lh.eap.core.BoardBaselineStore;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcBoardBaselineStore implements BoardBaselineStore {
    private final JdbcTemplate jdbc;

    public JdbcBoardBaselineStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Optional<BaselineRow> findApplicationBaseline(String principal, UUID conversation, UUID proposal, String workspace) {
        var rows = jdbc.query(
                "SELECT application_baseline FROM eap.code_proposal WHERE principal=? AND conversation_id=? AND id=? AND workspace=?",
                (rs, index) -> new BaselineRow(rs.getString(1)), principal, conversation, proposal, workspace);
        return rows.stream().findFirst();
    }
}
