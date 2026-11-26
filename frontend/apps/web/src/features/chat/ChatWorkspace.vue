<script setup lang="ts">
import type { CodePreparationSelection } from '../shell/workbench'
import type { BoardTask } from '@eap/runtime-client'

import { AiToolMode, ChatExecutionStatus } from '@eap/runtime-client'

import { computed, nextTick, onMounted, onUnmounted, ref, watch, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Badge,
  Button,
  ConfirmBox,
  Feedback,
  InfiniteScroll,
  Input,
  Textarea,
  RichText,
  Collapse,
  WorkbenchFrame,
  Drawer,
  Icon,
} from '@eap/ui'
import { errorMessage } from '../../lib/presentation'
import { subscribeRuntimeLiveness } from '../../lib/runtimeLiveness'
import { createChatSession, type ChatTurn } from './chatSession'
import { isDraftSubmitKey } from './draftKeys'
import TurnContextDetails from './TurnContextDetails.vue'
import TaskMemoryPanel from './TaskMemoryPanel.vue'
import ExecutionLogDialog from './ExecutionLogDialog.vue'
import ModelHistoryDialog from './ModelHistoryDialog.vue'
import ChatExportDialog from './ChatExportDialog.vue'
import WorkDocumentDialog from './WorkDocumentDialog.vue'
import TaskPlanDialog from './TaskPlanDialog.vue'
import ChatSessionToolbar from './ChatSessionToolbar.vue'
import ChatSessionNotices from './ChatSessionNotices.vue'
import ChatFailureNotices from './ChatFailureNotices.vue'
import TurnSteps from './TurnSteps.vue'
import MessageVersionSwitch from './MessageVersionSwitch.vue'
import CodeProposalCard from './CodeProposalCard.vue'
import CodePreparationDialog from '../shell/CodePreparationDialog.vue'
import { boardImplementationDraft } from '../shell/boardImplementationDraft'
import ConnectionDialog from '../../components/ConnectionDialog.vue'
import SessionPanel from '../../components/SessionPanel.vue'
import WorkspaceWelcome from '../../components/WorkspaceWelcome.vue'
import { chatService, chatStorage } from './chatService'
import TaskComposer from './TaskComposer.vue'
import { apiStorageScope } from '../../lib/runtimeConfig'
import { readTaskHandoff, writeTaskHandoff } from '../shell/boardTaskHandoff'
import { adoptBoardTaskDraft } from './boardTaskDraft'
import { catalogRefreshNote, type CatalogNote } from './catalogNote'
import { outgoingInstructions } from './outgoing'
import { reasoningForModel, type ReasoningLevel } from './reasoningChoice'
import { useChatFeed } from './useChatFeed'
import { useCodeProposals } from './codeProposals'
import {
  adoptScratch,
  applyScenario,
  assignSessionProject,
  chatBinding,
  currentExtras,
  rememberPanel,
  rememberSessionExecution,
  restorePanel,
  scenarios,
  takeBoardDraft,
  openCandidateDiff,
  workbench,
} from '../shell/workbench'
import {
  applyRuntimeIdentity,
  refreshWorkspaceDirty,
  runtimeIdentity,
} from '../shell/runtimeIdentity'

const { t, locale } = useI18n()
const props = withDefaults(defineProps<{ active?: boolean }>(), {
  active: true,
})
const importingPrototype =
  typeof sessionStorage !== 'undefined' && !!sessionStorage.getItem('eap.chat.prototype')
const api = chatService()
const session = createChatSession(
  api,
  typeof localStorage === 'undefined' ? undefined : chatStorage(localStorage),
)
const feedPort = ref<{ getEl: () => HTMLElement | null } | null>(null)
const feed = useChatFeed({
  feedPort,
  active: () => props.active,
  conversationId: session.conversationId,
  turns: session.turns,
})
const {
  holdingFeed,
  loadingOlder,
  visibleTurns,
  hasOlderTurns,
  showJumpToLatest,
  onFeedScroll,
  jumpToLatest,
  showOlderTurns,
} = feed
const proposals = useCodeProposals({
  api,
  turns: session.turns,
  approval: () => session.context.value.approval,
  t,
})
const { proposalNote } = proposals
watch(
  () => props.active,
  (active) => {
    if (!active) feed.saveCurrent()
    else {
      void session.refreshConnections().catch((error) => {
        historyNote.value = errorMessage(error)
      })
      void session.refreshStatus()
      feed.restoreFeed(session.conversationId.value)
    }
  },
)
// send appends a user/assistant pair and forbids another send while inflight.
// visibleTurns keys retain the absolute transcript index, including after slicing.
const pendingAnswerKey = computed(() => {
  if (!session.sending.value) return null
  const turns = session.turns.value
  const key = turns.length - 1
  return turns[key]?.role === 'assistant' && turns[key - 1]?.role === 'user' ? key : null
})
function turnIsRunning(turn: ChatTurn) {
  return turn.status === ChatExecutionStatus.RUNNING
}
const manageId = ref<string | null>(null)
const manageTitle = ref('')
const deleteId = ref<string | null>(null)
const historyNote = ref('')
const boardNote = ref('')
const adoptingBoardDraft = ref(false)
const answerHandoffPending = ref(false)
function adoptPendingBoardDraft() {
  if (!props.active || session.sending.value || session.opening.value) return
  const pending = takeBoardDraft(true)
  if (!pending) return
  adoptingBoardDraft.value = false
  const adopted = adoptBoardTaskDraft(pending)
  session.beginDraft()
  session.draft.value = adopted.text
  session.context.value = adopted.context
  workbench.executionMode = adopted.executionMode
  session.toolMode.value = AiToolMode.NONE
  workbench.sessionExtras.scratch = {
    projectId: pending.taskRef?.projectId ?? null,
    scenarioId: null,
    experts: [],
    resources: [],
    executionMode: adopted.executionMode,
  }
  boardNote.value = ''
}
watch(
  () => [props.active, workbench.pendingBoardDraft] as const,
  () => {
    const draft = props.active ? workbench.pendingBoardDraft : null
    if (draft) {
      boardNote.value = t('generation.pendingTask')
    }
  },
  { immediate: true },
)
const deleting = ref(false)
const executionLog = ref<{ conversationId: string; executionId: string } | null>(null)
watch(
  () => [session.conversationId.value, props.active],
  () => {
    executionLog.value = null
  },
)
const modelHistoryOpen = ref(false)
const taskPlan = ref<ChatTurn | null>(null)
const preparingTask = ref<BoardTask | null>(null)
function prepareSavedTask(task: BoardTask) {
  preparingTask.value = task
  taskPlan.value = null
}
function adoptPreparedTask(selection: CodePreparationSelection) {
  if (!preparingTask.value) return
  workbench.pendingBoardDraft = boardImplementationDraft(
    preparingTask.value,
    t('desktop.boardCriteria'),
    selection,
  )
  preparingTask.value = null
}

const exportingChat = ref(false)
const documentSource = ref<{ key: string; turn: ChatTurn } | null>(null)
const composerForm = ref<HTMLFormElement | null>(null)

/** Grow the draft box with its content, capped so the feed keeps readable room. */
function growDraft() {
  const field = composerForm.value?.querySelector<HTMLTextAreaElement>('.composer-draft')
  if (!field || !field.offsetParent) return
  const height = field.scrollHeight
  if (!height) return
  field.style.height = 'auto'
  field.style.height = `${Math.min(height, 220)}px`
}

/**
 * Enter sends, Shift+Enter inserts a newline. While an IME candidate window is open
 * Enter confirms the candidate, so a composing keystroke must never submit the draft.
 */
function draftKeydown(event: KeyboardEvent) {
  if (!isDraftSubmitKey(event)) return
  event.preventDefault()
  if (session.draft.value.trim() && !session.sending.value) void sendTask()
}

watch(
  () => session.conversationId.value,
  () => void nextTick(growDraft),
)
function resumeTaskHandoff() {
  workbench.boardHandoffToken++
  window.location.hash = 'board'
}
function taskFromAnswer(turn: ChatTurn) {
  const conversationId = session.conversationId.value
  if (!conversationId || session.sending.value || !turn.text || turn.text.length > 20000) return
  try {
    if (readTaskHandoff(localStorage, apiStorageScope)) {
      boardNote.value = t('desktop.taskHandoffPending')
      answerHandoffPending.value = true
      return
    }
    writeTaskHandoff(
      localStorage,
      apiStorageScope,
      {
        source: { conversationId, executionId: turn.executionId ?? '', text: turn.text },
        draft: {
          projectId: workbench.selectedProjectId ?? '',
          title:
            turn.text
              .split(/\r?\n/)
              .find((line) => line.trim())
              ?.replace(/^#+\s*/, '')
              .slice(0, 200) ?? '',
          goal: turn.text,
          acceptanceCriteria: '',
        },
        linkSource: true,
      },
      null,
    )
    workbench.boardHandoffToken++
    window.location.hash = 'board'
  } catch {
    boardNote.value = t('desktop.taskHandoffStorage')
  }
}
function applyPendingDraft() {
  const seeded = workbench.pendingDraft.trim()
  if (!seeded) return
  if (!session.draft.value.trim()) session.draft.value = seeded
  workbench.pendingDraft = ''
}
function newConversation() {
  historyNote.value = ''
  session.beginDraft()
  // Bind the draft to the currently selected local group (or clear for free chat).
  assignSessionProject(session.conversationId.value || 'scratch', workbench.selectedProjectId)
  applyPendingDraft()
}
watch(
  () => workbench.pendingNewChat,
  (pending) => {
    if (pending && props.active) {
      workbench.pendingNewChat = false
      void newConversation()
    }
  },
)
watch(
  () => [props.active, workbench.pendingDraft] as const,
  () => {
    if (props.active && workbench.pendingDraft.trim() && !session.draft.value.trim())
      applyPendingDraft()
  },
)
watch(
  () => session.conversationId.value,
  (id, previous) => {
    exportingChat.value = false
    taskPlan.value = null
    preparingTask.value = null
    rememberSessionExecution(id)
    restorePanel(id)
    feed.switchConversation(id, previous)
  },
  { immediate: true },
)
/** Right-anchored rails shrink conversation width (摘要 / 变更). */
const railMode = computed(() => {
  const panel = workbench.panel
  return panel === 'summary' || panel === 'changes' ? panel : null
})
/** Sources opens as a floating overlay with an expandable tree — not a full-page enter-dir browser. */
const filesOverlayOpen = computed(() => workbench.panel === 'files')
/** Terminal docks under the conversation and shrinks height — not a right rail. */
const terminalDockOpen = computed(() => workbench.panel === 'terminal')
function choosePanel(id: 'summary' | 'changes' | 'files' | 'terminal') {
  rememberPanel(session.conversationId.value, workbench.panel === id ? null : id)
}
function closePanel() {
  rememberPanel(session.conversationId.value, null)
}
function viewProposalDiff(path: string) {
  openCandidateDiff(session.conversationId.value, path)
  void nextTick(() => {
    document.querySelector<HTMLElement>('[data-testid="changes-rail"]')?.scrollIntoView({
      block: 'nearest',
    })
  })
}
function openFromSummary(target: 'changes' | 'files' | 'terminal' | 'composer' | 'policy') {
  if (target === 'policy') {
    closePanel()
    workbench.policyMenuToken += 1
    return
  }
  if (target === 'composer') {
    closePanel()
    void nextTick(() =>
      document.querySelector<HTMLTextAreaElement>('textarea.composer-draft')?.focus(),
    )
    return
  }
  rememberPanel(session.conversationId.value, target)
}
const archived = computed(
  () => !!session.history.value.find((x) => x.id === session.conversationId.value)?.archived,
)
async function removeConversation() {
  if (!deleteId.value) return
  deleting.value = true
  try {
    await session.deleteConversation(deleteId.value)
    deleteId.value = null
  } catch (error) {
    historyNote.value = errorMessage(error)
  } finally {
    deleting.value = false
  }
}
const modelChoices = computed(() =>
  session.connections.value
    .filter((item) => item.enabled)
    .flatMap((item) =>
      item.models
        .filter((model) => item.allowedModels.includes(model.id))
        .map((model) => ({
          key: JSON.stringify([item.id, model.id]),
          kind: item.kind,
          wireApi:
            item.kind === 'chatgpt-plan' ? 'responses' : (item.wireApi ?? 'chat-completions'),
          connectionId: item.id,
          name: item.name,
          model: model.id,
          efforts: model.reasoningEfforts,
        })),
    ),
)
const modelSelection = computed(() =>
  JSON.stringify([
    session.pendingConnectionId.value || session.boundConnectionId.value,
    session.pendingConnectionId.value ? session.pendingModel.value : session.boundModel.value,
  ]),
)
const selectedModel = computed(() =>
  modelChoices.value.find(
    (item) =>
      item.connectionId ===
        (session.pendingConnectionId.value || session.boundConnectionId.value) &&
      item.model ===
        (session.pendingConnectionId.value ? session.pendingModel.value : session.boundModel.value),
  ),
)
const agentReady = computed(
  () =>
    session.context.value.mode === 'code' &&
    !!session.context.value.taskRef &&
    !!session.context.value.targetPath.trim() &&
    !!selectedModel.value &&
    selectedModel.value.kind !== 'chatgpt-plan',
)
const reasoningEfforts = computed(() => selectedModel.value?.efforts ?? [])
const boundEfforts = computed(
  () =>
    modelChoices.value.find(
      (item) =>
        item.connectionId === session.boundConnectionId.value &&
        item.model === session.boundModel.value,
    )?.efforts ?? [],
)
const effortReset = ref<'' | ReasoningLevel>('')
watch(boundEfforts, (values) => {
  const next = reasoningForModel(session.context.value.reasoning, values)
  if (!next.reset) return
  session.context.value.reasoning = next.reasoning
  effortReset.value = next.reset
})
watch(
  () => session.context.value.reasoning,
  (value) => {
    if (value !== 'default') effortReset.value = ''
  },
)
function chooseModel(key: string) {
  const target = modelChoices.value.find((item) => item.key === key)
  if (target) session.chooseConversationConnection(target.connectionId, target.model)
}
const catalogNote = ref<CatalogNote | null>(null)
const modelsRefreshing = ref(false)
async function refreshModels() {
  if (modelsRefreshing.value) return
  modelsRefreshing.value = true
  const id = session.pendingConnectionId.value || session.boundConnectionId.value
  try {
    const refreshed = id ? await api.refreshConnectionModels(id) : null
    await session.refreshConnections()
    const current = session.connections.value.find((item) => item.id === id) ?? refreshed
    if (id === (session.pendingConnectionId.value || session.boundConnectionId.value))
      catalogNote.value = catalogRefreshNote({
        discoveryError: current?.discoveryError,
        discoveredAt: current?.discoveredAt,
      })
  } catch (error) {
    try {
      await session.refreshConnections()
    } catch {
      /* the list already on screen stays */
    }
    const current = id ? session.connections.value.find((item) => item.id === id) : undefined
    if (id === (session.pendingConnectionId.value || session.boundConnectionId.value))
      catalogNote.value = catalogRefreshNote({
        discoveryError: current?.discoveryError,
        discoveredAt: current?.discoveredAt,
        requestError: errorMessage(error),
      })
  } finally {
    modelsRefreshing.value = false
  }
}
watchEffect(() => {
  applyRuntimeIdentity(session.status.value)
  void refreshWorkspaceDirty(runtimeIdentity.value)
})
watchEffect(() => {
  const proposal = [...session.turns.value].reverse().find((turn) => turn.proposal)?.proposal
  const activeId = session.conversationId.value
  const extras = workbench.sessionExtras[activeId ?? 'scratch']
  chatBinding.value = {
    history: session.history.value.map((item) => ({
      id: item.id,
      title: item.title,
      archived: item.archived,
      updatedAt: item.updatedAt,
      // Real local flags drive the sidebar status chip; no invented states.
      draft: item.draft,
      expired: item.expired,
    })),
    activeId,
    busyIds: Object.keys(session.inflight.value).filter((id) => session.inflight.value[id] != null),
    rename: (id: string) => {
      const item = session.history.value.find((row) => row.id === id)
      manageId.value = id
      manageTitle.value = item?.title?.trim() || t('desktop.freeChat')
    },
    archive: (id: string) => {
      const item = session.history.value.find((row) => row.id === id)
      if (item) session.archiveConversation(id, !item.archived)
    },
    remove: (id: string) => {
      deleteId.value = id
      historyNote.value = ''
    },
    references: [
      ...session.context.value.files.map((file) => file.name),
      ...(session.context.value.prototypeVersionId
        ? [session.context.value.prototypeVersionId]
        : []),
    ],
    localFiles: session.context.value.files.map((file) => file.name),
    versionId: session.context.value.prototypeVersionId,
    draft: session.draft.value,
    sending: session.sending.value,
    workspaceLabel: session.workspaceLabel.value
      ? session.workspaceLabel.value
      : session.status.value?.workspaceLabel || session.workspaceLabel.value,
    memory: session.memoryNote.value,
    model: session.pendingModel.value || session.boundModel.value,
    connectionName: selectedModel.value?.name ?? '',
    approval: session.context.value.approval,
    goal: session.context.value.mode,
    executionMode: extras?.executionMode ?? workbench.executionMode,
    scenarioId: extras?.scenarioId ?? null,
    proposalFiles: proposal?.files.map((file) => file.path) ?? [],
    appliedFiles: proposal ? (proposals.applied.value[proposal.id] ?? []) : [],
    proposal,
    writeRefused: proposal ? !!proposals.refused.value[proposal.id] : false,
    verification:
      (proposal && proposals.appliedVerification.value[proposal.id]) ||
      proposal?.verification ||
      'not_requested',
    verificationChecks: proposal ? (proposals.appliedChecks.value[proposal.id] ?? []) : [],
    select: (id: string) => {
      void session.selectConversation(id)
    },
    create: () => {
      void newConversation()
    },
  }
})
function flushHiddenHistory() {
  if (document.visibilityState === 'hidden') session.flushPersistence()
}

let stopRuntimeLiveness: (() => void) | undefined
onUnmounted(() => {
  stopRuntimeLiveness?.()
  session.flushPersistence()
  window.removeEventListener('pagehide', session.flushPersistence)
  document.removeEventListener('visibilitychange', flushHiddenHistory)
  if (chatBinding.value?.activeId === session.conversationId.value) chatBinding.value = null
})
function useScene(id: string) {
  // Re-clicking the selected scene clears it (frame-064 chip remove parity).
  if (currentExtras().scenarioId === id) {
    currentExtras().scenarioId = null
    return
  }
  if (scenarios.find((scene) => scene.id === id)?.workflow === 'prototype-to-code') {
    workbench.selectedScenario = id
    window.location.hash = 'scenes'
    return
  }
  applyScenario(id)
}
watch(
  () => workbench.workMode,
  (mode) => {
    const id = currentExtras().scenarioId
    if (!id) return
    const scene = scenarios.find((item) => item.id === id)
    if (!scene || !scene.modes.includes(mode) || scene.status === 'disabled')
      currentExtras().scenarioId = null
  },
)
const outgoingText = computed(() => {
  const extras = currentExtras()
  return outgoingInstructions({
    instructions: session.context.value.instructions,
    scene: scenarios.find((item) => item.id === extras.scenarioId)?.instructions || '',
    guidance: extras.experts.map((item) => item.guidance).join('\n'),
    plan: workbench.executionMode === 'plan',
  })
})
/** Node id of a user question being edited; sending then creates a versioned sibling branch. */
const editingNodeId = ref<string | null>(null)

async function changeMessageVersion(turn: ChatTurn, direction: number) {
  if (!turn.nodeId) return
  const versions = session.messageVersions(turn.nodeId)
  const target = versions[versions.findIndex((node) => node.id === turn.nodeId) + direction]
  if (target) {
    editingNodeId.value = null
    await session.selectMessageVersion(target.id)
  }
}

function editQuestion(turn: ChatTurn) {
  if (!turn.nodeId || session.sending.value) return
  editingNodeId.value = turn.nodeId
  session.draft.value = turn.text
  nextTick(() => {
    const input = document.querySelector<HTMLTextAreaElement>('[data-testid="chat-input"]')
    input?.focus()
  })
}

function cancelEdit() {
  editingNodeId.value = null
}

async function regenerateAnswer(index: number) {
  if (session.sending.value) return
  const turns = session.turns.value
  const answer = turns[index]
  const question = index > 0 ? turns[index - 1] : null
  if (
    !answer ||
    answer.role !== 'assistant' ||
    !question ||
    question.role !== 'user' ||
    !question.nodeId
  )
    return
  await session.sendRegenerate(question.nodeId)
}

async function sendTask() {
  if (session.graphLoading.value || session.graphError.value || session.browsingHistory.value)
    return
  if (workbench.executionMode === 'agent' && !agentReady.value) return
  const editing = editingNodeId.value
  const extras = currentExtras()
  const guidance = extras.experts.map((item) => item.guidance).join('\n')
  const sceneInstructions =
    scenarios.find((item) => item.id === extras.scenarioId)?.instructions || ''
  const requestContext = {
    ...session.context.value,
    files: session.context.value.files.map((file) => ({ ...file })),
  }
  if (workbench.executionMode === 'plan') requestContext.mode = 'plan'
  requestContext.instructions = outgoingInstructions({
    instructions: requestContext.instructions,
    scene: sceneInstructions,
    guidance,
    plan: workbench.executionMode === 'plan',
  })
  const before = session.conversationId.value
  try {
    if (editing) {
      const ok = await session.sendEdit(editing)
      if (ok) editingNodeId.value = null
    } else {
      await session.send(
        requestContext,
        workbench.executionMode === 'agent' ? AiToolMode.CODE_SOURCES : undefined,
      )
    }
  } finally {
    if (!before && session.conversationId.value) {
      adoptScratch(session.conversationId.value)
      assignSessionProject(session.conversationId.value, workbench.selectedProjectId)
    }
  }
}

onMounted(async () => {
  window.addEventListener('pagehide', session.flushPersistence)
  document.addEventListener('visibilitychange', flushHiddenHistory)
  stopRuntimeLiveness = subscribeRuntimeLiveness((event) => {
    if (event.lost) session.markUnreachable()
    if (event.recovered) {
      void session.refreshStatus()
      void session.refreshConnections().catch(() => {
        /* the list already on screen stays until the next recovery */
      })
    }
  })
  await Promise.all([
    session.refreshStatus(),
    session.refreshConnections().catch((error) => {
      historyNote.value = errorMessage(error)
    }),
    importingPrototype ? Promise.resolve() : session.restoreLastConversation(),
  ])
})
</script>

<template>
  <section
    class="view work-page chat-workspace preview-workspace live-workspace"
    data-testid="chat-workspace"
  >
    <div class="page-head chat-page-head live-utilities">
      <ChatSessionToolbar
        :phase="session.phase.value"
        :status="session.status.value"
        :expired="session.expired.value"
        :archived="archived"
        :memory-note="session.memoryNote.value"
        :conversation-id="session.conversationId.value"
        :sending="session.sending.value"
        :has-turns="session.turns.value.length > 0"
        @panel="choosePanel"
        @export="exportingChat = true"
        @model-context="modelHistoryOpen = true"
      />
      <ExecutionLogDialog
        v-if="executionLog"
        :conversation-id="executionLog.conversationId"
        :execution-id="executionLog.executionId"
        @close="executionLog = null"
      />
      <ModelHistoryDialog
        v-if="modelHistoryOpen && session.conversationId.value"
        :conversation-id="session.conversationId.value"
        @adopt="
          (text) => {
            session.draft.value = [session.draft.value, text].filter(Boolean).join('\n\n')
          }
        "
        @close="modelHistoryOpen = false"
      />
      <Collapse
        v-if="session.conversationId.value"
        :key="session.conversationId.value"
        data-testid="task-memory-details"
      >
        <template #summary>
          {{ t('workingMemory.title') }}
          <Badge v-if="session.workingMemory.value?.invalidation" tone="warning">{{
            t('workingMemory.invalidation')
          }}</Badge>
        </template>
        <TaskMemoryPanel
          :memory="session.workingMemory.value"
          :busy="session.sending.value"
          :save="session.saveWorkingMemory"
          @refresh="session.recheckConversation"
          @adopt="
            (text) => {
              session.draft.value = [session.draft.value, text].filter(Boolean).join('\n\n')
            }
          "
        />
      </Collapse>
      <ChatExportDialog
        v-if="exportingChat && session.conversationId.value"
        :key="session.conversationId.value"
        :conversation-id="session.conversationId.value"
        :title="
          session.history.value.find((item) => item.id === session.conversationId.value)?.title ??
          'EAP'
        "
        :turns="session.turns.value"
        @close="exportingChat = false"
      />
    </div>

    <TaskPlanDialog
      v-if="taskPlan?.planningTask"
      :binding="taskPlan.planningTask"
      :text="taskPlan.text"
      @close="taskPlan = null"
      @prepare="prepareSavedTask"
    />
    <CodePreparationDialog
      v-if="preparingTask"
      :task="preparingTask"
      @close="preparingTask = null"
      @prepared="adoptPreparedTask"
    />
    <WorkDocumentDialog
      v-if="documentSource && session.conversationId.value"
      :key="session.conversationId.value + documentSource.key"
      :conversation-id="session.conversationId.value"
      :source-key="documentSource.key"
      :turn="documentSource.turn"
      @close="documentSource = null"
    />
    <WorkbenchFrame
      :rail="!!railMode"
      class="chat-body"
      :class="{
        'has-rail': !!railMode,
        'has-terminal-dock': terminalDockOpen,
      }"
      data-testid="chat-body"
    >
      <div class="chat-main" data-testid="chat-main">
        <InfiniteScroll
          ref="feedPort"
          class="chat-feed preview-feed"
          data-testid="chat-feed"
          edge="start"
          :disabled="!hasOlderTurns || loadingOlder || holdingFeed"
          @scroll="onFeedScroll"
          @load="showOlderTurns"
        >
          <ChatSessionNotices
            :session="session"
            :active="props.active"
            :archived="archived"
            :history-note="historyNote"
            :hide-history-note="!!deleteId"
            :retry-send="sendTask"
          >
            <p v-if="boardNote" class="hint" role="status" data-testid="board-draft-note">
              {{ boardNote }}
            </p>
            <Button
              v-if="answerHandoffPending"
              size="sm"
              data-testid="answer-task-resume"
              @click="resumeTaskHandoff"
              >{{ t('desktop.taskHandoffResume') }}</Button
            >
            <Button
              v-if="workbench.pendingBoardDraft"
              data-testid="adopt-board-draft"
              :disabled="session.sending.value || session.opening.value"
              @click="adoptingBoardDraft = true"
              >{{ t('generation.adoptTask') }}</Button
            >
            <ConfirmBox
              v-if="adoptingBoardDraft && workbench.pendingBoardDraft"
              :title="t('generation.adoptTask')"
              :impact="[workbench.pendingBoardDraft.title, t('generation.adoptTaskImpact')]"
              :confirm-label="t('generation.adoptTask')"
              @confirm="adoptPendingBoardDraft"
              @cancel="adoptingBoardDraft = false"
            />
          </ChatSessionNotices>

          <WorkspaceWelcome
            v-if="!session.turns.value.length || workbench.workMode === 'work'"
            :compact="session.turns.value.length > 0"
            @scenario="useScene"
          />
          <Feedback v-if="editingNodeId" tone="info" data-testid="editing-branch-hint">
            {{ t('chat.editingHint') }}
            <Button size="sm" variant="ghost" data-testid="cancel-edit" @click="cancelEdit">{{
              t('chat.cancelEdit')
            }}</Button>
          </Feedback>
          <ol v-if="visibleTurns.length" class="chat-log">
            <li
              v-for="{ turn, key } in visibleTurns"
              :key="key"
              :aria-label="turn.role === 'user' ? t('chat.speakerYou') : t('chat.speakerModel')"
              :class="turn.role === 'user' ? 'turn-user' : 'turn-assistant'"
            >
              <template v-if="turn.role === 'assistant'">
                <div class="turn-node" data-testid="assistant-turn-node">
                  <TurnSteps :turn="turn" :live="key === pendingAnswerKey" />
                  <div class="turn-body" data-testid="turn-body">
                    <RichText
                      v-if="turn.text"
                      class="turn-answer"
                      :source="turn.text"
                      :copy-label="t('chat.copyCode')"
                      :copied-label="t('chat.copiedCode')"
                      :streaming-label="turnIsRunning(turn) ? t('chat.streamingAnswer') : ''"
                    />
                    <p v-else>
                      {{
                        t(
                          key === pendingAnswerKey && turnIsRunning(turn)
                            ? 'chat.waitingForAnswer'
                            : 'chat.noAnswer',
                        )
                      }}
                    </p>
                    <MessageVersionSwitch
                      v-if="turn.nodeId"
                      :versions="session.messageVersions(turn.nodeId)"
                      :current="turn.nodeId"
                      :disabled="session.sending.value || session.graphLoading.value"
                      @change="changeMessageVersion(turn, $event)"
                    />
                    <p v-if="turn.error">
                      {{
                        turn.errorLanguage === locale && turn.errorMessage
                          ? turn.errorMessage
                          : t('presentation.failure')
                      }}
                      <code>{{ turn.error }}</code>
                    </p>
                    <p v-if="turn.artifactError">
                      {{ t('chat.artifactFailed') }}：{{ turn.artifactError }}
                    </p>
                  </div>
                  <div
                    v-if="
                      (turn.text && !session.sending.value) ||
                      (turn.executionId && session.conversationId.value)
                    "
                    class="turn-actions"
                    role="toolbar"
                    :aria-label="t('chat.turnActions')"
                    data-testid="turn-actions"
                  >
                    <Button
                      v-if="workbench.workMode === 'work' && turn.text && !session.sending.value"
                      size="sm"
                      data-testid="work-document-open"
                      @click="documentSource = { key: String(key), turn }"
                      >{{ t('desktop.workDocumentTitle') }}</Button
                    >
                    <Button
                      v-if="turn.text && !turn.error && !session.sending.value"
                      size="sm"
                      data-testid="answer-create-task"
                      @click="taskFromAnswer(turn)"
                      >{{ t('desktop.taskFromAnswer') }}</Button
                    >
                    <Button
                      v-if="turn.planningTask && turn.text && !turn.error && !session.sending.value"
                      size="sm"
                      data-testid="task-plan-open"
                      @click="taskPlan = turn"
                      >{{ t('desktop.taskPlanTitle') }}</Button
                    >
                    <Button
                      v-if="turn.text && !session.sending.value"
                      size="sm"
                      variant="ghost"
                      data-testid="answer-regenerate"
                      @click="regenerateAnswer(key)"
                      >{{ t('chat.regenerate') }}</Button
                    >
                    <Button
                      v-if="turn.executionId && session.conversationId.value"
                      size="sm"
                      variant="ghost"
                      data-testid="open-execution-log"
                      @click="
                        executionLog = {
                          conversationId: session.conversationId.value!,
                          executionId: turn.executionId!,
                        }
                      "
                      >{{ t('executionLog.title') }}</Button
                    >
                  </div>
                  <CodeProposalCard
                    v-if="turn.proposal"
                    :proposal="turn.proposal"
                    :execution-id="turn.executionId"
                    :proposals="proposals"
                    :approval="session.context.value.approval"
                    :locked="session.expired.value || archived"
                    @view-diff="viewProposalDiff"
                  />
                  <TurnContextDetails :budget="turn.contextBudget" :artifacts="turn.artifacts" />
                  <Feedback
                    v-if="
                      turn.knowledgeMemoryCleared &&
                      !turn.contextMemoryCleared &&
                      !session.contextMemoryCleared.value
                    "
                    tone="info"
                    >{{ t('knowledgeContext.cleared') }}</Feedback
                  >
                </div>
              </template>
              <template v-else>
                <p v-if="turn.text" class="turn-text">{{ turn.text }}</p>
                <MessageVersionSwitch
                  v-if="turn.nodeId"
                  :versions="session.messageVersions(turn.nodeId)"
                  :current="turn.nodeId"
                  :disabled="session.sending.value || session.graphLoading.value"
                  @change="changeMessageVersion(turn, $event)"
                />
                <Button
                  v-if="turn.nodeId && !session.sending.value && !session.browsingHistory.value"
                  size="sm"
                  variant="ghost"
                  data-testid="question-edit"
                  @click="editQuestion(turn)"
                  >{{ t('chat.editQuestion') }}</Button
                >
              </template>
            </li>
          </ol>

          <ChatFailureNotices
            :session="session"
            :has-model="!!selectedModel"
            :agent-blocked="workbench.executionMode === 'agent' && !agentReady"
            @send="sendTask"
          />
          <Feedback v-if="proposalNote" tone="info">{{ proposalNote }}</Feedback>
          <p v-if="effortReset" class="hint" data-testid="effort-reset">
            {{ t('desktop.effortReset', { effort: t('task.' + effortReset) }) }}
          </p>
        </InfiniteScroll>
        <div class="jump-latest-anchor">
          <Button
            v-if="showJumpToLatest"
            class="jump-latest"
            variant="secondary"
            size="sm"
            data-testid="jump-latest"
            @click="jumpToLatest"
            >{{ t('chat.jumpLatest') }}</Button
          >
        </div>
        <form
          ref="composerForm"
          class="chat-composer preview-composer preview-input-box"
          data-testid="chat-composer"
          @submit.prevent="sendTask"
        >
          <TaskComposer
            :draft="session.draft.value"
            :tool-mode="
              workbench.executionMode === 'plan' ? AiToolMode.NONE : session.toolMode.value
            "
            :active="props.active"
            :refreshing-models="modelsRefreshing"
            :model-options-available="modelChoices.length > 0"
            :agent-available="agentReady"
            :model-label="selectedModel ? selectedModel.model : ''"
            :context="session.context.value"
            :disabled="
              session.sending.value ||
              session.opening.value ||
              session.reconnecting.value ||
              archived
            "
            :reasoning-efforts="reasoningEfforts"
            @update="session.context.value = $event"
            @refresh="refreshModels"
          >
            <template #draft>
              <label>
                <span class="sr-only">{{ t('chat.draft') }}</span>
                <Textarea
                  v-model="session.draft.value"
                  class="composer-draft"
                  :placeholder="
                    t(
                      workbench.workMode === 'work'
                        ? 'chat.draftWork'
                        : workbench.workMode === 'code'
                          ? 'chat.draftCode'
                          : 'chat.draft',
                    )
                  "
                  rows="2"
                  @keydown="draftKeydown"
                  @input="growDraft"
                  :disabled="
                    session.sending.value ||
                    session.opening.value ||
                    session.reconnecting.value ||
                    archived
                  "
                />
              </label>
              <Collapse class="outgoing-preview" data-testid="outgoing-preview">
                <template #summary>{{ t('desktop.outgoing') }}</template>
                <p>{{ t('desktop.outgoingIdle') }}</p>
                <p>
                  {{ t('desktop.outgoingDraft') }}：{{
                    session.draft.value.trim() || t('desktop.stepNoDraft')
                  }}
                </p>
                <p>{{ t('desktop.outgoingGuide') }}</p>
                <pre>{{ outgoingText || t('desktop.outgoingNone') }}</pre>
                <p v-if="workbench.executionMode === 'plan'">{{ t('desktop.outgoingPlan') }}</p>
                <ul v-if="session.context.value.files.length">
                  <li v-for="file in session.context.value.files" :key="file.name">
                    {{ file.name }}
                  </li>
                </ul>
                <p v-else>{{ t('desktop.outgoingNoFiles') }}</p>
              </Collapse>
            </template>
            <template #settings
              ><p
                v-if="catalogNote?.kind === 'cached'"
                class="catalog-fail"
                data-testid="catalog-cache"
              >
                {{
                  t('desktop.catalogCached', {
                    time: catalogNote.time || t('desktop.catalogNoTime'),
                    error: catalogNote.error,
                  })
                }}
              </p>
              <p v-else-if="catalogNote?.kind === 'fresh'" class="hint" data-testid="catalog-fresh">
                {{
                  t('desktop.catalogFresh', {
                    time: catalogNote.time || t('desktop.catalogNoTime'),
                  })
                }}
              </p>
              <p v-if="selectedModel?.wireApi === 'responses'" class="hint">
                {{ t('modelUi.protocolToolsUnavailable') }}
              </p></template
            >
            <template #tools>
              <div
                v-if="session.conversationId.value"
                class="chat-tool-settings"
                data-testid="chat-tool-settings"
              >
                <p class="hint">{{ t('chat.gitWarning') }}</p>
                <Button
                  variant="secondary"
                  type="button"
                  :aria-pressed="session.toolMode.value === AiToolMode.NONE"
                  @click="session.toolMode.value = AiToolMode.NONE"
                  >{{ t('chat.toolNone') }}</Button
                >
                <Button
                  variant="secondary"
                  type="button"
                  :disabled="
                    workbench.executionMode === 'plan' ||
                    !session.status.value?.tools.git_status ||
                    selectedModel?.wireApi === 'responses'
                  "
                  :aria-pressed="session.toolMode.value === AiToolMode.GIT_STATUS"
                  @click="session.toolMode.value = AiToolMode.GIT_STATUS"
                  >{{ t('chat.toolGit') }}</Button
                >
              </div>
            </template>
            <template #model>
              <p
                v-if="session.conversationId.value && modelChoices.length"
                class="hint"
                data-testid="model-switch-notice"
              >
                {{ t('modelUi.switchAhead') }}
              </p>
              <p v-if="!modelChoices.length" class="hint" data-testid="model-empty">
                {{ t('desktop.modelEmptyHelp') }}
              </p>
              <Button
                variant="navigation"
                v-for="item in modelChoices"
                :key="item.key"
                type="button"
                class="menu-choice"
                :aria-pressed="item.key === modelSelection"
                @click="chooseModel(item.key)"
                >{{ item.name }} · {{ item.model }}</Button
              >
              <small v-if="selectedModel?.kind === 'chatgpt-plan'">{{
                t('authUi.planUsage')
              }}</small>
            </template>
            <template v-if="!selectedModel" #status>
              <p class="hint" data-testid="send-needs-model">
                {{ t('desktop.sendNeedsModel') }}
                <a
                  data-testid="send-open-settings"
                  href="#model-settings"
                  :title="t('desktop.locateSettingsNote')"
                  >{{ t('desktop.locateSettings') }}</a
                >
              </p>
            </template>
            <template #send>
              <Button
                v-if="session.sending.value"
                class="composer-send"
                variant="secondary"
                type="button"
                data-testid="cancel-message"
                :aria-label="t('chat.cancel')"
                :title="t('chat.cancel')"
                @click="session.cancelSend()"
              >
                <Icon name="x" class="composer-send-arrow" :size="18" />
                <span class="sr-only">{{ t('chat.cancel') }}</span>
              </Button>
              <Button
                v-else
                class="composer-send"
                variant="primary"
                type="submit"
                data-testid="send-message"
                :aria-label="t('chat.send')"
                :title="t('chat.send')"
                :disabled="
                  (workbench.executionMode === 'agent' && !agentReady) ||
                  session.expired.value ||
                  archived ||
                  session.reconnecting.value ||
                  session.changingConnection.value ||
                  session.checkingConversation.value ||
                  session.sessionUnavailable.value ||
                  session.graphLoading.value ||
                  session.graphError.value ||
                  session.browsingHistory.value ||
                  session.opening.value ||
                  !session.draft.value.trim() ||
                  (!!session.pendingConnectionId.value && !!session.conversationId.value) ||
                  !selectedModel
                "
              >
                <Icon name="arrow-up" class="composer-send-arrow" :size="18" />
                <span class="sr-only">{{ t('chat.send') }}</span>
              </Button>
            </template>
          </TaskComposer>
          <Feedback
            v-if="
              session.pendingConnectionId.value &&
              session.conversationId.value &&
              !session.expired.value
            "
            tone="warning"
          >
            {{ t('chat.targetPrompt', { target: session.targetNotice.value }) }}
            {{ t('modelUi.clearNotice') }}
            <Button
              type="button"
              variant="secondary"
              @click="session.confirmConnectionChange()"
              :disabled="session.changingConnection.value"
              >{{ t('chat.confirmTarget') }}</Button
            >
            <Button
              type="button"
              variant="secondary"
              :disabled="session.changingConnection.value"
              @click="session.cancelConnectionChange()"
              >{{ t('chat.cancelTarget') }}</Button
            >
          </Feedback>
        </form>
        <SessionPanel
          v-if="terminalDockOpen"
          class="terminal-dock"
          mode="terminal"
          data-testid="terminal-dock"
          @close="closePanel"
          @open="openFromSummary"
        />
      </div>
      <SessionPanel
        v-if="railMode"
        class="session-rail eap-scrollbar"
        :mode="railMode"
        :data-testid="railMode === 'summary' ? 'summary-rail' : 'changes-rail'"
        @close="closePanel"
        @open="openFromSummary"
      />
      <Drawer
        v-if="filesOverlayOpen"
        :title="t('desktop.sources')"
        :close-label="t('desktop.panelClose')"
        :show-header="false"
        data-testid="files-overlay-root"
        @close="closePanel"
      >
        <SessionPanel
          mode="files"
          data-testid="files-overlay"
          @close="closePanel"
          @open="openFromSummary"
        />
      </Drawer>
    </WorkbenchFrame>
    <ConnectionDialog
      v-if="manageId"
      :title="t('historyUi.rename')"
      :busy="false"
      @close="manageId = null"
      ><form
        class="history-dialog-form"
        @submit.prevent="
          () => {
            session.renameConversation(manageId!, manageTitle)
            manageId = null
          }
        "
      >
        <h2>{{ t('historyUi.rename') }}</h2>
        <Input
          v-model="manageTitle"
          required
          maxlength="100"
          :aria-label="t('historyUi.rename')"
        /><Button type="submit">{{ t('historyUi.save') }}</Button>
      </form></ConnectionDialog
    >
    <ConnectionDialog
      v-if="deleteId"
      :title="t('historyUi.delete')"
      :busy="deleting"
      @close="deleteId = null"
      ><div class="history-dialog-form">
        <h2>{{ t('historyUi.delete') }}</h2>
        <p>{{ t('historyUi.deleteNotice') }}</p>
        <Feedback v-if="historyNote" tone="warning">{{ historyNote }}</Feedback
        ><Button type="button" :disabled="deleting" @click="removeConversation">{{
          t('historyUi.delete')
        }}</Button
        ><Button type="button" variant="secondary" :disabled="deleting" @click="deleteId = null">{{
          t('composerUi.close')
        }}</Button>
      </div></ConnectionDialog
    >
  </section>
</template>

<style scoped>
.chat-connections {
  padding: 14px 18px;
  margin-bottom: 18px;
  border: 1px solid var(--border);
  border-radius: 12px;
}

.chat-connections > :deep(summary) {
  font-weight: 600;
  cursor: pointer;
}

.chat-log {
  display: grid;
  gap: 18px;
  max-width: 1100px;
  padding: 0;
  list-style: none;
}

.chat-log > li {
  padding: 18px 22px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 16px;
}

.chat-log > li > p {
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.chat-log > li:has(> strong:first-child) {
  min-width: 0;
}

.chat-composer {
  display: grid;
  gap: 14px;
}

.chat-composer textarea {
  display: block;
  width: 100%;
  padding: 14px;
  resize: vertical;
  border: 1px solid var(--border-strong);
  border-radius: 12px;
}
</style>

<style src="../../workspace.css"></style>
<style scoped>
.live-workspace {
  padding: 0;
  background: transparent;
}

.live-utilities {
  display: flex;
  flex-shrink: 0;
  flex-direction: column;
  gap: 0;
  align-items: stretch;
  min-width: 0;
  padding: 4px 24px 6px;
  margin: 0;
  border-bottom: 1px solid var(--border);
}

@media (width <= 760px) {
  .live-utilities {
    gap: 8px;
    padding: 8px 12px 10px;
  }
}

.chat-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.session-rail {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  background: var(--surface);
  border-left: 1px solid var(--border);
}

.terminal-dock {
  flex: 0 0 auto;
  min-height: 140px;
  max-height: min(280px, 36vh);
  overflow: hidden;
  background: var(--eap-code-bg);
  border-top: 1px solid var(--border);
}

@media (width <= 1000px) {
  .session-rail {
    position: fixed;
    top: 56px;
    right: 12px;
    bottom: 12px;
    z-index: 30;
    width: min(340px, calc(100vw - 24px));
    border: 1px solid var(--border);
    border-radius: 16px;
    box-shadow: 0 12px 36px color-mix(in srgb, var(--text) 16%, transparent);
  }
}

.outgoing-preview {
  margin: 4px 0 2px;
  font-size: 12px;
  color: var(--text-soft);
}

.outgoing-preview > :deep(summary) {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  width: auto;
  padding: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--accent);
  list-style: none;
}

.outgoing-preview > :deep(summary)::-webkit-details-marker {
  display: none;
}

.outgoing-preview > :deep(summary)::marker {
  content: none;
}

.outgoing-preview > :deep(summary)::before {
  font-size: 10px;
  color: var(--text-mute);
  content: '▸';
}

.outgoing-preview[open] {
  max-height: min(180px, 18vh);
  padding: 8px 10px;
  overflow: auto;
  overscroll-behavior: contain;
  background: var(--surface-2);
  border-radius: 10px;
}

.outgoing-preview[open] > :deep(summary)::before {
  content: '▾';
}

.outgoing-preview p,
.outgoing-preview ul {
  margin: 4px 0;
}

.outgoing-preview pre {
  max-height: 9em;
  margin: 6px 0;
  overflow: auto;
  font: inherit;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.chat-feed {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.chat-feed > .hint {
  margin: 4px 0;
  font-size: 11px;
  color: var(--text-soft);
}

.catalog-fail {
  padding: 8px 10px;
  margin: 6px 0 0;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.45;
  color: var(--danger);
  background: var(--danger-bg);
  border: 1px solid var(--danger-border);
  border-radius: 8px;
}

.chat-composer {
  display: block;
  flex: 0 0 auto;
  gap: 0;
  max-block-size: min(34dvh, 280px);
  overflow: auto;
  scrollbar-gutter: stable;
  overscroll-behavior: contain;
}

.chat-composer:has(textarea.composer-draft:disabled) textarea,
.chat-composer:has(textarea.composer-draft:disabled) :deep(.context-toolbar) {
  opacity: 0.5;
}

.chat-composer textarea {
  min-block-size: 2.75rem;
  padding: 4px 2px;
  font-size: 14px;
  resize: vertical;
  background: transparent;
  border: 0;
}

.chat-composer textarea.composer-draft:focus {
  outline: none;
  border: 0;
  box-shadow: none;
}

.chat-log {
  gap: 24px;
  max-width: none;
}

.turn-node {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.turn-body {
  min-width: 0;
  padding: 14px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
}

.turn-body .turn-answer {
  font-size: 14px;
  line-height: 1.8;
  color: var(--text);
}

.turn-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.chat-log > li.turn-user,
.chat-log > li.turn-assistant {
  min-width: 0;
}

.chat-log > li > strong {
  font-size: 11px;
  color: var(--text-soft);
}

.chat-log > li > p,
.chat-log > li .turn-text {
  font-size: 14px;
  line-height: 1.9;
}

/* Answers carry tables and code: they need the column, not intrinsic text width.
   User drafts keep content sizing and stay right-aligned. */
.chat-log > li.turn-assistant {
  justify-self: stretch;
  width: 100%;
  padding: 0;
  background: transparent;
  border: 0;
}

.jump-latest-anchor {
  position: relative;
  z-index: 2;
  height: 0;
}

.jump-latest {
  position: absolute;
  bottom: 10px;
  left: 50%;
  box-shadow: var(--eap-box-shadow-overlay);
  transform: translateX(-50%);
}

.turn-meta {
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-soft);
}
</style>
