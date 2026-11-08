<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  runtimeApi,
  type ExpertAgentDetail,
  type ExpertAgentInput,
  type ExpertAgentResult,
} from '@eap/runtime-client'
import { Button, ConfirmBox, Feedback, Input, Select, Textarea, Collapse } from '@eap/ui'
import ProposalDiffView from '../../components/ProposalDiffView.vue'
import { errorMessage } from '../../lib/presentation'
import { useExpertAgentRuns } from './useExpertAgentRuns'

const emit = defineEmits<{ saved: [] }>()
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
} = useExpertAgentRuns()
const experts = ref<Array<{ id: string; name: string }>>([])
const expert = ref(''),
  sql = ref(''),
  question = ref(''),
  target = ref(''),
  database = ref(''),
  plan = ref('')
const setupError = ref(''),
  creating = ref(false)
const confirmation = ref<'submit' | 'create' | 'approve' | 'deny' | null>(null)
const captured = ref<ExpertAgentDetail | null>(null)
const submitted = ref<{ expert: string; input: ExpertAgentInput } | null>(null)
let creationId: string | null = null
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
    if (!experts.value.some((item) => item.id === expert.value))
      expert.value = experts.value[0]?.id ?? ''
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
  if (action === 'submit' && submitted.value)
    await submit(submitted.value.expert, submitted.value.input)
  if ((action === 'approve' || action === 'deny') && captured.value)
    await review(action === 'approve', captured.value)
  if (action === 'create') {
    creating.value = true
    setupError.value = ''
    try {
      creationId ??= 'sql-agent-' + crypto.randomUUID()
      const manifest = {
        apiVersion: 'eap/v2',
        kind: 'Expert',
        id: creationId,
        name: t('expertAgent.defaultName'),
        behavior: { id: 'sql-readonly-agent', version: 1 },
        agent: { goal: t('expertAgent.goal'), tools: ['sql.parse', 'database.explain'] },
        knowledgeBases: [],
        databaseProfiles: [],
        steps: [],
        edges: [],
        rules: ['database.credentials.never-expose'],
        rulePacks: [],
        mcpTools: [],
      }
      await runtimeApi.saveExpert({
        id: creationId,
        name: manifest.name,
        manifest: JSON.stringify(manifest),
      })
      await runtimeApi.activateExpert(creationId, true)
      await loadExperts()
      emit('saved')
      creationId = null
    } catch (error) {
      setupError.value = errorMessage(error)
    } finally {
      creating.value = false
    }
  }
  confirmation.value = null
}
const confirmationTitle = computed(() =>
  t(
    'expertAgent.' +
      {
        submit: 'submitTitle',
        create: 'createTitle',
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
    t('expertAgent.' + (confirmation.value === 'create' ? 'createImpact' : 'submitImpact')),
    ...(confirmation.value === 'submit'
      ? [submitted.value?.expert ?? '', submitted.value?.input.targetPath ?? '']
      : []),
  ].filter(Boolean)
})
onMounted(loadExperts)
</script>

<template>
  <section class="agent-panel eap-panel" data-testid="expert-agent-panel">
    <header class="agent-actions">
      <h2>{{ t('expertAgent.title') }}</h2>
      <Button :disabled="busy || preview" @click="reload">{{ t('expertAgent.refresh') }}</Button>
    </header>
    <p>{{ t('expertAgent.hint') }}</p>
    <Feedback v-if="preview" :message="t('expertAgent.preview')" />
    <Feedback v-else-if="!automatic && !checking" :message="t('expertAgent.unavailable')" />
    <p v-if="!preview && checking" role="status">{{ t('expertAgent.loading') }}</p>
    <Feedback
      v-if="readError || actionError || setupError"
      tone="error"
      :message="actionError || readError || setupError"
    />
    <Collapse>
      <template #summary>{{ t('expertAgent.submit') }}</template>
      <div class="agent-form">
        <template v-if="!experts.length"
          ><p>{{ t('expertAgent.noExperts') }}</p>
          <Button
            data-testid="agent-create"
            :disabled="preview || busy || creating"
            @click="confirmation = 'create'"
            >{{ t('expertAgent.create') }}</Button
          ></template
        >
        <label for="agent-expert">{{ t('expertAgent.expert') }}</label>
        <Select id="agent-expert" v-model="expert" :disabled="busy || preview"
          ><option value="">{{ t('expertAgent.choose') }}</option>
          <option v-for="item in experts" :key="item.id" :value="item.id">
            {{ item.name }}
          </option></Select
        >
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
      </div>
    </Collapse>
    <h3>{{ t('expertAgent.recent') }}</h3>
    <p v-if="!checking && !readError && !runs.length">{{ t('expertAgent.empty') }}</p>
    <div class="agent-layout">
      <nav class="agent-list" :aria-label="t('expertAgent.recent')">
        <Button
          v-for="run in runs"
          :key="run.id"
          variant="navigation"
          :active="selected?.id === run.id"
          :disabled="busy"
          :data-testid="'agent-run-' + run.id"
          @click="select(run)"
        >
          {{ run.expertName }} · {{ t('expertAgent.state.' + run.state)
          }}<small>{{ displayTime(run.createdAt) }}</small
          ><small>{{ run.id }}</small>
        </Button>
      </nav>
      <div v-if="detail" class="agent-detail" data-testid="agent-detail">
        <h3>
          {{ detail.run.snapshot.manifest.name }} ·
          <span data-testid="agent-state">{{ t('expertAgent.state.' + detail.run.state) }}</span>
        </h3>
        <p>
          {{ t(detail.run.automatic ? 'expertAgent.automatic' : 'expertAgent.manual') }} ·
          {{ t('expertAgent.attempts') }} {{ detail.run.attempts }}/3 ·
          {{ t('expertAgent.revision') }} {{ detail.run.snapshot.revision }}
        </p>
        <p v-if="loading" role="status">{{ t('expertAgent.loading') }}</p>
        <p v-if="result?.summary && result.status === detail.run.state">{{ result.summary }}</p>
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
        <template v-if="detail.candidate">
          <p>{{ t('expertAgent.unverified') }}</p>
          <p>{{ t('expertAgent.workspace') }}: {{ detail.candidate.proposal.workspace }}</p>
          <p>
            {{ t('expertAgent.expiry') }}: {{ displayTime(detail.approval.approval_expires_at) }}
          </p>
          <div v-for="file in detail.candidate.proposal.files" :key="file.path">
            <h4>{{ file.path }}</h4>
            <p>{{ t('expertAgent.base') }}: {{ file.baseHash }}</p>
            <ProposalDiffView :path="file.path" :before="file.before" :after="file.content" />
          </div>
          <div class="agent-actions">
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
          <p v-if="!canReview">{{ t('expertAgent.blocked') }}</p>
        </template>
        <Collapse
          ><template #summary>{{ t('expertAgent.observations') }}</template>
          <pre
            v-for="(observation, index) in result?.observations ?? checkpoint?.observations ?? []"
            :key="index"
            >{{ observation.capability }}: {{ observation.stdout }}</pre>
        </Collapse>
      </div>
    </div>
    <ConfirmBox
      v-if="confirmation"
      :title="confirmationTitle"
      :impact="confirmationImpact"
      :confirm-label="confirmationTitle"
      :busy="busy || creating"
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
  grid-template-columns: minmax(180px, 1fr) minmax(0, 3fr);
  gap: 16px;
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

@container (width <= 760px) {
  .agent-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .agent-list {
    max-height: 200px;
  }
}
</style>
