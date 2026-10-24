import { computed, ref } from "vue";
import type { AiMessageResult, AiStatus, AiToolMode } from "@eap/runtime-client";

export type ChatApi = {
  aiStatus: () => Promise<AiStatus>;
  openAiConversation: () => Promise<{ conversationId: string; workspaceLabel: string; memory: string }>;
  sendAiMessage: (id: string, message: string, toolMode: AiToolMode) => Promise<AiMessageResult>;
};

export type ChatTurn = {
  role: "user" | "assistant";
  text: string;
  error: string;
  status: string;
  approval: string;
  verification: string;
  toolEvents: Array<{ sequence: number; code: string }>;
  artifactError: string;
  artifacts: AiMessageResult["artifacts"];
};

function httpStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("response" in error)) return undefined;
  const status = (error as { response?: { status?: number } }).response?.status;
  return typeof status === "number" ? status : undefined;
}

export function createChatSession(api: ChatApi) {
  const phase = ref<"loading" | "ready" | "offline">("loading");
  const status = ref<AiStatus | null>(null);
  const conversationId = ref<string | null>(null);
  const workspaceLabel = ref("");
  const memoryNote = ref("");
  const transcripts = ref<Record<string, ChatTurn[]>>({});
  const draft = ref("");
  const toolMode = ref<AiToolMode>("none");
  const failure = ref("");
  const inflight = ref<Record<string, number>>({});
  let ticket = 0;

  const turns = computed(() => (conversationId.value ? transcripts.value[conversationId.value] ?? [] : []));
  const sending = computed(() => (conversationId.value ? inflight.value[conversationId.value] != null : false));

  async function refreshStatus() {
    try {
      status.value = await api.aiStatus();
      phase.value = "ready";
    } catch {
      status.value = null;
      phase.value = "offline";
    }
  }

  async function openConversation() {
    const created = await api.openAiConversation();
    conversationId.value = created.conversationId;
    workspaceLabel.value = created.workspaceLabel;
    memoryNote.value = created.memory;
    if (!transcripts.value[created.conversationId]) {
      transcripts.value = { ...transcripts.value, [created.conversationId]: [] };
    }
    failure.value = "";
    return created;
  }

  function selectConversation(id: string) {
    if (!transcripts.value[id]) return;
    conversationId.value = id;
    failure.value = "";
  }

  function append(id: string, turn: ChatTurn) {
    const existing = transcripts.value[id] ?? [];
    transcripts.value = { ...transcripts.value, [id]: [...existing, turn] };
  }

  async function send() {
    const id = conversationId.value;
    const text = draft.value;
    if (!id || inflight.value[id] != null || !text.trim()) return;
    const mode = toolMode.value;
    const current = ++ticket;
    inflight.value = { ...inflight.value, [id]: current };
    try {
      const result = await api.sendAiMessage(id, text, mode);
      if (inflight.value[id] !== current) return;
      append(id, {
        role: "user",
        text,
        error: "",
        status: "",
        approval: "",
        verification: "",
        toolEvents: [],
        artifactError: "",
        artifacts: [],
      });
      append(id, {
        role: "assistant",
        text: result.answer,
        error: result.error,
        status: result.status,
        approval: result.approval,
        verification: result.verification,
        toolEvents: result.toolEvents ?? [],
        artifactError: result.artifactError,
        artifacts: result.artifacts ?? [],
      });
      if (conversationId.value === id && !result.error) draft.value = "";
      if (conversationId.value === id && result.error) failure.value = "kept";
    } catch (error) {
      if (inflight.value[id] !== current) return;
      if (conversationId.value === id) failure.value = httpStatus(error) === 503 ? "not-configured" : "failed";
    } finally {
      if (inflight.value[id] === current) {
        const next = { ...inflight.value };
        delete next[id];
        inflight.value = next;
      }
    }
  }

  return {
    phase,
    status,
    conversationId,
    workspaceLabel,
    memoryNote,
    transcripts,
    turns,
    draft,
    toolMode,
    failure,
    sending,
    refreshStatus,
    openConversation,
    selectConversation,
    send,
  };
}
