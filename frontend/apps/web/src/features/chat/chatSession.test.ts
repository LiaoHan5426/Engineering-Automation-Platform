import { describe, expect, it } from "vite-plus/test";
import { createChatSession, type ChatApi } from "./chatSession";
import type { AiMessageResult, AiStatus } from "@eap/runtime-client";

function status(state: AiStatus["state"] = "disabled"): AiStatus {
  return {
    state,
    provider: "none",
    model: "",
    configurationRevision: "rev",
    lastObservedAt: null,
    errorCode: "",
    tools: { git_status: false },
    workspaceLabel: "ws-abc",
  };
}

function result(partial: Partial<AiMessageResult> = {}): AiMessageResult {
  return {
    executionId: "exec-1",
    answer: "real",
    error: "",
    status: "SUCCEEDED",
    approval: "NOT_REQUIRED",
    verification: "UNVERIFIED",
    toolEvents: [],
    artifactError: "",
    artifacts: [],
    ...partial,
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("chat session", () => {
  it("loads status without sending a message", async () => {
    let sent = 0;
    const api: ChatApi = {
      aiStatus: async () => status("configured_unverified"),
      openAiConversation: async () => {
        throw new Error("no");
      },
      sendAiMessage: async () => {
        sent += 1;
        return result();
      },
    };
    const session = createChatSession(api);
    await session.refreshStatus();
    expect(session.phase.value).toBe("ready");
    expect(session.status.value?.state).toBe("configured_unverified");
    expect(sent).toBe(0);
    expect(session.turns.value).toEqual([]);
  });

  it("blocks a second send and keeps a failed draft", async () => {
    const pending = deferred<AiMessageResult>();
    let sent = 0;
    const api: ChatApi = {
      aiStatus: async () => status(),
      openAiConversation: async () => ({ conversationId: "c1", workspaceLabel: "ws-abc", memory: "memory" }),
      sendAiMessage: async () => {
        sent += 1;
        return pending.promise;
      },
    };
    const session = createChatSession(api);
    await session.openConversation();
    session.draft.value = "hello";
    const first = session.send();
    session.draft.value = "hello";
    await session.send();
    expect(sent).toBe(1);
    pending.resolve(result({ error: "TOOL_PERMISSION_DENIED", answer: "denied" }));
    await first;
    expect(session.draft.value).toBe("hello");
    expect(session.failure.value).toBe("kept");
    expect(session.turns.value.some((turn) => turn.text === "denied")).toBe(true);
  });

  it("writes a late response only to the conversation that sent it", async () => {
    const pending = deferred<AiMessageResult>();
    const api: ChatApi = {
      aiStatus: async () => status(),
      openAiConversation: async () => ({
        conversationId: session.conversationId.value ? "c2" : "c1",
        workspaceLabel: "ws-abc",
        memory: "memory",
      }),
      sendAiMessage: async () => pending.promise,
    };
    const session = createChatSession(api);
    await session.openConversation();
    session.draft.value = "first";
    const first = session.send();
    await session.openConversation();
    session.draft.value = "second draft";
    pending.resolve(result({ answer: "from-c1" }));
    await first;
    expect(session.conversationId.value).toBe("c2");
    expect(session.draft.value).toBe("second draft");
    expect(session.transcripts.value.c1?.some((turn) => turn.text === "from-c1")).toBe(true);
    expect(session.transcripts.value.c2 ?? []).toEqual([]);
  });

  it("does not show a simulated answer when the model is not configured", async () => {
    const api: ChatApi = {
      aiStatus: async () => status("disabled"),
      openAiConversation: async () => ({ conversationId: "c1", workspaceLabel: "ws-abc", memory: "memory" }),
      sendAiMessage: async () => {
        throw { response: { status: 503, data: { detail: "AI_NOT_CONFIGURED" } } };
      },
    };
    const session = createChatSession(api);
    await session.refreshStatus();
    await session.openConversation();
    session.draft.value = "hello";
    await session.send();
    expect(session.failure.value).toBe("not-configured");
    expect(session.draft.value).toBe("hello");
    expect(session.turns.value).toEqual([]);
    expect(JSON.stringify(session.transcripts.value)).not.toContain("模拟");
  });
});
