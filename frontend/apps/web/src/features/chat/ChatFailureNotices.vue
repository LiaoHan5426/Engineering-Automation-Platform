<script setup lang="ts">
import { Button, Feedback } from '@eap/ui'
import { useI18n } from 'vue-i18n'
import { workbench } from '../shell/workbench'
import type { ChatSession } from './chatSession'

defineProps<{
  session: ChatSession
  hasModel: boolean
  /** Agent mode is selected but its code-task preconditions are not met. */
  agentBlocked: boolean
}>()
const emit = defineEmits<{ send: [] }>()
const { t } = useI18n()
</script>

<template>
  <Button
    v-if="session.failure.value === 'target-changed'"
    type="button"
    :disabled="!hasModel || session.sending.value"
    @click="
      session.chooseConversationConnection(
        session.boundConnectionId.value!,
        session.boundModel.value,
      )
    "
    >{{ t('modelUi.reconnect') }}</Button
  >
  <Button
    v-if="
      !session.expired.value &&
      !session.graphError.value &&
      !session.graphLoading.value &&
      (session.failure.value === 'failed' ||
        session.failure.value === 'kept' ||
        session.failure.value === 'cancelled' ||
        session.failure.value === 'not-configured')
    "
    type="button"
    data-testid="retry-send"
    :disabled="session.sending.value || !session.draft.value.trim() || agentBlocked"
    @click="emit('send')"
    >{{ t('desktop.retrySend') }}</Button
  >
  <a
    v-if="session.failure.value === 'not-configured'"
    data-testid="locate-settings"
    :title="t('desktop.locateSettingsNote')"
    href="#model-settings"
    >{{ t('desktop.locateSettings') }}</a
  >
  <Button
    v-if="
      session.failure.value === 'model-unavailable' ||
      session.failure.value === 'target-change-failed'
    "
    type="button"
    data-testid="locate-model"
    :title="t('desktop.locateModelNote')"
    @click="workbench.modelMenuToken += 1"
    >{{ t('desktop.locateModel') }}</Button
  >
  <Feedback v-if="session.targetNotice.value === 'cleared'" tone="info">{{
    t('chat.memoryCleared')
  }}</Feedback>
  <Feedback v-if="session.targetNotice.value === 'kept'" tone="info">{{
    t('modelUi.memoryKept')
  }}</Feedback>
  <Feedback v-if="session.contextMemoryCleared.value" data-testid="context-cleared" tone="info">{{
    t('skill.cleared')
  }}</Feedback>
  <Feedback v-else-if="session.knowledgeMemoryCleared.value" tone="info">{{
    t('knowledgeContext.cleared')
  }}</Feedback>
  <Feedback v-if="session.failure.value.startsWith('skill-')" tone="warning">{{
    t('skill.' + session.failure.value.slice('skill-'.length))
  }}</Feedback>
  <Feedback v-if="session.failure.value.startsWith('knowledge-')" tone="warning">{{
    t('knowledgeContext.' + session.failure.value.slice('knowledge-'.length))
  }}</Feedback>
  <Feedback
    v-else-if="session.failure.value === 'context-budget-exceeded'"
    data-testid="context-budget-exceeded"
    tone="warning"
  >
    <p>{{ t('contextBudget.exceeded') }}</p>
    <p v-if="session.lastContextBudget.value">
      {{
        t('contextBudget.exceededDetail', {
          used: session.lastContextBudget.value.usedChars,
          platform: session.lastContextBudget.value.platformLimit,
          reserve: session.lastContextBudget.value.outputReserve,
          metering: session.lastContextBudget.value.metering,
        })
      }}
    </p>
  </Feedback>
  <Feedback v-else-if="session.failure.value === 'protocol-tools-unavailable'" tone="warning">{{
    t('modelUi.protocolToolsUnavailable')
  }}</Feedback>
  <Feedback v-else-if="session.failure.value.startsWith('generation-')" tone="warning">{{
    t('generation.' + session.failure.value)
  }}</Feedback>
  <Feedback
    v-else-if="
      session.failure.value &&
      !session.failure.value.startsWith('skill-') &&
      !['reconnect-failed', 'workspace-changed'].includes(session.failure.value)
    "
    tone="warning"
    >{{
      t(
        session.failure.value === 'target-changed'
          ? 'modelUi.retryTarget'
          : session.failure.value === 'model-unavailable'
            ? 'modelUi.unavailable'
            : session.failure.value === 'not-configured'
              ? 'chat.notConfigured'
              : session.failure.value === 'target-change-failed'
                ? 'chat.targetChangeFailed'
                : 'desktop.retrySame',
      )
    }}</Feedback
  >
  <Button
    v-if="session.failure.value === 'generation-stale'"
    data-testid="retry-generation"
    :disabled="session.sending.value || !session.draft.value.trim()"
    @click="emit('send')"
    >{{ t('generation.retry') }}</Button
  >
</template>
