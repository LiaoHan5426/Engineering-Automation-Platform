package com.lh.eap.persistence.mapper;

import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.json.JsonMapper;

/** Evaluate the actual migrated PostgreSQL check, including attribution and complete set limits. */
@EnabledIfEnvironmentVariable(named="EAP_RUN_SINGLE_CONTRACTS",matches="true")
class ComponentDeliveryConstraintTest {
 @Test void replacesRootOnlyConstraintWithoutRelaxingTaskIdentityOrFileLimits()throws Exception {
  String schema="eap_unknown_qa_"+UUID.randomUUID().toString().replace("-","");
  var directory=Files.createTempDirectory(Path.of("target"),"component-delivery-");
  var admin=new JdbcTemplate(ToolUnknownReviewFixture.originalDataSource());
  try {
   CurrentContractTestSchema.migrate(directory,schema,"33");
   var jdbc=new JdbcTemplate(ToolUnknownReviewFixture.scopedDataSource(schema));
   UUID task=UUID.randomUUID();String hash="a".repeat(64);
   var evidence=new LinkedHashMap<String,Object>();
   evidence.put("association","PREBOUND");evidence.put("conversationId",UUID.randomUUID());evidence.put("proposalId",UUID.randomUUID());evidence.put("generationId",UUID.randomUUID());
   evidence.put("targetPath","frontend/Page.vue");evidence.put("generationBaseHash",hash);evidence.put("appliedAfterHash",hash);evidence.put("generationCapturedAt","2026-11-10T01:00:00Z");
   evidence.put("prototypeVersionId",null);evidence.put("prototypeContentHash",null);evidence.put("associatedAt","2026-11-10T02:00:00Z");evidence.put("operator","local-operator");
   evidence.put("taskBinding",Map.of("projectId","graph","taskId",task,"revision",2));
   var delivery=new LinkedHashMap<String,Object>();
   for(String field:List.of("id","requestId","verificationId"))delivery.put(field,UUID.randomUUID());
   delivery.put("source","CHAT_APPLIED_PREBOUND");delivery.put("taskRevision",2);delivery.put("submittedRevision",3);delivery.put("workspacePath","workspace");delivery.put("baseCommit",hash);
   delivery.put("sourceHash",hash);delivery.put("prototypeVersionId",null);delivery.put("goal","Goal");delivery.put("acceptanceCriteria","Files checked");delivery.put("note","Technical evidence");
   delivery.put("createdAt","2026-11-10T02:00:00Z");delivery.put("decision",null);delivery.put("applicationEvidence",evidence);
   var files=List.of(Map.of("path","frontend/Page.vue","afterHash",hash),Map.of("path","frontend/Part.vue","afterHash",hash),Map.of("path","frontend/model.ts","afterHash",hash));delivery.put("files",files);
   assertFalse(check(jdbc,schema,task,delivery));
   delivery.put("files",List.of(files.getFirst()));assertTrue(check(jdbc,schema,task,delivery));
   CurrentContractTestSchema.migrate(directory,schema,"34");
   delivery.put("files",files);assertTrue(check(jdbc,schema,task,delivery));
   evidence.put("taskBinding",Map.of("projectId","graph","taskId",UUID.randomUUID(),"revision",2));assertFalse(check(jdbc,schema,task,delivery));
   evidence.put("taskBinding",Map.of("projectId","graph","taskId",task,"revision",2));
   delivery.put("files",Collections.nCopies(9,files.getFirst()));assertFalse(check(jdbc,schema,task,delivery));
  }finally {assertTrue(schema.matches("eap_unknown_qa_[a-f0-9]{32}"));admin.execute("DROP SCHEMA IF EXISTS "+schema+" CASCADE");}
 }
 private static boolean check(JdbcTemplate jdbc,String schema,UUID task,Map<String,Object> delivery)throws Exception {
  String expression=jdbc.queryForObject("SELECT pg_get_expr(conbin,conrelid) FROM pg_constraint WHERE conname='board_delivery_shape' AND connamespace=?::regnamespace",String.class,schema);
  expression=expression.replace("?","??"); // PostgreSQL JSON operators are not JDBC bind markers.
  return Boolean.TRUE.equals(jdbc.queryForObject("SELECT "+expression+" FROM (SELECT ?::jsonb AS delivery_snapshot,?::text AS delivery_request_hash,NULL::text AS delivery_decision_hash,?::uuid AS task_id,2::bigint AS task_revision) source",Boolean.class,JsonMapper.builder().build().writeValueAsString(delivery),"a".repeat(64),task));
 }
}
