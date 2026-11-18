package com.lh.eap.ai;

import com.lh.eap.ai.dto.AiMessageResponse;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

/** Durable transcript and operation authority. A process token is observation evidence, never run recovery. */
public final class ChatGraphStore {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final UUID process = UUID.randomUUID();
    public record Owner(String principal, String workspace, UUID conversationId) {}
    public record Node(UUID id, UUID parentId, String role, String content, UUID executionId,
            UUID operationId, String status, boolean observationAvailable, boolean safe, long boundary, AiMessageResponse response, List<TransientAttachments.Ref> attachmentRefs, UUID generationId, long terminalSequence) {}
    public record Operation(UUID operationId, String payload, UUID userMessageId, UUID assistantMessageId, UUID executionId, long graphRevision) {}
    public record Graph(UUID conversationId, long revision, long boundary, boolean sensitive, UUID activeExecution,
            UUID process, List<Node> nodes, List<Operation> operations) {}
    public record Binding(UUID operationId, UUID userMessageId, UUID assistantMessageId, UUID executionId, long graphRevision) {}
    public record View(UUID conversationId, long revision, List<Node> nodes, List<Binding> operations) {}
    public View view(Owner o) { var g=read(o); return new View(g.conversationId(),g.revision(),g.nodes(),g.operations().stream().map(op->new Binding(op.operationId(),op.userMessageId(),op.assistantMessageId(),op.executionId(),op.graphRevision())).toList()); }
    public record Reservation(Graph graph, Operation operation, boolean fresh) {}
    public ChatGraphStore(JdbcTemplate jdbc, PlatformTransactionManager manager) {
        this.jdbc=jdbc; tx=new TransactionTemplate(manager);
        tx.setPropagationBehavior(org.springframework.transaction.TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }
    public void open(Owner o) {
        jdbc.update("INSERT INTO eap.chat_graph(conversation_id,principal,workspace,snapshot) VALUES (?,?,?,?)",
            o.conversationId(),o.principal(),o.workspace(),JSON.writeValueAsString(new Graph(o.conversationId(),0,0,false,null,null,List.of(),List.of())));
    }
    private Graph load(Owner o, boolean lock) {
        var rows=jdbc.query("SELECT snapshot FROM eap.chat_graph WHERE conversation_id=? AND principal=? AND workspace=?"+(lock?" FOR UPDATE":""),
            (rs,n)->rs.getString(1),o.conversationId(),o.principal(),o.workspace());
        if(rows.isEmpty()) throw error(HttpStatus.NOT_FOUND,com.lh.eap.error.ChatErrors.UNKNOWN_CONVERSATION.code());
        return JSON.readValue(rows.getFirst(),Graph.class);
    }
    private void save(Owner o, Graph g) { jdbc.update("UPDATE eap.chat_graph SET snapshot=? WHERE conversation_id=? AND principal=? AND workspace=?",
        JSON.writeValueAsString(g),o.conversationId(),o.principal(),o.workspace()); }
    public Graph read(Owner o) {
        var g=load(o,false);
        if(g.activeExecution()==null || process.equals(g.process())) return g;
        return new Graph(g.conversationId(),g.revision(),g.boundary(),g.sensitive(),null,null,g.nodes().stream().map(n->
            n.executionId().equals(g.activeExecution()) && n.response()==null && n.role().equals("assistant") ?
                new Node(n.id(),n.parentId(),n.role(),n.content(),n.executionId(),n.operationId(),n.status(),false,false,n.boundary(),null,n.attachmentRefs(),n.generationId(),n.terminalSequence()):n).toList(),g.operations());
    }
    public Reservation find(Owner o, UUID operationId, String payload) {
        var g=read(o);
        for(var op:g.operations()) if(op.operationId().equals(operationId)) {
            if(!op.payload().equals(payload)) throw error(HttpStatus.CONFLICT,ChatGraphErrors.CHAT_OPERATION_CONFLICT.code());
            return new Reservation(g,op,false);
        }
        return null;
    }
    public Reservation reserve(Owner o, UUID operationId, String payload, long revision, String kind, UUID parent, UUID target, String message, boolean sensitive) {
        return reserve(o,operationId,payload,revision,kind,parent,target,message,sensitive,List.of());
    }
    public Reservation reserve(Owner o, UUID operationId, String payload, long revision, String kind, UUID parent, UUID target, String message, boolean sensitive, List<TransientAttachments.Ref> refs) {
        return tx.execute(s->{
            var g=load(o,true);
            for(var op:g.operations()) if(op.operationId().equals(operationId)) {
                if(!op.payload().equals(payload)) throw error(HttpStatus.CONFLICT,ChatGraphErrors.CHAT_OPERATION_CONFLICT.code());
                return new Reservation(g,op,false);
            }
            if(g.revision()!=revision) throw error(HttpStatus.CONFLICT,ChatGraphErrors.CHAT_REVISION_CONFLICT.code());
            if(g.activeExecution()!=null && process.equals(g.process())) throw error(HttpStatus.CONFLICT,com.lh.eap.error.ChatErrors.CONVERSATION_BUSY.code());
            Node p=parent==null?null:node(g,parent);
            if(kind.equals("send")) {
                if(target!=null || p!=null&&!p.role().equals("assistant")) throw error(HttpStatus.BAD_REQUEST,ChatGraphErrors.CHAT_PARENT_INVALID.code());
            } else {
                var t=node(g,target);
                if(!Objects.equals(t.parentId(),parent) || !t.role().equals(kind.equals("edit")?"user":"assistant")) throw error(HttpStatus.CONFLICT,ChatGraphErrors.CHAT_TARGET_INVALID.code());
            }
            if(!kind.equals("regenerate") && (message==null || message.isBlank()&&refs.isEmpty() || message.length()>32000)) throw error(HttpStatus.BAD_REQUEST,com.lh.eap.error.ChatErrors.INVALID_CHAT_REQUEST.code());
            if(kind.equals("regenerate") && (p==null || !p.role().equals("user"))) throw error(HttpStatus.BAD_REQUEST,ChatGraphErrors.CHAT_PARENT_INVALID.code());
            var execution=UUID.randomUUID(); var assistant=UUID.randomUUID();
            var user=kind.equals("regenerate")?parent:UUID.randomUUID();
            var op=new Operation(operationId,payload,user,assistant,execution,g.revision()+1);
            var nodes=new ArrayList<>(read(o).nodes());
            boolean safe=!g.sensitive()&&!sensitive;
            if(!kind.equals("regenerate")) nodes.add(new Node(user,parent,"user",message,execution,operationId,"SUCCEEDED",true,safe,g.boundary(),null,refs,null,0));
            nodes.add(new Node(assistant,user,"assistant","",execution,operationId,"CREATED",true,safe,g.boundary(),null,List.of(),null,0));
            var operations=new ArrayList<>(g.operations()); operations.add(op);
            var next=new Graph(g.conversationId(),g.revision()+1,g.boundary(),g.sensitive()||sensitive,execution,process,List.copyOf(nodes),List.copyOf(operations));
            save(o,next); return new Reservation(next,op,true);
        });
    }
    public static Node node(Graph g, UUID id) { return g.nodes().stream().filter(n->n.id().equals(id)).findFirst().orElseThrow(()->error(HttpStatus.BAD_REQUEST,ChatGraphErrors.CHAT_PARENT_INVALID.code())); }
    public List<Node> history(Reservation r) {
        var g=r.graph(); var current=node(g,r.operation().userMessageId()).parentId(); var result=new ArrayList<Node>();
        while(current!=null) { var n=node(g,current); if(n.safe()&&n.boundary()==g.boundary()&&n.status().equals("SUCCEEDED")) result.add(n); current=n.parentId(); }
        Collections.reverse(result); return result;
    }
    public void started(Owner o, Reservation r) {
        tx.executeWithoutResult(s->{var g=load(o,true);var nodes=g.nodes().stream().map(n->n.id().equals(r.operation().assistantMessageId())?
            new Node(n.id(),n.parentId(),n.role(),n.content(),n.executionId(),n.operationId(),ChatExecutionStatus.RUNNING.wire(),true,n.safe(),n.boundary(),n.response(),n.attachmentRefs(),n.generationId(),n.terminalSequence()):n).toList();
            save(o,new Graph(g.conversationId(),g.revision(),g.boundary(),g.sensitive(),g.activeExecution(),g.process(),nodes,g.operations()));});
    }
    public void linkGeneration(Owner o, Reservation r, UUID generationId) {
        tx.executeWithoutResult(s->{var g=load(o,true);var nodes=g.nodes().stream().map(n->n.id().equals(r.operation().assistantMessageId())?
            new Node(n.id(),n.parentId(),n.role(),n.content(),n.executionId(),n.operationId(),n.status(),n.observationAvailable(),n.safe(),n.boundary(),n.response(),n.attachmentRefs(),generationId,n.terminalSequence()):n).toList();
            save(o,new Graph(g.conversationId(),g.revision(),g.boundary(),g.sensitive(),g.activeExecution(),g.process(),nodes,g.operations()));});
    }
    public void failed(Owner o, Reservation r, String status, boolean observed) {
        tx.executeWithoutResult(s->{var g=load(o,true);if(node(g,r.operation().assistantMessageId()).response()!=null)return;
            var nodes=g.nodes().stream().map(n->n.id().equals(r.operation().assistantMessageId())?
                new Node(n.id(),n.parentId(),n.role(),n.content(),n.executionId(),n.operationId(),status,observed,n.safe(),n.boundary(),null,n.attachmentRefs(),n.generationId(),n.terminalSequence()):n).toList();
            save(o,new Graph(g.conversationId(),g.revision(),g.boundary(),g.sensitive(),Objects.equals(g.activeExecution(),r.operation().executionId())?null:g.activeExecution(),Objects.equals(g.activeExecution(),r.operation().executionId())?null:g.process(),nodes,g.operations()));});
    }
    public void finish(Owner o, Reservation r, AiMessageResponse response) {finish(o,r,response,2);}
    public void finish(Owner o, Reservation r, AiMessageResponse response,long terminalSequence) {
        tx.executeWithoutResult(s->{ var g=load(o,true);
            var existing=node(g,r.operation().assistantMessageId());
            if(existing.response()!=null) return;
            var nodes=g.nodes().stream().map(n->n.id().equals(r.operation().assistantMessageId())?
            new Node(n.id(),n.parentId(),n.role(),response==null?"":response.answer(),n.executionId(),n.operationId(),response==null?n.status():response.status(),response!=null,n.safe(),n.boundary(),response,n.attachmentRefs(),n.generationId(),terminalSequence):n).toList();
            save(o,new Graph(g.conversationId(),g.revision(),g.boundary(),g.sensitive(),Objects.equals(g.activeExecution(),r.operation().executionId())?null:g.activeExecution(),Objects.equals(g.activeExecution(),r.operation().executionId())?null:g.process(),nodes,g.operations())); });
    }
    public void boundary(Owner o) { tx.executeWithoutResult(s->{var g=load(o,true);save(o,new Graph(g.conversationId(),g.revision(),g.boundary()+1,g.sensitive(),g.activeExecution(),g.process(),g.nodes(),g.operations()));}); }
    public void delete(Owner o) { jdbc.update("DELETE FROM eap.chat_graph WHERE conversation_id=? AND principal=? AND workspace=?",o.conversationId(),o.principal(),o.workspace()); }
    public static ResponseStatusException error(HttpStatus status,String code) {return new ResponseStatusException(status,code);}
}
