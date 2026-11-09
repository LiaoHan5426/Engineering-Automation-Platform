<script setup lang="ts">
import { computed, onActivated, onDeactivated, onBeforeUnmount, onMounted, ref } from 'vue'
import axios from 'axios'
import {
  runtimeApi,
  type GitExecutionOperation,
  type ToolExecution,
  type ToolUnknownReviewRequest,
  type ToolProcessReview,
} from '@eap/runtime-client'
import { Badge, Button, Checkbox, Collapse, ConfirmBox, Feedback, Textarea } from '@eap/ui'
import { i18n } from '../../lib/i18n'
import { trustedStdoutNeedsCollapse, trustedStdoutPreview } from './trustedToolInvokeView'

const props = withDefaults(defineProps<{ enabled: boolean; operation?: GitExecutionOperation }>(), {
  operation: 'git-status',
})
const testId = (suffix: string) => 'trusted-' + props.operation + '-' + suffix
const t = (key: string) => i18n.global.t(`toolExecution.${key}`)
const records = ref<ToolExecution[]>([])
const selected = ref<ToolExecution | null>(null)
const busy = ref(false)
const uncertain = ref(false)
const refusal = ref<'denied' | 'rejected' | null>(null)
const loaded = ref(false)
const errorDetail = ref('')
const observedAt = ref('')
const processReview = ref<ToolProcessReview | null>(null)
const processReviewError = ref('')
const reviewNote = ref('')
const reviewChecked = ref(false)
const reviewError = ref('')
const reviewDialog = ref<{ id: string; request: ToolUnknownReviewRequest } | null>(null)
const pendingReview = ref<{ id: string; request: ToolUnknownReviewRequest } | null>(null)
const reviewValid = computed(
  () =>
    reviewChecked.value && reviewNote.value.trim().length >= 10 && reviewNote.value.length <= 2000,
)
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
        Date.parse(
          selected.value.finishedAt ?? selected.value.resolution?.resolvedAt ?? observedAt.value,
        ) - Date.parse(selected.value.createdAt),
      )
    : 0,
)

function accept(row: ToolExecution) {
  if (selected.value?.id !== row.id) processReview.value = null
  if (row.status !== 'UNKNOWN' || selected.value?.id !== row.id) {
    pendingReview.value = null
    reviewNote.value = ''
    reviewChecked.value = false
  }
  reviewError.value = ''
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
    const row = await runtimeApi.gitOperationExecution(props.operation, id, controller.signal)
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
    const response = await runtimeApi.gitOperationExecutions(props.operation, controller.signal)
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
async function openExecution(id: string) {
  if (busy.value || uncertain.value || disposed || suspended || selected.value?.id === id) return
  busy.value = true
  const revision = ++generation
  clearTimeout(timer)
  processReview.value = null
  processReviewError.value = ''
  try {
    const row = await runtimeApi.gitOperationExecution(props.operation, id, controller.signal)
    if (!disposed && !suspended && revision === generation) accept(row)
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
    const row = await runtimeApi.startGitOperationExecution(props.operation, requestId, {
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
    const result = await runtimeApi.cancelGitOperationExecution(
      props.operation,
      row.id,
      controller.signal,
    )
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
async function inspectProcesses() {
  const row = selected.value
  if (
    !row ||
    !['UNKNOWN', 'CLOSED_UNKNOWN'].includes(row.status) ||
    busy.value ||
    disposed ||
    suspended
  )
    return
  busy.value = true
  const revision = ++generation
  processReviewError.value = ''
  processReview.value = null
  try {
    const result = await runtimeApi.gitExecutionProcessReview(
      props.operation,
      row.id,
      controller.signal,
    )
    if (
      !disposed &&
      !suspended &&
      revision === generation &&
      selected.value?.id === result.executionId
    )
      processReview.value = result
  } catch (error) {
    if (!disposed && !suspended && revision === generation)
      processReviewError.value = axios.isAxiosError(error)
        ? ((error.response?.data as { detail?: string })?.detail ?? 'PROCESS_REVIEW_UNAVAILABLE')
        : 'PROCESS_REVIEW_UNAVAILABLE'
  } finally {
    if (revision === generation) busy.value = false
  }
}
function openReview() {
  const row = selected.value
  if (!row || row.status !== 'UNKNOWN' || busy.value || uncertain.value || !reviewValid.value)
    return
  reviewDialog.value = pendingReview.value ?? {
    id: row.id,
    request: {
      requestId: crypto.randomUUID(),
      note: reviewNote.value.trim(),
      processTreeStopped: true,
    },
  }
}
async function resolveUnknown() {
  const review = reviewDialog.value
  if (!review || busy.value || uncertain.value || suspended || disposed) return
  pendingReview.value = review
  busy.value = true
  const revision = ++generation
  try {
    const row = await runtimeApi.resolveUnknownGitExecution(
      props.operation,
      review.id,
      review.request,
      controller.signal,
    )
    if (!disposed && !suspended && revision === generation) accept(row)
  } catch (error) {
    if (revision !== generation || disposed || suspended) return
    if (axios.isAxiosError(error) && [400, 403, 404, 409].includes(error.response?.status ?? 0)) {
      reviewError.value =
        (error.response?.data as { detail?: string })?.detail ?? 'UNKNOWN_REVIEW_REJECTED'
      pendingReview.value = null
    } else failed(error)
  } finally {
    if (revision === generation) {
      busy.value = false
      reviewDialog.value = null
    }
  }
}
onMounted(() => void recheck())
onDeactivated(() => {
  suspended = true
  processReview.value = null
  reviewDialog.value = null
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
  reviewDialog.value = null
  ++generation
  clearTimeout(timer)
  controller.abort()
})
</script>

<template>
  <section class="trusted-git-execution" :data-testid="testId('execution-panel')">
    <h3>{{ t(operation === 'git-diff' ? 'diffTitle' : 'title') }}</h3>
    <p class="hint">
      {{ t('boundary') }} <template v-if="operation === 'git-diff'">{{ t('diffScope') }}</template>
    </p>
    <div class="form-actions">
      <Button
        variant="secondary"
        size="sm"
        :data-testid="testId('invoke')"
        :disabled="!enabled || busy || blocking || uncertain || !loaded"
        @click="start()"
        >{{ t(operation === 'git-diff' ? 'diffStart' : 'start') }}</Button
      >
      <Button
        v-if="selected && active(selected)"
        variant="secondary"
        size="sm"
        :data-testid="testId('cancel')"
        :disabled="busy || selected.status === 'CANCELLING'"
        @click="cancel"
        >{{ t('cancel') }}</Button
      >
      <Button
        variant="secondary"
        size="sm"
        :data-testid="testId('recheck')"
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
          :data-testid="
            operation === 'git-status' ? 'trusted-git-mock-' + scenario : testId('mock-' + scenario)
          "
          @click="start(scenario)"
          >{{ t(`mock${scenario[0]?.toUpperCase()}${scenario.slice(1)}`) }}</Button
        >
      </template>
    </div>
    <p v-if="busy" class="hint">{{ t('waiting') }}</p>
    <Feedback v-if="uncertain" tone="warning" :data-testid="testId('network')"
      >{{ t('network') }} · {{ errorDetail }}</Feedback
    >
    <Feedback v-if="refusal" tone="error" :data-testid="testId(refusal ?? 'rejected')">
      {{ t(refusal === 'denied' ? 'denied' : 'startRejected') }} · {{ errorDetail }}
    </Feedback>
    <template v-if="selected">
      <p class="hint" :data-testid="testId('summary')">
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
        :data-testid="testId('cancelling')"
        >{{ t('cancelPending') }}</Feedback
      >
      <Feedback
        v-if="selected.status === 'CANCELLED'"
        tone="success"
        :data-testid="testId('cancelled')"
        >{{ t('CANCELLED') }} · {{ selected.exitEvidence }}</Feedback
      >
      <Feedback v-if="selected.status === 'UNKNOWN'" tone="warning" :data-testid="testId('unknown')"
        >{{ t('unknown') }} · {{ selected.unconfirmedReason }}</Feedback
      >
      <template v-if="['UNKNOWN', 'CLOSED_UNKNOWN'].includes(selected.status)">
        <Button
          variant="secondary"
          size="sm"
          :disabled="busy"
          :data-testid="testId('process-inspect')"
          @click="inspectProcesses"
          >{{ t('processInspect') }}</Button
        >
        <p class="hint">{{ t('processBoundary') }}</p>
        <Feedback v-if="processReviewError" tone="warning" :data-testid="testId('process-error')">{{
          processReviewError
        }}</Feedback>
        <div v-if="processReview" :data-testid="testId('process-observation')">
          <p>{{ t('observed') }} {{ processReview.observedAt }} · {{ t('processSnapshot') }}</p>
          <p v-if="!processReview.steps.length" class="hint">{{ t('processNoIdentity') }}</p>
          <p v-if="processReview.truncated" class="hint">{{ t('processLimited') }}</p>
          <div v-for="step in processReview.steps" :key="step.stepId">
            <p>{{ step.phase }}</p>
            <p v-if="!step.descendantsCaptured" class="hint">{{ t('processDescendantsLegacy') }}</p>
            <p v-else-if="!step.descendants?.length" class="hint">
              {{ t('processDescendantsEmpty') }}
            </p>
            <p v-if="step.descendantsTruncated" class="hint">
              {{ t('processDescendantsLimited') }}
            </p>
            <div
              v-for="(identity, index) in [step.process, ...(step.descendants ?? [])]"
              :key="index"
            >
              <p>
                {{ t(index === 0 ? 'processParent' : 'processDescendant') }} ·
                {{ t('process' + identity.status) }} · PID {{ identity.pid ?? '—' }}
              </p>
              <p>
                {{ t('processCaptured') }} · {{ identity.capturedStartedAt ?? '—' }} ·
                {{ identity.capturedExecutable || '—' }}
              </p>
              <p>
                {{ t('processCurrent') }} · {{ identity.observedStartedAt ?? '—' }} ·
                {{ identity.observedExecutable || '—' }}
              </p>
            </div>
          </div>
        </div>
      </template>
      <template v-if="['UNKNOWN', 'CLOSED_UNKNOWN'].includes(selected.status)">
        <Collapse :data-testid="testId('execution-evidence')">
          <template #summary>{{ t('reviewEvidence') }}</template>
          <p class="hint">{{ t('reviewEvidenceHint') }}</p>
          <p class="hint">{{ t('reviewEvidencePreserved') }}</p>
          <div v-for="step in selected.steps" :key="step.id">
            <p>{{ step.phase }} · {{ step.status }}</p>
            <pre class="trusted-git-result">{{ JSON.stringify(step.command) }}</pre>
            <pre class="trusted-git-result">{{ JSON.stringify(step.evidence, null, 2) }}</pre>
          </div>
        </Collapse>
      </template>
      <template v-if="selected.status === 'UNKNOWN'">
        <p class="hint">{{ t('reviewBoundary') }}</p>
        <label
          >{{ t('reviewNote') }}
          <Textarea
            v-model="reviewNote"
            :maxlength="2000"
            :disabled="busy || uncertain || !!pendingReview"
            :data-testid="testId('review-note')"
          />
        </label>
        <label
          ><Checkbox
            v-model="reviewChecked"
            :disabled="busy || uncertain || !!pendingReview"
            :data-testid="testId('review-checked')"
          />{{ t('reviewAttestation') }}</label
        >
        <Feedback v-if="reviewError" tone="error" :data-testid="testId('review-error')">{{
          reviewError
        }}</Feedback>
        <Button
          variant="secondary"
          size="sm"
          :disabled="busy || uncertain || !reviewValid"
          :data-testid="testId('review-open')"
          @click="openReview"
          >{{ t('reviewOpen') }}</Button
        >
      </template>
      <Feedback
        v-if="selected.resolution"
        tone="warning"
        :data-testid="testId('review-resolution')"
      >
        {{ t('CLOSED_UNKNOWN') }} · {{ selected.resolution.operator }} ·
        {{ selected.resolution.resolvedAt }}
        <br />{{ selected.resolution.note }} <br />{{ t('originalUnknown') }} ·
        {{ selected.unconfirmedReason }}
      </Feedback>
      <p v-if="selected.exitEvidence" class="hint">
        {{ t('evidence') }} · {{ selected.exitEvidence }}
      </p>
      <p v-if="selected.truncated" class="hint">{{ t('truncated') }}</p>
      <Collapse v-if="trustedStdoutNeedsCollapse(selected.stdout)">
        <template #summary>{{ trustedStdoutPreview(selected.stdout) }}</template>
        <pre class="trusted-git-result" :data-testid="testId('result')">{{ selected.stdout }}</pre>
      </Collapse>
      <pre v-else-if="selected.stdout" class="trusted-git-result" :data-testid="testId('result')">{{
        selected.stdout
      }}</pre>
      <pre v-if="selected.stderr" class="trusted-git-result">{{ selected.stderr }}</pre>
      <p v-if="selected.steps.length" class="hint">
        {{ t('steps') }}:
        {{ selected.steps.map((step) => `${step.phase}: ${step.status}`).join(' · ') }}
      </p>
    </template>
    <h4>{{ t('history') }}</h4>
    <p v-if="loaded && !records.length" class="hint">{{ t('empty') }}</p>
    <ul class="trusted-tool-list" :data-testid="testId('history')">
      <li v-for="row in records" :key="row.id">
        <Collapse>
          <template #summary>{{ row.createdAt }} · {{ row.id }} · {{ t(row.status) }}</template>
          <p>{{ row.exitEvidence || row.unconfirmedReason }}</p>
          <p v-if="row.resolution">
            {{ t('CLOSED_UNKNOWN') }} · {{ row.resolution.operator }} ·
            {{ row.resolution.resolvedAt }} · {{ row.resolution.note }}
          </p>
          <Button
            variant="secondary"
            size="sm"
            :disabled="busy || uncertain || selected?.id === row.id"
            :data-testid="testId('history-open-' + row.id)"
            @click="openExecution(row.id)"
            >{{ t('historyOpen') }}</Button
          >
          <pre class="trusted-git-result">{{ row.stdout }}{{ row.stderr }}</pre>
        </Collapse>
      </li>
    </ul>
    <ConfirmBox
      v-if="reviewDialog"
      :title="t('reviewTitle')"
      :impact="[
        reviewDialog.id,
        selected?.workspacePath ?? '',
        t('reviewImpact'),
        reviewDialog.request.note,
      ]"
      :confirm-label="t('reviewConfirm')"
      :busy="busy"
      :refusal="uncertain ? t('network') : undefined"
      @confirm="resolveUnknown"
      @cancel="reviewDialog = null"
    />
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
