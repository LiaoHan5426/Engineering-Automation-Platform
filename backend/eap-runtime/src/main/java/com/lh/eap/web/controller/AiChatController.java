package com.lh.eap.web.controller;

import com.lh.eap.ai.AiChatApplication;
import com.lh.eap.ai.AiConnectionStatus;
import com.lh.eap.web.dto.AiConversationResponse;
import com.lh.eap.web.dto.AiMessageResponse;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/ai")
public class AiChatController {
    private final AiChatApplication chat;

    public AiChatController(AiChatApplication chat) {
        this.chat = chat;
    }

    @GetMapping("/status")
    public AiConnectionStatus.Snapshot status() {
        return chat.status();
    }

    @PostMapping("/conversations")
    public AiConversationResponse open(@RequestBody(required = false) String body) {
        return chat.open(body);
    }

    @PostMapping("/conversations/{id}/messages")
    public AiMessageResponse message(@PathVariable UUID id, @RequestBody(required = false) String body) {
        return chat.send(id, body);
    }
}
