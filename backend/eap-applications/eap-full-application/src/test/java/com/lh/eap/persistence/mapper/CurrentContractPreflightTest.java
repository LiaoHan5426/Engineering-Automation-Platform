package com.lh.eap.persistence.mapper;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.junit.jupiter.api.Assertions.*;

/** Read-only application-schema inventory. Does not migrate, repair, delete, or normalize records. */
@EnabledIfEnvironmentVariable(named="EAP_RUN_SINGLE_CONTRACTS",matches="true")
class CurrentContractPreflightTest {
    @Test void recordsActualDevelopmentSchemaReadinessWithoutChangingData() throws Exception {
        var jdbc=new JdbcTemplate(ToolUnknownReviewFixture.originalDataSource());
        var result=new LinkedHashMap<String,Object>();
        result.put("readOnly",true);
        result.put("schemaVersion",jdbc.queryForObject("SELECT version FROM eap.flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1",String.class));
        result.put("cliOperationOrUnregisteredKeys",jdbc.queryForObject("SELECT count(*) FROM eap.cli_channel c WHERE NOT EXISTS (SELECT 1 FROM eap.cli_program p WHERE p.id=c.capability)",Integer.class));
        int missing=0;for(var row:jdbc.queryForList("SELECT id,builtin,manifest::text AS manifest FROM eap.expert_definition")) {
            if(Boolean.TRUE.equals(row.get("builtin"))&&"sql-expert".equals(row.get("id")))continue;
            try {com.lh.eap.domain.model.ExpertManifest.parse((String)row.get("manifest"));}catch(RuntimeException invalid){missing++;}
        }
        result.put("authoredExpertsOutsideCurrentContract",missing);
        int invalid=0;for(var body:jdbc.queryForList("SELECT body FROM eap.prototype_version",String.class)) {
            try {com.lh.eap.application.service.SemanticPrototype.require(body);}catch(RuntimeException failure){invalid++;}
        }
        result.put("prototypesOutsideSemanticContract",invalid);
        result.put("migrationReady",missing==0&&invalid==0&&Integer.valueOf(0).equals(result.get("cliOperationOrUnregisteredKeys")));
        Path repo=Path.of("").toAbsolutePath();while(!Files.isDirectory(repo.resolve("frontend")))repo=repo.getParent();
        Files.writeString(repo.resolve("backend/target/current-contract-preflight.json"),ToolUnknownReviewFixture.JSON.writeValueAsString(result));
        assertTrue((Boolean)result.get("readOnly"));
    }
}
