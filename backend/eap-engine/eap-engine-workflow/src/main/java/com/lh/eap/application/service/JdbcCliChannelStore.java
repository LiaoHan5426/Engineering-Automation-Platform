package com.lh.eap.application.service;
import com.lh.eap.error.CliProgramErrors;

import com.lh.eap.local.CliChannelStore;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** Full-product CLI bindings in the existing schema; no new registry or automatic initialization. */
@Service
public class JdbcCliChannelStore implements CliChannelStore {
    private final JdbcTemplate jdbc;
    public JdbcCliChannelStore(JdbcTemplate jdbc) { this.jdbc = Objects.requireNonNull(jdbc); }

    @Override public Map<String, String> overrides() {
        try {
            var rows = jdbc.queryForList("SELECT program_id,binary_path FROM eap.cli_channel ORDER BY program_id");
            if (rows == null) throw new IllegalStateException("Missing authoritative result");
            var values = new LinkedHashMap<String, String>();
            for (var row : rows) {
                var capability = Objects.toString(row.get("program_id"), "").trim();
                var binary = Objects.toString(row.get("binary_path"), "").trim();
                if (capability.isEmpty() || binary.isEmpty()) throw new IllegalStateException("Invalid channel binding");
                values.put(capability, binary);
            }
            return values;
        } catch (RuntimeException error) {
            // Never expose driver errors, connection details or a fallback binary.
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, CliProgramErrors.CLI_CHANNEL_STORE_UNAVAILABLE.code());
        }
    }

    @Override @Transactional
    public void configure(String program, String binary) {
        if (binary == null || binary.isBlank()) {
            jdbc.update("DELETE FROM eap.cli_channel WHERE program_id=?", program);
            return;
        }
        jdbc.update("INSERT INTO eap.cli_channel (program_id,binary_path,updated_at) VALUES (?,?,now()) "
                + "ON CONFLICT (program_id) DO UPDATE SET binary_path=EXCLUDED.binary_path, updated_at=now()",
                program, binary);
    }
}
