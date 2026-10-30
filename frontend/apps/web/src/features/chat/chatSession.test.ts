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

  it("clears the failed send once the same draft succeeds", async () => {
    let calls = 0;
    const api: ChatApi = {
      aiStatus: async () => status("configured_unverified"),
      openAiConversation: async () => ({ conversationId: "c1", workspaceLabel: "ws-abc", memory: "memory" }),
      sendAiMessage: async () => {
        calls += 1;
        if (calls === 1) throw { response: { status: 500 } };
        return result({ answer: "retried" });
      },
    };
    const session = createChatSession(api);
    await session.refreshStatus();
    await session.openConversation();
    session.draft.value = "hello";
    await session.send();
    expect(session.failure.value).toBe("failed");
    expect(session.draft.value).toBe("hello");
    await session.send();
    expect(session.failure.value).toBe("");
    expect(session.draft.value).toBe("");
    expect(session.turns.value.map((turn) => turn.text)).toEqual(["hello", "retried"]);
  });

  it("holds the old conversation until a target change is confirmed", async () => {
    let sent = 0;
    let confirmed = 0;
    const api: ChatApi = {
      aiStatus: async () => status("configured_unverified"),
      openAiConversation: async () => ({
        conversationId: "c1",
        workspaceLabel: "ws-abc",
        memory: "memory",
        connectionId: "old",
      }),
      sendAiMessage: async () => {
        sent += 1;
        return result();
      },
      modelConnections: async () => ({
        items: [
          {
            id: "old",
            name: "旧连接",
            kind: "openai-compatible",
            enabled: true,
            baseUrl: "https://127.0.0.1:9/v1",
            defaultModel: "old-model", models: [{ id: "old-model", reasoningEfforts: [] }], allowedModels: ["old-model"], discoveredAt: "", discoveryError: "",
            secretPresent: true,
            revision: 1,
            defaultSelected: true,

            configurationRevision: "a",
          },
          {
            id: "next",
            name: "新连接",
            kind: "openai-compatible",
            enabled: true,
            baseUrl: "https://127.0.0.1:10/v1",
            defaultModel: "next-model", models: [{ id: "next-model", reasoningEfforts: [] }], allowedModels: ["next-model"], discoveredAt: "", discoveryError: "",
            secretPresent: true,
            revision: 2,
            defaultSelected: false,

            configurationRevision: "b",
          },
        ],
        effectiveDefaultId: "old",
      }),
      assignConversationConnection: async () => {
        confirmed += 1;
        return { connectionId: "next", memoryCleared: true, connectionName: "新连接", model: "next-model" };
      },
    };
    const session = createChatSession(api);
    await session.openConversation();
    await session.refreshConnections();
    session.chooseConversationConnection("next", "next-model");
    session.draft.value = "stay here";
    await session.send();
    expect(sent).toBe(0);
    expect(confirmed).toBe(0);
    expect(session.pendingConnectionId.value).toBe("next");
    expect(session.targetNotice.value).toContain("新连接");
    await session.confirmConnectionChange();
    expect(confirmed).toBe(1);
    expect(session.boundConnectionId.value).toBe("next");
    expect(session.targetNotice.value).toBe("cleared");
    await session.send();
    expect(sent).toBe(1);
  });

  it("says when a confirmed switch keeps server memory", async () => {
    const api: ChatApi = {
      aiStatus: async () => status("configured_unverified"),
      openAiConversation: async () => ({ conversationId: "c1", workspaceLabel: "ws", memory: "memory", connectionId: "old", model: "same-model" }),
      modelConnections: async () => ({
        effectiveDefaultId: "old",
        items: [
          { id: "old", name: "旧连接", kind: "openai-compatible", enabled: true, baseUrl: "https://127.0.0.1:9/v1", defaultModel: "same-model", models: [{ id: "same-model", reasoningEfforts: [] }], allowedModels: ["same-model"], discoveredAt: "", discoveryError: "", secretPresent: true, revision: 1, defaultSelected: true, configurationRevision: "a" },
          { id: "next", name: "新连接", kind: "openai-compatible", enabled: true, baseUrl: "https://127.0.0.1:10/v1", defaultModel: "same-model", models: [{ id: "same-model", reasoningEfforts: [] }], allowedModels: ["same-model"], discoveredAt: "", discoveryError: "", secretPresent: true, revision: 1, defaultSelected: false, configurationRevision: "b" },
        ],
      }),
      assignConversationConnection: async () => ({ connectionId: "next", memoryCleared: false, connectionName: "新连接", model: "same-model" }),
    };
    const session = createChatSession(api);
    await session.openConversation();
    await session.refreshConnections();
    session.chooseConversationConnection("next", "same-model");
    await session.confirmConnectionChange();
    expect(session.boundConnectionId.value).toBe("next");
    expect(session.targetNotice.value).toBe("kept");
  });
});

it('keeps independent drafts, binding and transcripts through switching, reload, archive and deletion', async () => {
  let serial = 0; const deleted: string[] = []; const store = new Map<string,string>();
  const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key,value); } };
  const api: ChatApi = { aiStatus: async () => status(), openAiConversation: async () => ({ conversationId: 'chat-' + ++serial, workspaceLabel: 'ws', memory: 'memory', connectionId: 'model-' + serial }), sendAiMessage: async () => result(), deleteAiConversation: async (id) => { deleted.push(id); } };
  const session = createChatSession(api, storage);
  await session.openConversation(); session.draft.value = 'First request'; await session.send(); session.draft.value = 'First draft';
  await session.openConversation(); session.draft.value = 'Second draft';
  await session.selectConversation('chat-1');
  expect(session.draft.value).toBe('First draft'); expect(session.boundConnectionId.value).toBe('model-1'); expect(session.turns.value).toHaveLength(2);
  session.renameConversation('chat-1', 'Renamed'); session.archiveConversation('chat-1', true);
  expect(session.conversationId.value).toBeNull();
  const restored = createChatSession(api, storage);
  expect(restored.history.value.find(x => x.id === 'chat-1')?.archived).toBe(true);
  restored.archiveConversation('chat-1', false); await restored.selectConversation('chat-1');
  expect(restored.draft.value).toBe('First draft'); expect(restored.history.value.find(x => x.id === 'chat-1')?.title).toBe('Renamed');
  await restored.deleteConversation('chat-1'); expect(deleted).toEqual(['chat-1']); expect(restored.transcripts.value['chat-1']).toBeUndefined();
  await restored.selectConversation('chat-2'); expect(restored.draft.value).toBe('Second draft');
});
it('keeps expired history readable without sending or silently creating a replacement', async () => {
  let sent = 0;
  const api: ChatApi = { aiStatus: async () => status(), openAiConversation: async () => ({ conversationId: 'old', workspaceLabel: 'ws', memory: 'memory' }), aiConversation: async () => { throw { response: { status: 404 } }; }, sendAiMessage: async () => { sent++; return result(); } };
  const session = createChatSession(api); await session.openConversation(); session.draft.value = 'kept'; await session.selectConversation('old'); await session.send();
  expect(session.expired.value).toBe(true); expect(session.draft.value).toBe('kept'); expect(sent).toBe(0);
});

it('creates the first conversation on send and assigns an explicitly selected model without losing prototype context', async () => {
  const requests: unknown[] = [];
  const api: ChatApi = {
    aiStatus: async () => status(),
    openAiConversation: async () => ({ conversationId: 'first', workspaceLabel: 'ws', memory: 'memory' }),
    assignConversationConnection: async (id, connection, confirmed, model) => {
      requests.push([id, connection, confirmed, model]);
      return { connectionId: connection, connectionName: 'desk', model, memoryCleared: false };
    },
    sendAiMessage: async (id, message, tool, context) => { requests.push([id, message, tool, context?.prototypeVersionId]); return result(); },
  };
  const session = createChatSession(api);
  session.draft.value = 'Implement this prototype';
  session.context.value.prototypeVersionId = 'saved-version';
  session.context.value.mode = 'code';
  session.chooseConversationConnection('desk', 'model-b');
  await session.send();
  expect(requests).toEqual([['first', 'desk', true, 'model-b'], ['first', 'Implement this prototype', 'none', 'saved-version']]);
  expect(session.boundModel.value).toBe('model-b');
  expect(session.turns.value[0].model).toBe('model-b');
});

it('preserves per-conversation context and restores the active conversation after returning from settings', async () => {
  let serial = 0;
  const store = new Map<string, string>();
  const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value); } };
  const api: ChatApi = { aiStatus: async () => status(), openAiConversation: async () => ({ conversationId: 'c' + ++serial, workspaceLabel: 'ws', memory: 'memory', connectionId: 'desk', model: 'model-a' }), sendAiMessage: async () => result() };
  const session = createChatSession(api, storage);
  await session.openConversation();
  session.context.value.instructions = 'Keep project conventions';
  session.context.value.files = [{ name: 'reference.md', content: 'Reference' }];
  await session.openConversation();
  session.context.value.instructions = 'Another task';
  await session.selectConversation('c1');
  expect(session.context.value.instructions).toBe('Keep project conventions');
  expect(session.context.value.files[0].name).toBe('reference.md');
  const restored = createChatSession(api, storage);
  await restored.restoreLastConversation();
  expect(restored.conversationId.value).toBe('c1');
  expect(restored.boundModel.value).toBe('model-a');
  expect(restored.context.value.instructions).toBe('Keep project conventions');
});

it('keeps a new draft local until the first message', async () => {
  let opened = 0;
  const api: ChatApi = { aiStatus: async () => status(), openAiConversation: async () => { opened += 1; return { conversationId: 'made', workspaceLabel: 'ws', memory: 'memory' }; }, sendAiMessage: async () => result() };
  const session = createChatSession(api);
  await session.openConversation();
  session.draft.value = '已有草稿';
  session.beginDraft();
  expect(opened).toBe(1);
  expect(session.conversationId.value).toBeNull();
  expect(session.draft.value).toBe('');
  session.draft.value = '第一条';
  await session.send();
  expect(opened).toBe(2);
  expect(session.history.value[0]?.title).toBe('第一条');
});
