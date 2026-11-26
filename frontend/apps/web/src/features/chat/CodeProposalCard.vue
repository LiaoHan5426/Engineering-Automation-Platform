<script setup lang="ts">
import type { CodeProposal, CodeTaskRef } from '@eap/runtime-client'
import { Button, Checkbox, Collapse } from '@eap/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import GenerationBaseline from '../../components/GenerationBaseline.vue'
import ProposalApplication from '../../components/ProposalApplication.vue'
import { boardTaskLocation } from '../shell/boardLocation'
import type { CodeProposals } from './codeProposals'

const props = defineProps<{
  proposal: CodeProposal
  executionId?: string | null
  proposals: CodeProposals
  approval: string
  /** Session can no longer write (expired or archived). */
  locked: boolean
}>()
const emit = defineEmits<{ 'view-diff': [path: string] }>()
const { t } = useI18n()
const { refused, refusing, refuseNote, applied, applying, writeConfirmed } = props.proposals

const readOnly = computed(
  () => props.approval === 'read_only' || !!refused.value[props.proposal.id] || props.locked,
)
function continueDelivery(task: CodeTaskRef) {
  window.location.hash = boardTaskLocation(task)
}
</script>

<template>
  <section class="code-proposal write-request" data-testid="code-proposal">
    <h3>{{ t('desktop.writeRequest', { count: proposal.files.length }) }}</h3>
    <GenerationBaseline :generation="proposal.generation" />
    <p v-if="!refused[proposal.id]" class="hint" data-testid="turn-pending">
      {{ t(proposals.pendingKey({ proposal })) }}
    </p>
    <Collapse v-for="file in proposal.files" :key="file.path">
      <template #summary
        >{{ file.path }} · {{ file.before == null ? t('task.newFile') : t('task.modifiedFile') }} ·
        {{ t('desktop.fileBaseline') }}：{{
          file.baseHash || t('desktop.summaryUnknown')
        }}</template
      >
      <div class="code-comparison">
        <Button
          size="sm"
          variant="secondary"
          type="button"
          data-testid="open-proposal-diff"
          @click="emit('view-diff', file.path)"
          >{{ t('desktop.openProposalDiff') }}</Button
        >
        <div>
          <strong>{{ t('task.before') }}</strong>
          <pre>{{ file.before ?? t('task.newFile') }}</pre>
        </div>
        <div>
          <strong>{{ t('task.after') }}</strong>
          <pre>{{ file.content }}</pre>
        </div>
      </div>
    </Collapse>
    <div class="proposal-actions">
      <Button
        v-if="!applied[proposal.id] && !refused[proposal.id]"
        type="button"
        data-testid="refuse-write"
        :disabled="!!refusing"
        @click="proposals.refuse({ proposal, executionId })"
        >{{ t('desktop.refuseWrite') }}</Button
      >
    </div>
    <p
      v-if="refuseNote && refusing === proposal.id"
      class="hint"
      role="alert"
      data-testid="refuse-write-error"
    >
      {{ refuseNote }}
    </p>
    <p v-if="refused[proposal.id]" class="hint" data-testid="refused-write">
      {{ t('desktop.refusedWrite') }}
    </p>
    <ProposalApplication
      v-if="proposal.generation"
      :proposal="proposal"
      :read-only="readOnly"
      @continue="continueDelivery"
      @applied="(result) => proposals.recordApplied(proposal.id, result)"
    />
    <template
      v-else-if="
        !applied[proposal.id] && !refused[proposal.id] && proposals.baselineReady(proposal)
      "
    >
      <label><Checkbox v-model="writeConfirmed[proposal.id]" /> {{ t('task.confirmWrite') }}</label>
      <Button
        type="button"
        variant="primary"
        :disabled="
          !writeConfirmed[proposal.id] ||
          !!applying ||
          !proposal.writeAllowed ||
          approval === 'read_only'
        "
        @click="proposals.apply(proposal)"
        >{{ t('task.apply') }}</Button
      >
    </template>
    <p v-else-if="applied[proposal.id]">
      {{ t('task.written') }}
      {{ applied[proposal.id]?.join('、') }}
    </p>
  </section>
</template>

<style scoped>
.code-proposal {
  display: grid;
  gap: 12px;
  margin: 16px 0;
}

.code-comparison {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.code-comparison pre {
  max-height: 380px;
  padding: 12px;
  overflow: auto;
  color: var(--eap-code-text);
  background: var(--eap-code-bg);
  border-radius: 8px;
}

.code-comparison > div:first-child pre {
  color: var(--danger);
  background: var(--danger-bg);
}

.code-comparison > div:last-child pre {
  color: var(--ok);
  background: var(--ok-bg);
}

@media (width <= 800px) {
  .code-comparison {
    grid-template-columns: 1fr;
  }
}
</style>
