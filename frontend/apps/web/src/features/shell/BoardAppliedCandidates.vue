<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { Button, Feedback } from '@eap/ui'
import {
  runtimeApi,
  type BoardTask,
  type BoardRun,
  type BoardAppliedCandidates,
  type BoardAppliedCandidate,
} from '@eap/runtime-client'
import { useI18n } from 'vue-i18n'
const props = defineProps<{ task: BoardTask; run: BoardRun; disabled: boolean }>()
const emit = defineEmits<{ select: [candidate: BoardAppliedCandidate] }>()
const { t } = useI18n()
const data = ref<BoardAppliedCandidates | null>(null),
  busy = ref(false),
  failed = ref(false),
  fresh = ref(false)
let generation = 0
async function load() {
  if (busy.value || props.disabled) return
  const token = ++generation
  busy.value = true
  fresh.value = false
  failed.value = false
  try {
    const value = await runtimeApi.boardAppliedCandidates(
      props.task.id,
      props.run.execution.id,
      props.task.projectId,
    )
    if (token !== generation) return
    if (
      value.taskBinding.taskId !== props.task.id ||
      value.taskBinding.projectId !== props.task.projectId ||
      value.taskBinding.revision !== props.run.taskRevision ||
      value.workspacePath !== props.run.execution.workspacePath ||
      !Array.isArray(value.items) ||
      value.items.length > 20 ||
      typeof value.truncated !== 'boolean' ||
      value.items.some(
        (item) =>
          !item ||
          !/^[a-f0-9]{64}$/.test(item.afterHash) ||
          ![item.conversationId, item.proposalId, item.generationId].every((id) =>
            /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id),
          ) ||
          typeof item.targetPath !== 'string' ||
          !item.targetPath.startsWith('frontend/') ||
          !Array.isArray(item.paths) ||
          item.paths.length < 1 ||
          item.paths.length > 8 ||
          item.paths[0] !== item.targetPath ||
          !item.appliedAt,
      )
    )
      throw new Error('APPLICATION_CATALOG_IDENTITY_MISMATCH')
    data.value = value
    fresh.value = true
  } catch {
    if (token === generation) failed.value = true
  } finally {
    if (token === generation) busy.value = false
  }
}
function select(candidate: BoardAppliedCandidate) {
  if (!props.disabled && !busy.value && fresh.value && data.value?.items.includes(candidate))
    emit('select', candidate)
}
watch(
  () => [props.task.id, props.task.projectId, props.task.revision, props.run.execution.id],
  () => {
    generation++
    data.value = null
    fresh.value = false
    failed.value = false
    busy.value = false
  },
)
onBeforeUnmount(() => {
  generation++
})
</script>
<template>
  <section class="applied-candidates" data-testid="delivery-applied-candidates">
    <p>{{ t('boardDelivery.candidatesHint') }}</p>
    <Button :disabled="busy || disabled" data-testid="delivery-load-candidates" @click="load">{{
      t('boardDelivery.loadCandidates')
    }}</Button>
    <Feedback v-if="failed" tone="warning" data-testid="delivery-candidates-failed">{{
      t('boardDelivery.candidatesFailed')
    }}</Feedback>
    <p v-if="data && !data.items.length">{{ t('boardDelivery.noCandidates') }}</p>
    <p v-if="data?.truncated">{{ t('boardDelivery.candidatesTruncated') }}</p>
    <ul v-if="data">
      <li v-for="item in data.items" :key="item.proposalId">
        <code>{{ item.targetPath }}</code> · {{ item.appliedAt }}
        <code>{{ item.afterHash }}</code>
        <Button
          :disabled="disabled || busy || !fresh"
          data-testid="delivery-select-candidate"
          @click="select(item)"
          >{{ t('boardDelivery.selectCandidate') }}</Button
        >
      </li>
    </ul>
  </section>
</template>
<style scoped>
.applied-candidates {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.applied-candidates li {
  display: grid;
  gap: 4px;
  margin-block: 8px;
}

.applied-candidates code {
  overflow-wrap: anywhere;
}
</style>
