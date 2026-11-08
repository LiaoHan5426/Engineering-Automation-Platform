package com.lh.eap.ai;

import java.time.Instant;
import java.util.Set;

record ChatGptCredentials(String clientId, String subject, String email, String idToken, String accessToken,
                          String refreshToken, Instant expiresAt, Set<String> scopes) {
    boolean planGranted() { return scopes.contains("chatgpt.tokens.use.direct") && scopes.contains("resource.invoke"); }
    @Override public String toString() { return "ChatGPT account credentials [protected]"; }
}
