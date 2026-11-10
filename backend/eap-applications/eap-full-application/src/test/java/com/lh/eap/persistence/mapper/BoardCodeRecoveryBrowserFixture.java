package com.lh.eap.persistence.mapper;
import com.lh.eap.application.service.*;
import com.lh.eap.delivery.*;
import com.lh.eap.config.RuntimeWorkspace;
import com.lh.eap.api.TaskRef;
import java.nio.file.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;
/** Explicit deterministic browser setup; only the owned isolation workspace and fixture data are written. */
public class BoardCodeRecoveryBrowserFixture {
 public static void main(String[] args)throws Exception {
  var json=JsonMapper.builder().build();var out=Path.of("backend/target/board-code-live");Files.createDirectories(out);var file=out.resolve("fixture.json");
  if(Files.exists(file)){System.out.println("Existing owned fixture preserved; no duplicate candidate or source write");return;}
  var source=ToolUnknownReviewFixture.originalDataSource();var jdbc=new JdbcTemplate(source);var manager=new DataSourceTransactionManager(source);
  var tasks=new BoardTaskService(jdbc);var root=Path.of("backend/target/prebound-page-workspace").toRealPath();
  var runtime=new RuntimeWorkspace(root,root.toString());var generations=new JdbcCodeGenerationStore(jdbc,manager);var proposals=new JdbcCodeProposalStore(jdbc,manager);
  var changes=new CodeChangeService(runtime,null,ignored->"",generations,proposals);
  String project="board-candidate-recovery-"+UUID.randomUUID().toString().substring(0,8);var result=new LinkedHashMap<String,Object>();
  result.put("projectId",project);result.put("workspace",root.toString());result.put("fixtureKind","Explicit deterministic candidates in a real production workspace/database; no model call");
  for(var kind:List.of("pending","readonly","stale")) {
   String path="frontend/RecoveryEvidence"+kind+".vue";String before="<template><p>Before "+kind+"</p></template>\n",after="<template><p>Recovered "+kind+"</p></template>\n";
   if(Files.exists(root.resolve(path)))throw new IllegalStateException("Refusing to overwrite existing fixture file");Files.writeString(root.resolve(path),before);
   var task=tasks.create(new BoardTaskService.Draft(project,"Persistent source candidate "+kind,"","ready","Verify task-owned review without Chat memory","Explicit confirmation and persisted source status; no automatic model replay",UUID.randomUUID()));
   UUID conversation=UUID.randomUUID();var ref=new TaskRef(task.projectId(),task.id(),task.revision());
   var snapshot=changes.prepareGeneration(RuntimeWorkspace.OPERATOR_LABEL,conversation,path,"","",ref);
   var proposal=changes.proposePrepared(RuntimeWorkspace.OPERATOR_LABEL,conversation,snapshot.id(),json.writeValueAsString(Map.of("summary","Deterministic restart verification candidate","files",List.of(Map.of("path",path,"content",after)))),!kind.equals("readonly"));
   if(kind.equals("stale")){var original=task;task=new TransactionTemplate(manager).execute(tx->tasks.update(original.id(),new BoardTaskService.Update(project,original.revision(),null,"Edited after candidate generation",null,null,null)));}
   result.put(kind,Map.of("task",task,"proposal",proposal,"before",before,"after",after));
  }
  Files.writeString(file,json.writeValueAsString(result));System.out.println(json.writeValueAsString(Map.of("projectId",project,"tasks",3,"candidates",3,"modelCalls",0)));
 }
}
