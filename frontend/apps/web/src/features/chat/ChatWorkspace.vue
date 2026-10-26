<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Badge, Button, Feedback } from "@eap/ui";
import { runtimeApi, type AiConnectionState, type HandoffRecord, type MissionRecord } from "@eap/runtime-client";
import { errorMessage } from "../../lib/presentation";
import { chatHandoff, beginHandoff, handoffSucceeded } from "../handoff/handoff";
import { beginMission, missionLocked, missionShell } from "../mission/mission";
import { createChatSession } from "./chatSession";
import ConnectionDialog from "../settings/ConnectionDialog.vue";
import TaskComposer from "./TaskComposer.vue";
import type { CodeProposal } from "@eap/runtime-client";

const { t } = useI18n();
const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true });
watch(() => props.active, active => { if (active) { void session.refreshConnections().catch(error => { historyNote.value = errorMessage(error); }); void session.refreshStatus(); } });
const importingPrototype = !!sessionStorage.getItem("eap.chat.prototype");
const session = createChatSession(runtimeApi, localStorage);
const showArchived = ref(false);
const historyOpen = ref(true);
const manageId = ref<string | null>(null);
const manageTitle = ref('');
const deleteId = ref<string | null>(null);
const historyNote = ref('');
const deleting = ref(false);
const creating = ref(false);
async function newConversation() {
  if (creating.value) return;
  creating.value = true; historyNote.value = "";
  try { await session.openConversation(); showArchived.value = false; }
  catch (error) { historyNote.value = errorMessage(error); }
  finally { creating.value = false; }
}
const archived = computed(() => !!session.history.value.find(x => x.id === session.conversationId.value)?.archived);
async function removeConversation() {
  if (!deleteId.value) return;
  deleting.value = true;
  try { await session.deleteConversation(deleteId.value); deleteId.value = null; }
  catch (error) { historyNote.value = errorMessage(error); }
  finally { deleting.value = false; }
}
const applied = ref<Record<string, string[]>>({});
const applying = ref<string | null>(null);
const proposalNote = ref("");
const writeConfirmed = ref<Record<string, boolean>>({});
const modelChoices = computed(() => session.connections.value.filter(item => item.enabled).flatMap(item =>
  item.models.filter(model => item.allowedModels.includes(model.id)).map(model => ({ key: JSON.stringify([item.id, model.id]), kind: item.kind, connectionId: item.id, name: item.name, model: model.id, efforts: model.reasoningEfforts }))));
const modelSelection = computed(() => JSON.stringify([session.pendingConnectionId.value || session.boundConnectionId.value, session.pendingConnectionId.value ? session.pendingModel.value : session.boundModel.value]));
const selectedModel = computed(() => modelChoices.value.find(item => item.connectionId === (session.pendingConnectionId.value || session.boundConnectionId.value) && item.model === (session.pendingConnectionId.value ? session.pendingModel.value : session.boundModel.value)));
watch(selectedModel, model => { if (model?.kind === "chatgpt-plan") session.toolMode.value = "none"; });
const reasoningEfforts = computed(() => selectedModel.value?.efforts ?? []);
function chooseModel(key: string) { const target = modelChoices.value.find(item => item.key === key); if (target) session.chooseConversationConnection(target.connectionId, target.model); }
watch(reasoningEfforts, values => { if (session.context.value.reasoning !== 'default' && !values.includes(session.context.value.reasoning)) session.context.value.reasoning = 'default'; });
async function applyProposal(proposal: CodeProposal) {
  if (!writeConfirmed.value[proposal.id] || applying.value || session.context.value.approval === "read_only") return;
  applying.value = proposal.id;
  proposalNote.value = "";
  try {
    const result = await runtimeApi.applyCodeProposal(proposal.conversationId, proposal.id);
    applied.value = { ...applied.value, [proposal.id]: result.written };
    proposalNote.value = t("task.written");
  } catch (error) { proposalNote.value = errorMessage(error); }
  finally { applying.value = null; }
}
const handoffs = ref<HandoffRecord[]>([]);
const missions = ref<MissionRecord[]>([]);
const handoffNote = ref("");
const handoffOk = ref(false);
const handoffBusy = ref(false);
const missionNote = ref("");
const missionOk = ref(false);
const missionBusy = ref(false);
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
  void loadHandoffs();
  void loadMissions();
});

function linkedMission(handoffId: string) {
  return missions.value.find((item) => item.handoffId === handoffId);
}

async function loadMissions() {
  if (typeof window === "undefined") return;
  try {
    const page = await runtimeApi.missions();
    missions.value = page.items;
  } catch {
    missions.value = [];
  }
}

async function loadHandoffs() {
  if (typeof window === "undefined") return;
  try {
    const page = await runtimeApi.handoffs();
    handoffs.value = page.items.filter((item) => item.source === "chat");
  } catch {
    handoffs.value = [];
  }
}

async function recordHandoff() {
  const draft = chatHandoff(session.draft.value, session.conversationId.value);
  const gate = { busy: handoffBusy.value };
  if (!draft || !beginHandoff(gate)) return;
  handoffBusy.value = true;
  handoffOk.value = false;
  handoffNote.value = "";
  try {
    const saved = await runtimeApi.recordHandoff(draft);
    if (!handoffSucceeded(saved)) {
      handoffNote.value = t("plugin.handoffRejected");
      return;
    }
    handoffOk.value = true;
    handoffNote.value = t("plugin.handoffDone", saved);
    await loadHandoffs();
    await loadMissions();
  } catch (error) {
    handoffOk.value = false;
    handoffNote.value = errorMessage(error);
  } finally {
    handoffBusy.value = false;
  }
}

async function readGitStatus(missionId: string) {
  const gate = { busy: missionBusy.value };
  if (!beginMission(gate)) return;
  missionBusy.value = true;
  missionOk.value = false;
  missionNote.value = "";
  try {
    const execution = await runtimeApi.startMissionGitStatus(missionId);
    missionOk.value = execution.unconfirmedReason == null;
    missionNote.value = execution.unconfirmedReason
      ? t("plugin.missionRunPending", { id: execution.id, status: execution.status, reason: execution.unconfirmedReason })
      : t("plugin.missionRunResult", { id: execution.id, status: execution.status, exitCode: execution.exitCode ?? "" });
    await loadMissions();
  } catch (error) {
    missionOk.value = false;
    missionNote.value = errorMessage(error);
  } finally {
    missionBusy.value = false;
  }
}

async function createMission(handoffId: string) {
  const gate = { busy: missionBusy.value };
  if (!beginMission(gate)) return;
  missionBusy.value = true;
  missionOk.value = false;
  missionNote.value = "";
  try {
    const saved = await runtimeApi.createMission(handoffId);
    if (!missionShell(saved)) {
      missionNote.value = t("plugin.missionRejected");
      return;
    }
    missionOk.value = true;
    missionNote.value = t("plugin.missionShell", saved);
    await loadMissions();
  } catch (error) {
    missionOk.value = false;
    missionNote.value = errorMessage(error);
  } finally {
    missionBusy.value = false;
  }
}
</script>

<template>
  <section class="view work-page chat-workspace" data-testid="chat-workspace">
    <div class="page-head chat-page-head">
      <button class="history-toggle eap-button" type="button" :aria-expanded="historyOpen" @click="historyOpen = !historyOpen">☰ {{ t("historyUi.title") }}</button>
      <button type="button" class="records-toggle eap-button" popovertarget="chat-records-panel">{{ t("composerUi.records") }} ▾</button>
      <div class="chat-top-actions">      <Button variant="secondary" :disabled="creating || session.opening.value || session.phase.value !== 'ready'" @click="newConversation">
        {{ t("chat.new") }}
      </Button>
<a class="chat-config-link" href="#model-settings">⚙ {{ t("composerUi.modelSettings") }}</a></div>
      <p class="eyebrow">CHAT</p>
      <h1>{{ t("workUi.chatTitle") }}</h1>
      <p>{{ t("workUi.chatSubtitle") }}</p>
    </div>

    <div class="chat-body">
    <aside v-if="historyOpen" class="conversation-sidebar" :aria-label="t('historyUi.title')">
      <a class="conversation-analysis" href="#sql">{{ t("workUi.sqlPrompt") }} ↗</a>
      <div class="history-heading"><strong>{{ t('historyUi.title') }}</strong><button type="button" @click="historyOpen = false" :aria-label="t('composerUi.close')">×</button></div>
      <div class="history-tabs"><button type="button" :aria-pressed="!showArchived" @click="showArchived = false">{{ t('historyUi.active') }}</button><button type="button" :aria-pressed="showArchived" @click="showArchived = true">{{ t('historyUi.archived') }}</button></div>
      <p class="history-notice">{{ t('historyUi.localNotice') }}</p>
      <Feedback v-if="session.storageError.value" tone="warning">{{ t('historyUi.storageError') }}</Feedback>
      <div v-for="item in session.history.value.filter(x => x.archived === showArchived)" :key="item.id" class="conversation-row" :class="{ 'is-active': item.id === session.conversationId.value }">
        <button class="conversation-select" type="button" @click="session.selectConversation(item.id)"><strong>{{ item.title || t('chat.new') }}</strong><small>{{ new Date(item.updatedAt).toLocaleString() }}</small></button>
        <details class="conversation-menu"><summary :aria-label="t('historyUi.actions')">⋯</summary><div><button type="button" @click="manageId = item.id; manageTitle = item.title">{{ t('historyUi.rename') }}</button><button type="button" :disabled="session.inflight.value[item.id] != null" @click="session.archiveConversation(item.id, !item.archived)">{{ item.archived ? t('historyUi.restore') : t('historyUi.archive') }}</button><button type="button" :disabled="session.inflight.value[item.id] != null" @click="deleteId = item.id; historyNote = ''">{{ t('historyUi.delete') }}</button></div></details>
      </div>
      <p v-if="!session.history.value.some(x => x.archived === showArchived)" class="history-notice">{{ t('historyUi.empty') }}</p>
    </aside>
    <div class="chat-main">
    <div class="chat-feed">
    <Feedback v-if="historyNote && !deleteId && session.phase.value !== 'offline'" tone="warning">{{ historyNote }}</Feedback>
    <Feedback v-if="session.expired.value || archived" tone="warning">{{ archived ? t('historyUi.archiveNotice') : t('historyUi.expired') }}</Feedback>
    <Feedback v-if="session.phase.value === 'loading'" tone="info">{{ t("chat.loading") }}</Feedback>
    <Feedback v-else-if="session.phase.value === 'offline'" tone="error">{{ t("chat.offline") }}</Feedback>
    <template v-else>
      <p class="hint">
        <Badge
          :tone="session.status.value?.state === 'available' ? 'success' : session.status.value?.state === 'error' ? 'danger' : 'warning'"
          :label="t(stateKey[session.status.value?.state ?? 'disabled'])"
        />
        <span v-if="session.status.value?.errorCode"> {{ session.status.value.errorCode }}</span>
      </p>
      <p class="hint">{{ t("chat.workspace") }}：{{ session.status.value?.workspaceLabel }}</p>
      <p v-if="session.workspaceLabel.value" class="hint">
        {{ t("chat.memory") }}：{{ session.memoryNote.value }}
      </p>
    </template>




    <p v-if="session.toolMode.value === 'git_status'" class="hint">{{ t("chat.gitWarning") }}</p>

    <div v-if="!session.turns.value.length" class="chat-welcome">
      <span class="welcome-mark" aria-hidden="true">✦</span><h2>{{ t("workUi.chatWelcome") }}</h2>
      <p>{{ t("workUi.chatWelcomeBody") }}</p>
      <div class="welcome-prompts">
        <button type="button" @click="session.draft.value = t('workUi.sqlExample'); session.context.value.expert = 'sql'">{{ t("workUi.sqlPrompt") }} <span aria-hidden="true">↗</span></button>
        <button type="button" @click="session.draft.value = t('workUi.codeExample'); session.context.value.expert = 'frontend'; session.context.value.mode = 'code'">{{ t("workUi.codePrompt") }} <span aria-hidden="true">↗</span></button>
        <button type="button" @click="session.draft.value = t('workUi.reviewExample')">{{ t("workUi.reviewPrompt") }} <span aria-hidden="true">↗</span></button>
      </div>
    </div>
    <ol v-else class="chat-log">
      <li v-for="(turn, index) in session.turns.value" :key="index">
        <strong>{{ turn.role === "user" ? "You" : "Model" }}</strong>
        <small v-if="turn.model"> · {{ turn.connectionName }} / {{ turn.model }} · {{ turn.reasoning === "default" ? t("task.modelDefault") : turn.reasoning }}</small>
        <p v-if="turn.text">{{ turn.text }}</p>
        <p v-else-if="turn.role === 'assistant'">{{ t("chat.noAnswer") }}</p>
        <p v-if="turn.error">{{ t("chat.toolError") }}：{{ turn.error }}</p>
        <p v-if="turn.role === 'assistant'">{{ t("chat.unverified") }} · {{ t("chat.approval") }} · {{ turn.status }}</p>
        <p v-if="turn.artifactError">{{ t("chat.artifactFailed") }}：{{ turn.artifactError }}</p>
        <section v-if="turn.proposal" class="code-proposal" data-testid="code-proposal">
          <h3>{{ t("task.proposal") }} · {{ turn.proposal.files.length }}</h3>
          <p>{{ t("chat.workspace") }}：{{ turn.proposal.workspace }}</p>
          <details v-for="file in turn.proposal.files" :key="file.path">
            <summary>{{ file.path }} · {{ file.before == null ? t('task.newFile') : t('task.modifiedFile') }}</summary>
            <div class="code-comparison">
              <div><strong>{{ t("task.before") }}</strong><pre>{{ file.before ?? t("task.newFile") }}</pre></div>
              <div><strong>{{ t("task.after") }}</strong><pre>{{ file.content }}</pre></div>
            </div>
          </details>
          <template v-if="!applied[turn.proposal.id]">
            <label><input v-model="writeConfirmed[turn.proposal.id]" type="checkbox" /> {{ t("task.confirmWrite") }}</label>
            <Button type="button" variant="primary" :disabled="!writeConfirmed[turn.proposal.id] || !!applying || !turn.proposal.writeAllowed || session.context.value.approval === 'read_only'" @click="applyProposal(turn.proposal)">{{ t("task.apply") }}</Button>
          </template>
          <p v-else>{{ t("task.written") }} {{ applied[turn.proposal.id]?.join('、') }}</p>
          <p class="hint">{{ t("task.verificationNotice") }}</p>
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
    <Feedback v-if="session.targetNotice.value === 'cleared'" tone="info">{{ t("chat.memoryCleared") }}</Feedback>
    <Feedback v-if="session.failure.value" tone="warning">{{ t(session.failure.value === "target-changed" ? "modelUi.retryTarget" : session.failure.value === "model-unavailable" ? "modelUi.unavailable" : "chat.keptDraft") }}</Feedback>
    <Feedback v-if="proposalNote" tone="info">{{ proposalNote }}</Feedback>
    </div>
    <form
      class="chat-composer"
      @submit.prevent="session.send()"
    >
      <label>
        <span class="sr-only">{{ t("chat.draft") }}</span>
        <textarea v-model="session.draft.value" :placeholder="t('chat.draft')" rows="3" :disabled="session.sending.value || session.opening.value || session.expired.value || archived" />
      </label>
      <TaskComposer :active="props.active" :context="session.context.value" :disabled="session.sending.value || session.opening.value || session.expired.value || archived" :reasoning-efforts="reasoningEfforts" @update="session.context.value = $event">
        <template #settings><p v-if="selectedModel?.kind === 'chatgpt-plan'" class="hint">{{ t("authUi.toolsHint") }}</p><div class="chat-tool-settings">      <Button
        variant="secondary"
        :disabled="!session.conversationId.value"
        :aria-pressed="session.toolMode.value === 'none'"
        @click="session.toolMode.value = 'none'"
      >
        {{ t("chat.toolNone") }}
      </Button>
      <Button
        variant="secondary"
        :disabled="!session.conversationId.value || !session.status.value?.tools.git_status || selectedModel?.kind === 'chatgpt-plan'"
        :aria-pressed="session.toolMode.value === 'git_status'"
        @click="session.toolMode.value = 'git_status'"
      >
        {{ t("chat.toolGit") }}
      </Button>
</div></template>
        <template #model>
      <label class="composer-model">
        <span class="sr-only">{{ t('modelUi.selection') }}</span>
        <select :value="modelSelection" :disabled="session.sending.value || session.opening.value || !modelChoices.length" @change="chooseModel(($event.target as HTMLSelectElement).value)">
          <option v-if="!modelChoices.some(item => item.key === modelSelection)" :value="modelSelection" disabled>{{ session.boundModel.value || t('modelUi.pending') }}</option>
          <option v-for="item in modelChoices" :key="item.key" :value="item.key">{{ item.name }} · {{ item.model }}</option>
        </select>
      </label>
      <small v-if="selectedModel?.kind === 'chatgpt-plan'">{{ t("authUi.planUsage") }}</small>
        </template>
        <template #send>
      <Button
        variant="primary"
        type="submit"
        :disabled="session.expired.value || archived || session.sending.value || session.opening.value || !session.draft.value.trim() || (!!session.pendingConnectionId.value && !!session.conversationId.value) || !selectedModel"
      >
        {{ session.sending.value ? t("chat.sending") : t("chat.send") }}
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
    </div>
    </div>
    <ConnectionDialog v-if="manageId" :title="t('historyUi.rename')" :busy="false" @close="manageId = null"><form class="history-dialog-form" @submit.prevent="session.renameConversation(manageId!, manageTitle); manageId = null"><h2>{{ t('historyUi.rename') }}</h2><input v-model="manageTitle" required maxlength="100" :aria-label="t('historyUi.rename')" /><Button type="submit">{{ t('historyUi.save') }}</Button></form></ConnectionDialog>
    <ConnectionDialog v-if="deleteId" :title="t('historyUi.delete')" :busy="deleting" @close="deleteId = null"><div class="history-dialog-form"><h2>{{ t('historyUi.delete') }}</h2><p>{{ t('historyUi.deleteNotice') }}</p><Feedback v-if="historyNote" tone="warning">{{ historyNote }}</Feedback><Button type="button" :disabled="deleting" @click="removeConversation">{{ t('historyUi.delete') }}</Button><Button type="button" variant="secondary" :disabled="deleting" @click="deleteId = null">{{ t('composerUi.close') }}</Button></div></ConnectionDialog>
    <div id="chat-records-panel" popover="auto" class="chat-records-panel" role="dialog" :aria-label="t('task.optionalRecords')">
      <div class="records-panel-head"><h2>{{ t("composerUi.records") }}</h2><button type="button" class="eap-button" popovertarget="chat-records-panel" popovertargetaction="hide" :aria-label="t('composerUi.close')">×</button></div>
    <div class="records-summary"><span>{{ t("composerUi.handoffs") }} <strong>{{ handoffs.length }}</strong></span><span>Mission <strong>{{ missions.filter(item => handoffs.some(handoff => handoff.id === item.handoffId)).length }}</strong></span></div>
    <div class="chat-actions">
      <Button
        variant="secondary"
        type="button"
        data-testid="chat-handoff"
        :disabled="handoffBusy || !session.draft.value.trim()"
        @click="recordHandoff"
      >
        {{ t("plugin.handoff") }}
      </Button>
    </div>
    <p v-if="!handoffs.length" class="records-empty">{{ t("composerUi.noRecords") }}</p>
    <details class="records-help"><summary>{{ t("composerUi.recordHelp") }}</summary><p class="hint">{{ t("plugin.handoffHint") }} {{ t("plugin.handoffRepeat") }}</p><p class="hint">{{ t("plugin.missionHint") }} {{ t("plugin.missionRepeat") }}</p></details>
    <Feedback v-if="handoffNote" :tone="handoffOk ? 'info' : 'warning'">{{ handoffNote }}</Feedback>
    <ul v-if="handoffs.length">
      <li v-for="item in handoffs" :key="item.id">
        <p>{{ item.summary }} · {{ item.execution }} · {{ item.grant }}</p>
        <Button
          variant="secondary"
          type="button"
          data-testid="chat-mission"
          :disabled="missionBusy"
          @click="createMission(item.id)"
        >
          {{ t("plugin.mission") }}
        </Button>
        <template v-if="linkedMission(item.id) && missionLocked(linkedMission(item.id)!)">
          <p data-testid="mission-shell">
            {{ missionShell(linkedMission(item.id)!) ? t("plugin.missionShell", linkedMission(item.id)!) : t("plugin.missionRunResult", { id: linkedMission(item.id)!.id, status: linkedMission(item.id)!.execution, exitCode: "" }) }}
          </p>
          <Button
            variant="secondary"
            type="button"
            data-testid="chat-git-status"
            :disabled="missionBusy"
            @click="readGitStatus(linkedMission(item.id)!.id)"
          >
            {{ t("plugin.missionRun") }}
          </Button>
        </template>
        <p v-else-if="linkedMission(item.id)">{{ t("plugin.missionRejected") }}</p>
      </li>
    </ul>

    <Feedback v-if="missionNote" :tone="missionOk ? 'info' : 'warning'">{{ missionNote }}</Feedback>
    </div>
  </section>
</template>

<style scoped>
.chat-connections { border: 1px solid #dce3ee; padding: 14px 18px; border-radius: 12px; margin-bottom: 18px; }
.chat-connections > summary { cursor: pointer; font-weight: 600; }
.chat-log { list-style: none; padding: 0; display: grid; gap: 18px; max-width: 1100px; }
.chat-log > li { padding: 18px 22px; background: #f6f8fc; border: 1px solid #e2e8f0; border-radius: 16px; }
.chat-log > li > p { white-space: pre-wrap; overflow-wrap: anywhere; }
.chat-log > li:has(> strong:first-child) { min-width: 0; }
.chat-composer { display: grid; gap: 14px; }
.chat-composer textarea { display: block; width: 100%; padding: 14px; border: 1px solid #cdd7e5; border-radius: 12px; resize: vertical; }
.code-proposal { display: grid; gap: 12px; margin: 16px 0; }
.code-comparison { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.code-comparison pre { overflow: auto; max-height: 380px; padding: 12px; background: #111c30; color: #dce7fa; border-radius: 8px; }
@media(max-width: 800px) { .code-comparison { grid-template-columns: 1fr; } }
</style>
