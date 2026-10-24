<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { Badge, Button, EmptyState, Feedback } from "@eap/ui";
import { runtimeApi, type AiConnectionState, type HandoffRecord, type MissionRecord } from "@eap/runtime-client";
import { errorMessage } from "../../lib/presentation";
import { chatHandoff, beginHandoff, handoffSucceeded } from "../handoff/handoff";
import { beginMission, missionShell } from "../mission/mission";
import { createChatSession } from "./chatSession";

const { t } = useI18n();
const session = createChatSession(runtimeApi);
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

onMounted(() => {
  void session.refreshStatus();
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
  <section class="view" data-testid="chat-workspace">
    <div class="page-head">
      <p class="eyebrow">CHAT</p>
      <h1>{{ t("chat.nav") }}</h1>
      <p>{{ t("chat.notice") }}</p>
    </div>

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

    <div class="chat-actions">
      <Button variant="secondary" :disabled="session.phase.value !== 'ready'" @click="session.openConversation()">
        {{ t("chat.new") }}
      </Button>
      <Button
        variant="secondary"
        :disabled="!session.conversationId.value"
        :aria-pressed="session.toolMode.value === 'none'"
        @click="session.toolMode.value = 'none'"
      >
        {{ t("chat.toolNone") }}
      </Button>
      <Button
        variant="secondary"
        :disabled="!session.conversationId.value || !session.status.value?.tools.git_status"
        :aria-pressed="session.toolMode.value === 'git_status'"
        @click="session.toolMode.value = 'git_status'"
      >
        {{ t("chat.toolGit") }}
      </Button>
    </div>
    <p v-if="session.toolMode.value === 'git_status'" class="hint">{{ t("chat.gitWarning") }}</p>

    <EmptyState v-if="!session.conversationId.value" :title="t('chat.empty')" />
    <ol v-else class="chat-log">
      <li v-for="(turn, index) in session.turns.value" :key="index">
        <strong>{{ turn.role === "user" ? "You" : "Model" }}</strong>
        <p v-if="turn.text">{{ turn.text }}</p>
        <p v-else-if="turn.role === 'assistant'">{{ t("chat.noAnswer") }}</p>
        <p v-if="turn.error">{{ t("chat.toolError") }}：{{ turn.error }}</p>
        <p v-if="turn.role === 'assistant'">{{ t("chat.unverified") }} · {{ t("chat.approval") }} · {{ turn.status }}</p>
        <p v-if="turn.artifactError">{{ t("chat.artifactFailed") }}：{{ turn.artifactError }}</p>
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

    <Feedback v-if="session.failure.value" tone="warning">{{ t("chat.keptDraft") }}</Feedback>
    <form
      class="chat-composer"
      @submit.prevent="session.send()"
    >
      <label>
        {{ t("chat.draft") }}
        <textarea v-model="session.draft.value" rows="4" :disabled="session.sending.value" />
      </label>
      <Button
        variant="primary"
        type="submit"
        :disabled="!session.conversationId.value || session.sending.value || !session.draft.value.trim()"
      >
        {{ session.sending.value ? t("chat.sending") : t("chat.send") }}
      </Button>
    </form>
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
    <p class="hint">{{ t("plugin.handoffHint") }} {{ t("plugin.handoffRepeat") }}</p>
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
        <p v-if="linkedMission(item.id) && missionShell(linkedMission(item.id)!)" data-testid="mission-shell">
          {{ t("plugin.missionShell", linkedMission(item.id)!) }}
        </p>
        <p v-else-if="linkedMission(item.id)">{{ t("plugin.missionRejected") }}</p>
      </li>
    </ul>
    <p class="hint">{{ t("plugin.missionHint") }} {{ t("plugin.missionRepeat") }}</p>
    <Feedback v-if="missionNote" :tone="missionOk ? 'info' : 'warning'">{{ missionNote }}</Feedback>
  </section>
</template>
