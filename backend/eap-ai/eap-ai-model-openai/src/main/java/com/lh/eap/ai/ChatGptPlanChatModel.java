package com.lh.eap.ai;

import com.openai.client.OpenAIClient;

/** ChatGPT account credentials are resolved outside the shared Responses transport. */
final class ChatGptPlanChatModel extends OpenAiResponsesChatModel {
    ChatGptPlanChatModel(ModelConnectionSnapshot snapshot) { super(snapshot); }
    ChatGptPlanChatModel(OpenAIClient client, String model) { super(client, model); }
}
