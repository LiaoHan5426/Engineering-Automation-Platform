package com.lh.eap.web.controller;

import com.lh.eap.ai.ChatGptLogin;
import java.util.UUID;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/ai/chatgpt/login")
public class ChatGptLoginController {
    private final ChatGptLogin login;
    private final com.lh.eap.ai.ModelConnections connections;
    public ChatGptLoginController(ChatGptLogin login, com.lh.eap.ai.ModelConnections connections) { this.login = login; this.connections = connections; }
    @PostMapping public ChatGptLogin.Started start(@RequestParam(required = false) UUID connectionId) { return login.start(connectionId); }
    @GetMapping("/{id}") public ChatGptLogin.State state(@PathVariable UUID id) { return login.state(id); }
    @DeleteMapping("/{id}") public void cancel(@PathVariable UUID id) { login.cancel(id); }
    @DeleteMapping("/accounts/{id}") public void disconnect(@PathVariable UUID id) { connections.disconnectOAuth(id); }
}
