<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TaskWorkingMemorySnapshot } from '@eap/runtime-client'
import { Button, Collapse, Feedback, Input } from '@eap/ui'

const props = defineProps<{ memory: TaskWorkingMemorySnapshot | null; busy: boolean }>()
const goalDraft = defineModel<string>({ required: true })
const emit = defineEmits<{ save: [] }>()
const { t } = useI18n()
const hasWorkingMemoryMaterial = computed(() => {
  const memory = props.memory
  return !!(
    memory?.goal ||
    memory?.invalidation ||
    memory?.constraints?.length ||
    memory?.facts?.length ||
    memory?.dependencyKeys?.length ||
    memory?.evidenceRefs?.length
  )
})
</script>

<template>
  <section class="working-memory" data-testid="working-memory">
    <h3>{{ t('workingMemory.title') }}</h3>
    <p class="hint">{{ t('workingMemory.note') }}</p>
    <Feedback v-if="memory?.invalidation" tone="warning" data-testid="working-memory-invalidation">
      {{ t('workingMemory.invalidation') }}
    </Feedback>
    <div v-if="memory?.invalidation" class="hint" data-testid="working-memory-sticky-retained">
      {{ t('workingMemory.stickyClearRetained') }}
      <Collapse
        ><template #summary>{{ t('contextBudget.notes') }}</template
        ><code>{{ memory.invalidation }}</code></Collapse
      >
    </div>
    <p v-else-if="memory?.goal" class="hint" data-testid="working-memory-goal-text">
      {{ t('workingMemory.goal') }}：{{ memory.goal }}
    </p>
    <p v-else-if="!hasWorkingMemoryMaterial" class="hint" data-testid="working-memory-empty">
      {{ t('workingMemory.empty') }}
    </p>
    <p v-if="memory?.constraints?.length" class="hint" data-testid="working-memory-constraints">
      {{ t('workingMemory.constraints') }}：{{ memory.constraints.join(' · ') }}
    </p>
    <Collapse
      v-if="memory?.facts?.length || memory?.dependencyKeys?.length || memory?.evidenceRefs?.length"
      data-testid="working-memory-details"
    >
      <template #summary>{{ t('workingMemory.details') }}</template>
      <p v-if="memory?.facts?.length" class="hint" data-testid="working-memory-facts">
        {{ t('workingMemory.facts') }}：{{
          memory.facts
            .map(
              (fact) =>
                `${fact.kind}:${fact.id}${fact.revisionOrDigest ? '@' + fact.revisionOrDigest : ''}`,
            )
            .join(' · ')
        }}
      </p>

      <p
        v-if="memory?.dependencyKeys?.length"
        class="hint"
        data-testid="working-memory-dependencies"
      >
        {{ t('workingMemory.dependencies') }}：{{ memory.dependencyKeys.join(' · ') }}
      </p>
      <p v-if="memory?.evidenceRefs?.length" class="hint" data-testid="working-memory-evidence">
        {{ t('workingMemory.evidence') }}：{{ memory.evidenceRefs.join(' · ') }}
      </p>
    </Collapse>
    <form class="working-memory-form" @submit.prevent="emit('save')">
      <Input
        v-model="goalDraft"
        data-testid="working-memory-goal"
        :placeholder="t('workingMemory.goalPlaceholder')"
      />
      <Button
        size="sm"
        type="submit"
        variant="secondary"
        data-testid="working-memory-save"
        :disabled="!goalDraft.trim() || busy"
        >{{ t('workingMemory.saveGoal') }}</Button
      >
    </form>
  </section>
</template>

<style scoped>
.working-memory {
  display: grid;
  gap: 6px;
  width: 100%;
  max-width: 980px;
  padding: 10px 14px;
  margin: 0 auto;
  background: var(--surface-2, var(--panel-bg));
  border: 1px solid var(--border);
  border-radius: 12px;
}

.working-memory h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 650;
  line-height: 1.4;
}

.working-memory > .hint {
  max-width: 72ch;
  margin: 0;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.working-memory-form {
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;
  align-items: center;
  margin-top: 4px;
}

.working-memory-form :deep(.eap-input) {
  flex: 1 1 auto;
  width: auto;
  min-width: 0;
  max-width: none;
}

.working-memory-form :deep(.eap-button) {
  flex: 0 0 auto;
}

@media (width <= 760px) {
  .working-memory {
    max-width: none;
  }

  .working-memory-form {
    flex-wrap: wrap;
  }
}
</style>
