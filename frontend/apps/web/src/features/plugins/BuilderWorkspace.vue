<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import { Badge, Button, Feedback } from "@eap/ui";
import { runtimeApi, type HandoffRecord, type MissionRecord } from "@eap/runtime-client";
import { errorMessage } from "../../lib/presentation";
import { beginHandoff, builderHandoff, handoffSucceeded } from "../handoff/handoff";
import { beginMission, missionShell } from "../mission/mission";
import PrototypePreview from "./PrototypePreview.vue";
import type { PluginHost } from "./host";
import { GRANTS, MANIFESTS, type BuilderConfig } from "./model";

const props = defineProps<{ instanceId: BuilderConfig["instanceId"]; host: PluginHost }>();
const { t } = useI18n();
const draft = reactive(props.host.readBuilder(props.instanceId));
const saved = ref(false);
const handoffs = ref<HandoffRecord[]>([]);
const missions = ref<MissionRecord[]>([]);
const handoffNote = ref("");
const handoffOk = ref(false);
const handoffBusy = ref(false);
const missionNote = ref("");
const missionOk = ref(false);
const missionBusy = ref(false);
const requests = MANIFESTS.find((item) => item.id === "builder")!.requests;

function save() {
  props.host.saveBuilder({ ...draft });
  saved.value = true;
}

function press() {
  draft.buttonPresses += 1;
  saved.value = false;
}

function approve() {
  draft.mockApproval = "simulated";
  saved.value = false;
}

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
    const sourceRef = `builder-${props.instanceId}`;
    handoffs.value = page.items.filter((item) => item.source === "builder" && item.sourceRef === sourceRef);
  } catch {
    handoffs.value = [];
  }
}

async function recordHandoff() {
  const request = builderHandoff(props.instanceId, draft.draftTitle, draft.draftBody);
  const gate = { busy: handoffBusy.value };
  if (!request || !beginHandoff(gate)) return;
  handoffBusy.value = true;
  handoffOk.value = false;
  handoffNote.value = "";
  try {
    const recorded = await runtimeApi.recordHandoff(request);
    if (!handoffSucceeded(recorded)) {
      handoffNote.value = t("plugin.handoffRejected");
      return;
    }
    handoffOk.value = true;
    handoffNote.value = t("plugin.handoffDone", recorded);
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

onMounted(() => {
  void loadHandoffs();
  void loadMissions();
});
</script>

<template>
  <section class="view" :data-testid="`builder-${instanceId}`">
    <div class="page-head">
      <p class="eyebrow">BUILDER</p>
      <h1>{{ instanceId === "alpha" ? t("plugin.builderAlpha") : t("plugin.builderBeta") }}</h1>
      <p>{{ t("plugin.storage") }}</p>
    </div>
    <div class="builder-layout">
      <form class="stack" @submit.prevent="save">
        <p>
          <Badge tone="warning" :label="t('plugin.mock')" />
        </p>
        <label>
          {{ t("plugin.repo") }}
          <input v-model="draft.mockRepositoryLabel" data-testid="mock-repository" @input="saved = false" />
        </label>
        <p class="hint">{{ t("plugin.repoNote") }}</p>
        <label>
          {{ t("plugin.title") }}
          <input v-model="draft.draftTitle" data-testid="draft-title" @input="saved = false" />
        </label>
        <label>
          {{ t("plugin.body") }}
          <textarea v-model="draft.draftBody" rows="5" data-testid="draft-body" @input="saved = false" />
        </label>
        <Button variant="primary" type="submit" data-testid="save-prototype">{{ t("plugin.save") }}</Button>
        <Feedback v-if="saved" tone="success">{{ t("plugin.saved") }}</Feedback>
      </form>
      <PrototypePreview
        :title="draft.draftTitle"
        :body="draft.draftBody"
        :presses="draft.buttonPresses"
        @press="press"
      />
    </div>
    <section class="stack task" data-testid="mock-task">
      <p>
        <Badge tone="warning" :label="t('plugin.mock')" />
        <strong> {{ t("plugin.task") }}</strong>
      </p>
      <p class="hint">{{ t("plugin.taskBody") }}</p>
      <p class="hint">{{ t("plugin.requests") }}：{{ requests.map((item) => item.id).join("、") }}</p>
      <p class="hint">{{ t("plugin.grants") }}：{{ GRANTS.length ? GRANTS.join("、") : t("plugin.noGrant") }}</p>
      <Button data-testid="mock-approve" variant="secondary" @click="approve">{{ t("plugin.approve") }}</Button>
      <Feedback v-if="draft.mockApproval === 'simulated'" tone="warning">{{ t("plugin.approved") }}</Feedback>
      <Button
        data-testid="builder-handoff"
        variant="secondary"
        type="button"
        :disabled="handoffBusy || !draft.draftTitle.trim() && !draft.draftBody.trim()"
        @click="recordHandoff"
      >
        {{ t("plugin.handoff") }}
      </Button>
      <p class="hint">{{ t("plugin.handoffHint") }} {{ t("plugin.handoffRepeat") }}</p>
      <Feedback v-if="handoffNote" :tone="handoffOk ? 'info' : 'warning'">{{ handoffNote }}</Feedback>
      <ul v-if="handoffs.length">
        <li v-for="item in handoffs" :key="item.id">
          <p>{{ item.summary }} · {{ item.execution }} · {{ item.grant }}</p>
          <Button
            variant="secondary"
            type="button"
            data-testid="builder-mission"
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
      <Button data-testid="deliver-write" variant="danger" disabled>{{ t("plugin.deliver") }}</Button>
      <p class="hint">{{ t("plugin.deliverDenied") }}</p>
    </section>
  </section>
</template>

<style scoped>
.builder-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}

.stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stack input,
.stack textarea {
  display: block;
  width: 100%;
  margin-top: 4px;
}

.task {
  max-width: 40rem;
}
</style>
