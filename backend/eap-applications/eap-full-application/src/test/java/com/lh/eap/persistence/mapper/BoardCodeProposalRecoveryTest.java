package com.lh.eap.persistence.mapper;

import static org.junit.jupiter.api.Assertions.*;
import com.lh.eap.application.service.*;
import com.lh.eap.config.RuntimeWorkspace;
import com.lh.eap.delivery.*;
import com.lh.eap.api.TaskRef;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

@EnabledIfEnvironmentVariable(named="EAP_RUN_SINGLE_CONTRACTS",matches="true")
class BoardCodeProposalRecoveryTest {
    @Test void taskReviewAndActionsSurviveApplicationRecreationWithoutAChatSession() throws Exception {
        var directory=Files.createTempDirectory(Path.of("target"),"board-code-recovery-");
        String schema="eap_unknown_qa_"+UUID.randomUUID().toString().replace("-","");
        var admin=new JdbcTemplate(ToolUnknownReviewFixture.originalDataSource());
        try {
            CurrentContractTestSchema.migrate(directory,schema);
            var jdbc=new JdbcTemplate(ToolUnknownReviewFixture.scopedDataSource(schema));
            var manager=new DataSourceTransactionManager(ToolUnknownReviewFixture.scopedDataSource(schema));
            var tasks=new BoardTaskService(jdbc);var root=Files.createDirectory(directory.resolve("workspace")).toRealPath();
            Files.createDirectory(root.resolve("frontend"));Files.writeString(root.resolve("frontend/Page.vue"),"<p>Before</p>\n");
            var runtime=new RuntimeWorkspace(root,root.toString());
            var generations=new JdbcCodeGenerationStore(jdbc,manager);var proposals=new JdbcCodeProposalStore(jdbc,manager);
            var changes=new CodeChangeService(runtime,null,ignored->"",generations,proposals);
            var task=tasks.create(new BoardTaskService.Draft("recovery","Recover source review","","ready","Goal","Criteria",UUID.randomUUID()));
            var conversation=UUID.randomUUID();var ref=new TaskRef(task.projectId(),task.id(),task.revision());
            var snapshot=changes.prepareGeneration(RuntimeWorkspace.OPERATOR_LABEL,conversation,"frontend/Page.vue","","",ref);
            var json=JsonMapper.builder().build();
            var proposal=changes.proposePrepared(RuntimeWorkspace.OPERATOR_LABEL,conversation,snapshot.id(),json.writeValueAsString(Map.of("files",List.of(Map.of("path","frontend/Page.vue","content","<p>Recovered</p>\n")))),true);
            // Fresh services: no AiConversationRegistry is constructed or reconnected.
            var recoveredChanges=new CodeChangeService(runtime,null,ignored->"",new JdbcCodeGenerationStore(jdbc,manager),new JdbcCodeProposalStore(jdbc,manager));
            var board=new BoardCodeProposalService(tasks,jdbc,runtime,recoveredChanges);
            var listing=board.list(task.id(),task.projectId());assertEquals(1,listing.items().size());assertFalse(listing.truncated());
            assertEquals("PROPOSED",board.get(task.id(),proposal.id(),task.projectId()).status());
            var action=new BoardCodeProposalService.Action(task.projectId(),task.revision(),true);
            var applied=board.apply(task.id(),proposal.id(),action);assertEquals("APPLIED",applied.status());
            assertEquals("<p>Recovered</p>\n",Files.readString(root.resolve("frontend/Page.vue")));
            assertEquals(applied,board.apply(task.id(),proposal.id(),action));
            var other=tasks.create(new BoardTaskService.Draft("recovery","Another","","ready","Goal","Criteria",UUID.randomUUID()));
            assertTrue(board.list(other.id(),other.projectId()).items().isEmpty());
            assertEquals(404,assertThrows(ResponseStatusException.class,()->board.get(other.id(),proposal.id(),other.projectId())).getStatusCode().value());
            assertThrows(ResponseStatusException.class,()->board.get(task.id(),proposal.id(),"another-project"));
            var otherRuntime=new RuntimeWorkspace(root.resolve("another"),root.toString());Files.createDirectory(otherRuntime.workspace());
            var otherBoard=new BoardCodeProposalService(tasks,jdbc,otherRuntime,recoveredChanges);
            assertTrue(otherBoard.list(task.id(),task.projectId()).items().isEmpty());
            assertEquals(404,assertThrows(ResponseStatusException.class,()->otherBoard.get(task.id(),proposal.id(),task.projectId())).getStatusCode().value());
            // Read-only, stale and refused candidates remain independently reviewable.
            var readonly=changes.proposePrepared(RuntimeWorkspace.OPERATOR_LABEL,conversation,
                changes.prepareGeneration(RuntimeWorkspace.OPERATOR_LABEL,conversation,"frontend/Page.vue","","",ref).id(),
                json.writeValueAsString(Map.of("files",List.of(Map.of("path","frontend/Page.vue","content","<p>No write</p>\n")))),false);
            assertEquals(403,assertThrows(ResponseStatusException.class,()->board.apply(task.id(),readonly.id(),action)).getStatusCode().value());
            assertEquals("PROPOSED",board.get(task.id(),readonly.id(),task.projectId()).status());
            var changed=new TransactionTemplate(manager).execute(tx->tasks.update(task.id(),new BoardTaskService.Update(task.projectId(),task.revision(),null,"changed",null,null,null)));
            var currentAction=new BoardCodeProposalService.Action(task.projectId(),changed.revision(),true);
            assertEquals("BOARD_CODE_PROPOSAL_STALE",assertThrows(ResponseStatusException.class,()->board.apply(task.id(),readonly.id(),currentAction)).getReason());
            assertEquals("REFUSED",board.refuse(task.id(),readonly.id(),currentAction).status());
            assertEquals("REFUSED",board.refuse(task.id(),readonly.id(),currentAction).status());
            assertEquals("<p>Recovered</p>\n",Files.readString(root.resolve("frontend/Page.vue")));
            assertEquals(400,assertThrows(ResponseStatusException.class,()->board.apply(task.id(),proposal.id(),new BoardCodeProposalService.Action(task.projectId(),changed.revision(),false))).getStatusCode().value());
            assertTrue(board.list(task.id(),task.projectId()).items().stream().anyMatch(item->item.status().equals("REFUSED")));
            // A live UNKNOWN intent cannot be applied/refused or silently replaced by a new result.
            var activeRef=new TaskRef(other.projectId(),other.id(),other.revision());
            var unknown=changes.proposePrepared(RuntimeWorkspace.OPERATOR_LABEL,conversation,
                changes.prepareGeneration(RuntimeWorkspace.OPERATOR_LABEL,conversation,"frontend/Page.vue","","",activeRef).id(),
                json.writeValueAsString(Map.of("files",List.of(Map.of("path","frontend/Page.vue","content","<p>Unknown</p>\n")))),true);
            assertTrue(proposals.claim(RuntimeWorkspace.OPERATOR_LABEL,conversation,unknown.id()));
            proposals.finish(RuntimeWorkspace.OPERATOR_LABEL,conversation,unknown.id(),"UNKNOWN",null,"TEST_UNKNOWN");
            var unknownAction=new BoardCodeProposalService.Action(other.projectId(),other.revision(),true);
            assertEquals("UNKNOWN",board.get(other.id(),unknown.id(),other.projectId()).status());
            assertEquals("CODE_APPLICATION_UNKNOWN",assertThrows(ResponseStatusException.class,()->board.apply(other.id(),unknown.id(),unknownAction)).getReason());
            assertThrows(ResponseStatusException.class,()->board.refuse(other.id(),unknown.id(),unknownAction));
            assertEquals("UNKNOWN",board.get(other.id(),unknown.id(),other.projectId()).status());
        } finally {assertTrue(schema.matches("eap_unknown_qa_[a-f0-9]{32}"));admin.execute("DROP SCHEMA IF EXISTS "+schema+" CASCADE");}
    }
}
