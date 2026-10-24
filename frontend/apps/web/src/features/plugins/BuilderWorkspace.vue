<script setup lang="ts">
import { reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import { Badge, Button, Feedback } from "@eap/ui";
import PrototypePreview from "./PrototypePreview.vue";
import type { PluginHost } from "./host";
import { GRANTS, MANIFESTS, type BuilderConfig } from "./model";

const props = defineProps<{ instanceId: BuilderConfig["instanceId"]; host: PluginHost }>();
const { t } = useI18n();
const draft = reactive(props.host.readBuilder(props.instanceId));
const saved = ref(false);
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
