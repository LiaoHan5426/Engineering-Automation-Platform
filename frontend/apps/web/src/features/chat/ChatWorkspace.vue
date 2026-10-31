<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch, watchEffect } from "vue";
import { useI18n } from "vue-i18n";
import { DropdownMenu, Badge, Button, Checkbox, Feedback, InfiniteScroll, Input, Textarea, Collapse, WorkbenchFrame, Drawer } from "@eap/ui";
import { type AiConnectionState } from "@eap/runtime-client";
import { errorMessage } from "../../lib/presentation";
import { createChatSession } from "./chatSession";
import ConnectionDialog from "../../components/ConnectionDialog.vue";
import SessionPanel from "../../components/SessionPanel.vue";
import WorkspaceWelcome from "../../components/WorkspaceWelcome.vue";
import { chatService, chatStorage } from './chatService';
import { preview } from '../shell/preview';
import TaskComposer from "./TaskComposer.vue";
import type { CodeProposal } from "@eap/runtime-client";
import { catalogRefreshNote, type CatalogNote } from "./catalogNote";
import { readFeedScroll, saveFeedScroll } from "./feedScroll";
import { outgoingInstructions } from "./outgoing";
import { applyFailureCode, applyFailureMessage } from "./applyError";
import { pendingWrite } from "./pendingWrite";
import { reasoningForModel, type ReasoningLevel } from "./reasoningChoice";
import { adoptScratch, applyScenario, assignSessionProject, chatBinding, currentExtras, rememberPanel, rememberSessionExecution, restorePanel, scenarios, takeBoardDraft, workbench } from "../shell/workbench";
import { applyRuntimeIdentity, identityFromStatus, identityPath, refreshWorkspaceDirty, runtimeIdentity } from "../shell/runtimeIdentity";

const { t } = useI18n();
const props = withDefaults(defineProps<{ active?: boolean; mock?: boolean }>(), { active: true, mock: false });
const feedPort = ref<{ getEl: () => HTMLElement | null } | null>(null);
const shownTurns = ref(40);
const loadingOlder = ref(false);
const holdingFeed = ref(false);
function feed() { return feedPort.value?.getEl() ?? null; }
let restoringFeed = false;
function feedKey(id: string | null | undefined) { return id || "scratch"; }
function onFeedScroll(event: Event) {
  if (restoringFeed || !props.active) return;
  const feedNode = event.currentTarget;
  if (feedNode instanceof HTMLElement) saveFeedScroll(feedKey(session.conversationId.value), feedNode.scrollTop);
}
function restoreFeed(id: string | null | undefined) {
  restoringFeed = true;
  holdingFeed.value = true;
  const apply = () => {
    const node = feed();
    if (node) node.scrollTop = readFeedScroll(feedKey(id));
  };
  const raf = typeof requestAnimationFrame === "function"
    ? requestAnimationFrame
    : (cb: FrameRequestCallback) => setTimeout(cb, 0) as unknown as number;
  void nextTick(() => {
    apply();
    raf(() => {
      apply();
      raf(() => { restoringFeed = false; holdingFeed.value = false; });
    });
  });
}
watch(() => props.active, active => {
  if (!active) saveFeedScroll(feedKey(session.conversationId.value), feed()?.scrollTop ?? 0);
  else {
    void session.refreshConnections().catch(error => { historyNote.value = errorMessage(error); });
    void session.refreshStatus();
    restoreFeed(session.conversationId.value);
  }
});
const importingPrototype = typeof sessionStorage !== "undefined" && !!sessionStorage.getItem("eap.chat.prototype");
const api = chatService();
const session = createChatSession(api, typeof localStorage === "undefined" ? undefined : chatStorage(props.mock, localStorage));
const visibleTurns = computed(() => {
  const all = session.turns.value;
  const start = Math.max(0, all.length - shownTurns.value);
  return all.slice(start).map((turn, offset) => ({ turn, key: start + offset }));
});
const hasOlderTurns = computed(() => shownTurns.value < session.turns.value.length);
watch(() => session.turns.value.length, (length, previous) => {
  if (previous != null && length > previous && shownTurns.value > 40) shownTurns.value += length - previous;
});
function showOlderTurns() {
  if (loadingOlder.value || !hasOlderTurns.value) return;
  const node = feed();
  const before = node?.scrollHeight ?? 0;
  const top = node?.scrollTop ?? 0;
  loadingOlder.value = true;
  shownTurns.value = Math.min(session.turns.value.length, shownTurns.value + 40);
  void nextTick(() => {
    if (node) node.scrollTop = top + node.scrollHeight - before;
    loadingOlder.value = false;
  });
}
async function importMockHandoff() {
  if (!props.mock || !props.active || !workbench.pendingMockHandoff) return;
  workbench.pendingMockHandoff = false;
  const draft = preview.current(workbench.workMode);
  await session.openConversation();
  session.draft.value = draft.draft;
  session.context.value = JSON.parse(JSON.stringify(draft.context));
  if (session.conversationId.value) {
    const source = workbench.sessionExtras[draft.id];
    const executionMode = source?.executionMode ?? draft.execution;
    workbench.sessionExtras[session.conversationId.value] = {
      scenarioId: source?.scenarioId ?? null,
      experts: [...(source?.experts ?? [])],
      resources: [...(source?.resources ?? [])],
      projectId: source?.projectId ?? workbench.selectedProjectId,
      executionMode: executionMode === "plan" || executionMode === "agent" ? executionMode : "chat",
      delivery: source?.delivery,
    };
    workbench.executionMode = workbench.sessionExtras[session.conversationId.value]?.executionMode ?? "chat";
  }
}
watch(() => [props.active, workbench.pendingMockHandoff], () => { void importMockHandoff(); });
const manageId = ref<string | null>(null);
const manageTitle = ref('');
const deleteId = ref<string | null>(null);
const historyNote = ref('');
const boardNote = ref("");
watch(() => [props.active, workbench.pendingBoardDraft] as const, () => {
  const draft = takeBoardDraft(props.active);
  if (draft) {
    if (!session.conversationId.value && !session.draft.value.trim()) session.draft.value = draft.title;
    boardNote.value = t("desktop.boardDraftKept", { title: draft.title });
  }
}, { immediate: true });
const deleting = ref(false);
const moreOpen = ref(false);
function applyPendingDraft() {
  const seeded = workbench.pendingDraft.trim();
  if (!seeded) return;
  if (!session.draft.value.trim()) session.draft.value = seeded;
  workbench.pendingDraft = "";
}
function newConversation() {
  historyNote.value = "";
  session.beginDraft();
  // Bind the draft to the currently selected local group (or clear for free chat).
  assignSessionProject(session.conversationId.value || "scratch", workbench.selectedProjectId);
  applyPendingDraft();
}
watch(() => workbench.pendingNewChat, (pending) => {
  if (pending && props.active) { workbench.pendingNewChat = false; void newConversation(); }
});
watch(() => [props.active, workbench.pendingDraft] as const, () => {
  if (props.active && workbench.pendingDraft.trim() && !session.draft.value.trim()) applyPendingDraft();
});
watch(() => session.conversationId.value, (id, previous) => {
  rememberSessionExecution(id);
  restorePanel(id);
  if (previous !== undefined) saveFeedScroll(feedKey(previous), feed()?.scrollTop ?? 0);
  shownTurns.value = 40;
  void nextTick(() => restoreFeed(id));
}, { immediate: true });
/** Right-anchored rails shrink conversation width (摘要 / 变更). */
const railMode = computed(() => {
  const panel = workbench.panel;
  return panel === "summary" || panel === "changes" ? panel : null;
});
/** Sources opens as a floating overlay with an expandable tree — not a full-page enter-dir browser. */
const filesOverlayOpen = computed(() => workbench.panel === "files");
/** Terminal docks under the conversation and shrinks height — not a right rail. */
const terminalDockOpen = computed(() => workbench.panel === "terminal");
function choosePanel(id: "summary" | "changes" | "files" | "terminal") {
  moreOpen.value = false;
  rememberPanel(session.conversationId.value, workbench.panel === id ? null : id);
}
const canRibbonRetry = computed(() => {
  const failure = session.failure.value;
  if (failure !== "failed" && failure !== "kept" && failure !== "not-configured") return false;
  if (session.sending.value || !session.draft.value.trim()) return false;
  if (!props.mock && (workbench.executionMode === "agent" || workbench.executionMode === "plan")) return false;
  return true;
});
function closePanel() {
  rememberPanel(session.conversationId.value, null);
}
function openFromSummary(target: "changes" | "files" | "terminal" | "composer" | "policy") {
  if (target === "policy") {
    closePanel();
    workbench.policyMenuToken += 1;
    return;
  }
  if (target === "composer") {
    closePanel();
    void nextTick(() => document.querySelector<HTMLTextAreaElement>("textarea.composer-draft")?.focus());
    return;
  }
  rememberPanel(session.conversationId.value, target);
}
const archived = computed(() => !!session.history.value.find(x => x.id === session.conversationId.value)?.archived);
function statusTone() {
  if (session.expired.value || archived.value) return "warning";
  if (props.mock) return "neutral";
  const state = session.status.value?.state;
  return state === "available" ? "success" : state === "error" ? "danger" : "warning";
}
async function removeConversation() {
  if (!deleteId.value) return;
  deleting.value = true;
  try { await session.deleteConversation(deleteId.value); deleteId.value = null; }
  catch (error) { historyNote.value = errorMessage(error); }
  finally { deleting.value = false; }
}
const refused = ref<Record<string, boolean>>({});
const conflicted = ref<Record<string, boolean>>({});
const applied = ref<Record<string, string[]>>({});
const appliedVerification = ref<Record<string, string>>({});
const appliedChecks = ref<Record<string, Array<{ name: string; exitCode: number | null; summary: string }>>>({});
function refuseProposal(id: string) { refused.value = { ...refused.value, [id]: true }; }
const applying = ref<string | null>(null);
const proposalNote = ref("");
const writeConfirmed = ref<Record<string, boolean>>({});
const modelChoices = computed(() => session.connections.value.filter(item => item.enabled).flatMap(item =>
  item.models.filter(model => item.allowedModels.includes(model.id)).map(model => ({ key: JSON.stringify([item.id, model.id]), kind: item.kind, connectionId: item.id, name: item.name, model: model.id, efforts: model.reasoningEfforts }))));
const modelSelection = computed(() => JSON.stringify([session.pendingConnectionId.value || session.boundConnectionId.value, session.pendingConnectionId.value ? session.pendingModel.value : session.boundModel.value]));
const selectedModel = computed(() => modelChoices.value.find(item => item.connectionId === (session.pendingConnectionId.value || session.boundConnectionId.value) && item.model === (session.pendingConnectionId.value ? session.pendingModel.value : session.boundModel.value)));
watch(selectedModel, model => { if (model?.kind === "chatgpt-plan") session.toolMode.value = "none"; });
const reasoningEfforts = computed(() => selectedModel.value?.efforts ?? []);
const boundEfforts = computed(() => modelChoices.value.find(item => item.connectionId === session.boundConnectionId.value && item.model === session.boundModel.value)?.efforts ?? []);
const effortReset = ref<"" | ReasoningLevel>("");
watch(boundEfforts, values => {
  const next = reasoningForModel(session.context.value.reasoning, values);
  if (!next.reset) return;
  session.context.value.reasoning = next.reasoning;
  effortReset.value = next.reset;
});
watch(() => session.context.value.reasoning, value => { if (value !== "default") effortReset.value = ""; });
function chooseModel(key: string) { const target = modelChoices.value.find(item => item.key === key); if (target) session.chooseConversationConnection(target.connectionId, target.model); }
const catalogNote = ref<CatalogNote | null>(null);
const modelsRefreshing = ref(false);
async function refreshModels() {
  if (modelsRefreshing.value) return;
  modelsRefreshing.value = true;
  const id = session.pendingConnectionId.value || session.boundConnectionId.value;
  try {
    const refreshed = id ? await api.refreshConnectionModels(id) : null;
    await session.refreshConnections();
    const current = session.connections.value.find(item => item.id === id) ?? refreshed;
    if (id === (session.pendingConnectionId.value || session.boundConnectionId.value)) catalogNote.value = catalogRefreshNote({ discoveryError: current?.discoveryError, discoveredAt: current?.discoveredAt });
  } catch (error) {
    try { await session.refreshConnections(); } catch { /* the list already on screen stays */ }
    const current = id ? session.connections.value.find(item => item.id === id) : undefined;
    if (id === (session.pendingConnectionId.value || session.boundConnectionId.value)) catalogNote.value = catalogRefreshNote({ discoveryError: current?.discoveryError, discoveredAt: current?.discoveredAt, requestError: errorMessage(error) });
  }
  finally { modelsRefreshing.value = false; }
}
watchEffect(() => {
  applyRuntimeIdentity(session.status.value);
  void refreshWorkspaceDirty(runtimeIdentity.value);
});
const displayWorkspacePath = computed(() => {
  const status = session.status.value;
  return identityPath(identityFromStatus(status)) || status?.workspaceLabel || "";
});
watchEffect(() => {
  const proposal = [...session.turns.value].reverse().find((turn) => turn.proposal)?.proposal;
  const activeId = session.conversationId.value;
  const extras = workbench.sessionExtras[activeId ?? "scratch"];
  chatBinding.value = {
    history: session.history.value.map((item) => ({ id: item.id, title: item.title, archived: item.archived, updatedAt: item.updatedAt })),
    activeId,
    busyIds: Object.keys(session.inflight.value).filter((id) => session.inflight.value[id] != null),
    rename: (id: string) => {
      const item = session.history.value.find((row) => row.id === id);
      manageId.value = id;
      manageTitle.value = item?.title?.trim() || t("desktop.freeChat");
    },
    archive: (id: string) => { const item = session.history.value.find((row) => row.id === id); if (item) session.archiveConversation(id, !item.archived); },
    remove: (id: string) => { deleteId.value = id; historyNote.value = ""; },
    references: [...session.context.value.files.map((file) => file.name), ...(session.context.value.prototypeVersionId ? [session.context.value.prototypeVersionId] : [])],
    localFiles: session.context.value.files.map((file) => file.name),
    versionId: session.context.value.prototypeVersionId,
    draft: session.draft.value,
    sending: session.sending.value,
    workspaceLabel: session.workspaceLabel.value && session.workspaceLabel.value !== "Mock workspace" ? session.workspaceLabel.value : session.status.value?.workspaceLabel || session.workspaceLabel.value,
    memory: session.memoryNote.value,
    model: session.pendingModel.value || session.boundModel.value,
    connectionName: selectedModel.value?.name ?? "",
    approval: session.context.value.approval,
    goal: session.context.value.mode,
    executionMode: extras?.executionMode ?? workbench.executionMode,
    scenarioId: extras?.scenarioId ?? null,
    proposalFiles: proposal?.files.map((file) => file.path) ?? [],
    appliedFiles: proposal ? applied.value[proposal.id] ?? [] : [],
    proposal,
    writeRefused: proposal ? !!refused.value[proposal.id] : false,
    verification: (proposal && appliedVerification.value[proposal.id]) || proposal?.verification || "not_requested",
    verificationChecks: proposal ? appliedChecks.value[proposal.id] ?? [] : [],
    select: (id: string) => { void session.selectConversation(id); },
    create: () => { void newConversation(); },
  };
});
onUnmounted(() => {
  if (chatBinding.value?.activeId === session.conversationId.value) chatBinding.value = null;
});
function useScene(id: string) {
  // Re-clicking the selected scene clears it (frame-064 chip remove parity).
  if (currentExtras().scenarioId === id) {
    currentExtras().scenarioId = null;
    return;
  }
  applyScenario(id);
}
watch(() => workbench.workMode, (mode) => {
  const id = currentExtras().scenarioId;
  if (!id) return;
  const scene = scenarios.find((item) => item.id === id);
  if (!scene || !scene.modes.includes(mode) || scene.status === "disabled") currentExtras().scenarioId = null;
});
const outgoingText = computed(() => {
  const extras = currentExtras();
  return outgoingInstructions({
    instructions: session.context.value.instructions,
    scene: scenarios.find((item) => item.id === extras.scenarioId)?.instructions || "",
    guidance: extras.experts.map((item) => item.guidance).join("\n"),
    plan: workbench.executionMode === "plan",
  });
});
async function sendTask() {
  if (!props.mock && (workbench.executionMode === 'agent' || workbench.executionMode === 'plan')) return;
  const extras = currentExtras();
  const guidance = extras.experts.map(item => item.guidance).join('\n');
  const sceneInstructions = scenarios.find(item => item.id === extras.scenarioId)?.instructions || '';
  const original = session.context.value.instructions;
  const originalMode = session.context.value.mode;
  const originalApproval = session.context.value.approval;
  if (workbench.executionMode === 'plan') {
    session.context.value.mode = 'chat'; session.context.value.approval = 'read_only'; session.toolMode.value = 'none';
  } else if (workbench.executionMode === 'agent') session.context.value.mode = 'code';
  session.context.value.instructions = outgoingInstructions({ instructions: original, scene: sceneInstructions, guidance, plan: workbench.executionMode === 'plan' });
  const before = session.conversationId.value;
  try { await session.send(); }
  finally {
    session.context.value.instructions = original;
    session.context.value.mode = originalMode;
    session.context.value.approval = originalApproval;
    if (!before && session.conversationId.value) {
      adoptScratch(session.conversationId.value);
      assignSessionProject(session.conversationId.value, workbench.selectedProjectId);
    }
  }
}
function turnPending(turn: { proposal?: CodeProposal | null }) {
  if (!turn.proposal) return "desktop.pendingNone";
  const state = pendingWrite({
    policy: session.context.value.approval,
    files: turn.proposal.files,
    applied: !!applied.value[turn.proposal.id]?.length,
    refused: !!refused.value[turn.proposal.id],
    conflict: !!conflicted.value[turn.proposal.id],
  });
  return `desktop.pending${state.charAt(0).toUpperCase()}${state.slice(1)}`;
}
function baselineReady(proposal: CodeProposal) {
  return proposal.files.length > 0 && proposal.files.every((file) => file.baseHash.trim().length > 0);
}
async function applyProposal(proposal: CodeProposal) {
  if (!baselineReady(proposal) || !writeConfirmed.value[proposal.id] || applying.value || session.context.value.approval === "read_only") return;
  applying.value = proposal.id;
  proposalNote.value = "";
  try {
    const result = await api.applyCodeProposal(proposal.conversationId, proposal.id);
    conflicted.value = { ...conflicted.value, [proposal.id]: false };
    applied.value = { ...applied.value, [proposal.id]: result.written };
    appliedVerification.value = { ...appliedVerification.value, [proposal.id]: result.verification };
    appliedChecks.value = { ...appliedChecks.value, [proposal.id]: result.checks ?? [] };
    proposalNote.value = props.mock ? t('preview.boundary') : t("task.written");
  } catch (error) {
    if (applyFailureCode(error) === "FILE_CHANGED_SINCE_PROPOSAL") {
      conflicted.value = { ...conflicted.value, [proposal.id]: true };
      writeConfirmed.value = { ...writeConfirmed.value, [proposal.id]: false };
    }
    proposalNote.value = applyFailureMessage(error, t);
  }
  finally { applying.value = null; }
}
const stateKey: Record<AiConnectionState, string> = {
  disabled: "chat.disabled",
  not_configured: "chat.not_configured",
  configured_unverified: "chat.configured_unverified",
  available: "chat.available",
  error: "chat.error",
};

onMounted(async () => {
  void session.refreshStatus();
  try { await session.refreshConnections(); if (!importingPrototype) await session.restoreLastConversation(); } catch (error) { historyNote.value = errorMessage(error); }
  await importMockHandoff();
});
</script>

<template>
  <section class="view work-page chat-workspace preview-workspace live-workspace" data-testid="chat-workspace">
    <div class="page-head chat-page-head live-utilities">
      <div v-if="session.phase.value === 'loading'" class="session-status"><p class="hint">{{ t("chat.loading") }}</p></div>
      <div v-else-if="session.phase.value === 'offline'" class="session-status"><p class="hint">{{ t("chat.offline") }}</p></div>
      <div v-else class="session-status">
        <Badge v-if="!mock" :tone="statusTone()" :label="t(stateKey[session.status.value?.state ?? 'disabled'])" />
        <p v-if="session.status.value?.errorCode" class="hint">{{ session.status.value.errorCode }}</p>
        <p class="hint session-path" data-testid="session-workspace-path" :title="[displayWorkspacePath ? `${t('chat.workspace')}：${displayWorkspacePath}` : '', session.status.value?.workspaceLabel ? `id：${session.status.value.workspaceLabel}` : '', session.memoryNote.value ? `${t('chat.memory')}：${session.memoryNote.value}` : ''].filter(Boolean).join(' · ')">{{ displayWorkspacePath }}</p>
      </div>
      <div class="session-tools">
        <Button size="sm" variant="ghost" type="button" class="shell-tool" data-testid="ribbon-retry" :disabled="!canRibbonRetry" :title="canRibbonRetry ? t('desktop.retrySend') : t('desktop.retryIdleHint')" @click="sendTask">{{ t("desktop.retryShort") }}</Button>
        <Button size="sm" variant="ghost" type="button" class="shell-tool" data-testid="open-summary" :aria-pressed="workbench.panel === 'summary'" @click="choosePanel('summary')">{{ t("desktop.summary") }}</Button>
        <Button size="sm" variant="ghost" type="button" class="shell-tool" data-testid="open-terminal" :aria-pressed="workbench.panel === 'terminal'" :title="t('desktop.terminalDockHint')" @click="choosePanel('terminal')">{{ t("desktop.terminal") }}</Button>
        <Button size="sm" variant="ghost" type="button" class="shell-tool" data-testid="open-changes" :aria-pressed="workbench.panel === 'changes'" @click="choosePanel('changes')">{{ t("desktop.changes") }}</Button>
        <Button size="sm" variant="ghost" type="button" class="shell-tool" data-testid="open-files" :aria-pressed="workbench.panel === 'files'" @click="choosePanel('files')">{{ t("desktop.sources") }}</Button>
        <DropdownMenu v-model:open="moreOpen" :label="t('desktop.moreActions')" data-testid="ribbon-more-menu" :items="[
          { id: 'export', label: t('desktop.moreExport'), disabled: true, description: t('desktop.moreExportOff') },
          { id: 'share', label: t('desktop.moreShare'), disabled: true, description: t('desktop.moreShareOff') },
        ]">
          <Button size="sm" variant="icon" type="button" class="shell-tool" data-testid="ribbon-more" :aria-label="t('desktop.moreActions')">⋯</Button>
        </DropdownMenu>
      </div>

    </div>

    <WorkbenchFrame :rail="!!railMode" class="chat-body" :class="{ 'has-rail': !!railMode, 'has-terminal-dock': terminalDockOpen }" data-testid="chat-body">
    <div class="chat-main" data-testid="chat-main">
    <InfiniteScroll ref="feedPort" class="chat-feed preview-feed" data-testid="chat-feed" edge="start" :disabled="!hasOlderTurns || loadingOlder || holdingFeed" @scroll="onFeedScroll" @load="showOlderTurns">
    <Feedback v-if="session.storageError.value" tone="warning">{{ t('historyUi.storageError') }}</Feedback>
    <Feedback v-if="historyNote && !deleteId && session.phase.value !== 'offline'" tone="warning">{{ historyNote }}</Feedback>
    <p v-if="boardNote" class="hint" role="status" data-testid="board-draft-note">{{ boardNote }}</p>
    <Feedback v-if="session.expired.value || archived" tone="warning">{{ archived ? t('historyUi.archiveNotice') : t('historyUi.expired') }}</Feedback>
    <p v-if="session.toolMode.value === 'git_status'" class="hint">{{ t("chat.gitWarning") }}</p>

    <WorkspaceWelcome v-if="!session.turns.value.length || workbench.workMode === 'work'" :compact="session.turns.value.length > 0" @scenario="useScene" />
    <ol v-if="visibleTurns.length" class="chat-log">
      <li v-for="{ turn, key } in visibleTurns" :key="key" :aria-label="turn.role === 'user' ? t('chat.speakerYou') : t('chat.speakerModel')" :class="turn.role === 'user' ? 'turn-user' : 'turn-assistant'">
        <p v-if="turn.text">{{ turn.text }}</p>
        <p v-else-if="turn.role === 'assistant'">{{ t("chat.noAnswer") }}</p>
        <p v-if="turn.error">{{ t("chat.toolError") }}：{{ turn.error }}</p>
        <p v-if="turn.artifactError">{{ t("chat.artifactFailed") }}：{{ turn.artifactError }}</p>
        <section v-if="turn.proposal" class="code-proposal write-request" data-testid="code-proposal">
          <h3>{{ t("desktop.writeRequest", { count: turn.proposal.files.length }) }}</h3>
          <p v-if="!refused[turn.proposal.id]" class="hint" data-testid="turn-pending">{{ t(turnPending(turn)) }}</p>
          <Collapse v-for="file in turn.proposal.files" :key="file.path">
            <template #summary>{{ file.path }} · {{ file.before == null ? t('task.newFile') : t('task.modifiedFile') }} · {{ t('desktop.fileBaseline') }}：{{ file.baseHash || t('desktop.summaryUnknown') }}</template>
            <div class="code-comparison">
              <div><strong>{{ t("task.before") }}</strong><pre>{{ file.before ?? t("task.newFile") }}</pre></div>
              <div><strong>{{ t("task.after") }}</strong><pre>{{ file.content }}</pre></div>
            </div>
          </Collapse>
          <div class="proposal-actions">
          <Button v-if="!applied[turn.proposal.id] && !refused[turn.proposal.id]" type="button" data-testid="refuse-write" @click="refuseProposal(turn.proposal.id)">{{ t("desktop.refuseWrite") }}</Button>
          </div>
          <p v-if="refused[turn.proposal.id]" class="hint" data-testid="refused-write">{{ t("desktop.refusedWrite") }}</p>
          <template v-if="!applied[turn.proposal.id] && !refused[turn.proposal.id] && baselineReady(turn.proposal)">
            <label><Checkbox v-model="writeConfirmed[turn.proposal.id]" /> {{ t("task.confirmWrite") }}</label>
            <Button type="button" variant="primary" :disabled="!writeConfirmed[turn.proposal.id] || !!applying || !turn.proposal.writeAllowed || session.context.value.approval === 'read_only'" @click="applyProposal(turn.proposal)">{{ t("task.apply") }}</Button>
          </template>
          <p v-else-if="applied[turn.proposal.id]">{{ mock ? t('preview.boundary') : t("task.written") }} {{ applied[turn.proposal.id]?.join('、') }}</p>
        </section>
        <ul v-if="turn.toolEvents.length">
          <li v-for="event in turn.toolEvents" :key="event.sequence">{{ event.sequence }}. {{ event.code }}</li>
        </ul>
        <ul v-if="turn.artifacts.length">
          <li v-for="artifact in turn.artifacts" :key="artifact.sha256">
            {{ artifact.kind }} · {{ artifact.sizeBytes }} · {{ artifact.sha256 }}
          </li>
        </ul>
      </li>
    </ol>

    <Button v-if="session.failure.value === 'target-changed'" type="button" :disabled="!selectedModel || session.sending.value" @click="session.chooseConversationConnection(session.boundConnectionId.value!, session.boundModel.value)">{{ t('modelUi.reconnect') }}</Button>
    <Button v-if="session.failure.value === 'failed' || session.failure.value === 'kept' || session.failure.value === 'not-configured'" type="button" data-testid="retry-send" :disabled="session.sending.value || !session.draft.value.trim() || (!mock && (workbench.executionMode === 'agent' || workbench.executionMode === 'plan'))" @click="sendTask">{{ t('desktop.retrySend') }}</Button>
    <a v-if="session.failure.value === 'not-configured'" data-testid="locate-settings" :title="t('desktop.locateSettingsNote')" href="#model-settings">{{ t('desktop.locateSettings') }}</a>
    <Button v-if="session.failure.value === 'model-unavailable' || session.failure.value === 'target-change-failed'" type="button" data-testid="locate-model" :title="t('desktop.locateModelNote')" @click="workbench.modelMenuToken += 1">{{ t('desktop.locateModel') }}</Button>
    <Feedback v-if="session.targetNotice.value === 'cleared'" tone="info">{{ t("chat.memoryCleared") }}</Feedback>
    <Feedback v-if="session.targetNotice.value === 'kept'" tone="info">{{ t("modelUi.memoryKept") }}</Feedback>
    <Feedback v-if="session.failure.value" tone="warning">{{ t(session.failure.value === "target-changed" ? "modelUi.retryTarget" : session.failure.value === "model-unavailable" ? "modelUi.unavailable" : session.failure.value === "not-configured" ? "chat.notConfigured" : session.failure.value === "target-change-failed" ? "chat.targetChangeFailed" : "desktop.retrySame") }}</Feedback>
    <Feedback v-if="proposalNote" tone="info">{{ proposalNote }}</Feedback>
    <p v-if="effortReset" class="hint" data-testid="effort-reset">{{ t("desktop.effortReset", { effort: t("task." + effortReset) }) }}</p>
    </InfiniteScroll>
    <form
      class="chat-composer preview-composer preview-input-box"
      data-testid="chat-composer"
      @submit.prevent="sendTask"
    >
      <TaskComposer :active="props.active" :preview="mock" :refreshing-models="modelsRefreshing" :model-label="selectedModel ? selectedModel.model : ''" :context="session.context.value" :disabled="session.sending.value || session.opening.value || session.expired.value || archived" :reasoning-efforts="reasoningEfforts" @update="session.context.value = $event" @refresh="refreshModels">
        <template #draft>
        <label>
        <span class="sr-only">{{ t("chat.draft") }}</span>
        <Textarea v-model="session.draft.value" class="composer-draft" :placeholder="t(workbench.workMode === 'work' ? 'chat.draftWork' : workbench.workMode === 'code' ? 'chat.draftCode' : 'chat.draft')" rows="3" :disabled="session.sending.value || session.opening.value || session.expired.value || archived" />
        </label>
        <Collapse class="outgoing-preview" data-testid="outgoing-preview">
          <template #summary>{{ t("desktop.outgoing") }}</template>
          <p>{{ t("desktop.outgoingIdle") }}</p>
          <p>{{ t("desktop.outgoingDraft") }}：{{ session.draft.value.trim() || t("desktop.stepNoDraft") }}</p>
          <p>{{ t("desktop.outgoingGuide") }}</p>
          <pre>{{ outgoingText || t("desktop.outgoingNone") }}</pre>
          <p v-if="workbench.executionMode === 'plan'">{{ t("desktop.outgoingPlan") }}</p>
          <ul v-if="session.context.value.files.length"><li v-for="file in session.context.value.files" :key="file.name">{{ file.name }}</li></ul>
          <p v-else>{{ t("desktop.outgoingNoFiles") }}</p>
        </Collapse>
        </template>
        <template #settings><p v-if="catalogNote?.kind === 'cached'" class="catalog-fail" data-testid="catalog-cache">{{ t("desktop.catalogCached", { time: catalogNote.time || t("desktop.catalogNoTime"), error: catalogNote.error }) }}</p><p v-else-if="catalogNote?.kind === 'fresh'" class="hint" data-testid="catalog-fresh">{{ t("desktop.catalogFresh", { time: catalogNote.time || t("desktop.catalogNoTime") }) }}</p><p v-if="selectedModel?.kind === 'chatgpt-plan'" class="hint">{{ t("authUi.toolsHint") }}</p></template>
        <template #tools>
          <div v-if="!mock && session.conversationId.value" class="chat-tool-settings" data-testid="chat-tool-settings">
            <p class="hint">{{ t("chat.gitWarning") }}</p>
            <Button variant="secondary" type="button" :aria-pressed="session.toolMode.value === 'none'" @click="session.toolMode.value = 'none'">{{ t("chat.toolNone") }}</Button>
            <Button variant="secondary" type="button" :disabled="!session.status.value?.tools.git_status || selectedModel?.kind === 'chatgpt-plan'" :aria-pressed="session.toolMode.value === 'git_status'" @click="session.toolMode.value = 'git_status'">{{ t("chat.toolGit") }}</Button>
          </div>
        </template>
        <template #model>
      <p class="hint" data-testid="model-switch-notice">{{ session.conversationId.value ? t("modelUi.switchAhead") : t("modelUi.switchNew") }}</p>
      <p v-if="!modelChoices.length" class="hint">{{ t('modelUi.pending') }}</p>
      <Button variant="navigation" v-for="item in modelChoices" :key="item.key" type="button" class="menu-choice" :aria-pressed="item.key === modelSelection" @click="chooseModel(item.key)">{{ item.name }} · {{ item.model }}</Button>
      <small v-if="selectedModel?.kind === 'chatgpt-plan'">{{ t("authUi.planUsage") }}</small>
        </template>
        <template #send>
      <p v-if="!mock && !selectedModel" class="hint" data-testid="send-needs-model">
        {{ t("desktop.sendNeedsModel") }}
        <a data-testid="send-open-settings" href="#model-settings" :title="t('desktop.locateSettingsNote')">{{ t("desktop.locateSettings") }}</a>
      </p>
      <Button
        class="composer-send"
        variant="primary"
        type="submit"
        data-testid="send-message"
        :aria-label="session.sending.value ? t('chat.sending') : t('chat.send')"
        :title="session.sending.value ? t('chat.sending') : t('chat.send')"
        :disabled="(!mock && (workbench.executionMode === 'agent' || workbench.executionMode === 'plan')) || session.expired.value || archived || session.sending.value || session.opening.value || !session.draft.value.trim() || (!!session.pendingConnectionId.value && !!session.conversationId.value) || !selectedModel"
      >
        <span class="composer-send-arrow" aria-hidden="true">{{ session.sending.value ? '…' : '↑' }}</span>
        <span class="sr-only">{{ session.sending.value ? t("chat.sending") : t("chat.send") }}</span>
      </Button>
        </template>
      </TaskComposer>
      <Feedback v-if="session.pendingConnectionId.value && session.conversationId.value" tone="warning">
        {{ t("chat.targetPrompt", { target: session.targetNotice.value }) }}
        {{ t("modelUi.clearNotice") }}
        <Button type="button" variant="secondary" @click="session.confirmConnectionChange()">{{ t("chat.confirmTarget") }}</Button>
        <Button type="button" variant="secondary" @click="session.cancelConnectionChange()">{{ t("chat.cancelTarget") }}</Button>
      </Feedback>

    </form>
    <SessionPanel
      v-if="terminalDockOpen"
      class="terminal-dock"
      mode="terminal"
      data-testid="terminal-dock"
      @close="closePanel"
      @open="openFromSummary"
    />
    </div>
    <SessionPanel
      v-if="railMode"
      class="session-rail eap-scrollbar"
      :mode="railMode"
      :data-testid="railMode === 'summary' ? 'summary-rail' : 'changes-rail'"
      @close="closePanel"
      @open="openFromSummary"
    />
    <Drawer v-if="filesOverlayOpen" :title="t('desktop.sources')" :close-label="t('desktop.panelClose')" :show-header="false" data-testid="files-overlay-root" @close="closePanel">
      <SessionPanel mode="files" data-testid="files-overlay" @close="closePanel" @open="openFromSummary" />
    </Drawer>
    </WorkbenchFrame>
    <ConnectionDialog v-if="manageId" :title="t('historyUi.rename')" :busy="false" @close="manageId = null"><form class="history-dialog-form" @submit.prevent="session.renameConversation(manageId!, manageTitle); manageId = null"><h2>{{ t('historyUi.rename') }}</h2><Input v-model="manageTitle" required maxlength="100" :aria-label="t('historyUi.rename')" /><Button type="submit">{{ t('historyUi.save') }}</Button></form></ConnectionDialog>
    <ConnectionDialog v-if="deleteId" :title="t('historyUi.delete')" :busy="deleting" @close="deleteId = null"><div class="history-dialog-form"><h2>{{ t('historyUi.delete') }}</h2><p>{{ t('historyUi.deleteNotice') }}</p><Feedback v-if="historyNote" tone="warning">{{ historyNote }}</Feedback><Button type="button" :disabled="deleting" @click="removeConversation">{{ t('historyUi.delete') }}</Button><Button type="button" variant="secondary" :disabled="deleting" @click="deleteId = null">{{ t('composerUi.close') }}</Button></div></ConnectionDialog>
  </section>
</template>

<style scoped>
.chat-connections { border: 1px solid var(--border); padding: 14px 18px; border-radius: 12px; margin-bottom: 18px; }
.chat-connections > :deep(summary) { cursor: pointer; font-weight: 600; }
.chat-log { list-style: none; padding: 0; display: grid; gap: 18px; max-width: 1100px; }
.chat-log > li { padding: 18px 22px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 16px; }
.chat-log > li > p { white-space: pre-wrap; overflow-wrap: anywhere; }
.chat-log > li:has(> strong:first-child) { min-width: 0; }
.chat-composer { display: grid; gap: 14px; }
.chat-composer textarea { display: block; width: 100%; padding: 14px; border: 1px solid var(--border-strong); border-radius: 12px; resize: vertical; }
.code-proposal { display: grid; gap: 12px; margin: 16px 0; }
.code-comparison { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.code-comparison pre { overflow: auto; max-height: 380px; padding: 12px; background: var(--eap-code-bg); color: var(--eap-code-text); border-radius: 8px; }
@media(max-width: 800px) { .code-comparison { grid-template-columns: 1fr; } }
</style>

<style src="../../workspace.css"></style>
<style scoped>
.live-workspace{padding:0;background:transparent}
.live-utilities{display:flex;align-items:center;flex-wrap:nowrap;gap:8px;padding:8px 24px;margin:0;flex-shrink:0;border-bottom:1px solid var(--border);min-width:0}
.session-status{min-width:0}
.session-tools{display:flex;align-items:center;gap:6px;margin-left:auto;flex:0 0 auto}
.session-tools .shell-tool{white-space:nowrap}




@media(max-width:760px){.live-utilities{padding:8px 12px;gap:6px;flex-wrap:wrap}.session-tools{max-width:100%;margin-left:0;flex-wrap:wrap}}
.chat-main{display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden}
.session-rail{min-width:0;min-height:0;overflow:auto;border-left:1px solid var(--border);background:var(--surface)}
.terminal-dock{flex:0 0 auto;max-height:min(280px,36vh);min-height:140px;overflow:hidden;border-top:1px solid var(--border);background:var(--eap-code-bg)}
@media(max-width:1000px){
  .session-rail{position:fixed;z-index:30;top:56px;right:12px;bottom:12px;width:min(340px,calc(100vw - 24px));border:1px solid var(--border);border-radius:16px;box-shadow:0 12px 36px color-mix(in srgb, var(--text) 16%, transparent)}
}
.outgoing-preview{margin:4px 0 2px;font-size:12px;color:var(--text-soft)}
.outgoing-preview>:deep(summary){display:inline-flex;align-items:center;gap:6px;width:auto;padding:0;font-size:12px;font-weight:500;color:var(--accent);list-style:none}
.outgoing-preview>:deep(summary)::-webkit-details-marker{display:none}
.outgoing-preview>:deep(summary)::marker{content:none}
.outgoing-preview>:deep(summary)::before{content:"▸";color:var(--text-mute);font-size:10px}
.outgoing-preview[open]{padding:8px 10px;background:var(--surface-2);border-radius:10px;max-height:min(180px,18vh);overflow:auto;overscroll-behavior:contain}
.outgoing-preview[open]>:deep(summary)::before{content:"▾"}
.outgoing-preview p,.outgoing-preview ul{margin:4px 0}
.outgoing-preview pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:9em;overflow:auto;margin:6px 0;font:inherit}
.chat-feed{flex:1;min-height:0;overflow:auto}
.chat-feed>.hint{font-size:11px;margin:4px 0;color:var(--text-soft)}
.catalog-fail{margin:6px 0 0;padding:8px 10px;border-radius:8px;background:var(--danger-bg);border:1px solid var(--danger-border);font-size:12px;line-height:1.45;color:var(--danger);font-weight:600}
.chat-composer{display:block;gap:0;flex:0 0 auto}
.chat-composer:has(textarea.composer-draft:disabled) textarea,.chat-composer:has(textarea.composer-draft:disabled) :deep(.context-toolbar){opacity:.5}
.chat-composer textarea{border:0;background:transparent;min-height:70px;padding:6px 3px;font-size:13px}
.chat-composer textarea.composer-draft:focus{outline:none;box-shadow:none;border:0}
.chat-log{gap:24px;max-width:none}
.chat-log>li.turn-user,.chat-log>li.turn-assistant{min-width:0}
.chat-log>li>strong{font-size:11px;color:var(--text-soft)}
.chat-log>li>p{line-height:1.9;font-size:14px}
.turn-meta{font-size:12px;line-height:1.6;color:var(--text-soft)}
.code-comparison>div:first-child pre{background:var(--danger-bg);color:var(--danger)}
.code-comparison>div:last-child pre{background:var(--ok-bg);color:var(--ok)}
</style>
