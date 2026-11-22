<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { runtimeApi, isChatExecutionStatus, type ChatExecutionSnapshot } from '@eap/runtime-client'
import { Badge, Button, Collapse, Dialog, Feedback } from '@eap/ui'
import { errorMessage } from '../../lib/presentation'

const props = defineProps<{ conversationId: string; executionId: string }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const snapshot = ref<ChatExecutionSnapshot>()
const refreshControl = ref<InstanceType<typeof Button>>()
const busy = ref(false)
const error = ref('')
let revision = 0
async function load(restoreFocus = false) {
  const ticket = ++revision
  busy.value = true
  error.value = ''
  try {
    const result = await runtimeApi.executionSnapshot(props.conversationId, props.executionId, 0)
    if (ticket === revision) snapshot.value = result
  } catch (failure) {
    if (ticket === revision) error.value = errorMessage(failure)
  } finally {
    if (ticket === revision) {
      busy.value = false
      await nextTick()
      if (ticket === revision && restoreFocus) refreshControl.value?.$el.focus()
    }
  }
}
function statusLabel(status: string) {
  return isChatExecutionStatus(status) ? t(`executionLog.status.${status}`) : status
}
watch(
  () => [props.conversationId, props.executionId],
  () => {
    snapshot.value = undefined
    void load()
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  revision++
})
</script>

<template>
  <Dialog
    :title="t('executionLog.title')"
    :close-label="t('executionLog.close')"
    @close="emit('close')"
  >
    <section class="execution-log" data-testid="execution-log">
      <p class="hint">{{ t('executionLog.boundary') }}</p>
      <Button ref="refreshControl" size="sm" :disabled="busy" data-testid="execution-log-refresh" @click="load(true)">
        {{ busy ? t('executionLog.loading') : t('executionLog.refresh') }}
      </Button>
      <Feedback v-if="error" tone="warning" data-testid="execution-log-error">{{ error }}</Feedback>
      <p v-if="error && snapshot" class="hint">{{ t('executionLog.stale') }}</p>
      <template v-if="snapshot">
        <div class="execution-log__summary">
          <Badge>{{ statusLabel(snapshot.status) }}</Badge>
          <span>{{
            t(snapshot.complete ? 'executionLog.complete' : 'executionLog.incomplete')
          }}</span>
          <span>{{ t('executionLog.sequence') }}: {{ snapshot.latestSequence }}</span>
        </div>
        <Collapse>
          <template #summary>{{ t('executionLog.details') }}</template>
          <code class="execution-log__identity" data-testid="execution-log-id">{{
            snapshot.executionId
          }}</code>
        </Collapse>
        <p v-if="!snapshot.events.length" class="hint">{{ t('executionLog.empty') }}</p>
        <ol v-else class="execution-log__events" :aria-label="t('executionLog.events')">
          <li v-for="event in snapshot.events" :key="event.eventId" class="execution-log__event">
            <div class="execution-log__summary">
              <strong>#{{ event.sequence }} · {{ event.type }}</strong>
              <time :datetime="event.occurredAt">{{ event.occurredAt }}</time>
              <Badge v-if="event.status">{{ statusLabel(event.status) }}</Badge>
            </div>
            <p v-if="event.text || event.message" class="execution-log__text">
              {{ event.text || event.message }}
            </p>
            <code v-if="event.code">{{ event.code }}</code>
            <Collapse v-if="event.payload != null">
              <template #summary>{{ t('executionLog.details') }}</template>
              <pre class="execution-log__payload">{{ JSON.stringify(event.payload, null, 2) }}</pre>
            </Collapse>
          </li>
        </ol>
      </template>
    </section>
  </Dialog>
</template>

<style scoped>
.execution-log {
  display: grid;
  gap: 1rem;
  min-width: 0;
}

.execution-log__summary {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  font-variant-numeric: tabular-nums;
}

.execution-log__events {
  display: grid;
  gap: 1rem;
  padding-inline-start: 1.5rem;
}

.execution-log__event {
  min-width: 0;
}

.execution-log__text,
.execution-log__payload {
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.execution-log__identity {
  overflow-wrap: anywhere;
}

.execution-log__payload {
  max-height: 20rem;
  overflow: auto;
}
</style>
