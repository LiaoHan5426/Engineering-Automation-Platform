package com.lh.eap.persistence.mapper;

import com.lh.eap.domain.model.CliOperation;
import com.lh.eap.domain.model.CliProgram;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.json.JsonMapper;

/** SQL access only; validation and reference protection live in the service. */
@Repository
public class CliProgramMapper {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final JdbcTemplate jdbc;

    public CliProgramMapper(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public List<CliProgram> programs() {
        return jdbc.query("SELECT id,name,binary_name,builtin FROM eap.cli_program ORDER BY id",
                (rs, row) -> new CliProgram(rs.getString("id"), rs.getString("name"), rs.getString("binary_name"), rs.getBoolean("builtin")));
    }

    public Optional<CliProgram> program(String id) {
        return jdbc.query("SELECT id,name,binary_name,builtin FROM eap.cli_program WHERE id=?",
                (rs, row) -> new CliProgram(rs.getString("id"), rs.getString("name"), rs.getString("binary_name"), rs.getBoolean("builtin")), id).stream().findFirst();
    }

    public List<CliOperation> operations() {
        return jdbc.query("SELECT capability_id,program_id,title,args::text,description,builtin FROM eap.cli_operation ORDER BY program_id,capability_id",
                (rs, row) -> new CliOperation(rs.getString("capability_id"), rs.getString("program_id"),
                        rs.getString("title"), List.of(JSON.readValue(rs.getString("args"), String[].class)),
                        rs.getString("description"), rs.getBoolean("builtin")));
    }

    public void insertProgram(CliProgram program) {
        jdbc.update("INSERT INTO eap.cli_program(id,name,binary_name,builtin) VALUES (?,?,?,false)", program.id(), program.name(), program.binary());
    }

    public void saveOperation(CliOperation operation, boolean create) {
        if (create) {
            jdbc.update("INSERT INTO eap.cli_operation(capability_id,program_id,title,args,description,builtin) VALUES (?,?,?,?::jsonb,?,false)",
                    operation.capabilityId(), operation.programId(), operation.title(), JSON.writeValueAsString(operation.args()), operation.description());
        } else {
            jdbc.update("UPDATE eap.cli_operation SET title=?,args=?::jsonb,description=?,updated_at=now() WHERE capability_id=? AND program_id=? AND NOT builtin",
                    operation.title(), JSON.writeValueAsString(operation.args()), operation.description(), operation.capabilityId(), operation.programId());
        }
    }

    public void lockProgram(String id) {
        jdbc.queryForList("SELECT id FROM eap.cli_program WHERE id=? FOR UPDATE", id);
    }

    public void lockExperts() {
        jdbc.queryForList("SELECT id FROM eap.expert_definition ORDER BY id FOR UPDATE");
    }

    public void deleteOperation(String capability) {
        jdbc.update("DELETE FROM eap.cli_operation WHERE capability_id=? AND NOT builtin", capability);
        jdbc.update("DELETE FROM eap.capability_setting WHERE capability=?", capability);
    }

    public void deleteProgram(String id) {
        jdbc.update("DELETE FROM eap.cli_channel WHERE capability=?", id);
        jdbc.update("DELETE FROM eap.cli_program WHERE id=? AND NOT builtin", id);
    }
}
