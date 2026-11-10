package com.lh.eap.persistence.mapper;

import java.nio.file.*;
import org.flywaydb.core.Flyway;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;

/** Executes the actual Flyway scripts in a fresh UUID-owned schema, never the application schema. */
final class CurrentContractTestSchema {
    static void migrate(Path session,String schema) throws Exception {
        migrate(session,schema,"35");
    }
    static void migrate(Path session,String schema,String target) throws Exception {
        if(!schema.matches("eap_unknown_qa_[a-f0-9]{32}"))throw new IllegalArgumentException("Unowned schema");
        var directory=session.resolve("migrations");Files.createDirectories(directory);
        for(var resource:new PathMatchingResourcePatternResolver().getResources("classpath:db/migration/V*.sql")) {
            String sql=new String(resource.getInputStream().readAllBytes(),java.nio.charset.StandardCharsets.UTF_8)
                    .replace("eap.",schema+".").replace("CREATE SCHEMA IF NOT EXISTS eap;","CREATE SCHEMA IF NOT EXISTS "+schema+";");
            Files.writeString(directory.resolve(resource.getFilename()),sql);
        }
        Flyway.configure().dataSource(ToolUnknownReviewFixture.originalDataSource()).schemas(schema).defaultSchema(schema)
                .locations("filesystem:"+directory.toAbsolutePath().toString().replace('\\','/'))
                .target(target).cleanDisabled(true).load().migrate();
    }
}
