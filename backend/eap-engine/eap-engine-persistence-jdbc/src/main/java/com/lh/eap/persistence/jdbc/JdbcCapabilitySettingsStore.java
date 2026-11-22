package com.lh.eap.persistence.jdbc;

import com.lh.eap.core.CapabilitySettingsStore;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** SQL only: absence defaulting, note limits and in-use refusals live in the owning service. */
@Repository
public class JdbcCapabilitySettingsStore implements CapabilitySettingsStore {
    private final JdbcTemplate jdbc;

    public JdbcCapabilitySettingsStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public List<Row> loadAll() {
        return jdbc.query("SELECT capability,enabled,notes,updated_at FROM eap.capability_setting",
                (rs, row) -> new Row(rs.getString("capability"), rs.getObject("enabled", Boolean.class),
                        rs.getString("notes"), rs.getString("updated_at")));
    }

    @Override
    public void save(String capability, boolean enabled, String notes) {
        jdbc.update("INSERT INTO eap.capability_setting (capability,enabled,notes,updated_at) VALUES (?,?,?,now()) "
                        + "ON CONFLICT (capability) DO UPDATE SET enabled=EXCLUDED.enabled, notes=EXCLUDED.notes, updated_at=now()",
                capability, enabled, notes);
    }
}
