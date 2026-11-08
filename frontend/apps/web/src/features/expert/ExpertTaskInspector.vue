<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Collapse, Descriptions, Drawer, EmptyState } from '@eap/ui'
import type { ExpertAgentDetail, ExpertAgentInput, ExpertAgentResult } from '@eap/runtime-client'

const props = defineProps<{
  section: 'input' | 'citation' | 'evidence' | 'run'
  detail: ExpertAgentDetail
  input: ExpertAgentInput | null
  citations: NonNullable<ExpertAgentResult['citations']>
  citationIndex: number
  observations: NonNullable<ExpertAgentResult['observations']>
}>()
defineEmits<{ close: [] }>()
const { t, locale } = useI18n()
const title = computed(() =>
  t(
    'expertWorkspace.' +
      {
        input: 'taskInput',
        citation: 'referenceExcerpt',
        evidence: 'executionEvidence',
        run: 'technical',
      }[props.section],
  ),
)
const citation = computed(() => props.citations[props.citationIndex])
const runItems = computed(() => [
  { key: 'id', label: t('expertWorkspace.taskId'), value: props.detail.run.id },
  { key: 'expert', label: t('expertAgent.expert'), value: props.detail.run.snapshot.manifest.name },
  { key: 'revision', label: t('expertAgent.revision'), value: props.detail.run.snapshot.revision },
  {
    key: 'state',
    label: t('expertWorkspace.filter'),
    value: t('expertAgent.state.' + props.detail.run.state),
  },
  { key: 'attempts', label: t('expertAgent.attempts'), value: props.detail.run.attempts + '/3' },
  {
    key: 'scheduling',
    label: t('expertWorkspace.scheduling'),
    value: t(props.detail.run.automatic ? 'expertAgent.automatic' : 'expertAgent.manual'),
  },
  {
    key: 'expiry',
    label: t('expertWorkspace.taskExpiry'),
    value: new Date(props.detail.run.expiresAt).toLocaleString(locale.value),
  },
])
</script>

<template>
  <Drawer
    :title="title"
    :close-label="t('expertWorkspace.closeInspector')"
    style="

--eap-layout-rail-width: 560px"
    @close="$emit('close')"
  >
    <div class="task-inspector" data-testid="task-inspector">
      <template v-if="section === 'input'">
        <template v-if="input">
          <h3>{{ t('expertWorkspace.taskGoal') }}</h3>
          <p>{{ input.question || t('expertWorkspace.noGoal') }}</p>
          <h3>{{ t('expertAgent.sql') }}</h3>
          <pre>{{ input.sql || '—' }}</pre>
          <Descriptions
            :items="[
              { key: 'target', label: t('expertAgent.target'), value: input.targetPath ?? '—' },
              { key: 'database', label: t('expertAgent.database'), value: input.databaseId ?? '—' },
            ]"
          />
          <template v-if="input.explainPlan"
            ><h3>EXPLAIN JSON</h3>
            <pre>{{ JSON.stringify(input.explainPlan, null, 2) }}</pre>
          </template>
        </template>
        <EmptyState v-else>{{ t('expertWorkspace.noInput') }}</EmptyState>
      </template>
      <template v-else-if="section === 'citation' && citation">
        <h3>{{ citation.source }}</h3>
        <p>{{ citation.knowledgeBase }}</p>
        <p>{{ t('expertWorkspace.excerptHint') }}</p>
        <p class="reference-excerpt">{{ citation.excerpt }}</p>
      </template>
      <template v-else-if="section === 'evidence'">
        <p>{{ t('expertWorkspace.evidenceHint') }}</p>
        <EmptyState v-if="!observations.length">{{ t('expertWorkspace.noEvidence') }}</EmptyState>
        <Collapse v-for="(observation, index) in observations" :key="index">
          <template #summary
            >{{ index + 1 }}. {{ observation.capability }} ·
            {{
              t(
                observation.success
                  ? 'expertWorkspace.observedSuccess'
                  : 'expertWorkspace.observedFailure',
              )
            }}</template
          >
          <pre>{{ observation.stdout || '—' }}</pre>
          <pre v-if="observation.stderr">{{ observation.stderr }}</pre>
        </Collapse>
      </template>
      <template v-else-if="section === 'run'">
        <Descriptions :items="runItems" />
        <p>{{ t('expertWorkspace.snapshotHint', { revision: detail.run.snapshot.revision }) }}</p>
      </template>
    </div>
  </Drawer>
</template>

<style scoped>
.task-inspector {
  display: grid;
  gap: 16px;
  align-content: start;
  min-width: 0;
}

.task-inspector h3,
.task-inspector p {
  margin: 0;
  overflow-wrap: anywhere;
}

.task-inspector pre {
  margin: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.reference-excerpt {
  white-space: pre-wrap;
}
</style>
