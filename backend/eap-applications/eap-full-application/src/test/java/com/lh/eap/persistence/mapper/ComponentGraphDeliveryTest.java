package com.lh.eap.persistence.mapper;
import static org.junit.jupiter.api.Assertions.*;
import com.lh.eap.application.service.*;
import com.lh.eap.delivery.*;
import com.lh.eap.config.RuntimeWorkspace;
import com.lh.eap.api.TaskRef;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;
@EnabledIfEnvironmentVariable(named="EAP_RUN_SINGLE_CONTRACTS",matches="true")
class ComponentGraphDeliveryTest {
 @Test void exactComponentSetCapturesBeforeModelAndAppliesAllFilesWithBaselineAndGraphGuards()throws Exception {
  var directory=Files.createTempDirectory(Path.of("target"),"component-graph-");String schema="eap_unknown_qa_"+UUID.randomUUID().toString().replace("-","");
  var admin=new JdbcTemplate(ToolUnknownReviewFixture.originalDataSource());
  try {
   CurrentContractTestSchema.migrate(directory,schema);var ds=ToolUnknownReviewFixture.scopedDataSource(schema);var jdbc=new JdbcTemplate(ds);var manager=new DataSourceTransactionManager(ds);
   var root=Files.createDirectory(directory.resolve("workspace")).toRealPath();Files.createDirectory(root.resolve("frontend"));
   String entry="frontend/Page.vue",child="frontend/Summary.vue";Files.writeString(root.resolve(entry),"<template><p>Before</p></template>\n");Files.writeString(root.resolve(child),"<template><span>Before child</span></template>\n");
   var task=new BoardTaskService(jdbc).create(new BoardTaskService.Draft("graph","Graph task","","ready","Complete page","Both files checked",UUID.randomUUID()));var ref=new TaskRef(task.projectId(),task.id(),task.revision());
   var changes=new CodeChangeService(new RuntimeWorkspace(root,root.toString()),null,ignored->"",new JdbcCodeGenerationStore(jdbc,manager),new JdbcCodeProposalStore(jdbc,manager));UUID conversation=UUID.randomUUID();
   var snapshot=changes.prepareGeneration(RuntimeWorkspace.OPERATOR_LABEL,conversation,entry,"","",ref,List.of(child));
   assertEquals(2,snapshot.sources().size());assertEquals(1,snapshot.reference().companionFiles().size());
   assertEquals("34",jdbc.queryForObject("SELECT version FROM eap.flyway_schema_history ORDER BY installed_rank DESC LIMIT 1",String.class));
   String page="<script setup>\nimport Summary from './Summary.vue'\n</script><template><Summary /></template>\n",component="<template><span>After child</span></template>\n";
   var json=JsonMapper.builder().build();String answer=json.writeValueAsString(Map.of("files",List.of(Map.of("path",entry,"content",page),Map.of("path",child,"content",component))));
   assertEquals("CODE_GENERATION_SCOPE_MISMATCH",assertThrows(ResponseStatusException.class,()->changes.proposePrepared(RuntimeWorkspace.OPERATOR_LABEL,conversation,snapshot.id(),json.writeValueAsString(Map.of("files",List.of(Map.of("path",entry,"content",page)))),true)).getReason());
   assertEquals("CODE_GRAPH_DISCONNECTED",assertThrows(ResponseStatusException.class,()->changes.proposePrepared(RuntimeWorkspace.OPERATOR_LABEL,conversation,snapshot.id(),answer.replace("import Summary from './Summary.vue'","const Summary = null"),true)).getReason());
   assertEquals("CODE_GRAPH_UNDECLARED_IMPORT",assertThrows(ResponseStatusException.class,()->changes.proposePrepared(RuntimeWorkspace.OPERATOR_LABEL,conversation,snapshot.id(),answer.replace("./Summary.vue","./Undeclared.vue"),true)).getReason());
   var proposal=changes.proposePrepared(RuntimeWorkspace.OPERATOR_LABEL,conversation,snapshot.id(),answer,true);
   Files.writeString(root.resolve(child),"external edit");
   assertEquals("FILE_CHANGED_SINCE_PROPOSAL",assertThrows(ResponseStatusException.class,()->changes.apply(RuntimeWorkspace.OPERATOR_LABEL,conversation,proposal.id(),true)).getReason());
   assertTrue(Files.readString(root.resolve(entry)).contains("Before"));assertEquals("FAILED",changes.proposal(RuntimeWorkspace.OPERATOR_LABEL,conversation,proposal.id()).status());
   Files.writeString(root.resolve(child),snapshot.companionSources().getFirst().content());
   var fresh=changes.prepareGeneration(RuntimeWorkspace.OPERATOR_LABEL,conversation,entry,"","",ref,List.of(child));
   var accepted=changes.proposePrepared(RuntimeWorkspace.OPERATOR_LABEL,conversation,fresh.id(),answer,true);
   var result=changes.apply(RuntimeWorkspace.OPERATOR_LABEL,conversation,accepted.id(),true);assertEquals(List.of(entry,child),result.written());
   assertEquals(page,Files.readString(root.resolve(entry)));assertEquals(component,Files.readString(root.resolve(child)));
   assertEquals(result,changes.apply(RuntimeWorkspace.OPERATOR_LABEL,conversation,accepted.id(),true));
   var recovered=new BoardCodeProposalService(new BoardTaskService(jdbc),jdbc,new RuntimeWorkspace(root,root.toString()),changes);
   assertEquals(2,recovered.get(task.id(),accepted.id(),task.projectId()).proposal().files().size());
   assertTrue(recovered.list(task.id(),task.projectId()).items().stream().anyMatch(item->item.id().equals(accepted.id())&&item.fileCount()==2));
   // A database result interruption after all filesystem replacements must retain UNKNOWN,
   // leave the actual bytes for human inspection and block another graph application.
   var failing=new JdbcCodeProposalStore(jdbc,manager) {
    @Override public void finish(String principal,UUID chat,UUID id,String status,CodeChangeService.Applied value,String reason) {
     if(status.equals("APPLIED"))throw new IllegalStateException("controlled result write interruption");
     super.finish(principal,chat,id,status,value,reason);
    }
   };
   var interrupted=new CodeChangeService(new RuntimeWorkspace(root,root.toString()),null,ignored->"",new JdbcCodeGenerationStore(jdbc,manager),failing);
   var next=interrupted.prepareGeneration(RuntimeWorkspace.OPERATOR_LABEL,conversation,entry,"","",ref,List.of(child));
   String changedAnswer=answer.replace("After child","Changed child");
   var unknown=interrupted.proposePrepared(RuntimeWorkspace.OPERATOR_LABEL,conversation,next.id(),changedAnswer,true);
   assertEquals("CODE_APPLICATION_UNKNOWN",assertThrows(ResponseStatusException.class,()->interrupted.apply(RuntimeWorkspace.OPERATOR_LABEL,conversation,unknown.id(),true)).getReason());
   assertEquals("UNKNOWN",interrupted.proposal(RuntimeWorkspace.OPERATOR_LABEL,conversation,unknown.id()).status());
   assertEquals(page,Files.readString(root.resolve(entry)));assertTrue(Files.readString(root.resolve(child)).contains("Changed child"));
   assertThrows(ResponseStatusException.class,()->interrupted.prepareGeneration(RuntimeWorkspace.OPERATOR_LABEL,conversation,entry,"","",ref,List.of(child)));
  }finally{assertTrue(schema.matches("eap_unknown_qa_[a-f0-9]{32}"));admin.execute("DROP SCHEMA IF EXISTS "+schema+" CASCADE");}
 }
 @Test void rejectsCyclesDynamicImportsExternalAndAmbiguousComponents() {
  String root="frontend/Page.vue",child="frontend/Part.vue";
  java.util.function.BiFunction<String,String,List<CodeChangeService.Change>> files=(a,b)->List.of(new CodeChangeService.Change(root,null,"<script setup>\n"+a+"\n</script>","absent"),new CodeChangeService.Change(child,null,"<script setup>\n"+b+"\n</script>","absent"));
  assertEquals("CODE_GRAPH_CYCLE",assertThrows(ResponseStatusException.class,()->ComponentGraph.validate(root,files.apply("import Part from './Part.vue'","import Page from './Page.vue'"))).getReason());
  assertEquals("CODE_GRAPH_DYNAMIC_IMPORT_DENIED",assertThrows(ResponseStatusException.class,()->ComponentGraph.validate(root,files.apply("const part=import(selectedPath)","text"))).getReason());
  assertEquals("CODE_GRAPH_IMPORT_DENIED",assertThrows(ResponseStatusException.class,()->ComponentGraph.validate(root,files.apply("import x from 'unapproved-package'","text"))).getReason());
  assertEquals("CODE_GRAPH_IMPORT_SYNTAX_DENIED",assertThrows(ResponseStatusException.class,()->ComponentGraph.validate(root,files.apply("import Part from './Part.vue'\nexport {\n dangerous\n} from 'unapproved-package'","text"))).getReason());
  assertEquals(1,ComponentGraph.validate(root,files.apply("import Part from './Part.vue'\nimport { ref } from 'vue'","<template><p>Part</p></template>")).size());
 }
}
