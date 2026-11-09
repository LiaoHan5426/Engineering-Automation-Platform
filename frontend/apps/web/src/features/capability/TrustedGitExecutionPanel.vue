<script setup lang="ts">
import { computed, onActivated, onDeactivated, onBeforeUnmount, onMounted, ref } from 'vue'
import axios from 'axios'
import { runtimeApi, type ToolExecution } from '@eap/runtime-client'
import { Badge, Button, Collapse, Feedback } from '@eap/ui'
import { i18n } from '../../lib/i18n'
import { trustedStdoutNeedsCollapse, trustedStdoutPreview } from './trustedToolInvokeView'

defineProps<{ enabled: boolean }>()
const t = (key: string) => i18n.global.t(`toolExecution.${key}`)
const records = ref<ToolExecution[]>([])
const selected = ref<ToolExecution | null>(null)
const busy = ref(false)
const uncertain = ref(false)
const refusal = ref<'denied' | 'rejected' | null>(null)
const loaded = ref(false)
const errorDetail = ref('')
const observedAt = ref('')
let controller = new AbortController()
let timer: ReturnType<typeof setTimeout> | undefined
let disposed = false
let suspended = false
let requestId: string | null = null
let generation = 0
const active = (row: ToolExecution) => ['CREATED', 'RUNNING', 'CANCELLING'].includes(row.status)
const blocking = computed(() =>
  records.value.some((row) => active(row) || row.status === 'UNKNOWN'),
)
const mock = import.meta.env.MODE === 'mock'
const elapsed = computed(() =>
  selected.value
    ? Math.max(
        0,
        Date.parse(selected.value.finishedAt ?? observedAt.value) -
          Date.parse(selected.value.createdAt),
      )
    : 0,
)

function accept(row: ToolExecution) {
  selected.value = row
  records.value = [row, ...records.value.filter((item) => item.id !== row.id)].slice(0, 20)
  observedAt.value = new Date().toISOString()
  uncertain.value = false
  refusal.value = null
  errorDetail.value = ''
  if (!active(row) && row.status !== 'UNKNOWN') requestId = null
}
function failed(error: unknown, starting = false) {
  if (disposed || suspended) return
  uncertain.value = true
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { detail?: string; execution?: ToolExecution } | undefined
    if (data?.execution) {
      accept(data.execution)
      return
    }
    if (starting && [400, 403, 409, 429].includes(error.response?.status ?? 0)) {
      uncertain.value = false
      refusal.value = error.response?.status === 403 ? 'denied' : 'rejected'
      selected.value = null
      requestId = null
    }
    errorDetail.value = data?.detail ?? 'TRANSPORT_UNCONFIRMED'
  } else errorDetail.value = 'TRANSPORT_UNCONFIRMED'
}
function schedule() {
  clearTimeout(timer)
  if (!disposed && !suspended && !uncertain.value && selected.value && active(selected.value)) {
    timer = setTimeout(() => void poll(), 1000)
  }
}
async function poll() {
  const id = selected.value?.id
  if (!id || disposed || suspended || busy.value) return
  const revision = ++generation
  try {
    const row = await runtimeApi.trustedGitExecution(id, controller.signal)
    if (!disposed && revision === generation) accept(row)
  } catch (error) {
    if (revision === generation) failed(error)
  }
  if (revision === generation) schedule()
}
async function recheck() {
  if (busy.value || disposed || suspended) return
  busy.value = true
  const revision = ++generation
  clearTimeout(timer)
  try {
    const response = await runtimeApi.trustedGitExecutions(controller.signal)
    if (disposed || suspended || revision !== generation) return
    records.value = response.items
    const row =
      response.items.find((item) => active(item) || item.status === 'UNKNOWN') ?? response.items[0]
    uncertain.value = false
    refusal.value = null
    if (row) accept(row)
    else selected.value = null
    loaded.value = true
  } catch (error) {
    if (revision === generation) failed(error)
  } finally {
    if (revision === generation) {
      busy.value = false
      schedule()
    }
  }
}
async function start(mockOutcome?: string) {
  if (busy.value || blocking.value || uncertain.value || !loaded.value) return
  busy.value = true
  const revision = ++generation
  requestId ??= crypto.randomUUID()
  try {
    const row = await runtimeApi.startTrustedGitExecution(requestId, {
      signal: controller.signal,
      mockOutcome: mock ? mockOutcome : undefined,
    })
    if (!disposed && !suspended && revision === generation) accept(row)
  } catch (error) {
    if (revision === generation) failed(error, true)
  } finally {
    if (revision === generation) {
      busy.value = false
      schedule()
    }
  }
}
async function cancel() {
  const row = selected.value
  if (!row || !active(row) || row.status === 'CANCELLING' || busy.value) return
  busy.value = true
  const revision = ++generation // A late poll cannot overwrite the cancellation acknowledgement.
  clearTimeout(timer)
  try {
    const result = await runtimeApi.cancelTrustedGitExecution(row.id, controller.signal)
    if (!disposed && !suspended && revision === generation) accept(result)
  } catch (error) {
    if (revision === generation) failed(error)
  } finally {
    if (revision === generation) {
      busy.value = false
      schedule()
    }
  }
}
onMounted(() => void recheck())
onDeactivated(() => {
  suspended = true
  ++generation
  busy.value = false
  clearTimeout(timer)
  controller.abort()
})
onActivated(() => {
  if (!suspended) return
  suspended = false
  controller = new AbortController()
  void recheck()
})
onBeforeUnmount(() => {
  disposed = true
  ++generation
  clearTimeout(timer)
  controller.abort()
})
</script>

<template>
  <section class="trusted-git-execution" data-testid="trusted-git-execution-panel">
    <h3>{{ t('title') }}</h3>
    <p class="hint">{{ t('boundary') }}</p>
    <div class="form-actions">
      <Button
        variant="secondary"
        size="sm"
        data-testid="trusted-git-status-invoke"
        :disabled="!enabled || busy || blocking || uncertain || !loaded"
        @click="start()"
        >{{ t('start') }}</Button
      >
      <Button
        v-if="selected && active(selected)"
        variant="secondary"
        size="sm"
        data-testid="trusted-git-status-cancel"
        :disabled="busy || selected.status === 'CANCELLING'"
        @click="cancel"
        >{{ t('cancel') }}</Button
      >
      <Button
        variant="secondary"
        size="sm"
        data-testid="trusted-git-status-recheck"
        :disabled="busy"
        @click="recheck"
        >{{ t('recheck') }}</Button
      >
      <template v-if="mock">
        <Button
          v-for="scenario in ['running', 'unknown', 'timeout', 'denied']"
          :key="scenario"
          variant="secondary"
          size="sm"
          :disabled="busy || blocking || uncertain || !loaded"
          :data-testid="`trusted-git-mock-${scenario}`"
          @click="start(scenario)"
          >{{ t(`mock${scenario[0]?.toUpperCase()}${scenario.slice(1)}`) }}</Button
        >
      </template>
    </div>
    <p v-if="busy" class="hint">{{ t('waiting') }}</p>
    <Feedback v-if="uncertain" tone="warning" data-testid="trusted-git-status-network"
      >{{ t('network') }} · {{ errorDetail }}</Feedback
    >
    <Feedback v-if="refusal" tone="error" :data-testid="`trusted-git-status-${refusal}`">
      {{ t(refusal === 'denied' ? 'denied' : 'startRejected') }} · {{ errorDetail }}
    </Feedback>
    <template v-if="selected">
      <p class="hint" data-testid="trusted-git-status-summary">
        <code>{{ selected.id }}</code> · {{ selected.programId }} / {{ selected.capabilityId }} ·
        <Badge :tone="selected.status === 'SUCCEEDED' ? 'success' : 'warning'">{{
          t(selected.status)
        }}</Badge>
        · {{ t('elapsed') }} {{ elapsed }} ms · {{ t('observed') }} {{ observedAt }}
        <template v-if="selected.exitCode != null"> · exit {{ selected.exitCode }}</template>
      </p>
      <p class="hint">
        <code>{{ selected.workspacePath }}</code> · <code>{{ selected.executable }}</code>
      </p>
      <Feedback
        v-if="selected.status === 'CANCELLING'"
        tone="warning"
        data-testid="trusted-git-status-cancelling"
        >{{ t('cancelPending') }}</Feedback
      >
      <Feedback
        v-if="selected.status === 'CANCELLED'"
        tone="success"
        data-testid="trusted-git-status-cancelled"
        >{{ t('CANCELLED') }} · {{ selected.exitEvidence }}</Feedback
      >
      <Feedback
        v-if="selected.status === 'UNKNOWN'"
        tone="warning"
        data-testid="trusted-git-status-unknown"
        >{{ t('unknown') }} · {{ selected.unconfirmedReason }}</Feedback
      >
      <p v-if="selected.exitEvidence" class="hint">
        {{ t('evidence') }} · {{ selected.exitEvidence }}
      </p>
      <p v-if="selected.truncated" class="hint">{{ t('truncated') }}</p>
      <Collapse v-if="trustedStdoutNeedsCollapse(selected.stdout)">
        <template #summary>{{ trustedStdoutPreview(selected.stdout) }}</template>
        <pre class="trusted-git-result" data-testid="trusted-git-status-result">{{
          selected.stdout
        }}</pre>
      </Collapse>
      <pre
        v-else-if="selected.stdout"
        class="trusted-git-result"
        data-testid="trusted-git-status-result"
        >{{ selected.stdout }}</pre>
      <pre v-if="selected.stderr" class="trusted-git-result">{{ selected.stderr }}</pre>
      <p v-if="selected.steps.length" class="hint">
        {{ t('steps') }}:
        {{ selected.steps.map((step) => `${step.phase}: ${step.status}`).join(' · ') }}
      </p>
    </template>
    <h4>{{ t('history') }}</h4>
    <p v-if="loaded && !records.length" class="hint">{{ t('empty') }}</p>
    <ul class="trusted-tool-list" data-testid="trusted-git-history">
      <li v-for="row in records" :key="row.id">
        <Collapse>
          <template #summary>{{ row.createdAt }} · {{ row.id }} · {{ t(row.status) }}</template>
          <p>{{ row.exitEvidence || row.unconfirmedReason }}</p>
          <pre class="trusted-git-result">{{ row.stdout }}{{ row.stderr }}</pre>
        </Collapse>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.trusted-git-execution {
  min-width: 0;
  overflow-wrap: anywhere;
}

.trusted-git-result {
  max-height: 20rem;
  overflow: auto;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
</style>
