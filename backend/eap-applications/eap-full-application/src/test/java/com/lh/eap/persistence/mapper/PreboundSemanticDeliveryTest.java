package com.lh.eap.persistence.mapper;

import static org.junit.jupiter.api.Assertions.*;
import com.lh.eap.application.service.*;
import com.lh.eap.delivery.*;
import com.lh.eap.api.TaskRef;
import com.lh.eap.config.RuntimeWorkspace;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import tools.jackson.databind.json.JsonMapper;

/** Real V31 failure -> V32 migration, PREBOUND source and durable application catalog in owned schema. */
@EnabledIfEnvironmentVariable(named="EAP_RUN_SINGLE_CONTRACTS", matches="true")
class PreboundSemanticDeliveryTest {
    @Test void semanticPrototypeBindsWithoutRemovedFieldsAndCatalogUsesExactDurableScope() throws Exception {
        var session=Files.createTempDirectory(Path.of("target"),"prebound-semantic-");
        String schema="eap_unknown_qa_"+UUID.randomUUID().toString().replace("-","");
        var admin=new JdbcTemplate(ToolUnknownReviewFixture.originalDataSource());
        try {
            CurrentContractTestSchema.migrate(session,schema,"31");
            var source=ToolUnknownReviewFixture.scopedDataSource(schema);
            var jdbc=new JdbcTemplate(source);var manager=new DataSourceTransactionManager(source);
            var versions=new PrototypeVersionService(new JdbcPrototypeVersionStore(jdbc),new JdbcPrototypeDeliveryStore(jdbc));
            String body="""
                {"format":"eap-prototype-v1","schema":{"version":1,"title":"Design","unknownMappings":[],"grapesProject":{},
                "root":{"id":"root","kind":"page","props":{},"children":[{"id":"button","kind":"button","props":{"label":"Send"},"children":[]}]}}}
                """;
            var version=versions.save(UUID.randomUUID(),"builder-alpha","Design",body,List.of("preview"));
            var task=new BoardTaskService(jdbc).create(new BoardTaskService.Draft("prebound-semantic","Page","","ready","Show generation binding","Source and preview checked",UUID.randomUUID()));
            jdbc.update("UPDATE eap.board_task SET prototype_version_id=? WHERE id=?",version.id(),task.id());
            var root=Files.createDirectory(session.resolve("workspace")).toRealPath();Files.createDirectory(root.resolve("frontend"));
            String target="frontend/Page.vue";Files.writeString(root.resolve(target),"<p>Before</p>\n");
            var generations=new JdbcCodeGenerationStore(jdbc,manager);
            var store=new JdbcCodeProposalStore(jdbc,manager);
            var changes=new CodeChangeService(new RuntimeWorkspace(root,root.toString()),null,ignored->"",generations,store);
            var ref=new TaskRef(task.projectId(),task.id(),task.revision());var conversation=UUID.randomUUID();
            assertThrows(RuntimeException.class,()->changes.prepareGeneration(RuntimeWorkspace.OPERATOR_LABEL,conversation,target,version.id().toString(),version.contentHash(),ref));
            assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM eap.code_generation",Integer.class));
            CurrentContractTestSchema.migrate(session,schema);
            var captured=changes.prepareGeneration(RuntimeWorkspace.OPERATOR_LABEL,conversation,target,version.id().toString(),version.contentHash(),ref);
            assertEquals(version,captured.taskSnapshot().prototype());
            var proposal=changes.proposePrepared(RuntimeWorkspace.OPERATOR_LABEL,conversation,captured.id(),
                JsonMapper.builder().build().writeValueAsString(Map.of("files",List.of(Map.of("path",target,"content","<p>After</p>\n")))),true);
            var catalog=new BoardApplicationCatalog(jdbc);
            assertTrue(catalog.list(ref,root.toString()).items().isEmpty());
            var applied=changes.apply(RuntimeWorkspace.OPERATOR_LABEL,conversation,proposal.id(),true);
            assertEquals("APPLIED",applied.status());assertEquals("<p>After</p>\n",Files.readString(root.resolve(target)));
            var page=catalog.list(ref,root.toString());assertEquals(ref,page.taskBinding());assertFalse(page.truncated());
            assertEquals(1,page.items().size());assertEquals(proposal.id(),page.items().getFirst().proposalId());
            assertEquals(applied.afterHash(),page.items().getFirst().afterHash());
            assertTrue(catalog.list(new TaskRef(ref.projectId(),ref.taskId(),ref.revision()+1),root.toString()).items().isEmpty());
            assertTrue(catalog.list(new TaskRef("another",ref.taskId(),ref.revision()),root.toString()).items().isEmpty());
            assertTrue(catalog.list(new TaskRef(ref.projectId(),UUID.randomUUID(),ref.revision()),root.toString()).items().isEmpty());
            assertTrue(catalog.list(ref,root.resolve("another").toString()).items().isEmpty());
            for(int i=0;i<22;i++) {
                var id=UUID.randomUUID();var extra=new CodeChangeService.Proposal(id,conversation,root.toString(),"bounded catalog",proposal.files(),proposal.createdAt(),false,true,"not_requested",proposal.generation());
                store.save(RuntimeWorkspace.OPERATOR_LABEL,extra);assertTrue(store.claim(RuntimeWorkspace.OPERATOR_LABEL,conversation,id));
                store.finish(RuntimeWorkspace.OPERATOR_LABEL,conversation,id,"APPLIED",new CodeChangeService.Applied(id,List.of(target),"not_requested",List.of(),"APPLIED",applied.afterHash(),""),"");
            }
            assertEquals(20,catalog.list(ref,root.toString()).items().size());assertTrue(catalog.list(ref,root.toString()).truncated());
            var old=JsonMapper.builder().build().valueToTree(version).deepCopy();
            ((tools.jackson.databind.node.ObjectNode)old).put("buttonPresses",0);
            String constraint=jdbc.queryForObject("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='code_generation_task_group' AND connamespace=?::regnamespace",String.class,schema);
            assertTrue(constraint.contains("requestId"));assertTrue(constraint.contains("buttonPresses"));
            assertThrows(org.springframework.dao.DataIntegrityViolationException.class,()->jdbc.update("""
                INSERT INTO eap.code_generation(id,principal,conversation_id,workspace,target_path,base_hash,source_content,
                    prototype_version_id,prototype_content_hash,captured_at,task_project_id,task_id,task_revision,task_snapshot)
                SELECT ?,principal,conversation_id,workspace,target_path,base_hash,source_content,
                    prototype_version_id,prototype_content_hash,captured_at,task_project_id,task_id,task_revision,
                    jsonb_set(task_snapshot,'{prototype}',?::jsonb)
                FROM eap.code_generation WHERE id=?
                """,UUID.randomUUID(),old.toString(),captured.id()));
            // Immutability remains enforced; migration did not rewrite captured evidence.
            assertThrows(org.springframework.dao.DataAccessException.class,()->jdbc.update("UPDATE eap.code_generation SET task_snapshot=jsonb_set(task_snapshot,'{prototype}',?::jsonb) WHERE id=?",old.toString(),captured.id()));
        } finally {
            assertTrue(schema.matches("eap_unknown_qa_[a-f0-9]{32}"));admin.execute("DROP SCHEMA IF EXISTS "+schema+" CASCADE");
        }
    }
}
