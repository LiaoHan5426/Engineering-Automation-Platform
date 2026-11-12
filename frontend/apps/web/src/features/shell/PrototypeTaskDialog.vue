<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, ConfirmBox, Dialog, Feedback, Input, Select, Textarea } from '@eap/ui'
import { isRequestError } from '@eap/request'
import {
  runtimeApi,
  type BoardTask,
  type PrototypeTaskDraft,
  type PrototypeVersionRecord,
} from '@eap/runtime-client'
import { localProjectState, selectLocalProject } from './localProjects'
import { apiStorageScope } from '../../lib/runtimeConfig'
import { errorMessage } from '../../lib/presentation'
const props = defineProps<{ version: PrototypeVersionRecord }>()
const emit = defineEmits<{ close: []; created: [task: BoardTask] }>()
const { t } = useI18n()
const title = ref(props.version.title.slice(0, 200))
const project = ref(localProjectState.selectedId ?? '')
const goal = ref(props.version.title)
const criteria = ref(props.version.acceptance.join('\n'))
const busy = ref(false),
  error = ref(''),
  task = ref<BoardTask>()
const snapshot = () => JSON.stringify([project.value, title.value, goal.value, criteria.value])
const baseline = snapshot()
const discard = ref(false)
const dirty = computed(() => !intent.value && !task.value && snapshot() !== baseline)
function close() {
  if (busy.value) return
  if (dirty.value) discard.value = true
  else emit('close')
}
const key = apiStorageScope + '.eap.prototype-task.v1.' + props.version.id
const intent = ref<PrototypeTaskDraft>()
const storageFailed = ref(false)
try {
  const raw = localStorage.getItem(key)
  if (raw) {
    const value = JSON.parse(raw)
    if (
      value.versionId !== props.version.id ||
      typeof value.projectId !== 'string' ||
      typeof value.title !== 'string' ||
      typeof value.goal !== 'string' ||
      typeof value.acceptanceCriteria !== 'string' ||
      typeof value.requestId !== 'string' ||
      !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value.requestId) ||
      !value.projectId.trim() ||
      value.projectId.length > 120 ||
      !value.title.trim() ||
      value.title.length > 200 ||
      value.goal.length > 4000 ||
      value.acceptanceCriteria.length > 4000
    )
      throw new Error('Invalid task intent')
    intent.value = value
    project.value = value.projectId
    title.value = value.title
    goal.value = value.goal
    criteria.value = value.acceptanceCriteria
  }
} catch {
  storageFailed.value = true
}
const canSave = computed(
  () => !busy.value && !storageFailed.value && project.value && title.value.trim(),
)
function openBoard() {
  selectLocalProject(task.value?.projectId ?? null)
  emit('close')
  window.location.hash = 'board'
}
async function save() {
  if (!canSave.value) return
  const retrying = !!intent.value
  const request = intent.value ?? {
    projectId: project.value,
    title: title.value.trim(),
    goal: goal.value,
    acceptanceCriteria: criteria.value,
    versionId: props.version.id,
    requestId: crypto.randomUUID(),
  }
  try {
    const serialized = JSON.stringify(request)
    localStorage.setItem(key, serialized)
    if (localStorage.getItem(key) !== serialized) throw new Error('Task intent readback failed')
  } catch {
    storageFailed.value = true
    return
  }
  intent.value = request
  busy.value = true
  error.value = ''
  try {
    const saved = await runtimeApi.createPrototypeTask(request)
    if (saved.projectId !== request.projectId || saved.prototypeVersionId !== request.versionId)
      throw new Error('Task identity mismatch')
    task.value = saved
    localStorage.removeItem(key)
    emit('created', saved)
  } catch (failure) {
    // A retry can follow a committed request whose response was lost. A later 4xx
    // does not establish absence; only a fresh request's definitive failure unlocks edits.
    if (
      !retrying &&
      isRequestError(failure) &&
      failure.response &&
      failure.response.status >= 400 &&
      failure.response.status < 500
    ) {
      try {
        localStorage.removeItem(key)
        if (localStorage.getItem(key) !== null) throw new Error('Task intent removal failed')
        intent.value = undefined
      } catch {
        storageFailed.value = true
      }
    }
    error.value = errorMessage(failure)
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <Dialog :title="t('builder.task.title')" :busy="busy" @close="close">
    <div class="task-form">
      <p>{{ version.title }} · {{ t('builder.task.boundary') }}</p>
      <Feedback v-if="storageFailed" tone="error">{{ t('builder.task.storageFailed') }}</Feedback>
      <Feedback v-if="error" tone="error">{{ error }}</Feedback>
      <Feedback v-if="task" tone="success" data-testid="prototype-task-created">{{
        t('builder.task.created')
      }}</Feedback>
      <template v-else>
        <Feedback v-if="intent" tone="warning">{{ t('builder.task.pending') }}</Feedback>
        <label
          >{{ t('builder.task.project')
          }}<Select
            v-model="project"
            :disabled="!!intent || busy"
            data-testid="prototype-task-project"
          >
            <option value="">{{ t('builder.task.choose') }}</option>
            <option v-for="item in localProjectState.projects" :key="item.id" :value="item.id">
              {{ item.label }}
            </option>
          </Select></label
        >
        <label
          >{{ t('builder.task.name')
          }}<Input
            v-model="title"
            maxlength="200"
            :disabled="!!intent || busy"
            data-testid="prototype-task-title"
        /></label>
        <label
          >{{ t('builder.task.goal')
          }}<Textarea v-model="goal" maxlength="4000" :disabled="!!intent || busy"
        /></label>
        <label
          >{{ t('builder.task.criteria')
          }}<Textarea v-model="criteria" maxlength="4000" :disabled="!!intent || busy"
        /></label>
      </template>
    </div>
    <template #footer>
      <Button
        v-if="!task"
        variant="primary"
        :disabled="!canSave"
        data-testid="prototype-task-save"
        @click="save"
        >{{ t(intent ? 'builder.task.retry' : 'builder.task.save') }}</Button
      >
      <Button v-else data-testid="prototype-task-board" @click="openBoard">{{
        t('builder.task.board')
      }}</Button>
    </template>
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
.task-form,
label {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.task-form {
  overflow-wrap: anywhere;
}
</style>
