import { computed, ref, watch } from "vue";
import type { AiMessageResult, AiStatus, AiToolMode, ModelConnection, ModelConnectionList, TaskContext, CodeProposal } from "@eap/runtime-client";

export type ChatApi = {
  aiConversation?: (id: string) => Promise<{ workspaceLabel: string; memory: string; connectionId?: string | null; model?: string | null }>;
  deleteAiConversation?: (id: string) => Promise<void>;
  aiStatus: () => Promise<AiStatus>;
  openAiConversation: () => Promise<{
    conversationId: string;
    workspaceLabel: string;
    memory: string;
    connectionId?: string | null;
    model?: string | null;
  }>;
  sendAiMessage: (id: string, message: string, toolMode: AiToolMode, context?: TaskContext) => Promise<AiMessageResult>;
  modelConnections?: () => Promise<ModelConnectionList>;
  assignConversationConnection?: (
    id: string,
    connectionId: string,
    confirmTargetChange: boolean,
    model: string,
  ) => Promise<{ connectionId: string; memoryCleared: boolean; connectionName: string; model: string }>;
};

export type ChatTurn = {
  proposal?: CodeProposal | null;
  model?: string;
  connectionName?: string;
  reasoning?: string;
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

export type ConversationHistory = { id: string; title: string; archived: boolean; updatedAt: string; draft: string; workspaceLabel: string; memory: string; connectionId: string | null; model?: string; context?: TaskContext; expired?: boolean };
export function createChatSession(api: ChatApi, storage?: Pick<Storage, 'getItem' | 'setItem'>) {
  const history = ref<ConversationHistory[]>([]);
  const storageError = ref(false);
  try {
    const saved = JSON.parse(storage?.getItem('eap.chat.history.v1') ?? 'null');
    if (saved?.version === 1 && Array.isArray(saved.items)) history.value = saved.items.filter((x: ConversationHistory) => typeof x.id === 'string' && typeof x.title === 'string' && typeof x.draft === 'string');
  } catch { storageError.value = true; }
  const opening = ref(false);
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
  const boundModel = ref("");
  const pendingModel = ref("");
  const targetNotice = ref("");
  let ticket = 0;
  try {
    const saved = JSON.parse(storage?.getItem('eap.chat.history.v1') ?? 'null');
    if (saved?.version === 1 && saved.transcripts && typeof saved.transcripts === 'object') {
      for (const item of history.value) if (Array.isArray(saved.transcripts[item.id])) transcripts.value[item.id] = saved.transcripts[item.id];
    }
  } catch { storageError.value = true; }
  watch(context, value => { const item = history.value.find(row => row.id === conversationId.value); if (item) item.context = JSON.parse(JSON.stringify(value)); else persist(); }, { deep: true, flush: 'sync' });
  function persist() {
    try { storage?.setItem('eap.chat.history.v1', JSON.stringify({ version: 1, items: history.value, transcripts: transcripts.value, activeId: conversationId.value, scratch: conversationId.value ? null : { draft: draft.value, context: context.value } })); }
    catch { storageError.value = true; }
  }
  watch([history, transcripts, conversationId], persist, { deep: true, flush: 'sync' });
  watch(draft, (value) => { const item = history.value.find(x => x.id === conversationId.value); if (item) item.draft = value; else persist(); }, { flush: 'sync' });
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

  async function restoreLastConversation() {
    try {
      const saved = JSON.parse(storage?.getItem('eap.chat.history.v1') ?? 'null');
      if (saved?.activeId && history.value.some(item => item.id === saved.activeId && !item.archived)) await selectConversation(saved.activeId);
      else if (saved?.scratch && typeof saved.scratch.draft === 'string') { draft.value = saved.scratch.draft; if (saved.scratch.context) context.value = saved.scratch.context; }
    } catch { storageError.value = true; }
  }

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
    if (opening.value) throw new Error("CONVERSATION_BUSY");
    opening.value = true;
    try {
    const created = await api.openAiConversation();
    history.value.unshift({ id: created.conversationId, title: '', archived: false, updatedAt: new Date().toISOString(), draft: '', workspaceLabel: created.workspaceLabel, memory: created.memory, connectionId: created.connectionId ?? null, model: created.model ?? '' });
    conversationId.value = created.conversationId;
    draft.value = '';
    expired.value = false;
    workspaceLabel.value = created.workspaceLabel;
    memoryNote.value = created.memory;
    boundConnectionId.value = created.connectionId ?? null;
    boundModel.value = created.model ?? "";
    context.value = { mode: "chat", expert: "general", instructions: "", reasoning: "default", approval: "review", files: [], prototypeVersionId: "" };
    pendingConnectionId.value = null;
    targetNotice.value = "";
    if (!transcripts.value[created.conversationId]) {
      transcripts.value = { ...transcripts.value, [created.conversationId]: [] };
    }
    failure.value = "";
    return created;
    } finally { opening.value = false; }
  }

  async function selectConversation(id: string) {
    if (!transcripts.value[id]) return;
    conversationId.value = id;
    const item = history.value.find(x => x.id === id);
    draft.value = item?.draft ?? '';
    workspaceLabel.value = item?.workspaceLabel ?? '';
    memoryNote.value = item?.memory ?? '';
    boundConnectionId.value = item?.connectionId ?? null;
    boundModel.value = item?.model ?? "";
    pendingConnectionId.value = null;
    targetNotice.value = '';
    context.value = item?.context ? structuredClone(JSON.parse(JSON.stringify(item.context))) : { mode: 'chat', expert: 'general', instructions: '', reasoning: 'default', approval: 'review', files: [], prototypeVersionId: '' };
    failure.value = '';
    expired.value = !!item?.expired;
    if (api.aiConversation) {
      expired.value = true;
      try {
        const live = await api.aiConversation(id);
        if (conversationId.value !== id) return;
        boundConnectionId.value = live.connectionId ?? null;
        boundModel.value = live.model ?? "";
        expired.value = false;
        if (item) { item.connectionId = live.connectionId ?? null; item.model = live.model ?? ""; item.expired = false; }
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
    if (!conversationId.value && !pendingConnectionId.value) {
      const selected = page.items.find(item => item.id === page.effectiveDefaultId && item.enabled && item.allowedModels.includes(item.defaultModel));
      if (selected) chooseConversationConnection(selected.id, selected.defaultModel);
    }
  }

  function chooseConversationConnection(id: string, model: string) {
    if (sending.value) return;
    if (id === boundConnectionId.value && model === boundModel.value && failure.value !== "target-changed") {
      pendingConnectionId.value = null;
      targetNotice.value = "";
      return;
    }
    pendingConnectionId.value = id;
    pendingModel.value = model;
    const target = connections.value.find((item) => item.id === id);
    targetNotice.value = target ? target.name + " · " + model : id;
  }

  async function confirmConnectionChange() {
    const id = conversationId.value;
    const next = pendingConnectionId.value;
    if (!id || !next || !api.assignConversationConnection) return;
    let assigned;
    try { assigned = await api.assignConversationConnection(id, next, true, pendingModel.value); }
    catch { failure.value = "target-change-failed"; return; }
    if (conversationId.value !== id) { const previous = history.value.find(x => x.id === id); if (previous) { previous.connectionId = assigned.connectionId; previous.model = assigned.model; } return; }
    boundConnectionId.value = assigned.connectionId;
    boundModel.value = assigned.model;
    failure.value = "";
    const item = history.value.find(x => x.id === id); if (item) { item.connectionId = assigned.connectionId; item.model = assigned.model; }
    pendingConnectionId.value = null;
    targetNotice.value = assigned.memoryCleared ? "cleared" : "";
  }

  function cancelConnectionChange() {
    pendingConnectionId.value = null;
    targetNotice.value = "";
  }

  async function send() {
    if (opening.value) return;
    if (!conversationId.value && draft.value.trim()) {
      const text = draft.value; const selectedContext = JSON.parse(JSON.stringify(context.value)) as TaskContext;
      const nextId = pendingConnectionId.value; const nextModel = pendingModel.value;
      try { await openConversation(); draft.value = text; context.value = selectedContext;
        if (nextId) { chooseConversationConnection(nextId, nextModel); await confirmConnectionChange(); }
      } catch { draft.value = text; context.value = selectedContext; failure.value = "failed"; return; }
    }
    const id = conversationId.value;
    const text = draft.value;
    if (!id || expired.value || history.value.find(x => x.id === id)?.archived || inflight.value[id] != null || !text.trim() || pendingConnectionId.value) return;
    const entry = history.value.find(x => x.id === id);
    if (entry) { if (!entry.title) entry.title = text.trim().slice(0, 50); entry.updatedAt = new Date().toISOString(); }
    if (entry) entry.context = JSON.parse(JSON.stringify(context.value)) as TaskContext;
    const requestMetadata = { model: boundModel.value, connectionName: connections.value.find(item => item.id === boundConnectionId.value)?.name ?? "", reasoning: context.value.reasoning };
    const mode = toolMode.value;
    const current = ++ticket;
    inflight.value = { ...inflight.value, [id]: current };
    try {
      const result = await api.sendAiMessage(id, text, mode, { ...context.value, files: context.value.files.map((file) => ({ ...file })) });
      if (inflight.value[id] !== current) return;
      append(id, {
        ...requestMetadata,
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
        ...requestMetadata,
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
      if (conversationId.value === id) failure.value = httpStatus(error) === 409 ? "target-changed" : httpStatus(error) === 403 ? "model-unavailable" : httpStatus(error) === 503 ? "not-configured" : "failed";
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
    opening,
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
    restoreLastConversation,
    openConversation,
    selectConversation,
    send,
    connections,
    boundConnectionId,
    boundModel,
    pendingModel,
    pendingConnectionId,
    targetNotice,
    refreshConnections,
    chooseConversationConnection,
    confirmConnectionChange,
    cancelConnectionChange,
  };
}
