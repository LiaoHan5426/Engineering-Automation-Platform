<script setup lang="ts">
import { AiToolMode } from '@eap/runtime-client'
import { Button, ConfirmBox, Feedback } from '@eap/ui'
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { workbench } from '../shell/workbench'
import type { ChatSession } from './chatSession'

const props = defineProps<{
  session: ChatSession
  active: boolean
  archived: boolean
  historyNote: string
  /** The delete dialog shows the history note itself. */
  hideHistoryNote: boolean
  /** Resends the kept draft once a reconnect reports it is safe to retry. */
  retrySend: () => Promise<void>
}>()
const { t } = useI18n()
const session = props.session

const graphRetryControl = ref<InstanceType<typeof Button>>()
async function retryGraph() {
  const id = session.conversationId.value
  const control = graphRetryControl.value?.$el as HTMLButtonElement | undefined
  const restoreFocus = document.activeElement === control
  await session.retryGraph()
  await nextTick()
  if (
    restoreFocus &&
    session.conversationId.value === id &&
    session.graphError.value &&
    control?.isConnected
  )
    control.focus()
}

const reconnectConfirmId = ref<string | null>(null)
const reconnectActionBusy = ref(false)
const reconnectLabel = computed(() =>
  t(session.draft.value.trim() ? 'historyUi.reconnectRetry' : 'historyUi.reconnect'),
)
watch(
  () => session.conversationId.value,
  () => {
    reconnectConfirmId.value = null
  },
)
async function confirmReconnect() {
  const id = reconnectConfirmId.value
  if (!id || reconnectActionBusy.value || id !== session.conversationId.value) return
  reconnectActionBusy.value = true
  try {
    const result = await session.reconnectConversation()
    reconnectConfirmId.value = null
    if (
      result?.readyToRetry &&
      props.active &&
      session.conversationId.value === id &&
      session.draft.value.trim()
    )
      await props.retrySend()
  } finally {
    reconnectActionBusy.value = false
  }
}
</script>

<template>
  <Feedback v-if="session.browsingHistory.value" tone="info" data-testid="branch-reading">
    {{ t('chat.readingBranch') }}
    <Button
      size="sm"
      variant="secondary"
      data-testid="branch-latest"
      @click="session.showLatestMessages()"
      >{{ t('chat.latestBranch') }}</Button
    >
  </Feedback>
  <Feedback
    v-if="session.graphError.value || session.graphLoading.value"
    :tone="session.graphError.value ? 'warning' : 'info'"
    data-testid="graph-error"
  >
    {{ t(session.graphError.value ? 'historyUi.graphFailed' : 'historyUi.graphLoading') }}
    <Button
      size="sm"
      variant="secondary"
      ref="graphRetryControl"
      data-testid="retry-graph"
      :disabled="session.graphLoading.value || session.sending.value"
      @click="retryGraph"
      >{{ t('historyUi.retryGraph') }}</Button
    >
  </Feedback>
  <Feedback v-if="session.storageError.value" tone="warning">{{
    t('historyUi.storageError')
  }}</Feedback>
  <Feedback
    v-if="historyNote && !hideHistoryNote && session.phase.value !== 'offline'"
    tone="warning"
    >{{ historyNote }}</Feedback
  >
  <slot />
  <Feedback v-if="session.expired.value || archived" tone="warning">{{
    archived ? t('historyUi.archiveNotice') : t('historyUi.expired')
  }}</Feedback>
  <Button
    v-if="session.expired.value && !archived"
    data-testid="reconnect-session"
    :disabled="
      session.reconnecting.value || reconnectActionBusy || session.checkingConversation.value
    "
    @click="reconnectConfirmId = session.conversationId.value"
    >{{ reconnectLabel }}</Button
  >
  <ConfirmBox
    v-if="reconnectConfirmId"
    :title="reconnectLabel"
    :impact="[t('historyUi.reconnectImpact'), t('historyUi.reconnectLocal')]"
    :confirm-label="reconnectLabel"
    :busy="reconnectActionBusy"
    @confirm="confirmReconnect"
    @cancel="reconnectConfirmId = null"
  />
  <Feedback v-if="session.sessionUnavailable.value" tone="warning">{{
    t('historyUi.probeFailed')
  }}</Feedback>
  <Button
    v-if="session.sessionUnavailable.value || (session.expired.value && !archived)"
    data-testid="recheck-session"
    :disabled="
      session.checkingConversation.value || session.reconnecting.value || reconnectActionBusy
    "
    @click="session.recheckConversation()"
    >{{ t('historyUi.recheck') }}</Button
  >
  <Feedback
    v-if="
      session.failure.value === 'reconnect-failed' || session.failure.value === 'workspace-changed'
    "
    data-testid="reconnect-error"
    tone="warning"
    >{{
      t(
        session.failure.value === 'workspace-changed'
          ? 'historyUi.workspaceChanged'
          : 'historyUi.reconnectFailed',
      )
    }}</Feedback
  >
  <Feedback v-if="session.reconnectNotice.value" tone="info">{{
    t(
      session.reconnectNotice.value === 'reset'
        ? 'historyUi.contextReset'
        : 'historyUi.contextKept',
    )
  }}</Feedback>
  <p
    v-if="workbench.executionMode !== 'plan' && session.toolMode.value === AiToolMode.GIT_STATUS"
    class="hint"
  >
    {{ t('chat.gitWarning') }}
  </p>
</template>

<style scoped>
.chat-feed > .hint {
  margin: 4px 0;
  font-size: 11px;
  color: var(--text-soft);
}
</style>
