<script setup lang="ts">
import { onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { Badge, Button, EmptyState, Feedback } from "@eap/ui";
import { runtimeApi, type AiConnectionState } from "@eap/runtime-client";
import { createChatSession } from "./chatSession";

const { t } = useI18n();
const session = createChatSession(runtimeApi);

const stateKey: Record<AiConnectionState, string> = {
  disabled: "chat.disabled",
  not_configured: "chat.not_configured",
  configured_unverified: "chat.configured_unverified",
  available: "chat.available",
  error: "chat.error",
};

onMounted(() => {
  void session.refreshStatus();
});
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
        <textarea v-model="session.draft.value" rows="4" :disabled="!session.conversationId.value || session.sending.value" />
      </label>
      <Button
        variant="primary"
        type="submit"
        :disabled="!session.conversationId.value || session.sending.value || !session.draft.value.trim()"
      >
        {{ session.sending.value ? t("chat.sending") : t("chat.send") }}
      </Button>
    </form>
  </section>
</template>
