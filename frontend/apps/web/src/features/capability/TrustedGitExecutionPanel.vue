<script setup lang="ts">
import { GitErrors } from '@eap/runtime-client'
import { CliProgramErrors } from '@eap/runtime-client'
import { WorkspaceErrors } from '@eap/runtime-client'
import { ExecutionErrors } from '@eap/runtime-client'
import { isToolExecutionStatusActive } from '@eap/runtime-client'

import { hasWireValue } from '@eap/runtime-client'

import { ToolExecutionStatus } from '@eap/runtime-client'

import { ToolErrors } from '@eap/runtime-client'

import { computed, onActivated, onDeactivated, onBeforeUnmount, onMounted, ref } from 'vue'
import { isRequestError } from '@eap/request'
import {
  runtimeApi,
  type GitExecutionOperation,
  type ToolExecution,
  type ToolUnknownReviewRequest,
  type ToolProcessReview,
  type ToolExecutionReadiness,
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
const readiness = ref<ToolExecutionReadiness | null>(null)
const scopeUnavailable = computed(() => readiness.value?.scopeAccessible === false)
const authorizationBlocked = computed(() => readiness.value?.authorized === false)
const environmentHint = computed(() => {
  const reason = readiness.value?.authorized === false ? readiness.value.reason : errorDetail.value
  if (reason === ToolErrors.TOOL_EXECUTION_STORE_UNAVAILABLE) return t('storeUnavailable')
  if (
    reason === WorkspaceErrors.AUTHORIZED_ROOT_MISSING ||
    reason === WorkspaceErrors.WORKSPACE_CHANGED
  )
    return t('workspaceUnavailable')
  if (reason === ToolErrors.CAPABILITY_DISABLED) return t('operationDisabled')
  if (
    hasWireValue(
      [
        ExecutionErrors.BINARY_MISSING,
        CliProgramErrors.CLI_BINDING_UNAVAILABLE,
        CliProgramErrors.CLI_PROGRAM_BINDING_CONFLICT,
        ToolErrors.TOOL_BINDING_CHANGED,
        GitErrors.GIT_STATUS_HANDLER_MISSING,
        GitErrors.GIT_DIFF_HANDLER_MISSING,
        GitErrors.GIT_STATUS_CAPABILITY_MISSING,
        GitErrors.GIT_DIFF_CAPABILITY_MISSING,
      ],
      reason,
    )
  )
    return t('bindingUnavailable')
  return ''
})
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
const active = (row: ToolExecution) => isToolExecutionStatusActive(row.status)
const blocking = computed(() =>
  records.value.some((row) => active(row) || row.status === ToolExecutionStatus.UNKNOWN),
)
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
  if (row.status !== ToolExecutionStatus.UNKNOWN || selected.value?.id !== row.id) {
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
  if (!active(row) && row.status !== ToolExecutionStatus.UNKNOWN) requestId = null
}
function failed(error: unknown, starting = false) {
  if (disposed || suspended) return
  uncertain.value = true
  if (isRequestError(error)) {
    const data = error.response?.data as { code?: string; execution?: ToolExecution } | undefined
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
    errorDetail.value = data?.code ?? 'TRANSPORT_UNCONFIRMED'
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
    const conditions = await runtimeApi.gitOperationReadiness(props.operation, controller.signal)
    if (disposed || suspended || revision !== generation) return
    readiness.value = conditions
    if (!conditions.scopeAccessible) {
      uncertain.value = true
      errorDetail.value = conditions.reason
      loaded.value = true
      return
    }
    const response = await runtimeApi.gitOperationExecutions(props.operation, controller.signal)
    if (disposed || suspended || revision !== generation) return
    if (
      conditions.blockingExecutionId &&
      !response.items.some((item) => item.id === conditions.blockingExecutionId)
    ) {
      const reserved = await runtimeApi.gitOperationExecution(
        props.operation,
        conditions.blockingExecutionId,
        controller.signal,
      )
      if (disposed || suspended || revision !== generation) return
      response.items = [reserved, ...response.items].slice(0, 20)
    }
    records.value = response.items
    const row =
      response.items.find((item) => active(item) || item.status === ToolExecutionStatus.UNKNOWN) ??
      response.items[0]
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
async function start() {
  if (
    busy.value ||
    blocking.value ||
    uncertain.value ||
    authorizationBlocked.value ||
    !loaded.value
  )
    return
  busy.value = true
  const revision = ++generation
  requestId ??= crypto.randomUUID()
  try {
    const row = await runtimeApi.startGitOperationExecution(props.operation, requestId, {
      signal: controller.signal,
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
  if (
    !row ||
    !active(row) ||
    row.status === ToolExecutionStatus.CANCELLING ||
    busy.value ||
    uncertain.value ||
    disposed ||
    suspended
  )
    return
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
    !hasWireValue([ToolExecutionStatus.UNKNOWN, ToolExecutionStatus.CLOSED_UNKNOWN], row.status) ||
    scopeUnavailable.value ||
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
      processReviewError.value = isRequestError(error)
        ? ((error.response?.data as { code?: string })?.code ?? 'PROCESS_REVIEW_UNAVAILABLE')
        : 'PROCESS_REVIEW_UNAVAILABLE'
  } finally {
    if (revision === generation) busy.value = false
  }
}
function openReview() {
  const row = selected.value
  if (
    !row ||
    row.status !== ToolExecutionStatus.UNKNOWN ||
    busy.value ||
    uncertain.value ||
    !reviewValid.value
  )
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
    if (isRequestError(error) && [400, 403, 404, 409].includes(error.response?.status ?? 0)) {
      reviewError.value =
        (error.response?.data as { code?: string })?.code ?? 'UNKNOWN_REVIEW_REJECTED'
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
        :disabled="!enabled || busy || blocking || uncertain || authorizationBlocked || !loaded"
        @click="start()"
        >{{ t(operation === 'git-diff' ? 'diffStart' : 'start') }}</Button
      >
      <Button
        v-if="selected && active(selected)"
        variant="secondary"
        size="sm"
        :data-testid="testId('cancel')"
        :disabled="busy || uncertain || selected.status === ToolExecutionStatus.CANCELLING"
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
    </div>
    <div v-if="readiness" :data-testid="testId('readiness')">
      <p class="hint">
        {{ t('readiness') }} · {{ readiness.reason }} · {{ t('observed') }}
        {{ readiness.checkedAt }}
      </p>
      <p class="hint">{{ t('readinessBoundary') }}</p>
    </div>
    <Feedback v-if="environmentHint" tone="warning" :data-testid="testId('environment')">{{
      environmentHint
    }}</Feedback>
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
        <Badge :tone="selected.status === ToolExecutionStatus.SUCCEEDED ? 'success' : 'warning'">{{
          t(selected.status)
        }}</Badge>
        · {{ t('elapsed') }} {{ elapsed }} ms · {{ t('observed') }} {{ observedAt }}
        <template v-if="selected.exitCode != null"> · exit {{ selected.exitCode }}</template>
      </p>
      <p class="hint">
        <code>{{ selected.workspacePath }}</code> · <code>{{ selected.executable }}</code>
      </p>
      <Feedback
        v-if="selected.status === ToolExecutionStatus.CANCELLING"
        tone="warning"
        :data-testid="testId('cancelling')"
        >{{ t('cancelPending') }}</Feedback
      >
      <Feedback
        v-if="selected.status === ToolExecutionStatus.CANCELLED"
        tone="success"
        :data-testid="testId('cancelled')"
        >{{ t('CANCELLED') }} · {{ selected.exitEvidence }}</Feedback
      >
      <Feedback
        v-if="selected.status === ToolExecutionStatus.UNKNOWN"
        tone="warning"
        :data-testid="testId('unknown')"
        >{{ t('unknown') }} · {{ selected.unconfirmedReason }}</Feedback
      >
      <Feedback
        v-if="
          selected.cancelRequested &&
          hasWireValue(
            [ToolExecutionStatus.UNKNOWN, ToolExecutionStatus.CLOSED_UNKNOWN],
            selected.status,
          )
        "
        tone="warning"
        :data-testid="testId('cancel-unconfirmed')"
        >{{ t('cancelUnconfirmed') }}</Feedback
      >
      <template
        v-if="
          hasWireValue(
            [ToolExecutionStatus.UNKNOWN, ToolExecutionStatus.CLOSED_UNKNOWN],
            selected.status,
          )
        "
      >
        <Button
          variant="secondary"
          size="sm"
          :disabled="busy || scopeUnavailable"
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
      <template
        v-if="
          hasWireValue(
            [ToolExecutionStatus.UNKNOWN, ToolExecutionStatus.CLOSED_UNKNOWN],
            selected.status,
          )
        "
      >
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
      <template v-if="selected.status === ToolExecutionStatus.UNKNOWN">
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
        t(operation === 'git-diff' ? 'diffTitle' : 'title') + ' · ' + operation,
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
