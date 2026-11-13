<script setup lang="ts">
import type { CodePreparationSelection } from './workbench'

import { boardImplementationDraft, boardPlanningDraft } from './boardImplementationDraft'
import { BoardTaskColumn, platformErrorCode } from '@eap/runtime-client'

import { BoardErrors } from '@eap/runtime-client'

import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { runtimeApi, type BoardTask, type BoardTaskDraft } from '@eap/runtime-client'
import {
  Button,
  Checkbox,
  ConfirmBox,
  Dialog,
  Input,
  Select,
  Textarea,
  Collapse,
  Tabs,
  Feedback,
} from '@eap/ui'
import { IconPlus } from '@eap/ui'
import { isRequestError } from '@eap/request'
import { chatBinding, workbench, type BoardColumn } from './workbench'
import { localProjectState } from './localProjects'
import { apiStorageScope } from '../../lib/runtimeConfig'
import BoardRunPanel from './BoardRunPanel.vue'
import BoardPrototypePanel from './BoardPrototypePanel.vue'
import BoardCodeCandidates from './BoardCodeCandidates.vue'
import CodePreparationDialog from './CodePreparationDialog.vue'
import { readBoardEdit, writeBoardEdit, readBoardCreate, writeBoardCreate } from './boardEdits'
import { readTaskHandoff, writeTaskHandoff, type TaskHandoff } from './boardTaskHandoff'
import { readBoardLocation } from './boardLocation'
const { t } = useI18n()
const columns: BoardColumn[] = [
  BoardTaskColumn.PLANNED,
  BoardTaskColumn.READY,
  BoardTaskColumn.RUNNING,
  BoardTaskColumn.ACCEPTANCE,
  BoardTaskColumn.DONE,
]
const query = ref(''),
  selectedId = ref(''),
  creating = ref(false),
  title = ref(''),
  note = ref('')
const priorityFilter = ref<'all' | 'p0' | 'p1' | 'p2'>('all')
const prototypePending = ref(false)
const codePending = ref(false)
const detailTab = ref('preparation')
const preparingCode = ref(false)
watch(selectedId, () => {
  preparingCode.value = false
})
const visitedDetailTabs = ref(new Set<string>(['preparation']))
watch(detailTab, (tab) => visitedDetailTabs.value.add(tab))
const busy = ref(false),
  rows = ref<BoardTask[]>([])
const draftNotes = ref(''),
  draftGoal = ref(''),
  draftCriteria = ref('')
const draftRevision = ref(0)
const newGoal = ref(''),
  newCriteria = ref('')
const createRequest = ref<BoardTaskDraft | null>(null)
const draftPriority = ref<BoardTask['priority']>('none')
const createColumn = ref<typeof BoardTaskColumn.PLANNED | typeof BoardTaskColumn.READY>(
  BoardTaskColumn.PLANNED,
)
const linkCurrentSession = ref(true)
const pendingAction = ref<(() => void) | null>(null)
const handoff = ref<TaskHandoff | null>(null)
const handoffActive = ref(false),
  handoffStorageError = ref(false),
  discardHandoff = ref(false)
let applyingHandoff = false
const activeSessionId = computed(() =>
  createRequest.value
    ? createRequest.value.sessionId
    : handoffActive.value
      ? (handoff.value?.source.conversationId ?? '')
      : chatBinding.value?.activeId?.trim() || '',
)

const draftStore = (() => {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
})()
function persistEdit() {
  const task = selected.value
  if (!task) return
  writeBoardEdit(
    draftStore,
    task.id,
    apiStorageScope,
    dirty.value
      ? {
          notes: draftNotes.value,
          priority: draftPriority.value,
          revision: draftRevision.value,
          goal: draftGoal.value,
          acceptanceCriteria: draftCriteria.value,
        }
      : null,
  )
}
const dirty = computed(
  () =>
    !!selected.value &&
    (draftNotes.value !== selected.value.notes ||
      draftPriority.value !== selected.value.priority ||
      draftGoal.value !== selected.value.goal ||
      draftCriteria.value !== selected.value.acceptanceCriteria),
)
const stale = computed(() => !!selected.value && draftRevision.value !== selected.value.revision)
function guarded(action: () => void) {
  if (busy.value || codePending.value) return
  if (dirty.value) pendingAction.value = action
  else action()
}
function closeDetail() {
  cancelGoalOptimization()
  guarded(() => {
    selectedId.value = ''
    if (window.location.hash.startsWith('#board?')) window.history.replaceState(null, '', '#board')
  })
}
function discardEdits() {
  const action = pendingAction.value
  pendingAction.value = null
  if (selected.value) writeBoardEdit(draftStore, selected.value.id, apiStorageScope, null)
  useLatest()
  action?.()
}
function startCreate(
  column: typeof BoardTaskColumn.PLANNED | typeof BoardTaskColumn.READY = BoardTaskColumn.PLANNED,
) {
  guarded(() => {
    if (!createRequest.value) createColumn.value = column
    selectedId.value = ''
    creating.value = true
  })
}
function closeCreate() {
  if (busy.value || createRequest.value) return
  cancelGoalOptimization()
  if (handoffActive.value) {
    persistHandoff()
    creating.value = false
    return
  }
  if (title.value || newGoal.value || newCriteria.value)
    pendingAction.value = () => {
      title.value = ''
      newGoal.value = ''
      newCriteria.value = ''
      creating.value = false
    }
  else creating.value = false
}
function selectTask(id: string) {
  if (id === selectedId.value) closeDetail()
  else
    guarded(() => {
      selectedId.value = id
    })
}
async function mutationFailed(error: unknown) {
  const code = platformErrorCode(error)
  if (code === BoardErrors.BOARD_PREPARATION_REQUIRED)
    note.value = t('desktop.boardPreparationRequired')
  else if (isRequestError(error) && error.response?.status === 409) {
    note.value = t('desktop.boardConflict')
    await load()
    // Keep the original draft revision until the user explicitly resolves the conflict.
  } else note.value = t('desktop.boardUpdateFailed')
}
function useLatest() {
  const task = selected.value
  if (!task) return
  draftNotes.value = task.notes
  draftPriority.value = task.priority
  draftGoal.value = task.goal
  draftCriteria.value = task.acceptanceCriteria
  draftRevision.value = task.revision
  writeBoardEdit(draftStore, task.id, apiStorageScope, null)
}
function keepDraft() {
  if (selected.value) {
    draftRevision.value = selected.value.revision
    persistEdit()
  }
}
const projectId = ref(
  readBoardLocation(window.location.hash)?.projectId ||
    localProjectState.selectedId ||
    localProjectState.projects[0]?.id ||
    'local-eap',
)
const taskLinkFailed = ref(false)
function readHandoff() {
  try {
    handoff.value = readTaskHandoff(localStorage, apiStorageScope)
    handoffStorageError.value = false
    const request = createRequest.value,
      saved = handoff.value
    if (
      request &&
      saved &&
      request.projectId === saved.draft.projectId &&
      request.title === saved.draft.title.trim() &&
      request.goal === saved.draft.goal &&
      request.acceptanceCriteria === saved.draft.acceptanceCriteria &&
      request.sessionId === (saved.linkSource ? saved.source.conversationId : '')
    ) {
      handoffActive.value = true
      linkCurrentSession.value = saved.linkSource
    }
  } catch {
    handoffStorageError.value = true
  }
}
function adoptHandoff() {
  if (!handoff.value || busy.value || createRequest.value || handoffStorageError.value) return
  const draft = handoff.value.draft
  const target = draft.projectId || projectId.value
  if (readBoardCreate(draftStore, target, apiStorageScope)) {
    note.value = t('desktop.boardCreateUncertain')
    return
  }
  const apply = () => {
    applyingHandoff = true
    projectId.value = target
    selectedId.value = ''
    title.value = draft.title
    newGoal.value = draft.goal
    newCriteria.value = draft.acceptanceCriteria
    createColumn.value = BoardTaskColumn.PLANNED
    linkCurrentSession.value = handoff.value!.linkSource
    handoffActive.value = true
    creating.value = true
    applyingHandoff = false
    persistHandoff()
  }
  if (dirty.value || (!handoffActive.value && (title.value || newGoal.value || newCriteria.value)))
    pendingAction.value = apply
  else apply()
}
function persistHandoff() {
  if (
    !handoffActive.value ||
    !handoff.value ||
    applyingHandoff ||
    createRequest.value ||
    handoffStorageError.value
  )
    return
  const next: TaskHandoff = {
    source: { ...handoff.value.source },
    linkSource: linkCurrentSession.value,
    draft: {
      projectId: projectId.value,
      title: title.value,
      goal: newGoal.value,
      acceptanceCriteria: newCriteria.value,
    },
  }
  try {
    writeTaskHandoff(localStorage, apiStorageScope, next, handoff.value)
    handoff.value = next
  } catch {
    handoffStorageError.value = true
  }
}
function removeHandoff() {
  if (!handoff.value || createRequest.value) return
  try {
    writeTaskHandoff(localStorage, apiStorageScope, null, handoff.value)
    handoff.value = null
    if (handoffActive.value) {
      handoffActive.value = false
      title.value = ''
      newGoal.value = ''
      newCriteria.value = ''
      creating.value = false
    }
    discardHandoff.value = false
  } catch {
    handoffStorageError.value = true
  }
}
function chooseCreateProject(id: string) {
  if (busy.value || createRequest.value) return
  if (readBoardCreate(draftStore, id, apiStorageScope)) {
    note.value = t('desktop.boardCreateUncertain')
    return
  }
  projectId.value = id
}
watch([title, newGoal, newCriteria, projectId, linkCurrentSession], persistHandoff, {
  flush: 'sync',
})
// One disposable suggestion pipeline serves both forms; persisted drafts remain independent.
const optimizingGoal = ref(false)
const goalSuggestion = ref('')
const goalOptimizationError = ref(false)
type GoalOptimization = {
  id: string
  text: string
  projectId: string
  taskId: string
  draftRevision: number
  revision: number
  editEpoch: number
  controller: AbortController
}
let goalEditEpoch = 0
let suggestionBinding: GoalOptimization | null = null
let goalOptimization: GoalOptimization | null = null
function optimizationMatches(binding: GoalOptimization) {
  if (busy.value || binding.projectId !== projectId.value) return false
  if (!binding.taskId)
    return creating.value && !createRequest.value && newGoal.value === binding.text
  return !!selected.value && !creating.value && !selected.value.executionActive && !stale.value &&
    selected.value.id === binding.taskId && selected.value.revision === binding.revision &&
    draftRevision.value === binding.draftRevision && draftGoal.value === binding.text &&
    goalEditEpoch === binding.editEpoch
}
function cancelGoalOptimization() {
  const pending = goalOptimization
  goalOptimization = null
  optimizingGoal.value = false
  goalSuggestion.value = ''
  suggestionBinding = null
  goalOptimizationError.value = false
  if (pending) {
    pending.controller.abort()
    void runtimeApi.cancelTaskDescriptionOptimization(pending.id).catch(() => undefined)
  }
}
async function optimizeGoal(edit = false) {
  const text = edit ? draftGoal.value : newGoal.value
  if (
    busy.value || optimizingGoal.value || !text.trim() || text.length > 4000 ||
    (edit ? !selected.value || creating.value || stale.value || selected.value.executionActive
      : !creating.value || !!createRequest.value)
  ) return
  cancelGoalOptimization()
  const pending: GoalOptimization = {
    id: crypto.randomUUID(),
    text,
    projectId: projectId.value,
    taskId: edit ? selected.value!.id : '',
    draftRevision: draftRevision.value,
    revision: selected.value?.revision ?? 0,
    editEpoch: goalEditEpoch,
    controller: new AbortController(),
  }
  goalOptimization = pending
  optimizingGoal.value = true
  try {
    const result = await runtimeApi.optimizeTaskDescription(
      pending.id,
      { text: pending.text },
      { signal: pending.controller.signal },
    )
    if (goalOptimization !== pending || !optimizationMatches(pending)) return
    if (!result.text.trim() || result.text.length > 2000)
      throw new Error('INVALID_TASK_DESCRIPTION_SUGGESTION')
    suggestionBinding = pending
    goalSuggestion.value = result.text
  } catch {
    if (goalOptimization === pending) goalOptimizationError.value = true
  } finally {
    if (goalOptimization === pending) {
      goalOptimization = null
      optimizingGoal.value = false
    }
  }
}
function adoptGoalSuggestion() {
  if (!suggestionBinding || !optimizationMatches(suggestionBinding) || !goalSuggestion.value) return
  const suggestion = goalSuggestion.value
  const edit = !!suggestionBinding.taskId
  cancelGoalOptimization()
  if (edit) draftGoal.value = suggestion
  else newGoal.value = suggestion
}
watch([newGoal, projectId, creating], cancelGoalOptimization, { flush: 'sync' })
onBeforeUnmount(cancelGoalOptimization)
watch(() => workbench.boardHandoffToken, readHandoff)
onMounted(readHandoff)
watch([busy, handoff], () => {
  if (
    !busy.value &&
    !readBoardLocation(window.location.hash) &&
    handoff.value &&
    !creating.value &&
    !title.value &&
    !newGoal.value &&
    !newCriteria.value &&
    !dirty.value &&
    !createRequest.value
  )
    adoptHandoff()
})
const previewProjects = computed(() => {
  const projects = localProjectState.projects.map((item) => ({
    id: item.id,
    name: item.label,
    directory: item.intendedPath,
  }))
  if (!projects.some((item) => item.id === projectId.value))
    projects.push({ id: projectId.value, name: projectId.value, directory: '' })
  return projects
})
const selected = computed(() => rows.value.find((item) => item.id === selectedId.value))
// Synchronous invalidation catches edits even when the text is immediately restored (ABA).
watch(draftGoal, () => {
  goalEditEpoch++
  cancelGoalOptimization()
}, { flush: 'sync' })
watch([projectId, selectedId, draftRevision, busy,
  () => selected.value?.revision, () => selected.value?.executionActive],
  cancelGoalOptimization, { flush: 'sync' })
const tasks = computed(() => {
  const needle = query.value.trim().toLowerCase()
  return rows.value.filter((item) => {
    if (priorityFilter.value !== 'all' && item.priority !== priorityFilter.value) return false
    if (!needle) return true
    return (
      item.title.toLowerCase().includes(needle) ||
      item.notes.toLowerCase().includes(needle) ||
      item.goal.toLowerCase().includes(needle) ||
      item.acceptanceCriteria.toLowerCase().includes(needle) ||
      item.id.toLowerCase().includes(needle)
    )
  })
})
const project = computed(() => previewProjects.value.find((item) => item.id === projectId.value))
const selectedProject = computed(() =>
  previewProjects.value.find((item) => item.id === selected.value?.projectId),
)
let ticket = 0
let loadedHash = window.location.hash
async function load() {
  const current = ++ticket
  loadedHash = window.location.hash
  const locationHash = loadedHash
  const linked = readBoardLocation(window.location.hash)
  busy.value = true
  taskLinkFailed.value = window.location.hash.startsWith('#board?') && !linked
  try {
    const [page, target] = await Promise.all([
      runtimeApi.boardTasks(projectId.value),
      linked && linked.projectId === projectId.value
        ? runtimeApi.boardTask(linked.taskId, linked.projectId)
        : Promise.resolve(null),
    ])
    if (current === ticket && window.location.hash === locationHash) {
      // Check against the old snapshot at response time, including edits made while loading.
      const preserveDraft = dirty.value || stale.value
      rows.value = page.items
      if (target) {
        if (target.id !== linked?.taskId || target.projectId !== linked.projectId)
          throw new Error('BOARD_TASK_IDENTITY_MISMATCH')
        if (!rows.value.some((task) => task.id === target.id)) rows.value.push(target)
        else rows.value = rows.value.map((task) => (task.id === target.id ? target : task))
        if (!preserveDraft || selectedId.value === target.id) {
          selectedId.value = target.id
          await nextTick()
          if (current === ticket) detailTab.value = 'runs'
        }
      }
      if (!preserveDraft) useLatest()
    }
  } catch {
    if (current === ticket) {
      note.value = t('desktop.boardLoadFailed')
      if (linked) taskLinkFailed.value = true
    }
  } finally {
    if (current === ticket) {
      busy.value = false
      if (window.location.hash !== locationHash) onTaskLocationChanged()
    }
  }
}
function followTaskLocation() {
  const linked = readBoardLocation(window.location.hash)
  if (!linked) return
  guarded(() => {
    if (projectId.value !== linked.projectId) {
      selectedId.value = ''
      projectId.value = linked.projectId
    } else void load()
  })
}
function onTaskLocationChanged() {
  if (window.location.hash !== loadedHash) followTaskLocation()
}
onMounted(() => window.addEventListener('hashchange', onTaskLocationChanged))
onBeforeUnmount(() => window.removeEventListener('hashchange', onTaskLocationChanged))
function switchProject(id: string) {
  if (createRequest.value) return
  guarded(() => {
    projectId.value = id
    selectedId.value = ''
    note.value = ''
    creating.value = false
  })
}
watch(selectedId, () => {
  detailTab.value = 'preparation'
  visitedDetailTabs.value = new Set(['preparation'])
  prototypePending.value = false
  codePending.value = false
  const task = selected.value
  const cached = task ? readBoardEdit(draftStore, task.id, apiStorageScope) : null
  draftNotes.value = cached?.notes ?? task?.notes ?? ''
  draftPriority.value = cached?.priority ?? task?.priority ?? 'none'
  draftGoal.value = cached?.goal ?? task?.goal ?? ''
  draftCriteria.value = cached?.acceptanceCriteria ?? task?.acceptanceCriteria ?? ''
  draftRevision.value = cached?.revision ?? task?.revision ?? 0
  if (cached)
    note.value = t(
      cached.revision === task?.revision ? 'desktop.boardDraftRestored' : 'desktop.boardDraftStale',
    )
})
watch([draftNotes, draftPriority, draftGoal, draftCriteria], persistEdit, { flush: 'post' })
onMounted(() => window.addEventListener('beforeunload', persistEdit))
onBeforeUnmount(() => {
  ticket++
  persistEdit()
  window.removeEventListener('beforeunload', persistEdit)
})
watch(
  projectId,
  () => {
    rows.value = []
    createRequest.value = readBoardCreate(draftStore, projectId.value, apiStorageScope)
    if (createRequest.value) {
      title.value = createRequest.value.title
      newGoal.value = createRequest.value.goal
      newCriteria.value = createRequest.value.acceptanceCriteria
      createColumn.value = createRequest.value.column
      linkCurrentSession.value = !!createRequest.value.sessionId
      creating.value = true
      note.value = t('desktop.boardCreateUncertain')
    }
    void load()
  },
  { immediate: true },
)
function prototypeSaved(task: BoardTask) {
  // The user may have started editing task fields while this independent request was pending.
  const preserveDraft = dirty.value
  replace(task)
  if (!preserveDraft) useLatest()
}
function replace(task: BoardTask) {
  rows.value = rows.value.map((item) => (item.id === task.id ? task : item))
}
async function move(id: string, column: BoardColumn) {
  if (busy.value) return
  if (dirty.value || stale.value) {
    note.value = t('desktop.boardUnsaved')
    return
  }
  const task = rows.value.find((item) => item.id === id)
  if (!task || task.column === column) return
  if (!task.allowedColumns.includes(column)) {
    note.value = t(
      column === BoardTaskColumn.READY
        ? 'desktop.boardPreparationRequired'
        : column === BoardTaskColumn.RUNNING
          ? 'desktop.boardNoRun'
          : 'desktop.boardEvidence',
    )
    return
  }
  busy.value = true
  try {
    const saved = await runtimeApi.updateBoardTask(id, {
      projectId: task.projectId,
      revision: task.revision,
      column,
    })
    replace(saved)
    if (selectedId.value === id) useLatest()
    note.value = t('desktop.boardMoved')
  } catch (error) {
    await mutationFailed(error)
  } finally {
    busy.value = false
  }
}
async function saveNotes() {
  const task = selected.value
  if (!task || busy.value || stale.value) return
  busy.value = true
  try {
    const saved = await runtimeApi.updateBoardTask(task.id, {
      projectId: task.projectId,
      revision: draftRevision.value,
      notes: draftNotes.value,
      priority: draftPriority.value,
      goal: draftGoal.value,
      acceptanceCriteria: draftCriteria.value,
    })
    replace(saved)
    useLatest()
    note.value = t('desktop.boardFieldsSaved')
  } catch (error) {
    await mutationFailed(error)
  } finally {
    busy.value = false
  }
}
async function create() {
  if (
    !creating.value ||
    !title.value.trim() ||
    busy.value ||
    title.value.length > 200 ||
    newGoal.value.length > 4000 ||
    newCriteria.value.length > 4000 ||
    (handoffActive.value && handoffStorageError.value && !createRequest.value)
  )
    return
  if (
    !createRequest.value &&
    createColumn.value === BoardTaskColumn.READY &&
    (!newGoal.value.trim() || !newCriteria.value.trim())
  ) {
    note.value = t('desktop.boardPreparationRequired')
    return
  }
  cancelGoalOptimization()
  busy.value = true
  createRequest.value ??= {
    projectId: projectId.value,
    title: title.value.trim(),
    column: createColumn.value,
    sessionId: linkCurrentSession.value ? activeSessionId.value : '',
    goal: newGoal.value,
    acceptanceCriteria: newCriteria.value,
    requestId: crypto.randomUUID(),
  }
  if (!writeBoardCreate(draftStore, projectId.value, apiStorageScope, createRequest.value)) {
    createRequest.value = null
    busy.value = false
    note.value = t('desktop.boardCreateStorageFailed')
    return
  }
  try {
    // Retries retain the exact request and identity after an unknown network outcome.
    const task = await runtimeApi.createBoardTask({ ...createRequest.value })
    rows.value = [task, ...rows.value.filter((item) => item.id !== task.id)]
    if (handoffActive.value && handoff.value) {
      try {
        writeTaskHandoff(localStorage, apiStorageScope, null, handoff.value)
        handoff.value = null
        handoffActive.value = false
      } catch {
        handoffStorageError.value = true
        note.value = t('desktop.taskHandoffStorage')
        return
      }
    }
    writeBoardCreate(draftStore, projectId.value, apiStorageScope, null)
    createRequest.value = null
    title.value = ''
    newGoal.value = ''
    newCriteria.value = ''
    creating.value = false
    selectedId.value = task.id
    note.value = task.sessionId ? t('desktop.boardCreatedLinked') : t('desktop.boardCreated')
  } catch (error) {
    if (
      isRequestError(error) &&
      error.response &&
      error.response.status >= 400 &&
      error.response.status < 500
    ) {
      writeBoardCreate(draftStore, projectId.value, apiStorageScope, null)
      createRequest.value = null
      await mutationFailed(error)
    } else note.value = t('desktop.boardCreateUncertain')
  } finally {
    busy.value = false
  }
}
function open(task: BoardTask, selection?: CodePreparationSelection, planning = false) {
  if (busy.value || dirty.value || stale.value || task.executionActive) return
  guarded(() => {
    // Seed chat draft only; never invent a fake conversation id from the task id.
    workbench.pendingBoardDraft = planning
      ? boardPlanningDraft(task, t('desktop.boardCriteria'))
      : boardImplementationDraft(task, t('desktop.boardCriteria'), selection)
    window.location.hash = workbench.workMode === 'work' ? 'work' : 'chat'
    preparingCode.value = false
  })
}
</script>
<template>
  <section class="preview-board" data-testid="preview-board">
    <header>
      <div>
        <p v-if="project?.name" class="eyebrow">{{ project.name }}</p>
        <h1>{{ t('desktop.board') }}</h1>
        <p>{{ t('preview.boardHint') }}</p>
        <p class="board-unattended" data-testid="board-unattended-badge">
          {{ t('desktop.boardUnattendedBadge') }}
        </p>
      </div>
      <Button
        variant="primary"
        :disabled="busy"
        data-testid="board-create-task"
        @click="startCreate()"
        ><IconPlus /> {{ t('preview.createTask') }}</Button
      >
    </header>
    <Feedback v-if="taskLinkFailed" tone="warning" data-testid="board-task-link-error">
      {{ t('generation.taskLinkFailed') }}
      <Button :disabled="busy" data-testid="board-task-link-retry" @click="followTaskLocation">{{
        t('generation.taskLinkRetry')
      }}</Button>
    </Feedback>
    <Feedback v-if="handoffStorageError" tone="error">{{
      t('desktop.taskHandoffStorage')
    }}</Feedback>
    <Feedback v-if="handoff && !creating" tone="info">
      {{ t('desktop.taskHandoffPending') }}
      <Button
        size="sm"
        :disabled="busy || !!createRequest || handoffStorageError"
        data-testid="board-handoff-resume"
        @click="adoptHandoff"
        >{{ t('desktop.taskHandoffResume') }}</Button
      >
      <Button
        size="sm"
        :disabled="busy || !!createRequest"
        data-testid="board-handoff-discard"
        @click="discardHandoff = true"
        >{{ t('desktop.taskHandoffDiscard') }}</Button
      >
    </Feedback>
    <Dialog
      v-if="creating"
      :title="t('preview.createTask')"
      :busy="busy || !!createRequest || !!pendingAction"
      :close-label="t('preview.close')"
      close-test-id="board-create-close"
      data-testid="board-create-dialog"
      size="lg"
      @close="closeCreate"
    >
      <form class="new-task-form" data-testid="board-create-form" @submit.prevent="create">
        <Feedback v-if="note" tone="warning" data-testid="board-create-note">{{ note }}</Feedback>
        <Feedback v-if="handoffActive && handoffStorageError" tone="error">{{
          t('desktop.taskHandoffStorage')
        }}</Feedback>
        <Feedback v-if="newGoal.length > 4000" tone="warning">{{
          t('desktop.taskHandoffGoalLimit')
        }}</Feedback>
        <p v-if="handoffActive">{{ t('desktop.taskHandoffBoundary') }}</p>
        <div class="new-task-form__placement">
          <label
            >{{ t('desktop.boardProject') }}
            <Select
              data-testid="board-create-project"
              :disabled="busy || !!createRequest"
              :model-value="projectId"
              @update:model-value="chooseCreateProject(String($event))"
            >
              <option v-for="item in previewProjects" :key="item.id" :value="item.id">
                {{ item.name }}
              </option>
            </Select>
          </label>
          <label
            >{{ t('desktop.boardCreatePosition') }}
            <Select
              v-model="createColumn"
              data-testid="board-create-column"
              :disabled="busy || !!createRequest"
            >
              <option :value="BoardTaskColumn.PLANNED">{{ t('desktop.planned') }}</option>
              <option :value="BoardTaskColumn.READY">{{ t('desktop.ready') }}</option>
            </Select>
          </label>
        </div>
        <Collapse
          v-if="handoffActive && handoff"
          :summary="t('desktop.taskHandoffSource')"
          data-testid="board-handoff-source"
        >
          <pre>{{ handoff.source.text }}</pre>
        </Collapse>
        <label class="new-task-form__title"
          >{{ t('preview.taskTitle')
          }}<Input
            data-testid="board-new-title"
            v-model="title"
            required
            maxlength="200"
            :disabled="busy || !!createRequest"
            :placeholder="t('preview.taskTitle')"
            :aria-label="t('preview.taskTitle')"
            autofocus
        /></label>
        <div class="new-task-form__goal-heading">
          <label for="board-new-goal">{{ t('desktop.boardGoal') }}</label>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            data-testid="board-optimize-goal"
            :disabled="
              busy || !!createRequest || optimizingGoal || !newGoal.trim() || newGoal.length > 4000
            "
            @click="optimizeGoal()"
            >{{ t('desktop.boardOptimizeGoal') }}</Button
          >
          <Button
            v-if="optimizingGoal"
            type="button"
            size="sm"
            data-testid="board-optimize-cancel"
            @click="cancelGoalOptimization"
            >{{ t('desktop.boardOptimizeCancel') }}</Button
          >
        </div>
        <div class="preparation-field">
          <Textarea
            id="board-new-goal"
            v-model="newGoal"
            data-testid="board-new-goal"
            rows="4"
            maxlength="4000"
            :required="createColumn === 'ready'"
            :disabled="busy || !!createRequest"
          />
        </div>
        <p v-if="optimizingGoal" role="status">{{ t('desktop.boardOptimizingGoal') }}</p>
        <Feedback v-if="goalOptimizationError" tone="error" data-testid="board-optimize-error">{{
          t('desktop.boardOptimizeFailed')
        }}</Feedback>
        <section
          v-if="goalSuggestion"
          data-testid="board-goal-suggestion"
          class="new-task-form__suggestion"
          aria-live="polite"
        >
          <strong>{{ t('desktop.boardGoalSuggestion') }}</strong>
          <p>{{ goalSuggestion }}</p>
          <div class="new-task-form__actions">
            <Button
              type="button"
              size="sm"
              variant="primary"
              data-testid="board-goal-adopt"
              :disabled="busy || !!createRequest"
              @click="adoptGoalSuggestion"
              >{{ t('desktop.boardGoalAdopt') }}</Button
            >
            <Button
              type="button"
              size="sm"
              data-testid="board-goal-dismiss"
              @click="cancelGoalOptimization"
              >{{ t('desktop.boardGoalDismiss') }}</Button
            >
          </div>
        </section>
        <label class="preparation-field"
          >{{ t('desktop.boardCriteria')
          }}<Textarea
            v-model="newCriteria"
            data-testid="board-new-criteria"
            rows="4"
            maxlength="4000"
            :required="createColumn === 'ready'"
            :disabled="busy || !!createRequest"
        /></label>
        <p class="board-notice">{{ t('desktop.boardPreparationHint') }}</p>
        <label v-if="activeSessionId" class="link-session" data-testid="board-link-session">
          <Checkbox v-model="linkCurrentSession" :disabled="busy || !!createRequest" />
          <span>{{ t('desktop.boardLinkCurrent') }} · {{ activeSessionId.slice(0, 8) }}</span>
        </label>
        <div class="new-task-form__actions">
          <Button
            type="submit"
            variant="primary"
            size="sm"
            :disabled="
              busy ||
              !title.trim() ||
              newGoal.length > 4000 ||
              (handoffActive && handoffStorageError && !createRequest)
            "
            data-testid="board-create-save"
            >{{ t(createRequest ? 'desktop.boardRetryCreate' : 'preview.save') }}</Button
          >
          <Button
            type="button"
            size="sm"
            variant="secondary"
            :disabled="busy || !!createRequest"
            @click="closeCreate"
            >{{ t('preview.close') }}</Button
          >
        </div>
      </form>
    </Dialog>
    <div class="board-tools">
      <label
        >{{ t('desktop.boardProject')
        }}<Select
          data-testid="board-project"
          :disabled="busy || !!createRequest"
          :model-value="projectId"
          @change="switchProject(($event.target as HTMLSelectElement).value)"
          ><option v-for="item in previewProjects" :key="item.id" :value="item.id">
            {{ item.name }}{{ item.directory ? ' · ' + item.directory : '' }}
          </option></Select
        ></label
      >
      <Input
        v-model="query"
        type="search"
        data-testid="board-search"
        :placeholder="t('desktop.boardSearch')"
        :aria-label="t('desktop.boardSearch')"
      />
      <label>
        <span class="sr-only">{{ t('desktop.boardPriorityAll') }}</span>
        <Select v-model="priorityFilter" data-testid="board-priority">
          <option value="all">{{ t('desktop.boardPriorityAll') }}</option>
          <option value="p0">P0</option>
          <option value="p1">P1</option>
          <option value="p2">P2</option>
        </Select>
      </label>
      <span>{{ tasks.length }} · {{ t('desktop.boardDraftRecord') }}</span>
      <Button
        type="button"
        size="sm"
        :disabled="busy"
        @click="
          guarded(() => {
            selectedId = ''
            note = ''
            void load()
          })
        "
        >{{ t('desktop.boardRefresh') }}</Button
      >
    </div>
    <p
      v-if="!busy && !tasks.length && (query || priorityFilter !== 'all')"
      class="board-notice"
      role="status"
      data-testid="board-filter-empty"
    >
      {{ t('desktop.boardFilterEmpty') }}
    </p>
    <p v-if="busy" role="status" data-testid="board-loading">{{ t('desktop.boardLoading') }}</p>
    <p v-if="note && !creating" class="board-notice" role="status">{{ note }}</p>
    <div class="board-scroll eap-scrollbar">
      <div class="board-lanes">
        <section
          v-for="column in columns"
          :key="column"
          class="board-lane"
          :data-testid="`lane-${column}`"
          @dragover.prevent
          @drop="move($event.dataTransfer?.getData('text/plain') ?? '', column)"
        >
          <h2>
            <span :class="column" />{{ t('desktop.' + column)
            }}<small>{{ tasks.filter((item) => item.column === column).length }}</small>
          </h2>
          <p class="lane-hint">{{ t('desktop.' + column + 'Hint') }}</p>
          <p v-if="column === 'ready'" class="lane-hint" data-testid="board-auto-off">
            {{ t('desktop.boardAutoOff') }}
          </p>
          <label v-if="column === 'ready'" class="auto-work" data-testid="board-auto-toggle">
            <Checkbox disabled />
            <span>{{ t('desktop.boardAutoWork') }} · {{ t('desktop.notConnected') }}</span>
          </label>
          <Button
            variant="card"
            v-for="task in tasks.filter((item) => item.column === column)"
            :key="task.id"
            type="button"
            class="board-card"
            :aria-pressed="selectedId === task.id"
            :disabled="busy"
            :draggable="!busy && !task.executionActive"
            @dragstart="$event.dataTransfer?.setData('text/plain', task.id)"
            @click="selectTask(task.id)"
          >
            <span class="card-meta">
              <small
                class="priority"
                :class="'prio-' + task.priority"
                data-testid="card-priority"
                >{{
                  task.priority === 'none'
                    ? t('desktop.boardUnranked')
                    : task.priority.toUpperCase()
                }}</small
              >
              <small
                v-if="task.sessionId"
                class="card-session"
                data-testid="card-session"
                :title="task.sessionId"
                >{{ t('desktop.boardSessionShort') }} · {{ task.sessionId.slice(0, 8) }}</small
              >
            </span>
            <strong>{{ task.title }}</strong>
            <span v-if="task.executionActive">{{ t('boardRun.active') }}</span>
            <span v-if="task.preparationIssues.length" class="preparation-missing">{{
              t('desktop.boardPreparationMissing')
            }}</span>
            <span :title="task.id">{{ task.id.slice(0, 8) }}</span>
          </Button>
          <Button
            size="sm"
            variant="link"
            v-if="column === 'planned' || column === 'ready'"
            type="button"
            class="lane-add"
            :disabled="busy"
            data-testid="lane-add-task"
            @click="startCreate(column)"
            ><IconPlus /> {{ t('desktop.boardAddTask') }}</Button
          >
          <p v-if="!tasks.some((item) => item.column === column)" class="empty-lane">
            {{ t('preview.noTasks') }}
          </p>
        </section>
      </div>
    </div>
    <Dialog
      v-if="selected"
      :title="selected.title"
      :busy="busy || !!pendingAction || codePending"
      :close-label="t('preview.close')"
      close-test-id="board-close-detail"
      size="lg"
      data-testid="board-detail-dialog"
      @close="closeDetail"
    >
      <div class="board-detail" data-testid="board-detail">
        <Tabs
          v-model="detailTab"
          :label="selected.title"
          data-testid="board-detail-tabs"
          :tabs="[
            {
              id: 'preparation',
              label: t('boardRun.preparationTab'),
              testId: 'board-tab-preparation',
            },
            { id: 'prototype', label: t('boardRun.prototypeTab'), testId: 'board-tab-prototype' },
            { id: 'runs', label: t('boardRun.runsTab'), testId: 'board-tab-runs' },
            { id: 'code', label: t('boardCode.tab'), testId: 'board-tab-code' },
          ]"
        />
        <p v-if="dirty && detailTab !== 'preparation'" role="status">
          {{ t('desktop.boardUnsaved') }}
        </p>
        <section
          v-show="detailTab === 'preparation'"
          class="board-detail-section"
          data-testid="board-preparation-section"
          :inert="detailTab !== 'preparation'"
        >
          <p data-testid="task-link">
            {{ t('desktop.boardProject') }}：{{ selectedProject?.name }} ·
            {{ selectedProject?.directory || '—' }}
          </p>
          <p data-testid="task-session">
            {{ t('desktop.boardSession') }}：
            <template v-if="selected.sessionId"
              ><code :title="selected.sessionId">{{ selected.sessionId.slice(0, 8) }}</code> ·
              {{ t('desktop.boardSessionLinked') }}</template
            >
            <template v-else>— · {{ t('desktop.boardSessionDraft') }}</template>
          </p>
          <label
            >{{ t('desktop.boardPriority')
            }}<Select
              v-model="draftPriority"
              data-testid="task-priority"
              :disabled="busy || selected.executionActive"
              ><option value="none">{{ t('desktop.boardUnranked') }}</option>
              <option value="p0">P0</option>
              <option value="p1">P1</option>
              <option value="p2">P2</option></Select
            ></label
          >
          <div class="new-task-form__goal-heading">
            <label for="task-goal">{{ t('desktop.boardGoal') }}</label>
            <Button size="sm" variant="secondary" data-testid="task-goal-optimize"
              :disabled="busy || selected.executionActive || stale || optimizingGoal || !draftGoal.trim() || draftGoal.length > 4000"
              @click="optimizeGoal(true)">{{ t('desktop.boardOptimizeGoal') }}</Button>
            <Button v-if="optimizingGoal" size="sm" data-testid="task-goal-cancel"
              @click="cancelGoalOptimization">{{ t('desktop.boardOptimizeCancel') }}</Button>
          </div>
          <Textarea id="task-goal" v-model="draftGoal" data-testid="task-goal"
            :disabled="busy || selected.executionActive" rows="3" maxlength="4000" />
          <p v-if="optimizingGoal" role="status">{{ t('desktop.boardOptimizingGoal') }}</p>
          <Feedback v-if="goalOptimizationError" tone="error" data-testid="task-goal-optimize-error">
            {{ t('desktop.boardOptimizeFailed') }}
          </Feedback>
          <section v-if="goalSuggestion" data-testid="task-goal-suggestion"
            class="new-task-form__suggestion" aria-live="polite">
            <strong>{{ t('desktop.boardGoalSuggestion') }}</strong>
            <p>{{ goalSuggestion }}</p>
            <p>{{ t('desktop.boardGoalDraftHint') }}</p>
            <div class="new-task-form__actions">
              <Button size="sm" variant="primary" data-testid="task-goal-adopt"
                :disabled="busy || selected.executionActive || stale" @click="adoptGoalSuggestion">
                {{ t('desktop.boardGoalAdopt') }}
              </Button>
              <Button size="sm" data-testid="task-goal-discard" @click="cancelGoalOptimization">
                {{ t('desktop.boardGoalDismiss') }}
              </Button>
            </div>
          </section>
          <label
            >{{ t('desktop.boardCriteria')
            }}<Textarea
              v-model="draftCriteria"
              data-testid="task-criteria"
              :disabled="busy || selected.executionActive"
              rows="3"
              maxlength="4000"
          /></label>
          <p
            v-if="selected.preparationIssues.length"
            role="status"
            data-testid="task-preparation-missing"
          >
            {{ t('desktop.boardPreparationRequired') }}
          </p>
          <section v-if="stale" class="board-conflict" role="alert" data-testid="board-conflict">
            <p>{{ t('desktop.boardConflictReview') }}</p>
            <dl>
              <dt>{{ t('desktop.boardGoal') }}</dt>
              <dd>{{ selected.goal || '—' }}</dd>
              <dt>{{ t('desktop.boardCriteria') }}</dt>
              <dd>{{ selected.acceptanceCriteria || '—' }}</dd>
              <dt>{{ t('preview.taskNotes') }}</dt>
              <dd>{{ selected.notes || '—' }}</dd>
              <dt>{{ t('desktop.boardPriority') }}</dt>
              <dd>
                {{
                  selected.priority === 'none'
                    ? t('desktop.boardUnranked')
                    : selected.priority.toUpperCase()
                }}
              </dd>
            </dl>
            <Button
              size="sm"
              :disabled="busy || selected.executionActive"
              data-testid="board-use-latest"
              @click="useLatest"
              >{{ t('desktop.boardUseLatest') }}</Button
            >
            <Button
              size="sm"
              :disabled="busy || selected.executionActive"
              data-testid="board-keep-draft"
              @click="keepDraft"
              >{{ t('desktop.boardKeepDraft') }}</Button
            >
          </section>
          <label
            >{{ t('preview.taskNotes')
            }}<Textarea
              v-model="draftNotes"
              data-testid="task-notes"
              :disabled="busy || selected.executionActive"
              rows="4"
              maxlength="4000"
          /></label>
          <div class="detail-save">
            <span v-if="dirty" role="status">{{ t('desktop.boardUnsaved') }}</span
            ><Button
              variant="primary"
              size="sm"
              :disabled="busy || selected.executionActive || !dirty || stale"
              data-testid="board-save-fields"
              @click="saveNotes"
              >{{ t('historyUi.save') }}</Button
            >
          </div>
          <div class="task-moves">
            <Button
              v-for="column in columns"
              :key="column"
              size="sm"
              :disabled="
                busy ||
                dirty ||
                stale ||
                selected.column === column ||
                !selected.allowedColumns.includes(column)
              "
              @click="move(selected.id, column)"
              >{{ t('desktop.' + column) }}</Button
            ><Button
              v-if="selected.column === BoardTaskColumn.READY && !selected.preparationIssues.length"
              size="sm"
              :disabled="busy || dirty || stale || selected.executionActive"
              data-testid="board-prepare-code"
              @click="preparingCode = true"
              >{{ t('boardCode.preparation.title') }}</Button
            >
            <Button size="sm" :disabled="busy || selected.executionActive" @click="open(selected)"
              >{{ t('preview.openConversation') }} ↗</Button
            >
            <Button
              v-if="
                [BoardTaskColumn.PLANNED, BoardTaskColumn.READY].includes(
                  selected.column as 'planned' | 'ready',
                )
              "
              size="sm"
              :disabled="busy || dirty || stale || selected.executionActive"
              data-testid="board-plan-task"
              @click="open(selected, undefined, true)"
              >{{ t('desktop.boardPlanTask') }}</Button
            >
          </div>
        </section>
        <section
          v-if="visitedDetailTabs.has('prototype')"
          v-show="detailTab === 'prototype'"
          class="board-detail-section"
          :inert="detailTab !== 'prototype'"
        >
          <BoardPrototypePanel
            :key="selected.id + '-prototype'"
            :task="selected"
            :disabled="busy || dirty || stale"
            @saved="prototypeSaved"
            @refresh="load"
            @pending="prototypePending = $event"
          />
        </section>
        <section
          v-if="visitedDetailTabs.has('code')"
          v-show="detailTab === 'code'"
          class="board-detail-section"
          :inert="detailTab !== 'code'"
        >
          <BoardCodeCandidates
            :key="selected.id + '-code'"
            :task="selected"
            :disabled="busy || dirty || stale || prototypePending"
            @pending="codePending = $event"
            @changed="load"
            @runs="detailTab = 'runs'"
          />
        </section>
        <section
          v-if="visitedDetailTabs.has('runs')"
          v-show="detailTab === 'runs'"
          class="board-detail-section"
          data-testid="board-runs-section"
          :inert="detailTab !== 'runs'"
        >
          <BoardRunPanel
            :key="selected.id"
            :task="selected"
            :disabled="busy || dirty || stale || prototypePending || codePending"
            @changed="load"
          />
          <Collapse class="board-evidence"
            ><template #summary>{{ t('desktop.boardEvidenceDetails') }}</template>
            <ul class="task-evidence" data-testid="task-links">
              <li>{{ t('desktop.linkGoal', { title: selected.goal || '—' }) }}</li>
              <li>{{ t('desktop.boardCriteria') }}：{{ selected.acceptanceCriteria || '—' }}</li>
              <li>{{ t('desktop.linkRun') }}</li>
            </ul>
            <ul class="task-evidence" data-testid="task-evidence">
              <li>
                {{
                  selected.prototypeVersionId
                    ? t('boardPrototype.designLinked')
                    : t('desktop.evidenceDesign')
                }}
              </li>
              <li>{{ t('desktop.evidenceRun') }}</li>
              <li>{{ t('desktop.evidenceDiff') }}</li>
              <li>{{ t('desktop.evidenceChecks') }}</li>
              <li>{{ t('desktop.acceptanceOpen') }}</li>
            </ul></Collapse
          >
          <p>
            {{ t('preview.events') }}：{{
              selected.events
                .map((item) =>
                  item === 'created'
                    ? t('preview.createTask')
                    : item === 'notes_updated'
                      ? t('desktop.boardSaved')
                      : item === 'prototype_linked'
                        ? t('boardPrototype.linked')
                        : item === 'prototype_unlinked'
                          ? t('boardPrototype.unlinked')
                          : item === 'preparation_updated'
                            ? t('desktop.boardPreparationUpdated')
                            : item === 'priority_updated'
                              ? t('desktop.boardPriorityUpdated')
                              : t('desktop.' + item),
                )
                .join(' → ')
            }}
          </p>
        </section>
      </div>
    </Dialog>
    <ConfirmBox
      v-if="discardHandoff"
      :title="t('desktop.taskHandoffDiscard')"
      :confirm-label="t('desktop.boardDiscard')"
      :impact="[t('desktop.taskHandoffDiscardImpact')]"
      @confirm="removeHandoff"
      @cancel="discardHandoff = false"
    />
    <ConfirmBox
      v-if="pendingAction"
      :title="t('desktop.boardUnsaved')"
      :impact="[t('desktop.boardDiscardImpact')]"
      :confirm-label="t('desktop.boardDiscard')"
      @confirm="discardEdits"
      @cancel="pendingAction = null"
    />
  </section>
  <CodePreparationDialog
    v-if="preparingCode && selected"
    :key="selected.id"
    :task="selected"
    @close="preparingCode = false"
    @prepared="open(selected!, $event)"
  />
</template>
<style scoped>
.preview-board {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
  min-height: 100%;
}
header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px 20px;
  align-items: end;
}
header > div {
  min-width: 0;
}
h1 {
  font-size: 24px;
  margin: 4px 0 9px;
}
header p {
  font-size: 12px;
  color: var(--text-mute);
  max-width: 62ch;
  line-height: 1.55;
}
.eyebrow {
  font-size: 10px;
}
.board-tools {
  display: flex;
  align-items: end;
  gap: 12px 16px;
  flex-wrap: wrap;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface-2);
}
.board-tools > span {
  font-size: 11px;
  color: var(--text-mute);
  align-self: center;
}
:deep(.eap-input),
input:not(.eap-input) {
  max-width: 320px;
  width: 100%;
  min-width: 0;
}
.task-moves {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.board-scroll {
  overflow: auto;
  min-width: 0;
  flex: 1;
  -webkit-overflow-scrolling: touch;
}
.board-lanes {
  display: grid;
  grid-template-columns: repeat(5, minmax(180px, 1fr));
  gap: 12px;
  min-height: 310px;
}
.board-lane {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 280px;
}
h2 {
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-weight: 650;
}
h2 small {
  margin-left: auto;
  color: var(--text-mute);
  font-weight: 600;
}
h2 > span {
  width: 8px;
  height: 8px;
  background: var(--text-mute);
  border-radius: 50%;
}
.lane-hint {
  margin: 0;
  font-size: 11px;
  color: var(--text-mute);
  line-height: 1.45;
}
.auto-work {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--accent-soft);
  font-size: 11px;
  color: var(--accent);
}
.auto-work input {
  accent-color: var(--focus-ring);
  width: 14px;
  height: 14px;
  flex: 0 0 14px;
  padding: 0;
}
.board-unattended {
  display: inline-flex;
  margin: 8px 0 0;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--eap-chart-accent-soft);
  color: var(--eap-chart-accent);
  font-size: 11px;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}
h2 > .planned {
  background: var(--text-mute);
}
h2 > .ready {
  background: var(--accent);
}
h2 > .running {
  background: var(--warn);
}
h2 > .acceptance {
  background: var(--eap-chart-accent);
}
h2 > .done {
  background: var(--accent);
}
.board-card {
  display: grid;
  gap: 8px;
}
.card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.board-card .priority {
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 0.02em;
}
.prio-none {
  background: var(--surface-2);
  color: var(--text-mute);
}
.prio-p0 {
  background: var(--danger-bg);
  color: var(--danger);
}
.prio-p1 {
  background: var(--warn-bg);
  color: var(--warn-text);
}
.prio-p2 {
  background: var(--accent-soft);
  color: var(--accent);
}
.card-session {
  font-size: 10px;
  color: var(--text-soft);
  background: var(--surface-2);
  border-radius: 999px;
  padding: 2px 7px;
}
.board-card strong {
  font-weight: 600;
  font-size: 13px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.board-card > span {
  font-size: 10px;
  color: var(--text-mute);
}
.empty-lane {
  text-align: center;
  font-size: 11px;
  color: var(--text-mute);
  margin: auto 0;
  padding: 24px 0;
}
.task-evidence {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  color: var(--text-soft);
  line-height: 1.7;
}
.board-notice {
  font-size: 12px;
  color: var(--text-soft);
  line-height: 1.7;
}
.link-session {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-soft);
}
.link-session input {
  width: 14px;
  height: 14px;
  flex: 0 0 14px;
  padding: 0;
  accent-color: var(--accent);
}
@media (max-width: 760px) {
  header {
    flex-wrap: wrap;
    gap: 10px;
  }
  h1 {
    font-size: 20px;
  }
  .board-lanes {
    grid-template-columns: repeat(5, minmax(148px, 72vw));
    gap: 10px;
    padding-bottom: 4px;
  }
  .board-lane {
    padding: 10px;
  }
  .board-scroll {
    scrollbar-gutter: stable;
  }
}
.new-task-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  min-width: 0;
}
.new-task-form__placement {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.new-task-form__goal-heading {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.new-task-form__goal-heading > label {
  margin-right: auto;
}
.new-task-form__suggestion {
  display: grid;
  gap: 8px;
  min-width: 0;
}
.new-task-form__suggestion p {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.new-task-form pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 220px;
  overflow: auto;
}
.new-task-form label {
  display: grid;
  gap: 6px;
  font-size: 12px;
  color: var(--text-soft);
  min-width: 0;
}
.new-task-form__title {
  grid-column: 1 / -1;
}
.new-task-form .preparation-field {
  flex: unset;
  min-width: 0;
}
.new-task-form :deep(.eap-input),
.new-task-form :deep(.eap-textarea) {
  max-width: none;
  width: 100%;
}
.new-task-form :deep(.eap-textarea) {
  min-height: 96px;
  resize: vertical;
}
.new-task-form .board-notice,
.new-task-form .link-session,
.new-task-form__actions {
  grid-column: 1 / -1;
}
.new-task-form__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}
.board-tools label {
  display: grid;
  gap: 5px;
  font-size: 12px;
  min-width: 0;
  color: var(--text-soft);
}
.board-tools :deep(.eap-select) {
  max-width: min(360px, 100%);
  min-width: 160px;
}
.board-detail {
  display: grid;
  gap: 12px;
  min-width: 0;
}
.board-detail-section {
  display: grid;
  gap: 12px;
  min-width: 0;
}
.board-detail label {
  display: grid;
  gap: 8px;
  font-size: 12px;
  color: var(--text-soft);
}
.board-detail p {
  margin: 0;
  font-size: 12px;
  color: var(--text-soft);
  line-height: 1.7;
  overflow-wrap: anywhere;
}
.board-detail code {
  font:
    11px/1.4 ui-monospace,
    monospace;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--surface-3);
  color: var(--accent);
}
.board-detail :deep(.eap-select) {
  max-width: 220px;
}
.board-detail :deep(.eap-textarea) {
  width: 100%;
  resize: vertical;
  min-height: 88px;
}
.detail-save {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: flex-end;
}
.detail-save span {
  font-size: 12px;
  color: var(--warn-text);
}
.board-evidence {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-2);
}
.board-evidence > :deep(summary) {
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-soft);
}
.new-task-form .board-notice {
  margin: 0;
}
@media (max-width: 760px) {
  .new-task-form__placement {
    grid-template-columns: 1fr;
  }
}
.preparation-missing {
  color: var(--warn-text);
}
.board-conflict {
  padding: 12px;
  border: 1px solid var(--eap-color-warning-border);
  border-radius: 10px;
  background: var(--warn-bg);
}
.board-conflict dl {
  font-size: 12px;
}
.board-conflict dt {
  font-weight: 600;
}
.board-conflict dd {
  margin: 4px 0 10px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.board-conflict :deep(.eap-button) {
  margin: 4px;
}
</style>
