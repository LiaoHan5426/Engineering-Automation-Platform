<script setup lang="ts">
import { ChatExecutionStatus } from '@eap/runtime-client'
import { Collapse } from '@eap/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ChatTurn } from './chatSession'

const props = defineProps<{
  turn: ChatTurn
  /** This turn is the answer currently being streamed. */
  live: boolean
}>()
const { t } = useI18n()

const running = computed(() => props.turn.status === ChatExecutionStatus.RUNNING)
const visible = computed(
  () =>
    (props.live && running.value) ||
    props.turn.toolEvents.length > 0 ||
    !!props.turn.knowledgeContext ||
    !!props.turn.skillContext,
)
const waiting = computed(
  () =>
    props.live &&
    running.value &&
    !props.turn.text &&
    !props.turn.toolEvents.length &&
    !props.turn.knowledgeContext &&
    !props.turn.skillContext,
)
/** Force-open while this live turn is streaming; leave uncontrolled afterward so the user can collapse. */
const stepOpen = computed<true | undefined>(() => (props.live && running.value ? true : undefined))
</script>

<template>
  <div v-if="visible" class="turn-steps" data-testid="turn-steps">
    <p class="turn-steps__label">{{ t('chat.toolSteps') }}</p>
    <Collapse
      v-if="waiting"
      class="turn-step turn-step--streaming"
      :open="true"
      data-testid="turn-streaming-step"
    >
      <template #summary>{{ t('chat.streamingAnswer') }}</template>
      <p class="hint">{{ t('chat.waitingForAnswer') }}</p>
    </Collapse>
    <Collapse
      v-for="event in turn.toolEvents"
      :key="event.sequence"
      class="turn-step"
      :open="stepOpen"
      data-testid="turn-tool-step"
    >
      <template #summary>
        {{ t('chat.toolStep', { code: event.code || t('chat.toolStepFallback') }) }}
      </template>
      <p class="hint">#{{ event.sequence }} · {{ event.code }}</p>
    </Collapse>
    <Collapse
      v-if="turn.knowledgeContext"
      data-testid="turn-knowledge"
      class="turn-step"
      :open="stepOpen"
    >
      <template #summary>
        {{ t('chat.knowledgeStep') }} · {{ turn.knowledgeContext.expertRef.id }} · r{{
          turn.knowledgeContext.expertRef.revision
        }}
      </template>
      <p>{{ t('knowledgeContext.provided') }}</p>
      <p>{{ t('knowledgeContext.excerpts') }}</p>
      <p v-if="turn.knowledgeContext.status === 'no_matches'">
        {{ t('knowledgeContext.no_matches') }}
      </p>
      <ul>
        <li v-for="reference in turn.knowledgeContext.references" :key="reference.id">
          <strong
            >{{ reference.id }} · {{ reference.source }} · {{ reference.knowledgeBase }}</strong
          >
          <p>
            {{ reference.retrievalMode }} · {{ reference.knowledgeBaseId }} ·
            {{ reference.documentId }}
          </p>
          <pre>{{ reference.excerpt }}</pre>
        </li>
      </ul>
    </Collapse>
    <Collapse v-if="turn.skillContext" data-testid="turn-skill" class="turn-step" :open="stepOpen">
      <template #summary>
        {{ t('chat.skillStep') }} · {{ turn.skillContext.skillRef.id }} ·
        {{ turn.skillContext.skillRef.version }} · r{{ turn.skillContext.skillRef.stateRevision }}
      </template>
      <p>{{ t('skill.evidence') }}</p>
      <code>{{ turn.skillContext.skillRef.digest }}</code>
      <pre>{{ turn.skillContext.instructions }}</pre>
      <div v-for="resource in turn.skillContext.resources" :key="resource.path">
        <strong>{{ resource.path }}</strong>
        <pre>{{ resource.content }}</pre>
      </div>
      <p>{{ t('skill.dependencies') }}: {{ turn.skillContext.dependencies }}</p>
    </Collapse>
  </div>
</template>

<style scoped>
.turn-steps {
  display: grid;
  gap: 4px;
  margin: 0;
}

.turn-steps__label {
  margin: 0;
  font-size: 11px;
  color: var(--text-soft);
  letter-spacing: 0.02em;
}

.turn-step {
  padding-inline: 10px;
  margin: 0;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.turn-step :deep(.eap-collapse__summary) {
  display: flex;
  gap: 8px;
  align-items: center;
  min-height: 28px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
  color: var(--text-soft);
  list-style: none;
}

.turn-step :deep(.eap-collapse__summary)::-webkit-details-marker {
  display: none;
}

.turn-step :deep(.eap-collapse__summary)::marker {
  content: none;
}

.turn-step :deep(.eap-collapse__summary)::before {
  font-size: 10px;
  color: var(--text-mute);
  content: '▸';
}

.turn-step[open] :deep(.eap-collapse__summary)::before {
  content: '▾';
}
</style>
