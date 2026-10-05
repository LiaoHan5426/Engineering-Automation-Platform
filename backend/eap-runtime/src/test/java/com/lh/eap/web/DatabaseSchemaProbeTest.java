package com.lh.eap.web;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.ClassPathResource;
import java.sql.DriverManager;
import static org.junit.jupiter.api.Assertions.fail;

@EnabledIfEnvironmentVariable(named="EAP_CHECK_SCHEMA",matches="true")
class DatabaseSchemaProbeTest {
    @Test void inspectExistingMigrationStateWithoutChangingData() throws Exception {
        var env=new StandardEnvironment();
        for(var source:new YamlPropertySourceLoader().load("application",new ClassPathResource("application.yml")))env.getPropertySources().addLast(source);
        try(var connection=DriverManager.getConnection(env.getProperty("spring.datasource.url"),env.getProperty("spring.datasource.username"),env.getProperty("spring.datasource.password"))){
            connection.setReadOnly(true);
            try(var statement=connection.createStatement();var rows=statement.executeQuery("SELECT table_name FROM information_schema.tables WHERE table_schema='eap' ORDER BY table_name")){
                while(rows.next())System.out.println("[schema-probe] table="+rows.getString(1));
            }
            try(var statement=connection.createStatement();var rows=statement.executeQuery("SELECT column_name,is_nullable FROM information_schema.columns WHERE table_schema='eap' AND table_name='knowledge_chunk' ORDER BY ordinal_position")){
                while(rows.next())System.out.println("[schema-probe] knowledge_chunk."+rows.getString(1)+" nullable="+rows.getString(2));
            }
        }catch(java.sql.SQLException error){fail("只读数据库检查失败："+error.getClass().getSimpleName()+" SQLState="+error.getSQLState());}
    }
}
