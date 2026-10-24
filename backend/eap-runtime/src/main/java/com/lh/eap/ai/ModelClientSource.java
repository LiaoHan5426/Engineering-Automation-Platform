package com.lh.eap.ai;

import org.springframework.ai.chat.client.ChatClient;

/** Builds Spring AI clients for a connection revision. Implementations must not mutate an existing client. */
public interface ModelClientSource {
    ChatClient conversational(ModelConnectionSnapshot snapshot);

    ChatClient completion(ModelConnectionSnapshot snapshot);
}
