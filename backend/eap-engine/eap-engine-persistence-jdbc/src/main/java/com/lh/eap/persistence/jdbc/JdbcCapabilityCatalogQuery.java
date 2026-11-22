package com.lh.eap.persistence.jdbc;

import com.lh.eap.core.CapabilityCatalogQuery;
import com.lh.eap.domain.model.CliOperation;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.json.JsonMapper;

/** SQL only: catalog-side view of declared CLI operations. */
@Repository
public class JdbcCapabilityCatalogQuery implements CapabilityCatalogQuery {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final JdbcTemplate jdbc;

    public JdbcCapabilityCatalogQuery(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public List<CliOperation> operations() {
        return jdbc.query("SELECT capability_id,program_id,title,args::text,description,builtin "
                        + "FROM eap.cli_operation ORDER BY program_id,capability_id",
                (rs, row) -> new CliOperation(rs.getString("capability_id"), rs.getString("program_id"),
                        rs.getString("title"), List.of(JSON.readValue(rs.getString("args"), String[].class)),
                        rs.getString("description"), rs.getBoolean("builtin")));
    }
}
