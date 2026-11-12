<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TaskWorkingMemorySnapshot, runtimeApi } from '@eap/runtime-client'
import { Button, Collapse, ConfirmBox, Dialog, Feedback, Input, Textarea } from '@eap/ui'
import { errorMessage } from '../../lib/presentation'

const props = defineProps<{
  memory: TaskWorkingMemorySnapshot | null
  busy: boolean
  save: (body: Parameters<typeof runtimeApi.putWorkingMemory>[1]) => Promise<unknown>
}>()
const emit = defineEmits<{ adopt: [text: string]; refresh: [] }>()
const { t } = useI18n()
const editing = ref(false),
  saving = ref(false),
  discard = ref(false),
  error = ref('')
const goalDraft = ref(''),
  constraintDraft = ref('')
let baseline: TaskWorkingMemorySnapshot | null = null
const dirty = computed(
  () =>
    goalDraft.value !== (baseline?.goal ?? '') ||
    constraintDraft.value !== (baseline?.constraints.join('\n') ?? ''),
)
const adoptable = computed(
  () =>
    !!props.memory &&
    !props.memory.invalidation &&
    !!(props.memory.goal || props.memory.constraints.length),
)
function edit() {
  baseline = props.memory
  goalDraft.value = baseline?.goal ?? ''
  constraintDraft.value = baseline?.constraints.join('\n') ?? ''
  error.value = ''
  editing.value = true
}
function close() {
  if (saving.value) return
  if (dirty.value) discard.value = true
  else editing.value = false
}
async function persistEdits() {
  if (saving.value || props.busy || !baseline) return
  saving.value = true
  error.value = ''
  try {
    await props.save({
      expectedUpdatedAt: baseline.updatedAt,
      goal: goalDraft.value,
      constraints: constraintDraft.value.split(/\r?\n/).filter(Boolean),
      facts: baseline.facts,
      evidenceRefs: baseline.evidenceRefs,
      dependencyKeys: baseline.dependencyKeys,
    })
    editing.value = false
  } catch (failure) {
    error.value = errorMessage(failure)
  } finally {
    saving.value = false
  }
}
function adopt() {
  if (!adoptable.value || !props.memory) return
  emit(
    'adopt',
    [
      props.memory.goal ? t('workingMemory.goal') + ': ' + props.memory.goal : '',
      ...props.memory.constraints.map((value) => t('workingMemory.constraints') + ': ' + value),
    ]
      .filter(Boolean)
      .join('\n'),
  )
}
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
    <div class="working-memory-form">
      <Button
        size="sm"
        :disabled="busy || !memory"
        data-testid="working-memory-edit"
        @click="edit"
        >{{ t('workingMemory.edit') }}</Button
      >
      <Button
        size="sm"
        :disabled="busy || !adoptable"
        data-testid="working-memory-adopt"
        @click="adopt"
        >{{ t('workingMemory.adopt') }}</Button
      >
      <Button
        size="sm"
        :disabled="busy"
        data-testid="working-memory-refresh"
        @click="emit('refresh')"
        >{{ t('workingMemory.refresh') }}</Button
      >
    </div>
    <Dialog
      v-if="editing"
      :title="t('workingMemory.edit')"
      :close-label="t('preview.close')"
      :busy="saving"
      @close="close"
    >
      <div class="working-memory-editor">
        <Feedback v-if="error" tone="error">{{ error }}</Feedback>
        <p>{{ t('workingMemory.editBoundary') }}</p>
        <label
          >{{ t('workingMemory.goal')
          }}<Input
            v-model="goalDraft"
            maxlength="500"
            :disabled="saving"
            data-testid="working-memory-goal"
        /></label>
        <label
          >{{ t('workingMemory.constraints')
          }}<Textarea
            v-model="constraintDraft"
            rows="6"
            :disabled="saving"
            data-testid="working-memory-constraint-input"
        /></label>
      </div>
      <template #footer
        ><Button
          :disabled="saving || busy || !dirty"
          data-testid="working-memory-save"
          @click="persistEdits"
          >{{ t('workingMemory.save') }}</Button
        ></template
      >
    </Dialog>
    <ConfirmBox
      v-if="discard"
      :title="t('workingMemory.discard')"
      :impact="[t('workingMemory.discardImpact')]"
      :confirm-label="t('preview.close')"
      @confirm="
        () => {
          discard = false
          editing = false
        }
      "
      @cancel="discard = false"
    />
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

.working-memory-editor,
.working-memory-editor label {
  display: grid;
  gap: 12px;
  min-width: 0;
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
