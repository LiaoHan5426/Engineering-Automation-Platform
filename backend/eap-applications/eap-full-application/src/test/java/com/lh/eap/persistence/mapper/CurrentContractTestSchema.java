package com.lh.eap.persistence.mapper;

import java.nio.file.*;
import org.flywaydb.core.Flyway;
import org.springframework.core.io.ClassPathResource;

/** Executes the current baseline in a fresh UUID-owned schema, never the application schema. */
final class CurrentContractTestSchema {
    static void migrate(Path session,String schema) throws Exception {
        migrate(session,schema,ToolUnknownReviewFixture.originalDataSource());
    }
    static void migrate(Path session,String schema,javax.sql.DataSource source) throws Exception {
        if(!schema.matches("eap_unknown_qa_[a-f0-9]{32}"))throw new IllegalArgumentException("Unowned schema");
        var directory=session.resolve("migrations");Files.createDirectories(directory);
        var resource=new ClassPathResource("db/migration/V1__initial_schema.sql");
        String sql=resource.getContentAsString(java.nio.charset.StandardCharsets.UTF_8)
                .replace("eap.",schema+".").replace("CREATE SCHEMA IF NOT EXISTS eap;","CREATE SCHEMA IF NOT EXISTS "+schema+";");
        Files.writeString(directory.resolve("V1__initial_schema.sql"),sql);
        Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema)
                .locations("filesystem:"+directory.toAbsolutePath().toString().replace('\\','/'))
                .cleanDisabled(true).load().migrate();
    }
}
