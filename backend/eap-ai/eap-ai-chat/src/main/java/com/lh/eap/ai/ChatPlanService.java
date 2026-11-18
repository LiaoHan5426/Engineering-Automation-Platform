package com.lh.eap.ai;
import com.lh.eap.ai.dto.ChatPlanSnapshot;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import java.util.function.BooleanSupplier;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;
/** Sole plan command authority. Progress declarations never change execution or board evidence. */
public class ChatPlanService {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final ChatPlanStore store;
    public ChatPlanService(ChatPlanStore store) { this.store = store; }
    public record InputItem(UUID id, String content, String status) {}
    public record Command(long expectedRevision, UUID operationId, List<InputItem> items) {}
    public void open(ChatPlanStore.Owner owner) { storage(() -> { store.open(owner); return null; }); }
    public void close(ChatPlanStore.Owner owner) { storage(() -> { store.close(owner); return null; }); }
    public ChatPlanSnapshot read(ChatPlanStore.Owner owner) { return storage(() -> store.read(owner)); }
    public ChatPlanSnapshot update(ChatPlanStore.Owner owner, Command command, BooleanSupplier cancelled) {
        if (command == null || command.operationId() == null || command.expectedRevision() < 0
                || command.items() == null || command.items().size() > 32) throw invalid();
        if (cancelled.getAsBoolean() || Thread.currentThread().isInterrupted()) throw closed();
        var items = new ArrayList<>(command.items());
        var seen = new HashSet<UUID>();
        for (var item : items) {
            if (item == null || item.content() == null || item.content().isBlank()
                    || item.content().codePointCount(0, item.content().length()) > 500
                    || (item.id() != null && !seen.add(item.id()))) throw invalid();
            try { ChatPlanItemStatus.fromWire(item.status()); } catch (IllegalArgumentException bad) { throw invalid(); }
        }
        String canonical = JSON.writeValueAsString(new Command(command.expectedRevision(), command.operationId(), items));
        return storage(() -> store.update(owner, command.operationId(), canonical, command.expectedRevision(), previous -> {
            if (cancelled.getAsBoolean() || Thread.currentThread().isInterrupted()) throw closed();
            var oldIds = new HashSet<UUID>();
            if (previous != null) previous.items().forEach(item -> oldIds.add(item.id()));
            var next = new ArrayList<ChatPlanSnapshot.Item>();
            for (var item : items) {
                if (item.id() != null && !oldIds.contains(item.id())) throw invalid();
                next.add(new ChatPlanSnapshot.Item(item.id() == null ? UUID.randomUUID() : item.id(), item.content(), item.status()));
            }
            var snapshot = new ChatPlanSnapshot(1, previous == null ? UUID.randomUUID() : previous.planId(),
                    owner.conversationId(), owner.executionId(), command.expectedRevision() + 1, Instant.now(), next);
            if (JSON.writeValueAsString(snapshot).getBytes(StandardCharsets.UTF_8).length > 32768) throw invalid();
            return snapshot;
        }));
    }
    private static <T> T storage(java.util.function.Supplier<T> work) {
        try { return work.get(); }
        catch (org.springframework.dao.DataAccessException unavailable) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, ChatPlanErrors.CHAT_PLAN_STORE_UNAVAILABLE.code());
        }
    }
    static ResponseStatusException invalid() { return new ResponseStatusException(HttpStatus.BAD_REQUEST, ChatPlanErrors.INVALID_CHAT_PLAN.code()); }
    static ResponseStatusException closed() { return new ResponseStatusException(HttpStatus.CONFLICT, ChatPlanErrors.CHAT_PLAN_EXECUTION_CLOSED.code()); }
}
