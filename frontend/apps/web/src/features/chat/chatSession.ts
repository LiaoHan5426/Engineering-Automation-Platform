import { computed, ref, watch } from "vue";
import type { AiMessageResult, AiStatus, AiToolMode, ModelConnection, ModelConnectionList, TaskContext, CodeProposal } from "@eap/runtime-client";

export type ChatApi = {
  aiConversation?: (id: string) => Promise<{ workspaceLabel: string; memory: string; connectionId?: string | null }>;
  deleteAiConversation?: (id: string) => Promise<void>;
  aiStatus: () => Promise<AiStatus>;
  openAiConversation: () => Promise<{
    conversationId: string;
    workspaceLabel: string;
    memory: string;
    connectionId?: string | null;
  }>;
  sendAiMessage: (id: string, message: string, toolMode: AiToolMode, context?: TaskContext) => Promise<AiMessageResult>;
  modelConnections?: () => Promise<ModelConnectionList>;
  assignConversationConnection?: (
    id: string,
    connectionId: string,
    confirmTargetChange: boolean,
  ) => Promise<{ connectionId: string; memoryCleared: boolean; connectionName: string; model: string }>;
};

export type ChatTurn = {
  proposal?: CodeProposal | null;
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

export type ConversationHistory = { id: string; title: string; archived: boolean; updatedAt: string; draft: string; workspaceLabel: string; memory: string; connectionId: string | null; expired?: boolean };
export function createChatSession(api: ChatApi, storage?: Pick<Storage, 'getItem' | 'setItem'>) {
  const history = ref<ConversationHistory[]>([]);
  const storageError = ref(false);
  try {
    const saved = JSON.parse(storage?.getItem('eap.chat.history.v1') ?? 'null');
    if (saved?.version === 1 && Array.isArray(saved.items)) history.value = saved.items.filter((x: ConversationHistory) => typeof x.id === 'string' && typeof x.title === 'string' && typeof x.draft === 'string');
  } catch { storageError.value = true; }
  const phase = ref<"loading" | "ready" | "offline">("loading");
  const status = ref<AiStatus | null>(null);
  const conversationId = ref<string | null>(null);
  const workspaceLabel = ref("");
  const memoryNote = ref("");
  const transcripts = ref<Record<string, ChatTurn[]>>({});
  const draft = ref("");
  const expired = ref(false);
  const toolMode = ref<AiToolMode>("none");
  const context = ref<TaskContext>({ mode: "chat", expert: "general", instructions: "", reasoning: "default", approval: "review", files: [], prototypeVersionId: "" });
  const failure = ref("");
  const inflight = ref<Record<string, number>>({});
  const connections = ref<ModelConnection[]>([]);
  const boundConnectionId = ref<string | null>(null);
  const pendingConnectionId = ref<string | null>(null);
  const targetNotice = ref("");
  let ticket = 0;
  try {
    const saved = JSON.parse(storage?.getItem('eap.chat.history.v1') ?? 'null');
    if (saved?.version === 1 && saved.transcripts && typeof saved.transcripts === 'object') {
      for (const item of history.value) if (Array.isArray(saved.transcripts[item.id])) transcripts.value[item.id] = saved.transcripts[item.id];
    }
  } catch { storageError.value = true; }
  function persist() {
    try { storage?.setItem('eap.chat.history.v1', JSON.stringify({ version: 1, items: history.value, transcripts: transcripts.value })); }
    catch { storageError.value = true; }
  }
  watch([history, transcripts], persist, { deep: true, flush: 'sync' });
  watch(draft, (value) => { const item = history.value.find(x => x.id === conversationId.value); if (item) item.draft = value; }, { flush: 'sync' });
  function renameConversation(id: string, title: string) { const item = history.value.find(x => x.id === id); if (item && title.trim()) item.title = title.trim().slice(0, 100); }
  function archiveConversation(id: string, archived: boolean) {
    if (inflight.value[id] != null) return;
    const item = history.value.find(x => x.id === id); if (!item) return;
    item.archived = archived;
    if (archived && conversationId.value === id) { conversationId.value = null; draft.value = ''; boundConnectionId.value = null; pendingConnectionId.value = null; }
  }
  async function deleteConversation(id: string) {
    if (inflight.value[id] != null) return;
    await api.deleteAiConversation?.(id);
    history.value = history.value.filter(x => x.id !== id);
    const next = { ...transcripts.value }; delete next[id]; transcripts.value = next;
    if (conversationId.value === id) { conversationId.value = null; draft.value = ''; boundConnectionId.value = null; pendingConnectionId.value = null; }
  }

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
    history.value.unshift({ id: created.conversationId, title: '', archived: false, updatedAt: new Date().toISOString(), draft: '', workspaceLabel: created.workspaceLabel, memory: created.memory, connectionId: created.connectionId ?? null });
    conversationId.value = created.conversationId;
    draft.value = '';
    expired.value = false;
    workspaceLabel.value = created.workspaceLabel;
    memoryNote.value = created.memory;
    boundConnectionId.value = created.connectionId ?? null;
    pendingConnectionId.value = null;
    targetNotice.value = "";
    if (!transcripts.value[created.conversationId]) {
      transcripts.value = { ...transcripts.value, [created.conversationId]: [] };
    }
    failure.value = "";
    return created;
  }

  async function selectConversation(id: string) {
    if (!transcripts.value[id]) return;
    conversationId.value = id;
    const item = history.value.find(x => x.id === id);
    draft.value = item?.draft ?? '';
    workspaceLabel.value = item?.workspaceLabel ?? '';
    memoryNote.value = item?.memory ?? '';
    boundConnectionId.value = item?.connectionId ?? null;
    pendingConnectionId.value = null;
    targetNotice.value = '';
    context.value = { mode: 'chat', expert: 'general', instructions: '', reasoning: 'default', approval: 'review', files: [], prototypeVersionId: '' };
    failure.value = '';
    expired.value = !!item?.expired;
    if (api.aiConversation) {
      expired.value = true;
      try {
        const live = await api.aiConversation(id);
        if (conversationId.value !== id) return;
        boundConnectionId.value = live.connectionId ?? null;
        expired.value = false;
        if (item) { item.connectionId = live.connectionId ?? null; item.expired = false; }
      } catch (error) {
        if (conversationId.value !== id) return;
        expired.value = true;
        if (item && httpStatus(error) === 404) item.expired = true;
      }
    }
  }

  function append(id: string, turn: ChatTurn) {
    const existing = transcripts.value[id] ?? [];
    transcripts.value = { ...transcripts.value, [id]: [...existing, turn] };
  }

  async function refreshConnections() {
    if (!api.modelConnections) return;
    const page = await api.modelConnections();
    connections.value = page.items;
  }

  function chooseConversationConnection(id: string) {
    if (!conversationId.value || id === boundConnectionId.value) {
      pendingConnectionId.value = null;
      targetNotice.value = "";
      return;
    }
    pendingConnectionId.value = id;
    const target = connections.value.find((item) => item.id === id);
    targetNotice.value = target ? target.name + " · " + target.model : id;
  }

  async function confirmConnectionChange() {
    const id = conversationId.value;
    const next = pendingConnectionId.value;
    if (!id || !next || !api.assignConversationConnection) return;
    const assigned = await api.assignConversationConnection(id, next, true);
    if (conversationId.value !== id) { const previous = history.value.find(x => x.id === id); if (previous) previous.connectionId = assigned.connectionId; return; }
    boundConnectionId.value = assigned.connectionId;
    const item = history.value.find(x => x.id === id); if (item) item.connectionId = assigned.connectionId;
    pendingConnectionId.value = null;
    targetNotice.value = assigned.memoryCleared ? "cleared" : "";
  }

  function cancelConnectionChange() {
    pendingConnectionId.value = null;
    targetNotice.value = "";
  }

  async function send() {
    const id = conversationId.value;
    const text = draft.value;
    if (!id || expired.value || history.value.find(x => x.id === id)?.archived || inflight.value[id] != null || !text.trim() || pendingConnectionId.value) return;
    const entry = history.value.find(x => x.id === id);
    if (entry) { if (!entry.title) entry.title = text.trim().slice(0, 50); entry.updatedAt = new Date().toISOString(); }
    const mode = toolMode.value;
    const current = ++ticket;
    inflight.value = { ...inflight.value, [id]: current };
    try {
      const result = await api.sendAiMessage(id, text, mode, { ...context.value, files: context.value.files.map((file) => ({ ...file })) });
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
        proposal: result.proposal,
        text: result.answer,
        error: result.error,
        status: result.status,
        approval: result.approval,
        verification: result.verification,
        toolEvents: result.toolEvents ?? [],
        artifactError: result.artifactError,
        artifacts: result.artifacts ?? [],
      });
      if (!result.error) { if (entry && entry.draft === text) entry.draft = ""; if (conversationId.value === id && draft.value === text) draft.value = ""; }
      if (conversationId.value === id && result.error) failure.value = "kept";
    } catch (error) {
      if (inflight.value[id] !== current) return;
      if (httpStatus(error) === 404) { if (entry) entry.expired = true; if (conversationId.value === id) expired.value = true; }
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
    inflight, history, storageError, expired, renameConversation, archiveConversation, deleteConversation,
    phase,
    status,
    conversationId,
    workspaceLabel,
    memoryNote,
    transcripts,
    turns,
    draft,
    toolMode,
    context,
    failure,
    sending,
    refreshStatus,
    openConversation,
    selectConversation,
    send,
    connections,
    boundConnectionId,
    pendingConnectionId,
    targetNotice,
    refreshConnections,
    chooseConversationConnection,
    confirmConnectionChange,
    cancelConnectionChange,
  };
}
