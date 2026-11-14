package com.lh.eap.web.controller;
import com.lh.eap.ai.ExpertKnowledgeContextService;
import com.lh.eap.ai.TaskWorkingMemory;
import com.lh.eap.ai.dto.AiConversationReconnectResponse;
import com.lh.eap.web.i18n.ProblemResponses;
import com.lh.eap.web.i18n.RequestLanguage;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.CompletionException;
import org.springframework.web.bind.annotation.DeleteMapping;
import tools.jackson.databind.json.JsonMapper;
import com.lh.eap.error.ProtocolErrors;
import com.lh.eap.error.WorkspaceErrors;
import com.lh.eap.delivery.CodeChangeService;

import com.lh.eap.ai.AiChatApplication;
import com.lh.eap.ai.AiConnectionStatus;
import com.lh.eap.ai.ModelConnectionView;
import com.lh.eap.ai.ModelConnections;
import com.lh.eap.application.dto.AiConnectionAssignment;
import com.lh.eap.ai.dto.AiConversationResponse;
import com.lh.eap.ai.dto.ChatExecutionEvent;
import java.io.IOException;
import java.util.Map;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/ai")
public class AiChatController {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final AiChatApplication chat;
    private final ProblemResponses problems;

    public AiChatController(AiChatApplication chat, ProblemResponses problems) {
        this.chat = chat;
        this.problems = problems;
    }

    @GetMapping("/conversations/{id}")
    public AiConversationResponse conversation(@PathVariable UUID id) { return chat.conversation(id); }

    @GetMapping("/conversations/{id}/model-history")
    public com.lh.eap.ai.AiConversationRegistry.ModelHistoryUsage modelHistory(@PathVariable UUID id) {
        return chat.modelHistory(id);
    }

    @DeleteMapping("/conversations/{id}/model-history")
    public void clearModelHistory(@PathVariable UUID id) { chat.clearModelHistory(id); }

    @PostMapping("/conversations/{id}/model-history/summary")
    public AiChatApplication.HistorySummary summarizeHistory(@PathVariable UUID id) { return chat.summarizeHistory(id); }

    @PutMapping(value = "/conversations/{id}/working-memory", consumes = MediaType.APPLICATION_JSON_VALUE)
    public TaskWorkingMemory.Snapshot putWorkingMemory(@PathVariable UUID id,
            @RequestBody(required = false) String body) {
        return chat.putWorkingMemory(id, body);
    }

    @DeleteMapping("/conversations/{id}")
    public void deleteConversation(@PathVariable UUID id) { chat.deleteConversation(id); }

    @GetMapping("/status")
    public AiConnectionStatus.Snapshot status() {
        return chat.status();
    }

    @GetMapping("/workspace/baseline")
    public CodeChangeService.Baseline baseline(@RequestParam("path") String path) {
        return chat.baseline(path);
    }

    @GetMapping("/workspace/source")
    public CodeChangeService.SourceExcerpt source(@RequestParam("path") String path) {
        return chat.source(path);
    }
    @PostMapping("/workspace/code-dependencies")
    public CodeChangeService.Preparation dependencies(@RequestBody PreparationRequest request) {
        return chat.dependencies(request.targetPath());
    }

    public record PreparationRequest(String targetPath, List<String> componentPaths) {}
    public record ReferenceRequest(List<String> paths) {}
    @PostMapping("/workspace/code-references")
    public List<CodeChangeService.SourceExcerpt> references(@RequestBody ReferenceRequest request) {
        return chat.references(request.paths());
    }
    @PostMapping("/workspace/code-preparation")
    public CodeChangeService.Preparation preparation(@RequestBody PreparationRequest request) {
        return chat.preparation(request.targetPath(), request.componentPaths());
    }

    @GetMapping("/workspace/dirty")
    public CodeChangeService.DirtySummary dirty() {
        return chat.dirty();
    }

    /**
     * Safe read-only {@code git --version} probe. Does not enable configured typecheck/test/build
     * and never marks apply verification as passed.
     */
    @PostMapping("/workspace/verification/probe")
    public CodeChangeService.VerificationProbe verificationProbe() {
        return chat.verificationProbe();
    }

    /**
     * Refuse a browser/remote multi-tenant directory-grant store.
     * Colocated workspace binding uses process configuration ({@code authorized-root}), not this POST.
     */
    @PostMapping("/workspace/grants")
    public void refuseUserDirectoryGrants() {
        throw new ResponseStatusException(
                HttpStatus.METHOD_NOT_ALLOWED,
                WorkspaceErrors.USER_DIRECTORY_GRANTS_NOT_STORED_ON_SERVER.code());
    }

    @PostMapping("/conversations")
    public AiConversationResponse open(@RequestBody(required = false) String body) {
        return chat.open(body);
    }

    @PostMapping("/conversations/{id}/reconnect")
    public AiConversationReconnectResponse reconnect(@PathVariable UUID id,
            @RequestBody(required = false) String body) {
        return chat.reconnect(id, body);
    }

    /**
     * Primary chat path: SSE observer of an application-owned execution.
     * Validation failures thrown before the first event keep HTTP 4xx JSON error semantics.
     * The final frame carries the full message envelope in {@code payload}.
     */
    @PostMapping(
            value = "/conversations/{id}/messages",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter message(@PathVariable UUID id, @RequestBody(required = false) String body, HttpServletRequest request, HttpServletResponse response) {
        var language = RequestLanguage.resolve(request.getHeader("Accept-Language"));
        response.setHeader("Content-Language", language.toLanguageTag());
        var emitter = new SseEmitter(120_000L);
        var turn = chat.sendDetached(id, body, event -> sendEvent(emitter, event, language));
        turn.result().whenComplete((result, failure) -> {
            if (failure == null) emitter.complete();
            else emitter.completeWithError(failure);
        });
        // Only preparation is awaited: failures before execution retain normal HTTP error semantics.
        try { turn.started().join(); }
        catch (CompletionException failure) {
            if (failure.getCause() instanceof RuntimeException cause) throw cause;
            throw failure;
        }
        return emitter;
    }

    @PostMapping("/conversations/{id}/cancel")
    public Map<String, Object> cancel(@PathVariable UUID id) {
        return chat.cancel(id);
    }

    @GetMapping("/conversations/{id}/executions/{executionId}/plan")
    public org.springframework.http.ResponseEntity<?> plan(@PathVariable UUID id, @PathVariable UUID executionId) {
        var snapshot = chat.executionPlan(id, executionId);
        // Spring otherwise renders a null return as an empty body rather than the JSON null contract.
        return snapshot == null
                ? org.springframework.http.ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body("null")
                : org.springframework.http.ResponseEntity.ok(snapshot);
    }

    @GetMapping("/conversations/{id}/executions/{executionId}/snapshot")
    public Map<String,Object> snapshot(
            @PathVariable UUID id,
            @PathVariable UUID executionId,
            @RequestParam(name = "afterSequence", defaultValue = "0") long afterSequence,
            HttpServletRequest request, HttpServletResponse response) {
        if (afterSequence < 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ProtocolErrors.CURSOR_INVALID.code());
        var language = RequestLanguage.resolve(request.getHeader("Accept-Language"));
        response.setHeader("Content-Language", language.toLanguageTag());
        var snapshot = chat.executionSnapshot(id, executionId, afterSequence);
        var data = new LinkedHashMap<String,Object>();
        data.put("executionId", snapshot.executionId()); data.put("conversationId", snapshot.conversationId());
        data.put("latestSequence", snapshot.latestSequence()); data.put("complete", snapshot.complete()); data.put("status", snapshot.status());
        data.put("events", snapshot.events().stream().map(event -> eventBody(event, language)).toList());
        return data;
    }

    @PostMapping("/expert-context/preview")
    public ExpertKnowledgeContextService.Context previewExpertContext(@RequestBody(required = false) String body) {
        return chat.previewExpertContext(body);
    }

    @GetMapping("/connections")
    public ModelConnections.Listing connections() {
        return chat.connections();
    }

    @PostMapping("/conversations/{id}/proposals/{proposal}/apply")
    public CodeChangeService.Applied apply(@PathVariable UUID id, @PathVariable UUID proposal,
            @RequestBody(required = false) String body) {
        return chat.apply(id, proposal, body);
    }

    @GetMapping("/conversations/{id}/proposals/{proposal}")
    public CodeChangeService.ProposalStatus proposal(@PathVariable UUID id, @PathVariable UUID proposal) {
        return chat.proposal(id, proposal);
    }

    @PostMapping("/conversations/{id}/proposals/{proposal}/refuse")
    public CodeChangeService.ProposalStatus refuseProposal(@PathVariable UUID id, @PathVariable UUID proposal,
            @RequestBody(required = false) String body) {
        return chat.refuseProposal(id, proposal, body);
    }

    @PostMapping("/connections")
    public ModelConnectionView create(@RequestBody(required = false) String body) {
        return chat.saveConnection(null, body);
    }

    @PostMapping("/connections/{id}")
    public ModelConnectionView update(@PathVariable UUID id, @RequestBody(required = false) String body) {
        return chat.saveConnection(id, body);
    }

    @PostMapping("/connections/{id}/enabled")
    public ModelConnectionView enabled(@PathVariable UUID id, @RequestBody(required = false) String body) {
        return chat.setConnectionEnabled(id, body);
    }

    @PostMapping("/connections/{id}/default")
    public ModelConnectionView chooseDefault(@PathVariable UUID id) {
        return chat.setDefaultConnection(id);
    }

    @PostMapping("/connections/{id}/models/refresh")
    public ModelConnectionView refreshModels(@PathVariable UUID id) { return chat.refreshModels(id); }

    @PostMapping("/connections/{id}/models")
    public ModelConnectionView configureModels(@PathVariable UUID id, @RequestBody String body) {
        return chat.configureModels(id, body);
    }

    @PostMapping("/conversations/{id}/connection")
    public AiConnectionAssignment assign(@PathVariable UUID id, @RequestBody(required = false) String body) {
        return chat.assign(id, body);
    }

    private void sendEvent(SseEmitter emitter, ChatExecutionEvent event, Locale language) {
        try {
            emitter.send(SseEmitter.event().id(event.eventId().toString()).name(event.type()).data(eventBody(event, language)));
        } catch (IOException closed) {
            throw new ResponseStatusException(HttpStatus.REQUEST_TIMEOUT, ProtocolErrors.SSE_CLOSED.code());
        }
    }

    private Object eventBody(ChatExecutionEvent event, Locale language) {
        if (event.code() == null || event.code().isBlank() || !Set.of("error","refused","final").contains(event.type())) return event;
        Map<String,Object> data = JSON.convertValue(event, LinkedHashMap.class);
        data.put("message", problems.localized(400, event.code(), language).getDetail());
        return data;
    }
}
