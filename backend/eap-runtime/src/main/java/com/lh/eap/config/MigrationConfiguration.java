package com.lh.eap.config;

import java.util.*;
import javax.sql.DataSource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.flyway.autoconfigure.FlywayMigrationStrategy;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.flywaydb.core.Flyway;

@Configuration
public class MigrationConfiguration {
    @Bean
    FlywayMigrationStrategy verifiedLegacyMigration(DataSource dataSource,
            @Value("${EAP_ADOPT_EXISTING_SCHEMA:false}") boolean adoptExisting) {
        return flyway -> {
            var jdbc=new JdbcTemplate(dataSource);
            var history=jdbc.queryForObject("SELECT to_regclass('eap.flyway_schema_history')::text",String.class);
            var count=jdbc.queryForObject("SELECT count(*) FROM information_schema.tables WHERE table_schema='eap' AND table_type='BASE TABLE'",Integer.class);
            if(history==null&&count!=null&&count>0) {
                if(!adoptExisting)throw new IllegalStateException("eap 已有手工建表，但无 Flyway 历史。请核对结构后以 EAP_ADOPT_EXISTING_SCHEMA=true 启动一次；不会清库或修改旧迁移校验和。");
                var expected=Map.of(
                    "task",Set.of("id","goal","status","decision","created_at"),
                    "task_observation",Set.of("id","task_id","capability","success","exit_code","stdout","stderr","metadata"),
                    "expert_definition",Set.of("id","name","manifest","enabled","revision","updated_at"),
                    "knowledge_base",Set.of("id","name","description","visibility","created_at"),
                    "knowledge_document",Set.of("id","knowledge_base_id","object_key","content_sha256","media_type","created_at"),
                    "knowledge_chunk",Set.of("id","document_id","chunk_index","content","embedding_model","embedding_version","created_at")
                );
                for(var entry:expected.entrySet()){
                    var columns=new HashSet<>(jdbc.queryForList("SELECT column_name FROM information_schema.columns WHERE table_schema='eap' AND table_name=?",String.class,entry.getKey()));
                    if(!columns.containsAll(entry.getValue()))throw new IllegalStateException("无法接管旧库："+entry.getKey()+" 缺少预期列，请手动核对，未建立基线。");
                }
                var incompatible=jdbc.queryForObject("SELECT count(*) FROM information_schema.columns WHERE table_schema='eap' AND table_name='knowledge_chunk' AND column_name='embedding' AND is_nullable='NO'",Integer.class);
                if(incompatible!=null&&incompatible>0)throw new IllegalStateException("旧库 embedding 仍为 NOT NULL，请先完成 V5，未建立基线。");
                // This is explicit adoption after a schema check, never automatic repair or clean.
                Flyway.configure().configuration(flyway.getConfiguration()).baselineVersion("5").baselineDescription("Explicitly adopted and verified legacy schema").load().baseline();
            }
            flyway.migrate();
        };
    }
}
