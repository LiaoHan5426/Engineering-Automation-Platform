<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  runtimeApi,
  type ExpertAgentDetail,
  type ExpertAgentInput,
  type ExpertAgentResult,
} from '@eap/runtime-client'
import { Button, ConfirmBox, Feedback, Input, Select, Textarea } from '@eap/ui'
import ExpertTaskInspector from './ExpertTaskInspector.vue'
import ProposalDiffView from '../../components/ProposalDiffView.vue'
import { errorMessage } from '../../lib/presentation'
import { useExpertAgentRuns } from './useExpertAgentRuns'

import type { ExpertRoute } from './expertNavigation'
const props = withDefaults(
  defineProps<{
    mode?: 'tasks' | 'start' | 'task' | 'review'
    expertId?: string
    runId?: string
    fromAll?: boolean
  }>(),
  { mode: 'tasks', expertId: '', runId: '', fromAll: false },
)
const emit = defineEmits<{ navigate: [route: ExpertRoute] }>()
const { t, locale } = useI18n()
const {
  runs,
  selected,
  detail,
  automatic,
  busy,
  loading,
  checking,
  readError,
  actionError,
  preview,
  canReview,
  select,
  refresh,
  submit,
  review,
  cancel,
} = useExpertAgentRuns(false, () =>
  props.mode === 'tasks' ? 'list' : props.mode === 'start' ? 'form' : 'detail',
)
const experts = ref<Array<{ id: string; name: string }>>([])
const expert = ref(''),
  sql = ref(''),
  question = ref(''),
  target = ref(''),
  database = ref(''),
  plan = ref('')
const setupError = ref('')
const stateFilter = ref('')
const visibleRuns = computed(() =>
  runs.value.filter(
    (run) =>
      (!props.expertId || run.expertId === props.expertId) &&
      (!stateFilter.value || run.state === stateFilter.value),
  ),
)
function openRun(run: { id: string; expertId: string }) {
  emit('navigate', {
    page: 'task',
    expertId: run.expertId,
    runId: run.id,
    from: props.fromAll ? 'all' : undefined,
  })
}
function openReview() {
  emit('navigate', {
    page: 'review',
    expertId: props.expertId,
    runId: props.runId,
    from: props.fromAll ? 'all' : undefined,
  })
}
function guardLeave() {
  if (busy.value || confirmation.value) return false
  if (
    props.mode === 'start' &&
    [sql.value, question.value, target.value, database.value, plan.value].some((value) =>
      value.trim(),
    )
  ) {
    setupError.value = t('expertWorkspace.taskDraft')
    return false
  }
  return true
}
function discardInput() {
  sql.value = ''
  question.value = ''
  target.value = ''
  database.value = ''
  plan.value = ''
  setupError.value = ''
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (!guardLeave()) {
    event.preventDefault()
    event.returnValue = ''
  }
}
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
defineExpose({ guardLeave })
const confirmation = ref<'submit' | 'approve' | 'deny' | null>(null)
const captured = ref<ExpertAgentDetail | null>(null)
const submitted = ref<{ expert: string; input: ExpertAgentInput } | null>(null)
function displayTime(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(locale.value)
}
function parse<T>(value: string | null | undefined): T | null {
  try {
    return value ? (JSON.parse(value) as T) : null
  } catch {
    return null
  }
}
const result = computed(() => parse<ExpertAgentResult>(detail.value?.run.result))
const checkpoint = computed(() => parse<ExpertAgentResult>(detail.value?.run.checkpoint))
const citations = computed(() =>
  result.value?.citations?.length ? result.value.citations : (checkpoint.value?.citations ?? []),
)
const inspector = ref<'input' | 'citation' | 'evidence' | 'run' | null>(null)
const citationIndex = ref(0)
const observations = computed(
  () => result.value?.observations ?? checkpoint.value?.observations ?? [],
)
watch(
  () => [props.mode, props.expertId, props.runId],
  () => {
    inspector.value = null
  },
)
function inspectCitation(index: number) {
  citationIndex.value = index
  inspector.value = 'citation'
}
const request = computed(() => parse<ExpertAgentInput>(detail.value?.run.request))
const goalPreview = computed(() => {
  const goal = request.value?.question?.trim()
  return goal ? (goal.length > 180 ? goal.slice(0, 180) + '…' : goal) : t('expertWorkspace.noGoal')
})
const cancellable = computed(
  () =>
    detail.value &&
    ['queued', 'running', 'interrupted', 'awaiting-approval'].includes(detail.value.run.state),
)
async function loadExperts() {
  if (preview) return
  try {
    const response = await runtimeApi.experts()
    experts.value = response.items.flatMap((text) => {
      const value = parse<{
        id: string
        name: string
        apiVersion: string
        behavior?: { id: string; version: number }
      }>(text)
      return value?.apiVersion === 'eap/v2' &&
        value.behavior?.id === 'sql-readonly-agent' &&
        value.behavior.version === 1 &&
        response.states?.[value.id]?.enabled
        ? [{ id: value.id, name: value.name }]
        : []
    })
    expert.value = experts.value.some((item) => item.id === props.expertId) ? props.expertId : ''
    setupError.value = ''
  } catch (error) {
    setupError.value = errorMessage(error)
  }
}
async function reload() {
  await Promise.all([loadExperts(), refresh()])
}
function prepareSubmit() {
  setupError.value = ''
  let explainPlan: Record<string, unknown> | null = null
  if (plan.value.trim()) {
    const parsed = parse<unknown>(plan.value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      setupError.value = t('expertAgent.invalidPlan')
      return
    }
    explainPlan = parsed as Record<string, unknown>
  }
  submitted.value = {
    expert: expert.value,
    input: {
      sql: sql.value,
      question: question.value,
      targetPath: target.value.trim() || null,
      databaseId: database.value.trim() || null,
      explainPlan,
    },
  }
  confirmation.value = 'submit'
}
function prepareReview(approve: boolean) {
  captured.value = detail.value
  confirmation.value = approve ? 'approve' : 'deny'
}
async function confirm() {
  const action = confirmation.value
  if (action === 'submit' && submitted.value) {
    await submit(submitted.value.expert, submitted.value.input)
    if (!actionError.value && selected.value) {
      confirmation.value = null
      discardInput()
      openRun(selected.value)
      return
    }
  }
  if ((action === 'approve' || action === 'deny') && captured.value)
    await review(action === 'approve', captured.value)
  confirmation.value = null
}
const confirmationTitle = computed(() =>
  t(
    'expertAgent.' +
      {
        submit: 'submitTitle',
        approve: 'approvalTitle',
        deny: 'denialTitle',
      }[confirmation.value ?? 'submit'],
  ),
)
const confirmationImpact = computed(() => {
  if (confirmation.value === 'approve' || confirmation.value === 'deny')
    return [
      t('expertAgent.' + (confirmation.value === 'approve' ? 'approvalImpact' : 'denialImpact')),
      captured.value?.candidate?.proposal.workspace ?? '',
      captured.value?.candidate?.proposal.files[0]?.path ?? '',
      t('expertAgent.digest') + ': ' + (captured.value?.approval.approval_digest ?? ''),
    ]
  return [
    t('expertAgent.submitImpact'),
    ...(confirmation.value === 'submit'
      ? [submitted.value?.expert ?? '', submitted.value?.input.targetPath ?? '']
      : []),
  ].filter(Boolean)
})
onMounted(() => {
  window.addEventListener('beforeunload', beforeUnload)
  watch(
    () => [props.mode, props.expertId, props.runId],
    () => {
      if (props.mode === 'start') void loadExperts()
      if (props.runId && props.expertId && (props.mode === 'task' || props.mode === 'review'))
        void select({ id: props.runId, expertId: props.expertId })
    },
    { immediate: true },
  )
})
</script>

<template>
  <section class="agent-panel eap-panel" data-testid="expert-agent-panel">
    <header class="agent-actions">
      <h2>
        {{
          mode === 'task' && detail
            ? detail.run.snapshot.manifest.name
            : t('expertWorkspace.' + mode)
        }}
      </h2>
      <Button :disabled="busy || preview" @click="reload">{{ t('expertAgent.refresh') }}</Button>
    </header>
    <p v-if="mode === 'start'">{{ t('expertAgent.hint') }}</p>
    <Feedback v-if="preview" :message="t('expertAgent.preview')" />
    <Feedback
      v-else-if="mode === 'start' && !automatic && !checking"
      :message="t('expertAgent.unavailable')"
    />
    <p v-if="!preview && ((checking && !detail) || (loading && !detail))" role="status">
      {{ t('expertAgent.loading') }}
    </p>
    <Feedback
      v-if="readError || actionError || setupError"
      tone="error"
      :message="actionError || readError || setupError"
    />
    <section v-if="mode === 'start'">
      <div class="agent-form">
        <Feedback v-if="!expert">{{ t('expertWorkspace.enableHint') }}</Feedback>
        <p>
          {{ t('expertAgent.expert') }}:
          {{ experts.find((item) => item.id === expert)?.name || expertId }}
        </p>
        <label for="agent-sql">{{ t('expertAgent.sql') }}</label
        ><Textarea id="agent-sql" v-model="sql" :disabled="busy" :maxlength="50000" />
        <label for="agent-question">{{ t('expertAgent.question') }}</label
        ><Textarea id="agent-question" v-model="question" :disabled="busy" :maxlength="8000" />
        <label for="agent-target">{{ t('expertAgent.target') }}</label
        ><Input id="agent-target" v-model="target" :disabled="busy" :maxlength="240" />
        <p>{{ t('expertAgent.targetHint') }}</p>
        <label for="agent-database">{{ t('expertAgent.database') }}</label
        ><Input id="agent-database" v-model="database" :disabled="busy" />
        <label for="agent-plan">{{ t('expertAgent.plan') }}</label
        ><Textarea id="agent-plan" v-model="plan" :disabled="busy" :maxlength="100000" />
        <Button
          data-testid="agent-submit"
          variant="primary"
          :disabled="
            busy ||
            preview ||
            !automatic ||
            !expert ||
            (!sql.trim() && !question.trim()) ||
            (!!target.trim() && !target.trim().endsWith('.sql'))
          "
          @click="prepareSubmit"
          >{{ t('expertAgent.submit') }}</Button
        >
        <Button data-testid="agent-discard-input" :disabled="busy" @click="discardInput">{{
          t('expertWorkspace.discardInput')
        }}</Button>
      </div>
    </section>
    <template v-if="mode === 'tasks'">
      <label
        >{{ t('expertWorkspace.filter')
        }}<Select v-model="stateFilter"
          ><option value="">{{ t('expertWorkspace.allStates') }}</option>
          <option value="awaiting-approval">{{ t('expertAgent.state.awaiting-approval') }}</option>
          <option value="running">{{ t('expertAgent.state.running') }}</option>
          <option value="needs-input">{{ t('expertAgent.state.needs-input') }}</option></Select
        ></label
      >
      <h3>{{ t('expertAgent.recent') }}</h3>
      <p v-if="!checking && !readError && !visibleRuns.length">{{ t('expertAgent.empty') }}</p>
      <div class="agent-layout">
        <nav class="agent-list" :aria-label="t('expertAgent.recent')">
          <Button
            v-for="run in visibleRuns"
            :key="run.id"
            variant="navigation"
            :active="selected?.id === run.id"
            :disabled="busy"
            :data-testid="'agent-run-' + run.id"
            @click="openRun(run)"
          >
            {{ run.expertName }} · {{ t('expertAgent.state.' + run.state)
            }}<small>{{ displayTime(run.createdAt) }}</small>
          </Button>
        </nav>
      </div>
    </template>
    <div
      v-if="detail && (mode === 'task' || mode === 'review')"
      class="agent-detail"
      data-testid="agent-detail"
    >
      <p data-testid="agent-state">{{ t('expertAgent.state.' + detail.run.state) }}</p>
      <section v-if="mode === 'task'" class="task-summary-section" data-testid="task-goal">
        <h3>{{ t('expertWorkspace.taskGoal') }}</h3>
        <p>{{ goalPreview }}</p>
        <Button variant="link" data-testid="task-input-open" @click="inspector = 'input'">{{
          t('expertWorkspace.viewInput')
        }}</Button>
      </section>
      <section class="task-summary-section" data-testid="task-result">
        <h3 v-if="mode === 'task'">{{ t('expertWorkspace.resultAndNext') }}</h3>
        <p v-if="result?.summary && result.status === detail.run.state">{{ result.summary }}</p>
        <p
          v-else-if="
            mode === 'task' && ['queued', 'running', 'interrupted'].includes(detail.run.state)
          "
        >
          {{ t('expertWorkspace.resultPending') }}
        </p>
      </section>
      <Feedback v-if="result?.error" tone="error" :message="result.error" />
      <Feedback
        v-if="detail.run.state === 'unknown'"
        tone="error"
        :message="t('expertAgent.unknown')"
      />
      <Feedback v-if="detail.run.state === 'applied'" :message="t('expertAgent.applied')" />
      <Button v-if="cancellable" data-testid="agent-cancel" :disabled="busy" @click="cancel">{{
        t('expertAgent.cancel')
      }}</Button>
      <Button
        v-if="mode === 'task' && detail.candidate"
        data-testid="agent-open-review"
        variant="primary"
        @click="openReview"
        >{{
          t(
            detail.run.state === 'awaiting-approval'
              ? 'expertWorkspace.review'
              : 'expertWorkspace.reviewRecord',
          )
        }}</Button
      >
      <template v-if="mode === 'review' && detail.candidate">
        <p>{{ t('expertAgent.unverified') }}</p>
        <p>{{ t('expertAgent.workspace') }}: {{ detail.candidate.proposal.workspace }}</p>
        <p v-if="detail.run.state === 'awaiting-approval'">
          {{ t('expertAgent.expiry') }}: {{ displayTime(detail.approval.approval_expires_at) }}
        </p>
        <div v-for="file in detail.candidate.proposal.files" :key="file.path">
          <h4>{{ file.path }}</h4>
          <p>{{ t('expertAgent.base') }}: {{ file.baseHash }}</p>
          <ProposalDiffView :path="file.path" :before="file.before" :after="file.content" />
        </div>
        <div v-if="detail.run.state === 'awaiting-approval'" class="agent-actions">
          <Button
            data-testid="agent-approve"
            variant="primary"
            :disabled="!canReview"
            @click="prepareReview(true)"
            >{{ t('expertAgent.review') }}</Button
          >
          <Button
            data-testid="agent-deny"
            variant="danger"
            :disabled="!canReview"
            @click="prepareReview(false)"
            >{{ t('expertAgent.deny') }}</Button
          >
        </div>
        <p v-if="detail.run.state === 'awaiting-approval' && !canReview">
          {{ t('expertAgent.blocked') }}
        </p>
        <p v-if="detail.run.state !== 'awaiting-approval'">
          {{ t('expertWorkspace.reviewRecord') }}:
          {{ t('expertAgent.state.' + detail.run.state) }} ·
          {{ displayTime(detail.approval.decided_at) }}
        </p>
      </template>
      <section
        v-if="mode === 'task' && citations.length"
        class="task-summary-section"
        data-testid="task-references"
      >
        <h3>{{ t('expertWorkspace.citations') }}</h3>
        <Button
          v-for="(citation, index) in citations"
          :key="citation.id"
          variant="navigation"
          class="task-reference"
          :data-testid="'task-reference-' + index"
          @click="inspectCitation(index)"
        >
          <span>{{ citation.source }}</span
          ><small>{{ citation.knowledgeBase }} · {{ t('expertWorkspace.viewExcerpt') }}</small>
        </Button>
      </section>
      <nav class="task-inspector-links" :aria-label="t('expertWorkspace.supportingDetails')">
        <Button variant="link" data-testid="task-evidence-open" @click="inspector = 'evidence'">{{
          t('expertWorkspace.executionEvidence')
        }}</Button>
        <Button variant="link" data-testid="task-run-open" @click="inspector = 'run'">{{
          t('expertWorkspace.technical')
        }}</Button>
      </nav>
    </div>
    <ExpertTaskInspector
      v-if="inspector && detail"
      :section="inspector"
      :detail="detail"
      :input="request"
      :citations="citations"
      :citation-index="citationIndex"
      :observations="observations"
      @close="inspector = null"
    />
    <ConfirmBox
      v-if="confirmation"
      :title="confirmationTitle"
      :impact="confirmationImpact"
      :confirm-label="confirmationTitle"
      :busy="busy"
      :danger="confirmation === 'deny'"
      :refusal="
        (confirmation === 'approve' || confirmation === 'deny') && !canReview && !busy
          ? t('expertAgent.blocked')
          : undefined
      "
      @confirm="confirm"
      @cancel="confirmation = null"
    />
  </section>
</template>

<style scoped>
.agent-panel,
.agent-form,
.agent-detail {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.agent-panel {
  padding: 16px;
  margin-bottom: 16px;
  container-type: inline-size;
}

.agent-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.agent-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
}

.agent-detail {
  align-content: start;
}

.agent-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 580px;
  overflow: auto;
}

p,
small {
  color: var(--text-soft);
  overflow-wrap: anywhere;
}

.agent-list small {
  display: block;
  overflow-wrap: anywhere;
}

.agent-list > button {
  flex-direction: column;
  align-items: stretch;
  text-align: left;
}

.agent-detail > * {
  min-width: 0;
}

h3,
h4 {
  overflow-wrap: anywhere;
}

pre {
  max-height: 220px;
  overflow: auto;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.task-summary-section {
  display: grid;
  gap: 10px;
}

.task-summary-section h3,
.task-summary-section p {
  margin: 0;
}

.task-summary-section > button {
  justify-self: start;
}

.task-summary-section > .task-reference {
  display: grid;
  gap: 4px;
  justify-self: stretch;
  text-align: left;
}

.task-reference span,
.task-reference small {
  overflow-wrap: anywhere;
}

.task-inspector-links {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 12px;
}


@container (width <= 760px) {
  .agent-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .agent-list {
    max-height: 200px;
  }
}
</style>
