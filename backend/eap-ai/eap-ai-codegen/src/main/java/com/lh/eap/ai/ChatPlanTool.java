package com.lh.eap.ai;
import java.util.function.*;
import com.lh.eap.ai.dto.ChatPlanSnapshot;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.ai.tool.definition.ToolDefinition;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.databind.json.JsonMapper;
/** Bound to server-owned execution; model arguments cannot select identity or workspace. */
final class ChatPlanTool implements ToolCallback {
    static final int TRANSCRIPT_CHARS = 16384;
    static final int RESERVED_CHARS = TRANSCRIPT_CHARS + 2048;
    private int transcriptChars;
    private static final JsonMapper JSON = JsonMapper.builder().enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION).build();
    private final ChatPlanService service;
    private final ChatPlanStore.Owner owner;
    private final BooleanSupplier cancelled;
    private final Consumer<ChatPlanSnapshot> committed;
    private int calls;
    private String failure = "";
    String failure() { return failure; }
    int transcriptChars() { return transcriptChars; }
    ChatPlanTool(ChatPlanService service, ChatPlanStore.Owner owner, BooleanSupplier cancelled, Consumer<ChatPlanSnapshot> committed) {
        this.service=service; this.owner=owner; this.cancelled=cancelled; this.committed=committed;
    }
    String instructions() { return "\nOptional update_execution_plan replaces your progress declaration, not evidence of success or acceptance. "
            + "There are SIX total calls: up to FOUR original source/tool reads plus TWO plan updates. Read every required source before final answer. "
            + "First expectedRevision is 0; reuse operationId only for identical retry. Preserve returned item IDs; omit IDs only for new items. Empty items explicitly clears the plan. Keep updates concise: the pair shares a finite 16K-character transcript allowance."; }
    public ToolDefinition getToolDefinition() {
        return ToolDefinition.builder().name("update_execution_plan").description("Replace this execution's bounded progress plan; completed is not execution evidence.")
            .inputSchema("""
                {"type":"object","additionalProperties":false,"required":["expectedRevision","operationId","items"],"properties":{
                "expectedRevision":{"type":"integer","minimum":0},"operationId":{"type":"string","format":"uuid"},
                "items":{"type":"array","maxItems":32,"items":{"type":"object","additionalProperties":false,"required":["content","status"],"properties":{
                "id":{"type":"string","format":"uuid"},"content":{"type":"string","minLength":1,"maxLength":500},"status":{"type":"string","enum":["pending","in_progress","completed"]}}}}}
                """).build();
    }
    private org.springframework.ai.tool.execution.ToolExecutionException halt(String code) {
        failure = code;
        return new org.springframework.ai.tool.execution.ToolExecutionException(getToolDefinition(), new IllegalStateException(code));
    }
    private String result(String value) {
        transcriptChars += value.length();
        if (transcriptChars > TRANSCRIPT_CHARS) throw halt(com.lh.eap.error.ChatErrors.CONTEXT_BUDGET_EXCEEDED.code());
        return value;
    }
    public synchronized String call(String input) {
        if (++calls > ChatClients.MAX_PLAN_UPDATES) throw halt(com.lh.eap.error.ToolErrors.TOOL_CALL_LIMIT.code());
        // Failed attempts also enter the next model prompt. Charge raw arguments before validation.
        long attempted = (long) transcriptChars + (input == null ? 0 : input.length()) + 1024;
        if (attempted > TRANSCRIPT_CHARS) throw halt(com.lh.eap.error.ChatErrors.CONTEXT_BUDGET_EXCEEDED.code());
        transcriptChars = (int) attempted;
        try {
            if (input == null || input.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 32768) return result(ChatPlanErrors.INVALID_CHAT_PLAN.code());
            var tree = JSON.readTree(input);
            if (!tree.isObject() || tree.size()!=3 || !tree.has("expectedRevision") || !tree.has("operationId") || !tree.has("items")) return result(ChatPlanErrors.INVALID_CHAT_PLAN.code());
            if (!tree.path("expectedRevision").isIntegralNumber() || !tree.path("expectedRevision").canConvertToLong()
                    || !tree.path("operationId").isString() || !tree.path("items").isArray()) return result(ChatPlanErrors.INVALID_CHAT_PLAN.code());
            for (var item : tree.path("items")) {
                if (!item.isObject() || item.size() != (item.has("id") ? 3 : 2)
                        || !item.path("content").isString() || !item.path("status").isString()
                        || (item.has("id") && !item.path("id").isString())) return result(ChatPlanErrors.INVALID_CHAT_PLAN.code());
            }
            // A successful reply repeats content, allocated IDs and snapshot metadata. Reserve its
            // conservative upper bound before committing; exceeding the cap must end the model loop.
            if ((long) transcriptChars + input.length() + 3072 > TRANSCRIPT_CHARS)
                throw halt(com.lh.eap.error.ChatErrors.CONTEXT_BUDGET_EXCEEDED.code());
            var snapshot = service.update(owner, JSON.readValue(input, ChatPlanService.Command.class), cancelled);
            String reply = result(JSON.writeValueAsString(snapshot));
            committed.accept(snapshot);
            return reply;
        } catch (org.springframework.ai.tool.execution.ToolExecutionException terminal) { throw terminal; }
        catch (org.springframework.web.server.ResponseStatusException rejected) { return result(rejected.getReason()); }
        catch (RuntimeException rejected) { return result(ChatPlanErrors.INVALID_CHAT_PLAN.code()); }
    }
}
