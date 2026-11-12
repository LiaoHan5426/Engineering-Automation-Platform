<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Dialog, Button, Textarea, Feedback, Collapse, ConfirmBox } from '@eap/ui'
import { runtimeApi, BoardTaskColumn, type CodeTaskRef, type BoardTask } from '@eap/runtime-client'
import { isRequestError } from '@eap/request'
import { errorMessage } from '../../lib/presentation'
const props = defineProps<{ binding: CodeTaskRef; text: string }>()
const emit = defineEmits<{ close: []; prepare: [task: BoardTask] }>()
const { t } = useI18n()
const task = ref<BoardTask>(),
  goal = ref(''),
  criteria = ref(''),
  notes = ref('')
const busy = ref(false),
  error = ref(''),
  saved = ref(false),
  discard = ref(false)
const baseline = ref('')
const uncertain = ref(false)
const acceptedRevision = ref<number | null>(null)
const savedCurrent = computed(() => saved.value && task.value?.revision === acceptedRevision.value)
const canPromote = computed(
  () =>
    savedCurrent.value &&
    !busy.value &&
    !uncertain.value &&
    task.value?.column === BoardTaskColumn.PLANNED &&
    !task.value.executionActive &&
    !task.value.preparationIssues.length &&
    task.value.allowedColumns.includes(BoardTaskColumn.READY),
)
const canPrepare = computed(
  () =>
    savedCurrent.value &&
    !busy.value &&
    !uncertain.value &&
    task.value?.column === BoardTaskColumn.READY &&
    !task.value.executionActive &&
    !task.value.preparationIssues.length,
)
let attempted: {
  revision: number
  column: BoardTask['column']
  goal: string
  acceptanceCriteria: string
  notes: string
} | null = null
function matches(current: BoardTask) {
  return (
    !!attempted &&
    current.revision === attempted.revision + 1 &&
    current.column === attempted.column &&
    current.goal === attempted.goal &&
    current.acceptanceCriteria === attempted.acceptanceCriteria &&
    current.notes === attempted.notes
  )
}
function accept(current: BoardTask) {
  task.value = current
  acceptedRevision.value = current.revision
  baseline.value = snapshot()
  saved.value = true
  uncertain.value = false
}
function identity(current: BoardTask) {
  if (current.id !== props.binding.taskId || current.projectId !== props.binding.projectId)
    throw new Error(t('desktop.taskPlanMissing'))
}
async function reconcile() {
  if (busy.value || !attempted) return
  busy.value = true
  error.value = ''
  try {
    const current = await runtimeApi.boardTask(props.binding.taskId, props.binding.projectId)
    identity(current)
    if (matches(current)) {
      accept(current)
    } else if (current.revision === attempted.revision) {
      task.value = current
      uncertain.value = false
      attempted = null
    } else {
      task.value = current
      uncertain.value = false
      error.value = t('desktop.taskPlanStale')
    }
  } catch (failure) {
    error.value = errorMessage(failure)
  } finally {
    busy.value = false
  }
}
const snapshot = () => JSON.stringify([goal.value, criteria.value, notes.value])
const dirty = computed(() => !!task.value && snapshot() !== baseline.value)
const allowed = computed(
  () =>
    !!task.value &&
    task.value.revision === props.binding.revision &&
    ['planned', 'ready'].includes(task.value.column) &&
    !task.value.executionActive,
)
async function load() {
  busy.value = true
  try {
    const current = await runtimeApi.boardTask(props.binding.taskId, props.binding.projectId)
    identity(current)
    task.value = current
    goal.value = current.goal
    criteria.value = current.acceptanceCriteria
    notes.value = current.notes
    baseline.value = snapshot()
  } catch (failure) {
    error.value = errorMessage(failure)
  } finally {
    busy.value = false
  }
}
function adopt() {
  if (!allowed.value || busy.value || uncertain.value) return
  notes.value = [notes.value, props.text].filter(Boolean).join('\n\n')
}
async function save() {
  if (
    !allowed.value ||
    busy.value ||
    uncertain.value ||
    !dirty.value ||
    notes.value.length > 4000 ||
    goal.value.length > 4000 ||
    criteria.value.length > 4000
  )
    return
  await write()
}
async function promote() {
  if (!canPromote.value) return
  await write(BoardTaskColumn.READY)
}
async function write(column?: BoardTask['column']) {
  if (!task.value) return
  busy.value = true
  error.value = ''
  try {
    attempted = {
      revision: task.value.revision,
      column: column ?? task.value.column,
      goal: goal.value,
      acceptanceCriteria: criteria.value,
      notes: notes.value,
    }
    const result = await runtimeApi.updateBoardTask(props.binding.taskId, {
      projectId: props.binding.projectId,
      revision: attempted.revision,
      goal: attempted.goal,
      acceptanceCriteria: attempted.acceptanceCriteria,
      notes: attempted.notes,
      ...(column ? { column } : {}),
    })
    identity(result)
    if (!matches(result)) throw new Error('Task update readback mismatch')
    accept(result)
  } catch (failure) {
    uncertain.value = !(
      isRequestError(failure) &&
      failure.response &&
      failure.response.status >= 400 &&
      failure.response.status < 500
    )
    error.value = errorMessage(failure)
  } finally {
    busy.value = false
  }
}
function close() {
  if (busy.value) return
  if (dirty.value) discard.value = true
  else emit('close')
}
onMounted(load)
</script>
<template>
  <Dialog :title="t('desktop.taskPlanTitle')" size="lg" :busy="busy" @close="close">
    <div class="task-plan-form">
      <p>{{ t('desktop.taskPlanBoundary') }}</p>
      <Feedback v-if="error" tone="error">{{ error }}</Feedback>
      <Feedback v-if="uncertain" tone="warning"
        >{{ t('desktop.taskPlanUncertain')
        }}<Button :disabled="busy" data-testid="task-plan-reconcile" @click="reconcile">{{
          t('desktop.taskPlanReconcile')
        }}</Button></Feedback
      >
      <Feedback v-if="saved" tone="success">{{ t('desktop.boardFieldsSaved') }}</Feedback>
      <Feedback v-else-if="task && !allowed" tone="warning">{{
        t('desktop.taskPlanStale')
      }}</Feedback>
      <h3 v-if="task">{{ task.title }}</h3>
      <Collapse :summary="t('desktop.taskHandoffSource')">
        <pre>{{ text }}</pre>
      </Collapse>
      <Button
        :disabled="!allowed || busy || saved || uncertain"
        data-testid="task-plan-adopt"
        @click="adopt"
        >{{ t('desktop.taskPlanAdopt') }}</Button
      >
      <label
        >{{ t('desktop.boardGoal')
        }}<Textarea
          v-model="goal"
          :disabled="!allowed || busy || saved || uncertain"
          maxlength="4000"
          data-testid="task-plan-goal"
      /></label>
      <label
        >{{ t('desktop.boardCriteria')
        }}<Textarea
          v-model="criteria"
          :disabled="!allowed || busy || saved || uncertain"
          maxlength="4000"
          data-testid="task-plan-criteria"
      /></label>
      <label
        >{{ t('preview.taskNotes')
        }}<Textarea
          v-model="notes"
          :disabled="!allowed || busy || saved || uncertain"
          rows="8"
          data-testid="task-plan-notes"
      /></label>
      <Feedback v-if="notes.length > 4000" tone="warning">{{
        t('desktop.taskPlanLimit')
      }}</Feedback>
    </div>
    <template #footer>
      <Button
        v-if="saved && task?.column === BoardTaskColumn.PLANNED"
        :disabled="!canPromote"
        data-testid="task-plan-ready"
        @click="promote"
        >{{ t('desktop.taskPlanReady') }}</Button
      >
      <Button
        v-if="saved"
        :disabled="!canPrepare"
        data-testid="task-plan-prepare"
        @click="canPrepare && task && emit('prepare', task)"
        >{{ t('boardCode.preparation.title') }}</Button
      >
      <Button
        variant="primary"
        :disabled="!allowed || busy || !dirty || saved || uncertain || notes.length > 4000"
        data-testid="task-plan-save"
        @click="save"
        >{{ t('historyUi.save') }}</Button
      ></template
    >
  </Dialog>
  <ConfirmBox
    v-if="discard"
    :title="t('desktop.boardUnsaved')"
    :impact="[t('desktop.boardDiscardImpact')]"
    :confirm-label="t('desktop.boardDiscard')"
    @confirm="emit('close')"
    @cancel="discard = false"
  />
</template>
<style scoped>
.task-plan-form,
label {
  display: grid;
  gap: 12px;
  min-width: 0;
}
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 240px;
  overflow: auto;
}
</style>
