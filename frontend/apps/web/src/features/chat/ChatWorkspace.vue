<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  DropdownMenu,
  Badge,
  Button,
  Checkbox,
  ConfirmBox,
  Feedback,
  InfiniteScroll,
  Input,
  Textarea,
  Collapse,
  WorkbenchFrame,
  Drawer,
} from '@eap/ui'
import { type AiConnectionState } from '@eap/runtime-client'
import { IconEllipsis, Icon } from '@eap/ui'
import { errorMessage } from '../../lib/presentation'
import { createChatSession } from './chatSession'
import { includedSourceSummary } from './contextBudgetView'
import ConnectionDialog from '../../components/ConnectionDialog.vue'
import SessionPanel from '../../components/SessionPanel.vue'
import WorkspaceFileTreeRail from '../../components/WorkspaceFileTreeRail.vue'
import WorkspaceWelcome from '../../components/WorkspaceWelcome.vue'
import { chatService, chatStorage } from './chatService'
import { preview } from '../shell/preview'
import TaskComposer from './TaskComposer.vue'
import GenerationBaseline from './GenerationBaseline.vue'
import ProposalApplication from './ProposalApplication.vue'
import { adoptBoardTaskDraft } from './boardTaskDraft'
import type { CodeProposal } from '@eap/runtime-client'
import { catalogRefreshNote, type CatalogNote } from './catalogNote'
import { readFeedScroll, saveFeedScroll } from './feedScroll'
import { outgoingInstructions } from './outgoing'
import { applyFailureCode, applyFailureMessage } from './applyError'
import { pendingWrite } from './pendingWrite'
import { refusedFromState } from './proposalRefusal'
import { proposalRefused } from '@eap/runtime-client'
import { reasoningForModel, type ReasoningLevel } from './reasoningChoice'
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
  toggleWorkspaceTree,
  openCandidateDiff,
  workbench,
} from '../shell/workbench'
import {
  applyRuntimeIdentity,
  identityFromStatus,
  identityPath,
  refreshWorkspaceDirty,
  runtimeIdentity,
} from '../shell/runtimeIdentity'

const { t } = useI18n()
const props = withDefaults(defineProps<{ active?: boolean; mock?: boolean }>(), {
  active: true,
  mock: false,
})
const workingGoalDraft = ref('')
const feedPort = ref<{ getEl: () => HTMLElement | null } | null>(null)
const shownTurns = ref(40)
const loadingOlder = ref(false)
const holdingFeed = ref(false)
function feed() {
  return feedPort.value?.getEl() ?? null
}
let restoringFeed = false
function feedKey(id: string | null | undefined) {
  return id || 'scratch'
}
function onFeedScroll(event: Event) {
  if (restoringFeed || !props.active) return
  const feedNode = event.currentTarget
  if (feedNode instanceof HTMLElement)
    saveFeedScroll(feedKey(session.conversationId.value), feedNode.scrollTop)
}
function restoreFeed(id: string | null | undefined) {
  restoringFeed = true
  holdingFeed.value = true
  const apply = () => {
    const node = feed()
    if (node) node.scrollTop = readFeedScroll(feedKey(id))
  }
  const raf =
    typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (cb: FrameRequestCallback) => setTimeout(cb, 0) as unknown as number
  void nextTick(() => {
    apply()
    raf(() => {
      apply()
      raf(() => {
        restoringFeed = false
        holdingFeed.value = false
      })
    })
  })
}
watch(
  () => props.active,
  (active) => {
    if (!active) saveFeedScroll(feedKey(session.conversationId.value), feed()?.scrollTop ?? 0)
    else {
      void session.refreshConnections().catch((error) => {
        historyNote.value = errorMessage(error)
      })
      void session.refreshStatus()
      restoreFeed(session.conversationId.value)
    }
  },
)
const importingPrototype =
  typeof sessionStorage !== 'undefined' && !!sessionStorage.getItem('eap.chat.prototype')
const api = chatService()
const session = createChatSession(
  api,
  typeof localStorage === 'undefined' ? undefined : chatStorage(props.mock, localStorage),
)
async function saveWorkingGoal() {
  const goal = workingGoalDraft.value.trim()
  if (!goal) return
  const current = session.workingMemory.value
  try {
    await session.saveWorkingMemory({
      goal,
      constraints: current?.constraints ?? [],
      facts: current?.facts ?? [],
      evidenceRefs: current?.evidenceRefs ?? [],
      dependencyKeys: current?.dependencyKeys ?? [],
    })
    workingGoalDraft.value = ''
  } catch {
    session.failure.value = 'failed'
  }
}
const visibleTurns = computed(() => {
  const all = session.turns.value
  const start = Math.max(0, all.length - shownTurns.value)
  return all.slice(start).map((turn, offset) => ({ turn, key: start + offset }))
})
const hasOlderTurns = computed(() => shownTurns.value < session.turns.value.length)
watch(
  () => session.turns.value.length,
  (length, previous) => {
    if (previous != null && length > previous && shownTurns.value > 40)
      shownTurns.value += length - previous
  },
)
function showOlderTurns() {
  if (loadingOlder.value || !hasOlderTurns.value) return
  const node = feed()
  const before = node?.scrollHeight ?? 0
  const top = node?.scrollTop ?? 0
  loadingOlder.value = true
  shownTurns.value = Math.min(session.turns.value.length, shownTurns.value + 40)
  void nextTick(() => {
    if (node) node.scrollTop = top + node.scrollHeight - before
    loadingOlder.value = false
  })
}
async function importMockHandoff() {
  if (!props.mock || !props.active || !workbench.pendingMockHandoff) return
  workbench.pendingMockHandoff = false
  const draft = preview.current(workbench.workMode)
  await session.openConversation()
  session.draft.value = draft.draft
  session.context.value = JSON.parse(JSON.stringify(draft.context))
  if (session.conversationId.value) {
    const source = workbench.sessionExtras[draft.id]
    const executionMode = source?.executionMode ?? draft.execution
    workbench.sessionExtras[session.conversationId.value] = {
      scenarioId: source?.scenarioId ?? null,
      experts: [...(source?.experts ?? [])],
      resources: [...(source?.resources ?? [])],
      projectId: source?.projectId ?? workbench.selectedProjectId,
      executionMode: executionMode === 'plan' || executionMode === 'agent' ? executionMode : 'chat',
      delivery: source?.delivery,
    }
    workbench.executionMode =
      workbench.sessionExtras[session.conversationId.value]?.executionMode ?? 'chat'
  }
}
watch(
  () => [props.active, workbench.pendingMockHandoff],
  () => {
    void importMockHandoff()
  },
)
const manageId = ref<string | null>(null)
const manageTitle = ref('')
const deleteId = ref<string | null>(null)
const historyNote = ref('')
const boardNote = ref('')
const adoptingBoardDraft = ref(false)
function adoptPendingBoardDraft() {
  if (!props.active || session.sending.value || session.opening.value) return
  const pending = takeBoardDraft(true)
  if (!pending) return
  adoptingBoardDraft.value = false
  const adopted = adoptBoardTaskDraft(pending)
  session.beginDraft()
  session.draft.value = adopted.text
  session.context.value = adopted.context
  workbench.executionMode = 'chat'
  session.toolMode.value = 'none'
  workbench.sessionExtras.scratch = {
    projectId: pending.taskRef?.projectId ?? null,
    scenarioId: null,
    experts: [],
    resources: [],
    executionMode: 'chat',
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
const moreOpen = ref(false)
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
    rememberSessionExecution(id)
    restorePanel(id)
    if (previous !== undefined) saveFeedScroll(feedKey(previous), feed()?.scrollTop ?? 0)
    shownTurns.value = 40
    void nextTick(() => restoreFeed(id))
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
const workspaceTreeOpen = computed(() => workbench.workspaceTreeOpen)
function choosePanel(id: 'summary' | 'changes' | 'files' | 'terminal') {
  moreOpen.value = false
  rememberPanel(session.conversationId.value, workbench.panel === id ? null : id)
}
const canRibbonRetry = computed(() => {
  const failure = session.failure.value
  if (
    session.expired.value ||
    session.sessionUnavailable.value ||
    session.checkingConversation.value ||
    session.reconnecting.value
  )
    return false
  if (failure !== 'failed' && failure !== 'kept' && failure !== 'not-configured') return false
  if (session.sending.value || !session.draft.value.trim()) return false
  if (!props.mock && (workbench.executionMode === 'agent' || workbench.executionMode === 'plan'))
    return false
  return true
})
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
const reconnectConfirmId = ref<string | null>(null)
const reconnectActionBusy = ref(false)
const reconnectLabel = computed(() =>
  t(session.draft.value.trim() ? 'historyUi.reconnectRetry' : 'historyUi.reconnect'),
)
watch(
  () => session.conversationId.value,
  () => {
    reconnectConfirmId.value = null
  },
)
async function confirmReconnect() {
  const id = reconnectConfirmId.value
  if (!id || reconnectActionBusy.value || id !== session.conversationId.value) return
  reconnectActionBusy.value = true
  try {
    const result = await session.reconnectConversation()
    reconnectConfirmId.value = null
    if (
      result?.readyToRetry &&
      props.active &&
      session.conversationId.value === id &&
      session.draft.value.trim()
    )
      await sendTask()
  } finally {
    reconnectActionBusy.value = false
  }
}
function statusTone() {
  if (session.expired.value || archived.value) return 'warning'
  if (props.mock) return 'neutral'
  const state = session.status.value?.state
  return state === 'available' ? 'success' : state === 'error' ? 'danger' : 'warning'
}
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
const refused = ref<Record<string, boolean>>({})
const refusing = ref<string | null>(null)
const refuseNote = ref('')
const conflicted = ref<Record<string, boolean>>({})
const applied = ref<Record<string, string[]>>({})
const appliedVerification = ref<Record<string, string>>({})
const appliedChecks = ref<
  Record<string, Array<{ name: string; exitCode: number | null; summary: string }>>
>({})
function syncRefused(id: string, value: boolean) {
  refused.value = { ...refused.value, [id]: value }
}
async function hydrateProposalRefusal(proposal: CodeProposal) {
  if (props.mock || refused.value[proposal.id]) return
  try {
    const state = await api.codeProposal(proposal.conversationId, proposal.id)
    if (refusedFromState(state)) syncRefused(proposal.id, true)
  } catch {
    /* durable status unavailable in this mode */
  }
}
watch(
  () =>
    session.turns.value
      .map((turn) => turn.proposal)
      .filter((proposal): proposal is CodeProposal => !!proposal),
  (proposals) => {
    for (const proposal of proposals) void hydrateProposalRefusal(proposal)
  },
  { immediate: true },
)
async function refuseProposal(turn: { proposal?: CodeProposal | null; executionId?: string | null }) {
  const proposal = turn.proposal
  if (!proposal || refused.value[proposal.id] || refusing.value) return
  if (props.mock) {
    syncRefused(proposal.id, true)
    return
  }
  refusing.value = proposal.id
  refuseNote.value = ''
  try {
    const state = await api.refuseCodeProposal(proposal.conversationId, proposal.id, {
      executionId: turn.executionId ?? null,
    })
    syncRefused(proposal.id, proposalRefused(state.status))
  } catch (error) {
    refuseNote.value = errorMessage(error)
  } finally {
    if (refusing.value === proposal.id) refusing.value = null
  }
}
const applying = ref<string | null>(null)
const proposalNote = ref('')
const writeConfirmed = ref<Record<string, boolean>>({})
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
const displayWorkspacePath = computed(() => {
  const status = session.status.value
  return identityPath(identityFromStatus(status)) || status?.workspaceLabel || ''
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
    workspaceLabel:
      session.workspaceLabel.value && session.workspaceLabel.value !== 'Mock workspace'
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
    appliedFiles: proposal ? (applied.value[proposal.id] ?? []) : [],
    proposal,
    writeRefused: proposal ? !!refused.value[proposal.id] : false,
    verification:
      (proposal && appliedVerification.value[proposal.id]) ||
      proposal?.verification ||
      'not_requested',
    verificationChecks: proposal ? (appliedChecks.value[proposal.id] ?? []) : [],
    select: (id: string) => {
      void session.selectConversation(id)
    },
    create: () => {
      void newConversation()
    },
  }
})
onUnmounted(() => {
  if (chatBinding.value?.activeId === session.conversationId.value) chatBinding.value = null
})
function useScene(id: string) {
  // Re-clicking the selected scene clears it (frame-064 chip remove parity).
  if (currentExtras().scenarioId === id) {
    currentExtras().scenarioId = null
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
async function sendTask() {
  if (!props.mock && (workbench.executionMode === 'agent' || workbench.executionMode === 'plan'))
    return
  const extras = currentExtras()
  const guidance = extras.experts.map((item) => item.guidance).join('\n')
  const sceneInstructions =
    scenarios.find((item) => item.id === extras.scenarioId)?.instructions || ''
  const requestContext = {
    ...session.context.value,
    files: session.context.value.files.map((file) => ({ ...file })),
  }
  if (workbench.executionMode === 'plan') {
    requestContext.mode = 'chat'
    requestContext.approval = 'read_only'
    session.toolMode.value = 'none'
  } else if (workbench.executionMode === 'agent') requestContext.mode = 'code'
  requestContext.instructions = outgoingInstructions({
    instructions: requestContext.instructions,
    scene: sceneInstructions,
    guidance,
    plan: workbench.executionMode === 'plan',
  })
  const before = session.conversationId.value
  try {
    await session.send(requestContext)
  } finally {
    if (!before && session.conversationId.value) {
      adoptScratch(session.conversationId.value)
      assignSessionProject(session.conversationId.value, workbench.selectedProjectId)
    }
  }
}
function turnPending(turn: { proposal?: CodeProposal | null }) {
  if (!turn.proposal) return 'desktop.pendingNone'
  const state = pendingWrite({
    policy: session.context.value.approval,
    files: turn.proposal.files,
    applied: !!applied.value[turn.proposal.id]?.length,
    refused: !!refused.value[turn.proposal.id],
    conflict: !!conflicted.value[turn.proposal.id],
  })
  return `desktop.pending${state.charAt(0).toUpperCase()}${state.slice(1)}`
}
function baselineReady(proposal: CodeProposal) {
  return (
    proposal.files.length > 0 && proposal.files.every((file) => file.baseHash.trim().length > 0)
  )
}
async function applyProposal(proposal: CodeProposal) {
  if (
    !baselineReady(proposal) ||
    !writeConfirmed.value[proposal.id] ||
    applying.value ||
    session.context.value.approval === 'read_only'
  )
    return
  applying.value = proposal.id
  proposalNote.value = ''
  try {
    const result = await api.applyCodeProposal(proposal.conversationId, proposal.id)
    conflicted.value = { ...conflicted.value, [proposal.id]: false }
    applied.value = { ...applied.value, [proposal.id]: result.written }
    appliedVerification.value = { ...appliedVerification.value, [proposal.id]: result.verification }
    appliedChecks.value = { ...appliedChecks.value, [proposal.id]: result.checks ?? [] }
    proposalNote.value = props.mock ? t('preview.boundary') : t('task.written')
  } catch (error) {
    if (applyFailureCode(error) === 'FILE_CHANGED_SINCE_PROPOSAL') {
      conflicted.value = { ...conflicted.value, [proposal.id]: true }
      writeConfirmed.value = { ...writeConfirmed.value, [proposal.id]: false }
    }
    proposalNote.value = applyFailureMessage(error, t)
  } finally {
    applying.value = null
  }
}
const stateKey: Record<AiConnectionState, string> = {
  disabled: 'chat.disabled',
  not_configured: 'chat.not_configured',
  configured_unverified: 'chat.configured_unverified',
  available: 'chat.available',
  error: 'chat.error',
}

onMounted(async () => {
  void session.refreshStatus()
  try {
    await session.refreshConnections()
    if (!importingPrototype) await session.restoreLastConversation()
  } catch (error) {
    historyNote.value = errorMessage(error)
  }
  await importMockHandoff()
})
</script>

<template>
  <section
    class="view work-page chat-workspace preview-workspace live-workspace"
    data-testid="chat-workspace"
  >
    <div class="page-head chat-page-head live-utilities">
      <div v-if="session.phase.value === 'loading'" class="session-status">
        <p class="hint">{{ t('chat.loading') }}</p>
      </div>
      <div v-else-if="session.phase.value === 'offline'" class="session-status">
        <p class="hint">{{ t('chat.offline') }}</p>
      </div>
      <div v-else class="session-status">
        <Badge
          v-if="!mock"
          :tone="statusTone()"
          :label="t(stateKey[session.status.value?.state ?? 'disabled'])"
        />
        <p v-if="session.status.value?.errorCode" class="hint">
          {{ session.status.value.errorCode }}
        </p>
        <p
          class="hint session-path"
          data-testid="session-workspace-path"
          :title="
            [
              displayWorkspacePath ? `${t('chat.workspace')}：${displayWorkspacePath}` : '',
              session.status.value?.workspaceLabel
                ? `id：${session.status.value.workspaceLabel}`
                : '',
              session.memoryNote.value ? `${t('chat.memory')}：${session.memoryNote.value}` : '',
            ]
              .filter(Boolean)
              .join(' · ')
          "
        >
          {{ displayWorkspacePath }}
        </p>
        <section
          v-if="session.conversationId.value"
          class="working-memory"
          data-testid="working-memory"
        >
          <h3>{{ t('workingMemory.title') }}</h3>
          <p class="hint">{{ t('workingMemory.note') }}</p>
          <p v-if="session.workingMemory.value?.invalidation" class="hint">
            {{ t('workingMemory.invalidation') }}：{{ session.workingMemory.value.invalidation }}
          </p>
          <p v-else-if="session.workingMemory.value?.goal" class="hint" data-testid="working-memory-goal-text">
            {{ t('workingMemory.goal') }}：{{ session.workingMemory.value.goal }}
          </p>
          <p v-else class="hint">{{ t('workingMemory.empty') }}</p>
          <p
            v-if="session.workingMemory.value?.constraints?.length"
            class="hint"
            data-testid="working-memory-constraints"
          >
            {{ t('workingMemory.constraints') }}：{{
              session.workingMemory.value.constraints.join(' · ')
            }}
          </p>
          <p
            v-if="session.workingMemory.value?.facts?.length"
            class="hint"
            data-testid="working-memory-facts"
          >
            {{ t('workingMemory.facts') }}：{{
              session.workingMemory.value.facts
                .map((fact) => `${fact.kind}:${fact.id}${fact.revisionOrDigest ? '@' + fact.revisionOrDigest : ''}`)
                .join(' · ')
            }}
          </p>
          <p
            v-if="session.workingMemory.value?.layers?.length"
            class="hint"
            data-testid="working-memory-layers"
          >
            {{ t('workingMemory.layers') }}：{{ session.workingMemory.value.layers.join(' · ') }}
          </p>
          <p
            v-if="session.workingMemory.value?.dependencyKeys?.length"
            class="hint"
            data-testid="working-memory-dependencies"
          >
            {{ t('workingMemory.dependencies') }}：{{
              session.workingMemory.value.dependencyKeys.join(' · ')
            }}
          </p>
          <p
            v-if="session.workingMemory.value?.evidenceRefs?.length"
            class="hint"
            data-testid="working-memory-evidence"
          >
            {{ t('workingMemory.evidence') }}：{{
              session.workingMemory.value.evidenceRefs.join(' · ')
            }}
          </p>
          <form class="working-memory-form" @submit.prevent="saveWorkingGoal">
            <Input
              v-model="workingGoalDraft"
              data-testid="working-memory-goal"
              :placeholder="t('workingMemory.goalPlaceholder')"
            />
            <Button
              size="sm"
              type="submit"
              data-testid="working-memory-save"
              :disabled="!workingGoalDraft.trim() || session.sending.value"
              >{{ t('workingMemory.saveGoal') }}</Button
            >
          </form>
        </section>
      </div>
      <div class="session-tools">
        <Button
          size="sm"
          variant="ghost"
          type="button"
          class="shell-tool"
          data-testid="ribbon-retry"
          :disabled="!canRibbonRetry"
          :title="canRibbonRetry ? t('desktop.retrySend') : t('desktop.retryIdleHint')"
          @click="sendTask"
          >{{ t('desktop.retryShort') }}</Button
        >
        <Button
          size="sm"
          variant="ghost"
          type="button"
          class="shell-tool"
          data-testid="open-workspace-tree"
          :aria-pressed="workspaceTreeOpen"
          :title="t('desktop.workspaceTreeHint')"
          @click="toggleWorkspaceTree()"
          >{{ t('desktop.workspaceTree') }}</Button
        >
        <Button
          size="sm"
          variant="ghost"
          type="button"
          class="shell-tool"
          data-testid="open-summary"
          :aria-pressed="workbench.panel === 'summary'"
          @click="choosePanel('summary')"
          >{{ t('desktop.summary') }}</Button
        >
        <Button
          size="sm"
          variant="ghost"
          type="button"
          class="shell-tool"
          data-testid="open-terminal"
          :aria-pressed="workbench.panel === 'terminal'"
          :title="t('desktop.terminalDockHint')"
          @click="choosePanel('terminal')"
          >{{ t('desktop.terminal') }}</Button
        >
        <Button
          size="sm"
          variant="ghost"
          type="button"
          class="shell-tool"
          data-testid="open-changes"
          :aria-pressed="workbench.panel === 'changes'"
          @click="choosePanel('changes')"
          >{{ t('desktop.changes') }}</Button
        >
        <Button
          size="sm"
          variant="ghost"
          type="button"
          class="shell-tool"
          data-testid="open-files"
          :aria-pressed="workbench.panel === 'files'"
          @click="choosePanel('files')"
          >{{ t('desktop.sources') }}</Button
        >
        <DropdownMenu
          v-model:open="moreOpen"
          :label="t('desktop.moreActions')"
          data-testid="ribbon-more-menu"
          :items="[
            {
              id: 'export',
              label: t('desktop.moreExport'),
              disabled: true,
              description: t('desktop.moreExportOff'),
            },
            {
              id: 'share',
              label: t('desktop.moreShare'),
              disabled: true,
              description: t('desktop.moreShareOff'),
            },
          ]"
        >
          <Button
            size="sm"
            variant="icon"
            type="button"
            class="shell-tool"
            data-testid="ribbon-more"
            :aria-label="t('desktop.moreActions')"
            ><IconEllipsis
          /></Button>
        </DropdownMenu>
      </div>
    </div>

    <WorkbenchFrame
      :rail="!!railMode"
      class="chat-body"
      :class="{
        'has-rail': !!railMode,
        'has-terminal-dock': terminalDockOpen,
        'has-workspace-tree': workspaceTreeOpen,
      }"
      data-testid="chat-body"
    >
      <WorkbenchFrame
        :rail="workspaceTreeOpen"
        rail-side="start"
        class="chat-workspace-split"
        data-testid="chat-workspace-split"
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
          <Feedback v-if="session.storageError.value" tone="warning">{{
            t('historyUi.storageError')
          }}</Feedback>
          <Feedback
            v-if="historyNote && !deleteId && session.phase.value !== 'offline'"
            tone="warning"
            >{{ historyNote }}</Feedback
          >
          <p v-if="boardNote" class="hint" role="status" data-testid="board-draft-note">
            {{ boardNote }}
          </p>
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
          <Feedback v-if="session.expired.value || archived" tone="warning">{{
            archived ? t('historyUi.archiveNotice') : t('historyUi.expired')
          }}</Feedback>
          <Button
            v-if="session.expired.value && !archived"
            data-testid="reconnect-session"
            :disabled="
              session.reconnecting.value ||
              reconnectActionBusy ||
              session.checkingConversation.value
            "
            @click="reconnectConfirmId = session.conversationId.value"
            >{{ reconnectLabel }}</Button
          >
          <ConfirmBox
            v-if="reconnectConfirmId"
            :title="reconnectLabel"
            :impact="[t('historyUi.reconnectImpact'), t('historyUi.reconnectLocal')]"
            :confirm-label="reconnectLabel"
            :busy="reconnectActionBusy"
            @confirm="confirmReconnect"
            @cancel="reconnectConfirmId = null"
          />
          <Feedback v-if="session.sessionUnavailable.value" tone="warning">{{
            t('historyUi.probeFailed')
          }}</Feedback>
          <Button
            v-if="session.sessionUnavailable.value || (session.expired.value && !archived)"
            data-testid="recheck-session"
            :disabled="
              session.checkingConversation.value ||
              session.reconnecting.value ||
              reconnectActionBusy
            "
            @click="session.recheckConversation()"
            >{{ t('historyUi.recheck') }}</Button
          >
          <Feedback
            v-if="
              session.failure.value === 'reconnect-failed' ||
              session.failure.value === 'workspace-changed'
            "
            data-testid="reconnect-error"
            tone="warning"
            >{{
              t(
                session.failure.value === 'workspace-changed'
                  ? 'historyUi.workspaceChanged'
                  : 'historyUi.reconnectFailed',
              )
            }}</Feedback
          >
          <Feedback v-if="session.reconnectNotice.value" tone="info">{{
            t(
              session.reconnectNotice.value === 'reset'
                ? 'historyUi.contextReset'
                : 'historyUi.contextKept',
            )
          }}</Feedback>
          <p v-if="session.toolMode.value === 'git_status'" class="hint">
            {{ t('chat.gitWarning') }}
          </p>

          <WorkspaceWelcome
            v-if="!session.turns.value.length || workbench.workMode === 'work'"
            :compact="session.turns.value.length > 0"
            @scenario="useScene"
          />
          <ol v-if="visibleTurns.length" class="chat-log">
            <li
              v-for="{ turn, key } in visibleTurns"
              :key="key"
              :aria-label="turn.role === 'user' ? t('chat.speakerYou') : t('chat.speakerModel')"
              :class="turn.role === 'user' ? 'turn-user' : 'turn-assistant'"
            >
              <p v-if="turn.text">{{ turn.text }}</p>
              <p v-else-if="turn.role === 'assistant'">{{ t('chat.noAnswer') }}</p>
              <p v-if="turn.error">{{ t('chat.toolError') }}：{{ turn.error }}</p>
              <p v-if="turn.artifactError">
                {{ t('chat.artifactFailed') }}：{{ turn.artifactError }}
              </p>
              <section
                v-if="turn.proposal"
                class="code-proposal write-request"
                data-testid="code-proposal"
              >
                <h3>{{ t('desktop.writeRequest', { count: turn.proposal.files.length }) }}</h3>
                <GenerationBaseline :generation="turn.proposal.generation" />
                <p v-if="!refused[turn.proposal.id]" class="hint" data-testid="turn-pending">
                  {{ t(turnPending(turn)) }}
                </p>
                <Collapse v-for="file in turn.proposal.files" :key="file.path">
                  <template #summary
                    >{{ file.path }} ·
                    {{ file.before == null ? t('task.newFile') : t('task.modifiedFile') }} ·
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
                      @click="viewProposalDiff(file.path)"
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
                    v-if="!applied[turn.proposal.id] && !refused[turn.proposal.id]"
                    type="button"
                    data-testid="refuse-write"
                    :disabled="!!refusing"
                    @click="refuseProposal(turn)"
                    >{{ t('desktop.refuseWrite') }}</Button
                  >
                </div>
                <p
                  v-if="refuseNote && refusing === turn.proposal.id"
                  class="hint"
                  role="alert"
                  data-testid="refuse-write-error"
                >
                  {{ refuseNote }}
                </p>
                <p v-if="refused[turn.proposal.id]" class="hint" data-testid="refused-write">
                  {{ t('desktop.refusedWrite') }}
                </p>
                <ProposalApplication
                  v-if="turn.proposal.generation && !mock"
                  :proposal="turn.proposal"
                  :read-only="
                    session.context.value.approval === 'read_only' ||
                    !!refused[turn.proposal.id] ||
                    session.expired.value ||
                    archived
                  "
                  @applied="
                    (result) => {
                      applied[turn.proposal!.id] = result.written
                      appliedVerification[turn.proposal!.id] = result.verification
                      appliedChecks[turn.proposal!.id] = result.checks
                    }
                  "
                />
                <template
                  v-else-if="
                    !applied[turn.proposal.id] &&
                    !refused[turn.proposal.id] &&
                    baselineReady(turn.proposal)
                  "
                >
                  <label
                    ><Checkbox v-model="writeConfirmed[turn.proposal.id]" />
                    {{ t('task.confirmWrite') }}</label
                  >
                  <Button
                    type="button"
                    variant="primary"
                    :disabled="
                      !writeConfirmed[turn.proposal.id] ||
                      !!applying ||
                      !turn.proposal.writeAllowed ||
                      session.context.value.approval === 'read_only'
                    "
                    @click="applyProposal(turn.proposal)"
                    >{{ t('task.apply') }}</Button
                  >
                </template>
                <p v-else-if="applied[turn.proposal.id]">
                  {{ mock ? t('preview.boundary') : t('task.written') }}
                  {{ applied[turn.proposal.id]?.join('、') }}
                </p>
              </section>
              <ul v-if="turn.toolEvents.length">
                <li v-for="event in turn.toolEvents" :key="event.sequence">
                  {{ event.sequence }}. {{ event.code }}
                </li>
              </ul>
              <section v-if="turn.knowledgeContext" data-testid="turn-knowledge">
                <h3>
                  {{ t('knowledgeContext.title') }} · {{ turn.knowledgeContext.expertRef.id }} · r{{
                    turn.knowledgeContext.expertRef.revision
                  }}
                </h3>
                <p>
                  {{
                    t(
                      mock || turn.status === 'mock_completed'
                        ? 'knowledgeContext.mock'
                        : 'knowledgeContext.provided',
                    )
                  }}
                </p>
                <p>{{ t('knowledgeContext.excerpts') }}</p>
                <p v-if="turn.knowledgeContext.status === 'no_matches'">
                  {{ t('knowledgeContext.no_matches') }}
                </p>
                <ul>
                  <li v-for="reference in turn.knowledgeContext.references" :key="reference.id">
                    <strong
                      >{{ reference.id }} · {{ reference.source }} ·
                      {{ reference.knowledgeBase }}</strong
                    >
                    <p>
                      {{ reference.retrievalMode }} · {{ reference.knowledgeBaseId }} ·
                      {{ reference.documentId }}
                    </p>
                    <pre>{{ reference.excerpt }}</pre>
                  </li>
                </ul>
              </section>
              <section v-if="turn.skillContext" data-testid="turn-skill">
                <h3>
                  {{ t('skill.title') }} · {{ turn.skillContext.skillRef.id }} ·
                  {{ turn.skillContext.skillRef.version }} · r{{
                    turn.skillContext.skillRef.stateRevision
                  }}
                </h3>
                <p>{{ t('skill.evidence') }}</p>
                <p v-if="mock || turn.status === 'mock_completed'">{{ t('skill.mock') }}</p>
                <code>{{ turn.skillContext.skillRef.digest }}</code>
                <pre>{{ turn.skillContext.instructions }}</pre>
                <div v-for="resource in turn.skillContext.resources" :key="resource.path">
                  <strong>{{ resource.path }}</strong>
                  <pre>{{ resource.content }}</pre>
                </div>
                <p>{{ t('skill.dependencies') }}: {{ turn.skillContext.dependencies }}</p>
              </section>
              <section v-if="turn.contextBudget" data-testid="turn-context-budget">
                <h3>{{ t('contextBudget.title') }}</h3>
                <p>
                  {{ t('contextBudget.used') }} {{ turn.contextBudget.usedChars }} ·
                  {{ t('contextBudget.remaining') }} {{ turn.contextBudget.remainingChars }} ·
                  {{ t('contextBudget.reserve') }} {{ turn.contextBudget.outputReserve }}
                </p>
                <p>
                  {{ t('contextBudget.metering') }}：{{
                    turn.contextBudget.metering === 'UNKNOWN'
                      ? t('contextBudget.unknown')
                      : t('contextBudget.charEstimate')
                  }}
                </p>
                <p v-if="includedSourceSummary(turn.contextBudget)">
                  {{ t('contextBudget.sources') }}：{{ includedSourceSummary(turn.contextBudget) }}
                </p>
                <p v-if="turn.contextBudget.notes.length">
                  {{ t('contextBudget.notes') }}：{{ turn.contextBudget.notes.join(' · ') }}
                </p>
              </section>
              <Feedback
                v-if="
                  turn.knowledgeMemoryCleared &&
                  !turn.contextMemoryCleared &&
                  !session.contextMemoryCleared.value
                "
                tone="info"
                >{{
                  t(
                    mock || turn.status === 'mock_completed'
                      ? 'knowledgeContext.mock'
                      : 'knowledgeContext.cleared',
                  )
                }}</Feedback
              >
              <ul v-if="turn.artifacts.length">
                <li v-for="artifact in turn.artifacts" :key="artifact.sha256">
                  {{ artifact.kind }} · {{ artifact.sizeBytes }} · {{ artifact.sha256 }}
                </li>
              </ul>
            </li>
          </ol>

          <Button
            v-if="session.failure.value === 'target-changed'"
            type="button"
            :disabled="!selectedModel || session.sending.value"
            @click="
              session.chooseConversationConnection(
                session.boundConnectionId.value!,
                session.boundModel.value,
              )
            "
            >{{ t('modelUi.reconnect') }}</Button
          >
          <Button
            v-if="
              !session.expired.value &&
              (session.failure.value === 'failed' ||
                session.failure.value === 'kept' ||
                session.failure.value === 'cancelled' ||
                session.failure.value === 'not-configured')
            "
            type="button"
            data-testid="retry-send"
            :disabled="
              session.sending.value ||
              !session.draft.value.trim() ||
              (!mock && (workbench.executionMode === 'agent' || workbench.executionMode === 'plan'))
            "
            @click="sendTask"
            >{{ t('desktop.retrySend') }}</Button
          >
          <a
            v-if="session.failure.value === 'not-configured'"
            data-testid="locate-settings"
            :title="t('desktop.locateSettingsNote')"
            href="#model-settings"
            >{{ t('desktop.locateSettings') }}</a
          >
          <Button
            v-if="
              session.failure.value === 'model-unavailable' ||
              session.failure.value === 'target-change-failed'
            "
            type="button"
            data-testid="locate-model"
            :title="t('desktop.locateModelNote')"
            @click="workbench.modelMenuToken += 1"
            >{{ t('desktop.locateModel') }}</Button
          >
          <Feedback v-if="session.targetNotice.value === 'cleared'" tone="info">{{
            t('chat.memoryCleared')
          }}</Feedback>
          <Feedback v-if="session.targetNotice.value === 'kept'" tone="info">{{
            t('modelUi.memoryKept')
          }}</Feedback>
          <Feedback
            v-if="session.contextMemoryCleared.value"
            data-testid="context-cleared"
            tone="info"
            >{{ t(mock ? 'skill.mock' : 'skill.cleared') }}</Feedback
          >
          <Feedback v-else-if="session.knowledgeMemoryCleared.value" tone="info">{{
            t(mock ? 'knowledgeContext.mock' : 'knowledgeContext.cleared')
          }}</Feedback>
          <Feedback v-if="session.failure.value.startsWith('skill-')" tone="warning">{{
            t('skill.' + session.failure.value.slice('skill-'.length))
          }}</Feedback>
          <Feedback v-if="session.failure.value.startsWith('knowledge-')" tone="warning">{{
            t('knowledgeContext.' + session.failure.value.slice('knowledge-'.length))
          }}</Feedback>
          <Feedback
            v-else-if="session.failure.value === 'context-budget-exceeded'"
            data-testid="context-budget-exceeded"
            tone="warning"
          >
            <p>{{ t('contextBudget.exceeded') }}</p>
            <p v-if="session.lastContextBudget.value">
              {{
                t('contextBudget.exceededDetail', {
                  used: session.lastContextBudget.value.usedChars,
                  platform: session.lastContextBudget.value.platformLimit,
                  reserve: session.lastContextBudget.value.outputReserve,
                  metering: session.lastContextBudget.value.metering,
                })
              }}
            </p>
          </Feedback>
          <Feedback
            v-else-if="session.failure.value === 'protocol-tools-unavailable'"
            tone="warning"
            >{{ t('modelUi.protocolToolsUnavailable') }}</Feedback
          >
          <Feedback v-else-if="session.failure.value.startsWith('generation-')" tone="warning">{{
            t('generation.' + session.failure.value)
          }}</Feedback>
          <Feedback
            v-else-if="
              session.failure.value &&
              !session.failure.value.startsWith('skill-') &&
              !['reconnect-failed', 'workspace-changed'].includes(session.failure.value)
            "
            tone="warning"
            >{{
              t(
                session.failure.value === 'target-changed'
                  ? 'modelUi.retryTarget'
                  : session.failure.value === 'model-unavailable'
                    ? 'modelUi.unavailable'
                    : session.failure.value === 'not-configured'
                      ? 'chat.notConfigured'
                      : session.failure.value === 'target-change-failed'
                        ? 'chat.targetChangeFailed'
                        : 'desktop.retrySame',
              )
            }}</Feedback
          >
          <Button
            v-if="session.failure.value === 'generation-stale'"
            data-testid="retry-generation"
            :disabled="session.sending.value || !session.draft.value.trim()"
            @click="sendTask"
            >{{ t('generation.retry') }}</Button
          >
          <Feedback v-if="proposalNote" tone="info">{{ proposalNote }}</Feedback>
          <p v-if="effortReset" class="hint" data-testid="effort-reset">
            {{ t('desktop.effortReset', { effort: t('task.' + effortReset) }) }}
          </p>
        </InfiniteScroll>
        <form
          class="chat-composer preview-composer preview-input-box"
          data-testid="chat-composer"
          @submit.prevent="sendTask"
        >
          <TaskComposer
            :draft="session.draft.value"
            :tool-mode="session.toolMode.value"
            :active="props.active"
            :preview="mock"
            :refreshing-models="modelsRefreshing"
            :model-options-available="modelChoices.length > 0"
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
                  rows="3"
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
                v-if="!mock && session.conversationId.value"
                class="chat-tool-settings"
                data-testid="chat-tool-settings"
              >
                <p class="hint">{{ t('chat.gitWarning') }}</p>
                <Button
                  variant="secondary"
                  type="button"
                  :aria-pressed="session.toolMode.value === 'none'"
                  @click="session.toolMode.value = 'none'"
                  >{{ t('chat.toolNone') }}</Button
                >
                <Button
                  variant="secondary"
                  type="button"
                  :disabled="
                    !session.status.value?.tools.git_status ||
                    selectedModel?.wireApi === 'responses'
                  "
                  :aria-pressed="session.toolMode.value === 'git_status'"
                  @click="session.toolMode.value = 'git_status'"
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
            <template v-if="!mock && !selectedModel" #status>
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
                  (!mock &&
                    (workbench.executionMode === 'agent' || workbench.executionMode === 'plan')) ||
                  session.expired.value ||
                  archived ||
                  session.reconnecting.value ||
                  session.checkingConversation.value ||
                  session.sessionUnavailable.value ||
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
            <Button type="button" variant="secondary" @click="session.confirmConnectionChange()">{{
              t('chat.confirmTarget')
            }}</Button>
            <Button type="button" variant="secondary" @click="session.cancelConnectionChange()">{{
              t('chat.cancelTarget')
            }}</Button>
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
        <template v-if="workspaceTreeOpen" #rail>
          <WorkspaceFileTreeRail @close="toggleWorkspaceTree(false)" />
        </template>
      </WorkbenchFrame>
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
  border: 1px solid var(--border);
  padding: 14px 18px;
  border-radius: 12px;
  margin-bottom: 18px;
}
.chat-connections > :deep(summary) {
  cursor: pointer;
  font-weight: 600;
}
.chat-log {
  list-style: none;
  padding: 0;
  display: grid;
  gap: 18px;
  max-width: 1100px;
}
.chat-log > li {
  padding: 18px 22px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 16px;
}
.chat-log > li > p {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
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
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  resize: vertical;
}
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
  overflow: auto;
  max-height: 380px;
  padding: 12px;
  background: var(--eap-code-bg);
  color: var(--eap-code-text);
  border-radius: 8px;
}
@media (max-width: 800px) {
  .code-comparison {
    grid-template-columns: 1fr;
  }
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
  align-items: center;
  flex-wrap: nowrap;
  gap: 8px;
  padding: 8px 24px;
  margin: 0;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border);
  min-width: 0;
}
.session-status {
  min-width: 0;
}
.session-tools {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  flex: 0 0 auto;
}
.session-tools .shell-tool {
  white-space: nowrap;
}

@media (max-width: 760px) {
  .live-utilities {
    padding: 8px 12px;
    gap: 6px;
    flex-wrap: wrap;
  }
  .session-tools {
    max-width: 100%;
    margin-left: 0;
    flex-wrap: wrap;
  }
}
.chat-workspace-split {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
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
  border-left: 1px solid var(--border);
  background: var(--surface);
}
.terminal-dock {
  flex: 0 0 auto;
  max-height: min(280px, 36vh);
  min-height: 140px;
  overflow: hidden;
  border-top: 1px solid var(--border);
  background: var(--eap-code-bg);
}
@media (max-width: 1000px) {
  .session-rail {
    position: fixed;
    z-index: 30;
    top: 56px;
    right: 12px;
    bottom: 12px;
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
  align-items: center;
  gap: 6px;
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
  content: '▸';
  color: var(--text-mute);
  font-size: 10px;
}
.outgoing-preview[open] {
  padding: 8px 10px;
  background: var(--surface-2);
  border-radius: 10px;
  max-height: min(180px, 18vh);
  overflow: auto;
  overscroll-behavior: contain;
}
.outgoing-preview[open] > :deep(summary)::before {
  content: '▾';
}
.outgoing-preview p,
.outgoing-preview ul {
  margin: 4px 0;
}
.outgoing-preview pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 9em;
  overflow: auto;
  margin: 6px 0;
  font: inherit;
}
.chat-feed {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.chat-feed > .hint {
  font-size: 11px;
  margin: 4px 0;
  color: var(--text-soft);
}
.catalog-fail {
  margin: 6px 0 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--danger-bg);
  border: 1px solid var(--danger-border);
  font-size: 12px;
  line-height: 1.45;
  color: var(--danger);
  font-weight: 600;
}
.chat-composer {
  display: block;
  gap: 0;
  flex: 0 0 auto;
}
.chat-composer:has(textarea.composer-draft:disabled) textarea,
.chat-composer:has(textarea.composer-draft:disabled) :deep(.context-toolbar) {
  opacity: 0.5;
}
.chat-composer textarea {
  border: 0;
  background: transparent;
  min-height: 70px;
  padding: 6px 3px;
  font-size: 13px;
}
.chat-composer textarea.composer-draft:focus {
  outline: none;
  box-shadow: none;
  border: 0;
}
.chat-log {
  gap: 24px;
  max-width: none;
}
.chat-log > li.turn-user,
.chat-log > li.turn-assistant {
  min-width: 0;
}
.chat-log > li > strong {
  font-size: 11px;
  color: var(--text-soft);
}
.chat-log > li > p {
  line-height: 1.9;
  font-size: 14px;
}
.turn-meta {
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-soft);
}
.code-comparison > div:first-child pre {
  background: var(--danger-bg);
  color: var(--danger);
}
.code-comparison > div:last-child pre {
  background: var(--ok-bg);
  color: var(--ok);
}
</style>
