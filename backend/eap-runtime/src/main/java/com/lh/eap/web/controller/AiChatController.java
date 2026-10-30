package com.lh.eap.web.controller;

import com.lh.eap.ai.AiChatApplication;
import com.lh.eap.ai.AiConnectionStatus;
import com.lh.eap.ai.ModelConnectionView;
import com.lh.eap.ai.ModelConnections;
import com.lh.eap.web.dto.AiConnectionAssignment;
import com.lh.eap.web.dto.AiConversationResponse;
import com.lh.eap.web.dto.AiMessageResponse;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/ai")
public class AiChatController {
    private final AiChatApplication chat;

    public AiChatController(AiChatApplication chat) {
        this.chat = chat;
    }

    @GetMapping("/conversations/{id}")
    public AiConversationResponse conversation(@PathVariable UUID id) { return chat.conversation(id); }

    @org.springframework.web.bind.annotation.DeleteMapping("/conversations/{id}")
    public void deleteConversation(@PathVariable UUID id) { chat.deleteConversation(id); }

    @GetMapping("/status")
    public AiConnectionStatus.Snapshot status() {
        return chat.status();
    }

    @GetMapping("/workspace/baseline")
    public com.lh.eap.ai.CodeChangeService.Baseline baseline(@RequestParam("path") String path) {
        return chat.baseline(path);
    }

    @GetMapping("/workspace/source")
    public com.lh.eap.ai.CodeChangeService.SourceExcerpt source(@RequestParam("path") String path) {
        return chat.source(path);
    }

    @GetMapping("/workspace/dirty")
    public com.lh.eap.ai.CodeChangeService.DirtySummary dirty() {
        return chat.dirty();
    }

    /**
     * Safe read-only {@code git --version} probe. Does not enable configured typecheck/test/build
     * and never marks apply verification as passed.
     */
    @PostMapping("/workspace/verification/probe")
    public com.lh.eap.ai.CodeChangeService.VerificationProbe verificationProbe() {
        return chat.verificationProbe();
    }

    /**
     * Refuse a browser/remote multi-tenant directory-grant store.
     * Colocated workspace binding uses process configuration ({@code authorized-root}), not this POST.
     */
    @PostMapping("/workspace/grants")
    public void refuseUserDirectoryGrants() {
        throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.METHOD_NOT_ALLOWED,
                "USER_DIRECTORY_GRANTS_NOT_STORED_ON_SERVER");
    }

    @PostMapping("/conversations")
    public AiConversationResponse open(@RequestBody(required = false) String body) {
        return chat.open(body);
    }

    @PostMapping("/conversations/{id}/messages")
    public AiMessageResponse message(@PathVariable UUID id, @RequestBody(required = false) String body) {
        return chat.send(id, body);
    }

    @GetMapping("/connections")
    public ModelConnections.Listing connections() {
        return chat.connections();
    }

    @PostMapping("/conversations/{id}/proposals/{proposal}/apply")
    public com.lh.eap.ai.CodeChangeService.Applied apply(@PathVariable UUID id, @PathVariable UUID proposal,
            @RequestBody(required = false) String body) {
        return chat.apply(id, proposal, body);
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
}
