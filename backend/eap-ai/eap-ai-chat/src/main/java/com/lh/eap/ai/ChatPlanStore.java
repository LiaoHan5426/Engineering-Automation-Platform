package com.lh.eap.ai;
import com.lh.eap.ai.dto.ChatPlanSnapshot;
import java.util.UUID;
import java.util.function.UnaryOperator;
public interface ChatPlanStore {
    record Owner(String principal, String workspace, UUID conversationId, UUID executionId) {}
    void open(Owner owner);
    void close(Owner owner);
    ChatPlanSnapshot read(Owner owner);
    ChatPlanSnapshot update(Owner owner, UUID operationId, String command, long expectedRevision,
            UnaryOperator<ChatPlanSnapshot> replacement);
}
