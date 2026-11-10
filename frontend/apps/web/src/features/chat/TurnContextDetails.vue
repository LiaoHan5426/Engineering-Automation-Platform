<script setup lang="ts">
import type { AiArtifactSummary, ContextBudgetObservation } from '@eap/runtime-client'
import { ContextMetering } from '@eap/runtime-client'
import { Collapse } from '@eap/ui'
import { useI18n } from 'vue-i18n'
import { includedSourceSummary } from './contextBudgetView'

defineProps<{ budget?: ContextBudgetObservation | null; artifacts: AiArtifactSummary[] }>()
const { t } = useI18n()
</script>

<template>
  <Collapse v-if="budget" data-testid="turn-context-budget">
    <template #summary>{{ t('contextBudget.summary', { used: budget.usedChars }) }}</template>
    <p>
      {{
        budget.metering === ContextMetering.UNKNOWN
          ? t('contextBudget.unknown')
          : t('contextBudget.charEstimate')
      }}
    </p>
    <p>
      {{ t('contextBudget.remaining') }} {{ budget.remainingChars }} ·
      {{ t('contextBudget.reserve') }} {{ budget.outputReserve }}
    </p>
    <p v-if="includedSourceSummary(budget)">
      {{ t('contextBudget.sources') }}：{{ includedSourceSummary(budget) }}
    </p>
    <p v-if="budget.notes.length" data-testid="turn-context-budget-notes">
      {{ t('contextBudget.notes') }}：
      <code v-for="note in budget.notes" :key="note" :data-testid="`context-budget-note-${note}`"
        >{{ note }}
      </code>
    </p>
  </Collapse>
  <Collapse v-if="artifacts.length" data-testid="turn-artifacts">
    <template #summary>{{ t('contextBudget.artifacts', { count: artifacts.length }) }}</template>
    <ul>
      <li v-for="artifact in artifacts" :key="artifact.sha256">
        {{ artifact.kind }} · {{ artifact.sizeBytes }} B · <code>{{ artifact.sha256 }}</code>
      </li>
    </ul>
  </Collapse>
</template>
