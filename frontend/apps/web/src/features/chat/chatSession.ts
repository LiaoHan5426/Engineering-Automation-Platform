import { contextBudgetFromError } from './contextBudgetView'
import { ModelErrors } from '@eap/runtime-client'
import {
  createChatAttachmentStore,
  createAttachmentPreviews,
  type LocalAttachment,
  type AttachmentOwner,
} from './chatAttachments'
import { apiStorageScope } from '../../lib/runtimeConfig'
import { selectedPath, selectBranch, siblings, type BranchSelection } from './messageGraph'
import {
  validateChatGraph,
  isChatExecutionStatusActive,
  isChatExecutionStatusBlocking,
  isChatExecutionStatus,
  type ChatGraph,
  type ChatGraphRequest,
  type ChatGraphOperation,
} from '@eap/runtime-client'
import { createPlanObserver, type PlanObservation } from './planObserver'
import type { ChatPlanSnapshot } from '@eap/runtime-client'
import { AiToolMode, ChatErrors } from '@eap/runtime-client'

import { ChatExecutionStatus } from '@eap/runtime-client'
import { AgentErrors } from '@eap/runtime-client'
import { computed, ref, watch } from 'vue'
import type {
  AiConversationRecovery,
  AiMessageResult,
  AiStatus,
  ContextBudgetObservation,
  ModelConnection,
  ModelConnectionList,
  TaskContext,
  TaskWorkingMemorySnapshot,
  CodeProposal,
} from '@eap/runtime-client'
import {
  createChatHistoryWriter,
  readChatHistory,
  exportLegacyChatHistory,
  type ChatHistorySnapshot,
} from './chatHistory'

export type ChatApi = {
  chatPlan?: (conversationId: string, executionId: string) => Promise<ChatPlanSnapshot | null>
  reconnectAiConversation?: (
    id: string,
    expectedWorkspaceLabel: string,
    connectionId: string,
    model: string,
  ) => Promise<AiConversationRecovery>
  aiConversation?: (id: string) => Promise<{
    workspaceLabel: string
    memory: string
    connectionId?: string | null
    model?: string | null
    workingMemory?: TaskWorkingMemorySnapshot | null
  }>
  deleteAiConversation?: (id: string) => Promise<void>
  aiStatus: () => Promise<AiStatus>
  openAiConversation: () => Promise<{
    conversationId: string
    workspaceLabel: string
    memory: string
    connectionId?: string | null
    model?: string | null
    workingMemory?: TaskWorkingMemorySnapshot | null
  }>
  webSources?: () => Promise<import('@eap/runtime-client').WebSourceService[]>
  chatGraph: (id: string) => Promise<ChatGraph>
  chatOperation: (id: string, operationId: string) => Promise<ChatGraphOperation>
  sendAiMessage: (
    id: string,
    request: ChatGraphRequest,
    options?: {
      signal?: AbortSignal
      onEvent?: (event: {
        message?: string
        type: string
        text: string
        code: string
        status: string
        sequence: number
        executionId: string
        conversationId?: string
        payload?: unknown
      }) => void
    },
  ) => Promise<AiMessageResult>
  cancelAiExecution: (
    id: string,
    executionId: string,
  ) => Promise<{ cancelled: boolean; executionId: string }>
  putWorkingMemory?: (
    id: string,
    body: {
      expectedUpdatedAt: string
      goal?: string
      constraints?: string[]
      facts?: Array<{ kind: string; id: string; revisionOrDigest: string }>
      evidenceRefs?: string[]
      dependencyKeys?: string[]
    },
  ) => Promise<TaskWorkingMemorySnapshot>
  modelConnections?: () => Promise<ModelConnectionList>
  assignConversationConnection?: (
    id: string,
    connectionId: string,
    confirmTargetChange: boolean,
    model: string,
  ) => Promise<{
    connectionId: string
    memoryCleared: boolean
    connectionName: string
    model: string
  }>
}

export type ChatTurn = {
  webSources?: import('@eap/runtime-client').WebSource[]
  attachmentRefs?: TaskContext['attachmentRefs']
  observationAvailable?: boolean
  id?: string
  parentId?: string | null
  siblings?: string[]
  plan?: PlanObservation
  planningTask?: TaskContext['taskRef']

  errorMessage?: string
  errorLanguage?: string
  skillContext?: AiMessageResult['skillContext']
  contextMemoryCleared?: boolean
  knowledgeContext?: AiMessageResult['knowledgeContext']
  knowledgeMemoryCleared?: boolean
  contextBudget?: ContextBudgetObservation | null
  executionId?: string | null
  proposal?: CodeProposal | null
  model?: string
  connectionName?: string
  reasoning?: string
  role: 'user' | 'assistant'
  text: string
  error: string
  status: string
  approval: string
  verification: string
  toolEvents: Array<{ sequence: number; code: string }>
  artifactError: string
  artifacts: AiMessageResult['artifacts']
}

function httpStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('response' in error)) return undefined
  const status = (error as { response?: { status?: number } }).response?.status
  return typeof status === 'number' ? status : undefined
}

function generationFailure(error: unknown): string | undefined {
  const code = (error as { response?: { data?: { code?: unknown } } } | null)?.response?.data?.code
  if (typeof code !== 'string') return undefined
  if (code.startsWith('SKILL_') || code.startsWith('INVALID_SKILL_')) return 'skill-failed'
  if (code === AgentErrors.INVALID_EXPERT_CONTEXT || code.startsWith('EXPERT_CONTEXT_'))
    return 'knowledge-failed'
  if (code === ChatErrors.CONTEXT_BUDGET_EXCEEDED || code === 'TASK_CONTEXT_TOO_LARGE')
    return 'context-budget-exceeded'
  return (
    {
      AI_PROTOCOL_TOOLS_UNAVAILABLE: 'protocol-tools-unavailable',
      CODE_GENERATION_BASELINE_CHANGED: 'generation-stale',
      CODE_GENERATION_TARGET_REQUIRED: 'generation-blocked',
      CODE_GENERATION_SCOPE_MISMATCH: 'generation-blocked',
      CODE_GENERATION_CONTEXT_UNAVAILABLE: 'generation-unavailable',
      CODE_PROPOSAL_TOO_LARGE: 'generation-too-large',
      BOARD_REVISION_CONFLICT: 'generation-task-stale',
      CODE_TASK_PROTOTYPE_MISMATCH: 'generation-task-stale',
      CODE_TASK_SNAPSHOT_CHANGED: 'generation-task-stale',
      CODE_WORKSPACE_BUSY: 'generation-task-blocked',
      BOARD_EXECUTION_ACTIVE: 'generation-task-blocked',
      BOARD_PREPARATION_REQUIRED: 'generation-task-blocked',
      BOARD_TASK_NOT_FOUND: 'generation-task-stale',
    } as Record<string, string>
  )[code]
}

export type ConversationHistory = {
  id: string
  title: string
  archived: boolean
  updatedAt: string
  draft: string
  workspaceLabel: string
  memory: string
  connectionId: string | null
  model?: string
  context?: TaskContext
  expired?: boolean
  knowledgeMemoryCleared?: boolean
  contextMemoryCleared?: boolean
}
export function createChatSession(api: ChatApi, storage?: Pick<Storage, 'getItem' | 'setItem'>) {
  const history = ref<ConversationHistory[]>([])
  const storageError = ref(false)
  // Read one startup snapshot; restoring selection must not reread a
  // snapshot that reactive watchers may already have rewritten.
  let saved: ChatHistorySnapshot | null = null
  try {
    saved = readChatHistory(storage)
    if (saved?.version === 2 && Array.isArray(saved.items))
      history.value = saved.items.filter(
        (x: ConversationHistory) =>
          typeof x.id === 'string' && typeof x.title === 'string' && typeof x.draft === 'string',
      )
  } catch {
    storageError.value = true
  }
  const webSourceServices = ref<import('@eap/runtime-client').WebSourceService[]>([])
  const webSourcesUnavailable = ref(false)
  async function refreshWebSources() {
    if (!api.webSources) return
    try {
      webSourceServices.value = await api.webSources()
      webSourcesUnavailable.value = false
    } catch {
      webSourceServices.value = []
      webSourcesUnavailable.value = true
    }
  }
  const opening = ref(false)
  const phase = ref<'loading' | 'ready' | 'offline'>('loading')
  const status = ref<AiStatus | null>(null)
  const conversationId = ref<string | null>(null)
  const attachmentStores = new Map<string, ReturnType<typeof createChatAttachmentStore>>()
  const attachmentStore = computed(() => {
    const path = status.value?.workspacePath?.trim() || status.value?.authorizedRootPath?.trim()
    if (!path) return undefined
    const namespace = `${apiStorageScope}:${path}`
    if (!attachmentStores.has(namespace))
      attachmentStores.set(namespace, createChatAttachmentStore(namespace))
    return attachmentStores.get(namespace)!
  })
  const attachmentOwner = computed<AttachmentOwner>(
    () => `draft:${conversationId.value ?? 'scratch'}`,
  )
  const attachmentPreviews = computed(() =>
    attachmentStore.value ? createAttachmentPreviews(attachmentStore.value) : undefined,
  )
  watch(conversationId, () => attachmentPreviews.value?.dispose())
  const localRefs = (refs: TaskContext['attachmentRefs'] = []): LocalAttachment[] =>
    refs.map((ref) => ({ ...ref, kind: ref.mime.startsWith('image/') ? 'image' : 'text' }))
  async function attachFiles(files: readonly File[]) {
    if (!attachmentStore.value) throw new Error('attachment.storageUnavailable')
    const refs = await attachmentStore.value.select(files, attachmentOwner.value)
    context.value = {
      ...context.value,
      attachmentRefs: [
        ...(context.value.attachmentRefs ?? []),
        ...refs.map(({ kind: _kind, ...ref }) => ref),
      ],
    }
    return refs
  }
  async function removeAttachment(id: string) {
    if (!attachmentStore.value) throw new Error('attachment.storageUnavailable')
    await attachmentStore.value.remove(attachmentOwner.value, id)
    context.value = {
      ...context.value,
      attachmentRefs: context.value.attachmentRefs?.filter((ref) => ref.id !== id),
    }
  }
  const workspaceLabel = ref('')
  const memoryNote = ref('')
  const workingMemory = ref<TaskWorkingMemorySnapshot | null>(null)
  const transcripts = ref<Record<string, ChatTurn[]>>({})
  const planObservers = new Map<string, ReturnType<typeof createPlanObserver>>()
  function observePlan(id: string, index: number, executionId: string) {
    const key = `${id}/${executionId}`
    let observer = planObservers.get(key)
    if (!observer && api.chatPlan) {
      const turn = transcripts.value[id]?.[index]
      observer = createPlanObserver(
        id,
        executionId,
        () => api.chatPlan!(id, executionId),
        (value) => {
          const turns = transcripts.value[id]
          const currentIndex =
            turns?.findIndex(
              (turn) => turn.executionId === executionId && turn.role === 'assistant',
            ) ?? -1
          if (!turns || currentIndex < 0) return
          const next = [...turns]
          next[currentIndex] = { ...next[currentIndex]!, plan: value }
          transcripts.value = { ...transcripts.value, [id]: next }
        },
        turn?.plan?.snapshot ?? null,
      )
      planObservers.set(key, observer)
      void observer.refresh()
    }
    return observer
  }
  function refreshPlan() {
    const id = conversationId.value
    if (!id) return
    const turns = transcripts.value[id] ?? []
    let index = turns.length - 1
    while (index >= 0 && (turns[index]?.role !== 'assistant' || !turns[index]?.executionId)) index--
    const executionId = turns[index]?.executionId
    if (executionId) void observePlan(id, index, executionId)?.refresh()
  }
  watch(conversationId, () => refreshPlan(), { flush: 'post' })
  const draft = ref('')
  const expired = ref(false)
  const reconnectingIds = ref<Record<string, boolean>>({})
  const reconnecting = computed(() => !!reconnectingIds.value[conversationId.value ?? ''])
  const changingConnectionIds = ref<Record<string, boolean>>({})
  const changingConnection = computed(
    () => !!changingConnectionIds.value[conversationId.value ?? ''],
  )
  const reconnectNotice = ref('')
  const reconnectResults = ref<Record<string, AiConversationRecovery>>({})
  const sessionUnavailable = ref(false)
  const checkingConversation = ref(false)
  let selectionVersion = 0
  const toolMode = ref<AiToolMode>(AiToolMode.NONE)
  const emptyContext = (): TaskContext => ({
    mode: 'chat',
    expert: 'general',
    instructions: '',
    reasoning: 'default',
    approval: 'review',
    files: [],
    prototypeVersionId: '',
    targetPath: '',
  })
  const context = ref<TaskContext>(emptyContext())
  const failure = ref('')
  const lastContextBudget = ref<ContextBudgetObservation | null>(null)
  const inflight = ref<Record<string, number>>({})
  const abortControllers = ref<Record<string, AbortController>>({})
  const connections = ref<ModelConnection[]>([])
  const boundConnectionId = ref<string | null>(null)
  const pendingConnectionId = ref<string | null>(null)
  const boundModel = ref('')
  const pendingModel = ref('')
  const targetNotice = ref('')
  let ticket = 0
  const graphs = ref<Record<string, ChatGraph>>({})
  const branches = ref<Record<string, BranchSelection>>(saved?.branches ?? {})
  const pendingOperations = ref<Record<string, string>>(saved?.pendingOperations ?? {})
  const scrollPreferences = ref<NonNullable<ChatHistorySnapshot['scroll']>>(saved?.scroll ?? {})
  function setScrollPreference(preference: { follow: boolean; anchorMessageId?: string }) {
    const id = conversationId.value
    if (!id) return
    scrollPreferences.value = { ...scrollPreferences.value, [id]: { ...preference } }
    persist()
  }
  const graphUnavailable = ref(false)
  const generationBlocking = computed(() => {
    const id = conversationId.value
    return (
      !!id &&
      (!!pendingOperations.value[id] ||
        !!graphs.value[id]?.nodes.some((node) => isChatExecutionStatusBlocking(node.status)))
    )
  })
  const canCancel = computed(() => {
    const id = conversationId.value
    return (
      !!id &&
      !!graphs.value[id]?.nodes.some(
        (node) =>
          node.role === 'assistant' &&
          node.observationAvailable !== false &&
          isChatExecutionStatusActive(node.status),
      )
    )
  })
  function projectGraph(id: string) {
    const graph = graphs.value[id]
    if (!graph) return
    const previous = new Map((transcripts.value[id] ?? []).map((turn) => [turn.id, turn]))
    transcripts.value = {
      ...transcripts.value,
      [id]: selectedPath(graph, branches.value[id] ?? {}).map((node) => ({
        ...previous.get(node.id),
        attachmentRefs: node.attachmentRefs,
        observationAvailable: node.observationAvailable,
        id: node.id,
        parentId: node.parentId,
        siblings: siblings(graph, node).map((item) => item.id),
        role: node.role,
        text: node.content,
        executionId: node.executionId,
        error: '',
        status: node.status,
        approval: '',
        verification: '',
        toolEvents: [],
        artifactError: '',
        artifacts: [],
        ...(node.response ? { ...node.response, text: node.response.answer || node.content } : {}),
        plan: previous.get(node.id)?.plan,
      })),
    }
  }
  const graphReadTickets = new Map<string, number>()
  async function refreshGraph(id = conversationId.value) {
    if (!id) return
    const ticket = (graphReadTickets.get(id) ?? 0) + 1
    graphReadTickets.set(id, ticket)
    const graph = validateChatGraph(await api.chatGraph(id), id)
    if (graphReadTickets.get(id) !== ticket) return
    if (graphs.value[id] && graph.revision < graphs.value[id]!.revision) return
    graphs.value = { ...graphs.value, [id]: graph }
    projectGraph(id)
    graphUnavailable.value = false
  }
  let branchEpoch = 0
  function switchBranch(id: string) {
    branchEpoch++
    const conversation = conversationId.value
    if (!conversation || !graphs.value[conversation]) return
    branches.value = {
      ...branches.value,
      [conversation]: selectBranch(
        graphs.value[conversation]!,
        branches.value[conversation] ?? {},
        id,
      ),
    }
    projectGraph(conversation)
    persist()
    refreshPlan()
  }
  let restoration = saved ? { activeId: saved.activeId, scratch: saved.scratch } : null
  let scratch = saved?.scratch
  saved = null
  watch(
    context,
    (value) => {
      const item = history.value.find((row) => row.id === conversationId.value)
      if (item) item.context = JSON.parse(JSON.stringify(value))
      else persist()
    },
    { deep: true, flush: 'sync' },
  )
  const historyWriter = createChatHistoryWriter(
    storage,
    () => ({
      version: 2,
      items: history.value,
      branches: branches.value,
      scroll: scrollPreferences.value,
      pendingOperations: pendingOperations.value,
      activeId: conversationId.value ?? undefined,
      scratch: conversationId.value ? scratch : { draft: draft.value, context: context.value },
    }),
    () => {
      storageError.value = true
    },
  )
  const persist = historyWriter.flush
  // Streaming turns are replaced immutably. Avoid a deep traversal and a full
  // synchronous serialization for every delta, while keeping edits durable.
  watch([branches, pendingOperations], persist, { deep: true, flush: 'sync' })
  watch([history, conversationId], persist, { deep: true, flush: 'sync' })
  watch(
    draft,
    (value) => {
      const item = history.value.find((x) => x.id === conversationId.value)
      if (item) item.draft = value
      else persist()
    },
    { flush: 'sync' },
  )
  function renameConversation(id: string, title: string) {
    const item = history.value.find((x) => x.id === id)
    if (item && title.trim()) item.title = title.trim().slice(0, 100)
  }
  function archiveConversation(id: string, archived: boolean) {
    if (inflight.value[id] != null) return
    const item = history.value.find((x) => x.id === id)
    if (!item) return
    item.archived = archived
    if (archived && conversationId.value === id) {
      conversationId.value = null
      draft.value = ''
      boundConnectionId.value = null
      pendingConnectionId.value = null
    }
  }
  async function deleteConversation(id: string) {
    if (inflight.value[id] != null) return
    await api.deleteAiConversation?.(id)
    history.value = history.value.filter((x) => x.id !== id)
    const next = { ...transcripts.value }
    delete next[id]
    transcripts.value = next
    if (conversationId.value === id) {
      conversationId.value = null
      draft.value = ''
      boundConnectionId.value = null
      pendingConnectionId.value = null
    }
  }

  const turns = computed(() =>
    conversationId.value ? (transcripts.value[conversationId.value] ?? []) : [],
  )
  const knowledgeMemoryCleared = computed(
    () =>
      history.value.find((item) => item.id === conversationId.value)?.knowledgeMemoryCleared ===
      true,
  )
  const contextMemoryCleared = computed(
    () =>
      history.value.find((item) => item.id === conversationId.value)?.contextMemoryCleared === true,
  )
  const sending = computed(() =>
    conversationId.value ? inflight.value[conversationId.value] != null : false,
  )

  let restoringSelection = false
  async function restoreLastConversation() {
    const startup = restoration
    restoration = null
    restoringSelection = true
    try {
      if (
        startup?.activeId &&
        history.value.some((item) => item.id === startup.activeId && !item.archived)
      )
        await selectConversation(startup.activeId)
      else if (startup?.scratch && typeof startup.scratch.draft === 'string') {
        draft.value = startup.scratch.draft
        if (startup.scratch.context) context.value = startup.scratch.context
      }
    } catch {
      storageError.value = true
    } finally {
      restoringSelection = false
    }
  }

  let statusRequest: Promise<void> | undefined
  function refreshStatus(): Promise<void> {
    return (statusRequest ??= loadStatus().finally(() => {
      statusRequest = undefined
    }))
  }
  async function loadStatus() {
    try {
      status.value = await api.aiStatus()
      phase.value = 'ready'
    } catch {
      status.value = null
      phase.value = 'offline'
    }
  }

  function rememberScratch() {
    if (!conversationId.value && !restoringSelection)
      scratch = { draft: draft.value, context: JSON.parse(JSON.stringify(context.value)) }
  }
  function beginDraft() {
    rememberScratch()
    selectionVersion++
    sessionUnavailable.value = false
    checkingConversation.value = false
    reconnectNotice.value = ''
    conversationId.value = null
    draft.value = scratch?.draft ?? ''
    expired.value = false
    failure.value = ''
    pendingConnectionId.value = null
    targetNotice.value = ''
    context.value = { ...emptyContext(), ...structuredClone(scratch?.context ?? {}) }
  }

  async function openConversation() {
    if (opening.value) throw new Error(ChatErrors.CONVERSATION_BUSY)
    opening.value = true
    const origin = selectionVersion
    try {
      const created = await api.openAiConversation()
      history.value.unshift({
        id: created.conversationId,
        title: '',
        archived: false,
        updatedAt: new Date().toISOString(),
        draft: '',
        workspaceLabel: created.workspaceLabel,
        memory: created.memory,
        connectionId: created.connectionId ?? null,
        model: created.model ?? '',
      })
      transcripts.value = { ...transcripts.value, [created.conversationId]: [] }
      if (origin !== selectionVersion) return created
      scratch = undefined
      conversationId.value = created.conversationId
      selectionVersion++
      sessionUnavailable.value = false
      checkingConversation.value = false
      draft.value = ''
      expired.value = false
      workspaceLabel.value = created.workspaceLabel
      memoryNote.value = created.memory
      workingMemory.value = created.workingMemory ?? null
      boundConnectionId.value = created.connectionId ?? null
      boundModel.value = created.model ?? ''
      context.value = emptyContext()
      pendingConnectionId.value = null
      targetNotice.value = ''
      if (!transcripts.value[created.conversationId]) {
        transcripts.value = { ...transcripts.value, [created.conversationId]: [] }
      }
      await refreshGraph(created.conversationId)
      failure.value = ''
      return created
    } finally {
      opening.value = false
    }
  }

  async function saveWorkingMemory(body: {
    expectedUpdatedAt?: string
    goal?: string
    constraints?: string[]
    facts?: Array<{ kind: string; id: string; revisionOrDigest: string }>
    evidenceRefs?: string[]
    dependencyKeys?: string[]
  }) {
    const id = conversationId.value
    const version = selectionVersion
    if (!id || !api.putWorkingMemory) return null
    const snapshot = await api.putWorkingMemory(id, {
      ...body,
      expectedUpdatedAt:
        body.expectedUpdatedAt ?? workingMemory.value?.updatedAt ?? '1970-01-01T00:00:00Z',
    })
    if (conversationId.value === id && selectionVersion === version) workingMemory.value = snapshot
    return snapshot
  }

  async function selectConversation(id: string) {
    if (!history.value.some((item) => item.id === id)) return
    if (conversationId.value === id) return recheckConversation()
    rememberScratch()
    selectionVersion++
    reconnectNotice.value = ''
    conversationId.value = id
    const item = history.value.find((x) => x.id === id)
    draft.value = item?.draft ?? ''
    workspaceLabel.value = item?.workspaceLabel ?? ''
    memoryNote.value = item?.memory ?? ''
    workingMemory.value = null
    boundConnectionId.value = item?.connectionId ?? null
    boundModel.value = item?.model ?? ''
    pendingConnectionId.value = null
    targetNotice.value = ''
    context.value = item?.context
      ? { ...emptyContext(), ...structuredClone(JSON.parse(JSON.stringify(item.context))) }
      : emptyContext()
    failure.value = ''
    expired.value = !!item?.expired
    sessionUnavailable.value = false
    await recheckConversation()
  }

  const conversationRequests = new Map<
    string,
    Promise<Awaited<ReturnType<NonNullable<ChatApi['aiConversation']>>>>
  >()
  function applyBinding(
    id: string,
    binding: { connectionId?: string | null; model?: string | null },
    selected = true,
  ) {
    const item = history.value.find((row) => row.id === id)
    if (item) {
      item.connectionId = binding.connectionId ?? null
      item.model = binding.model ?? ''
    }
    if (selected && conversationId.value === id) {
      boundConnectionId.value = binding.connectionId ?? null
      boundModel.value = binding.model ?? ''
    }
  }
  async function recheckConversation() {
    const id = conversationId.value
    if (!id || !api.aiConversation || reconnecting.value || changingConnection.value) return false
    const item = history.value.find((row) => row.id === id)
    const version = selectionVersion
    const active = () => conversationId.value === id && selectionVersion === version
    checkingConversation.value = true
    try {
      let request = conversationRequests.get(id)
      if (!request) {
        request = api.aiConversation(id).finally(() => {
          conversationRequests.delete(id)
        })
        conversationRequests.set(id, request)
      }
      const live = await request
      await refreshGraph(id)
      if (!active()) return false
      applyBinding(id, live)
      memoryNote.value = live.memory || memoryNote.value
      workingMemory.value = live.workingMemory ?? null
      if (live.workspaceLabel) workspaceLabel.value = live.workspaceLabel
      expired.value = false
      sessionUnavailable.value = false
      if (item) {
        item.expired = false
        item.memory = live.memory || item.memory
      }
      return true
    } catch (error) {
      if (!active()) return false
      if (httpStatus(error) === 404) {
        expired.value = true
        if (item) item.expired = true
        sessionUnavailable.value = false
      } else sessionUnavailable.value = true
      return false
    } finally {
      if (active()) checkingConversation.value = false
    }
  }

  let connectionsRequest: Promise<ModelConnectionList | undefined> | undefined
  let connectionsRevision = 0
  /** Accept the editor's saved readback without changing the current or pending target. */
  function applyConnectionDirectory(items: ModelConnection[]) {
    connectionsRevision += 1
    connectionsRequest = undefined
    connections.value = [...items]
  }
  function loadConnections(): Promise<ModelConnectionList | undefined> {
    if (!api.modelConnections) return Promise.resolve(undefined)
    if (connectionsRequest) return connectionsRequest
    const revision = connectionsRevision
    const request: Promise<ModelConnectionList | undefined> = api
      .modelConnections()
      .then((page) => {
        if (revision !== connectionsRevision) return undefined
        connections.value = page.items
        return page
      })
      .catch((error: unknown) => {
        if (revision !== connectionsRevision) return undefined
        throw error
      })
      .finally(() => {
        if (connectionsRequest === request) connectionsRequest = undefined
      })
    connectionsRequest = request
    return request
  }
  async function refreshConnections(): Promise<void> {
    const page = await loadConnections()
    if (page && !conversationId.value && !pendingConnectionId.value) {
      const selected = page.items.find(
        (item) =>
          item.id === page.effectiveDefaultId &&
          item.enabled &&
          item.allowedModels.includes(item.defaultModel),
      )
      if (selected) chooseConversationConnection(selected.id, selected.defaultModel)
    }
  }

  function chooseConversationConnection(id: string, model: string) {
    if (sending.value || reconnecting.value || changingConnection.value) return
    if (
      id === boundConnectionId.value &&
      model === boundModel.value &&
      failure.value !== 'target-changed'
    ) {
      pendingConnectionId.value = null
      targetNotice.value = ''
      return
    }
    pendingConnectionId.value = id
    pendingModel.value = model
    const target = connections.value.find((item) => item.id === id)
    targetNotice.value = target ? target.name + ' · ' + model : id
  }

  async function confirmConnectionChange() {
    const id = conversationId.value
    const next = pendingConnectionId.value
    if (
      !id ||
      !next ||
      !api.assignConversationConnection ||
      sending.value ||
      reconnecting.value ||
      changingConnection.value ||
      checkingConversation.value
    )
      return
    const version = selectionVersion
    const active = () => conversationId.value === id && selectionVersion === version
    changingConnectionIds.value = { ...changingConnectionIds.value, [id]: true }
    let assigned
    try {
      assigned = await api.assignConversationConnection(id, next, true, pendingModel.value)
    } catch {
      if (active()) failure.value = 'target-change-failed'
      return
    } finally {
      const next = { ...changingConnectionIds.value }
      delete next[id]
      changingConnectionIds.value = next
    }
    applyBinding(id, assigned, active())
    if (!active()) return
    failure.value = ''
    pendingConnectionId.value = null
    targetNotice.value = assigned.memoryCleared ? 'cleared' : 'kept'
  }

  function cancelConnectionChange() {
    if (changingConnection.value) return
    pendingConnectionId.value = null
    targetNotice.value = ''
  }

  async function reconnectConversation() {
    const id = conversationId.value
    const item = history.value.find((row) => row.id === id)
    if (
      !id ||
      !item ||
      item.archived ||
      inflight.value[id] != null ||
      reconnectingIds.value[id] ||
      changingConnectionIds.value[id] ||
      !api.reconnectAiConversation
    )
      return
    const targetId = pendingConnectionId.value || item.connectionId
    const model = pendingConnectionId.value ? pendingModel.value : item.model
    const target = connections.value.find((row) => row.id === targetId && row.enabled)
    if (
      !targetId ||
      !model ||
      !target?.allowedModels.includes(model) ||
      !target.models.some((row) => row.id === model)
    ) {
      failure.value = 'model-unavailable'
      return
    }
    const version = selectionVersion
    const active = () => conversationId.value === id && selectionVersion === version
    reconnectingIds.value = { ...reconnectingIds.value, [id]: true }
    try {
      const result = await api.reconnectAiConversation(id, item.workspaceLabel, targetId, model)
      reconnectResults.value = { ...reconnectResults.value, [id]: result }
      applyBinding(id, result, active())
      item.expired = false
      if (active()) {
        memoryNote.value = result.memory
        workingMemory.value = result.workingMemory ?? null
        pendingConnectionId.value = null
        targetNotice.value = ''
        expired.value = false
        sessionUnavailable.value = false
        failure.value = ''
        reconnectNotice.value = result.contextReset || result.memoryCleared ? 'reset' : 'kept'
      }
      return { ...result, readyToRetry: active() }
    } catch (error) {
      if (active())
        failure.value =
          (error as { response?: { data?: { code?: string } } })?.response?.data?.code ===
          ChatErrors.CONVERSATION_WORKSPACE_CHANGED
            ? 'workspace-changed'
            : 'reconnect-failed'
      return
    } finally {
      const next = { ...reconnectingIds.value }
      delete next[id]
      reconnectingIds.value = next
    }
  }

  async function send(outgoingContext?: TaskContext, requestedTools?: AiToolMode) {
    if (
      opening.value ||
      reconnecting.value ||
      changingConnection.value ||
      checkingConversation.value ||
      sessionUnavailable.value
    )
      return
    const requestContext = outgoingContext ?? context.value
    const planning = requestContext.mode === 'plan'
    const selectedToolMode = planning ? AiToolMode.NONE : (requestedTools ?? toolMode.value)
    const selected = connections.value.find(
      (item) => item.id === (pendingConnectionId.value || boundConnectionId.value),
    )
    if (
      selectedToolMode !== AiToolMode.NONE &&
      (selected?.kind === 'chatgpt-plan' ||
        (selectedToolMode === AiToolMode.GIT_STATUS && selected?.wireApi === 'responses'))
    ) {
      failure.value = 'protocol-tools-unavailable'
      return
    }
    if (
      requestContext.skillRef &&
      (requestContext.mode === 'code' ||
        selectedToolMode !== AiToolMode.NONE ||
        requestContext.knowledgeExpertRef ||
        requestContext.taskRef)
    ) {
      failure.value = 'skill-unavailable'
      return
    }
    if (requestContext.knowledgeExpertRef) {
      if (requestContext.mode === 'code' || selectedToolMode !== AiToolMode.NONE) {
        failure.value = 'knowledge-unavailable'
        return
      }
      if (draft.value.length > 500) {
        failure.value = 'knowledge-limit'
        return
      }
    }
    if (!conversationId.value && draft.value.trim()) {
      const text = draft.value
      const selectedContext = JSON.parse(JSON.stringify(context.value)) as TaskContext
      const nextId = pendingConnectionId.value
      const nextModel = pendingModel.value
      const origin = selectionVersion
      let openedId: string | undefined
      try {
        const created = await openConversation()
        openedId = created.conversationId
        if (selectionVersion !== origin + 1 || conversationId.value !== created.conversationId)
          return
        draft.value = text
        context.value = selectedContext
        if (nextId) {
          chooseConversationConnection(nextId, nextModel)
          await confirmConnectionChange()
        }
      } catch {
        if (selectionVersion !== origin && conversationId.value !== openedId) return
        draft.value = text
        context.value = selectedContext
        failure.value = 'failed'
        return
      }
    }
    const id = conversationId.value
    const text = draft.value
    if (
      !id ||
      expired.value ||
      history.value.find((x) => x.id === id)?.archived ||
      inflight.value[id] != null ||
      (!text.trim() && !requestContext.attachmentRefs?.length) ||
      pendingConnectionId.value
    )
      return
    await generate(id, 'send', null, text, requestContext, selectedToolMode)
  }

  const preparing = new Set<string>()
  async function generate(
    id: string,
    kind: ChatGraphRequest['kind'],
    targetId: string | null,
    text: string,
    requestContext = context.value,
    mode = toolMode.value,
  ) {
    if (preparing.has(id)) return
    preparing.add(id)
    try {
      await generatePrepared(id, kind, targetId, text, requestContext, mode)
    } catch (error) {
      if (conversationId.value === id)
        failure.value = error instanceof Error ? error.message : 'failed'
    } finally {
      preparing.delete(id)
    }
  }
  async function generatePrepared(
    id: string,
    kind: ChatGraphRequest['kind'],
    targetId: string | null,
    text: string,
    requestContext = context.value,
    mode = toolMode.value,
  ) {
    if (
      inflight.value[id] != null ||
      pendingOperations.value[id] ||
      reconnecting.value ||
      changingConnection.value ||
      checkingConversation.value ||
      expired.value ||
      pendingConnectionId.value
    )
      return
    if (!graphs.value[id]) await refreshGraph(id)
    const graph = graphs.value[id]!
    if (graph.nodes.some((node) => isChatExecutionStatusBlocking(node.status))) {
      failure.value = 'kept'
      return
    }
    const target = targetId ? graph.nodes.find((node) => node.id === targetId) : null
    if (kind !== 'send' && !target) return
    const path = selectedPath(graph, branches.value[id] ?? {})
    const parent = kind === 'send' ? (path.at(-1)?.id ?? null) : target!.parentId
    if (kind === 'send' && path.at(-1)?.role === 'user') return
    const requestCopy = JSON.parse(JSON.stringify(requestContext)) as TaskContext
    if (kind !== 'send') {
      requestCopy.files = []
      requestCopy.attachmentRefs = (
        (kind === 'regenerate' ? graph.nodes.find((node) => node.id === parent) : target)
          ?.attachmentRefs ?? []
      ).map((ref) => ({ ...ref }))
    }
    const store = attachmentStore.value
    // Old unsent text drafts are moved to local originals before the first new send.
    if (requestCopy.files.length) {
      if (!store) throw new Error('attachment.storageUnavailable')
      const migrated = await store.select(
        requestCopy.files.map(
          (file) => new File([file.content], file.name, { type: 'text/plain' }),
        ),
        attachmentOwner.value,
      )
      requestCopy.attachmentRefs = [
        ...(requestCopy.attachmentRefs ?? []),
        ...migrated.map(({ kind: _kind, ...ref }) => ref),
      ]
      requestCopy.files = []
      if (conversationId.value === id)
        context.value = { ...context.value, files: [], attachmentRefs: requestCopy.attachmentRefs }
    }
    const ancestors = parent ? selectedPath(graph, selectBranch(graph, {}, parent)) : []
    const parentIndex = ancestors.findIndex((node) => node.id === parent)
    const historicalRefs = ancestors
      .slice(0, parentIndex + 1)
      .flatMap((node) => node.attachmentRefs ?? [])
    const refs = [
      ...new Map(
        [...historicalRefs, ...(requestCopy.attachmentRefs ?? [])].map((ref) => [ref.id, ref]),
      ).values(),
    ]
    const connection = connections.value.find(
      (item) => item.id === history.value.find((item) => item.id === id)?.connectionId,
    )
    const model = connection?.models.find(
      (item) => item.id === history.value.find((item) => item.id === id)?.model,
    )
    const transientAttachments = []
    if (store && requestCopy.attachmentRefs?.length) {
      await store.retain(`draft:${id}`, localRefs(requestCopy.attachmentRefs))
      for (const ref of requestCopy.attachmentRefs) await store.remove('draft:scratch', ref.id)
    }
    if (refs.length) {
      if (!store) throw new Error('attachment.storageUnavailable')
      const prepared = await store.prepareSubmission(localRefs(refs), {
        imageMimeTypes:
          model?.supportsImageInput === true
            ? ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
            : [],
      })
      for (const item of prepared) {
        const bytes = new Uint8Array(await item.blob.arrayBuffer())
        let binary = ''
        for (const byte of bytes) binary += String.fromCharCode(byte)
        const { kind: _kind, ...ref } = item.ref
        transientAttachments.push({ ...ref, base64: btoa(binary) })
      }
    }
    const operationId = crypto.randomUUID()
    pendingOperations.value = { ...pendingOperations.value, [id]: operationId }
    const current = ++ticket
    inflight.value = { ...inflight.value, [id]: current }
    const request: ChatGraphRequest = {
      operationId,
      expectedRevision: graph.revision,
      kind,
      parentMessageId: parent,
      targetMessageId: targetId,
      message: text,
      toolMode: mode,
      context: requestCopy,
      ...(transientAttachments.length ? { transientAttachments } : {}),
    }
    const generationSelectionVersion = selectionVersion
    const generationBranchEpoch = branchEpoch
    let operationSelected = false
    let execution = ''
    let lastSequence = -1
    const controller = new AbortController()
    abortControllers.value = { ...abortControllers.value, [id]: controller }
    const selectOperation = async (requireBinding = false) => {
      await refreshGraph(id)
      const operation = graphs.value[id]?.operations.find(
        (item) => item.operationId === operationId,
      )
      if (!operation && requireBinding) throw new Error('INVALID_CHAT_GRAPH')
      if (operation) {
        execution = operation.executionId
        if (requestCopy.attachmentRefs?.length && store)
          await store.retain(
            `message:${operation.userMessageId}`,
            localRefs(requestCopy.attachmentRefs),
          )
        if (!operationSelected && generationBranchEpoch === branchEpoch)
          branches.value = {
            ...branches.value,
            [id]: selectBranch(
              graphs.value[id]!,
              branches.value[id] ?? {},
              operation.assistantMessageId,
            ),
          }
        operationSelected = true
        projectGraph(id)
      }
    }
    let eventQueue = Promise.resolve()
    try {
      const result = await api.sendAiMessage(id, request, {
        signal: controller.signal,
        onEvent(event) {
          eventQueue = eventQueue
            .then(async () => {
              if (
                inflight.value[id] !== current ||
                event.conversationId !== id ||
                event.sequence <= lastSequence ||
                (execution && event.executionId !== execution)
              )
                return
              // Server graph confirms the operation/execution association before any event mutates a turn.
              if (!graphs.value[id]?.operations.some((item) => item.operationId === operationId))
                await selectOperation()
              const operation = graphs.value[id]?.operations.find(
                (item) => item.operationId === operationId,
              )
              if (!operation) return
              if (event.executionId !== operation.executionId) return
              execution = operation.executionId
              lastSequence = event.sequence
              const node = graphs.value[id]?.nodes.find(
                (item) => item.id === operation.assistantMessageId,
              )
              if (!node) return
              if (event.type === 'answer.delta' && !node.response) node.content += event.text || ''
              if (event.status && isChatExecutionStatus(event.status)) node.status = event.status
              projectGraph(id)
              const index = transcripts.value[id]?.findIndex((turn) => turn.id === node.id) ?? -1
              if (index >= 0) {
                if (event.type === 'reasoning.delta') {
                  const turns = [...transcripts.value[id]!]
                  turns[index] = {
                    ...turns[index]!,
                    reasoning: (turns[index]!.reasoning ?? '') + (event.text || ''),
                  }
                  transcripts.value = { ...transcripts.value, [id]: turns }
                }
                const observer = observePlan(id, index, execution)
                if (event.type === 'plan.updated') observer?.event(event.payload)
              }
            })
            .catch(() => {
              graphUnavailable.value = true
            })
        },
      })
      await eventQueue
      await selectOperation(true)
      if (api.aiConversation) {
        try {
          const live = await api.aiConversation(id)
          if (conversationId.value === id && selectionVersion === generationSelectionVersion)
            workingMemory.value = live.workingMemory ?? null
        } catch {
          /* The generation is confirmed; retain the last observed memory snapshot. */
        }
      }
      const next = { ...pendingOperations.value }
      delete next[id]
      pendingOperations.value = next
      const entry = history.value.find((item) => item.id === id)
      if (entry) {
        entry.updatedAt = new Date().toISOString()
        entry.title ||= text.slice(0, 50)
        if (result.contextMemoryCleared) entry.contextMemoryCleared = true
        if (result.knowledgeMemoryCleared) entry.knowledgeMemoryCleared = true
      }
      if (kind === 'send' && result.status === ChatExecutionStatus.SUCCEEDED && !result.error) {
        const sentRefs = requestCopy.attachmentRefs ?? []
        if (store && sentRefs.length) {
          const currentIds = (context.value.attachmentRefs ?? []).map((ref) => ref.id).join(',')
          if (conversationId.value === id && currentIds === sentRefs.map((ref) => ref.id).join(','))
            context.value = { ...context.value, attachmentRefs: [] }
          if (
            entry?.context?.attachmentRefs?.map((ref) => ref.id).join(',') ===
            sentRefs.map((ref) => ref.id).join(',')
          )
            entry.context = { ...entry.context, attachmentRefs: [] }
          for (const ref of sentRefs) await store.remove(`draft:${id}`, ref.id)
        }
        if (entry?.draft === text) entry.draft = ''
        if (conversationId.value === id && draft.value === text) draft.value = ''
      }
      if (conversationId.value === id) {
        lastContextBudget.value = result.contextBudget ?? null
        failure.value = result.error
          ? (generationFailure({ response: { data: { code: result.error } } }) ?? 'kept')
          : result.status === ChatExecutionStatus.SUCCEEDED
            ? ''
            : 'kept'
      }
    } catch (error) {
      await eventQueue
      const status = httpStatus(error)
      const data = (
        error as {
          response?: {
            data?: {
              code?: string
              error?: string
              contextMemoryCleared?: boolean
              knowledgeMemoryCleared?: boolean
            }
          }
        }
      )?.response?.data
      const entry = history.value.find((item) => item.id === id)
      if (entry && data?.contextMemoryCleared === true) entry.contextMemoryCleared = true
      if (entry && data?.knowledgeMemoryCleared === true) entry.knowledgeMemoryCleared = true
      const observed = contextBudgetFromError(error)
      if (conversationId.value === id && observed) lastContextBudget.value = observed
      const accepted =
        execution || graphs.value[id]?.operations.some((item) => item.operationId === operationId)
      const expiredBeforeAcceptance =
        !accepted &&
        status === 404 &&
        (data?.code ?? data?.error) === ChatErrors.UNKNOWN_CONVERSATION
      if (expiredBeforeAcceptance && entry) entry.expired = true
      if (
        expiredBeforeAcceptance &&
        conversationId.value === id &&
        selectionVersion === generationSelectionVersion
      ) {
        expired.value = true
        sessionUnavailable.value = false
      }
      // A definite HTTP rejection before acceptance is distinct from losing an accepted response.
      if (
        status &&
        !accepted &&
        ((status >= 400 && status < 500) ||
          (data?.code ?? data?.error) === ModelErrors.AI_NOT_CONFIGURED)
      ) {
        const next = { ...pendingOperations.value }
        delete next[id]
        pendingOperations.value = next
      }
      try {
        await refreshGraph(id)
      } catch {
        graphUnavailable.value = true
      }
      if (conversationId.value === id) {
        const code = data?.code ?? data?.error
        failure.value = expiredBeforeAcceptance
          ? ''
          : (generationFailure(error) ??
            (code === ModelErrors.AI_NOT_CONFIGURED
              ? 'not-configured'
              : code === ChatErrors.CONTEXT_BUDGET_EXCEEDED
                ? 'context-budget-exceeded'
                : pendingOperations.value[id]
                  ? 'response-uncertain'
                  : 'failed'))
      }
    } finally {
      const next = { ...inflight.value }
      delete next[id]
      inflight.value = next
      const abort = { ...abortControllers.value }
      delete abort[id]
      abortControllers.value = abort
      persist()
    }
  }
  async function recoverOperation() {
    const id = conversationId.value
    const operationId = id && pendingOperations.value[id]
    if (!id || !operationId) return
    try {
      const operation = await api.chatOperation(id, operationId)
      await refreshGraph(id)
      branches.value = {
        ...branches.value,
        [id]: selectBranch(
          graphs.value[id]!,
          branches.value[id] ?? {},
          operation.assistantMessageId,
        ),
      }
      projectGraph(id)
      const next = { ...pendingOperations.value }
      delete next[id]
      pendingOperations.value = next
      failure.value = ''
    } catch {
      failure.value = 'response-uncertain'
    }
  }
  async function editMessage(id: string, text: string) {
    const conversation = conversationId.value
    if (
      !conversation ||
      (!text.trim() &&
        !graphs.value[conversation]?.nodes.find((node) => node.id === id)?.attachmentRefs
          ?.length) ||
      graphs.value[conversation]?.nodes.find((node) => node.id === id)?.role !== 'user'
    )
      return
    await generate(conversation, 'edit', id, text)
  }
  async function regenerateMessage(id: string) {
    const conversation = conversationId.value
    if (
      !conversation ||
      graphs.value[conversation]?.nodes.find((node) => node.id === id)?.role !== 'assistant'
    )
      return
    await generate(conversation, 'regenerate', id, '')
  }
  async function cancelSend() {
    const id = conversationId.value
    if (!id) return
    const graph = graphs.value[id]
    const operationId = pendingOperations.value[id]
    const operation = graph?.operations.find((item) => item.operationId === operationId)
    const executionId =
      operation?.executionId ??
      graph?.nodes.find((node) => isChatExecutionStatusActive(node.status))?.executionId
    if (!executionId) {
      await recoverOperation()
      return
    }
    try {
      await api.cancelAiExecution(id, executionId)
      await refreshGraph(id)
    } catch {
      failure.value = 'response-uncertain'
    }
  }

  return {
    legacyHistoryExport: () => exportLegacyChatHistory(storage),
    attachmentStore,
    attachmentOwner,
    attachmentPreviews,
    attachFiles,
    removeAttachment,
    webSourceServices,
    webSourcesUnavailable,
    refreshWebSources,
    scrollPreferences,
    setScrollPreference,
    graphs,
    branches,
    graphUnavailable,
    generationBlocking,
    canCancel,
    pendingOperations,
    refreshGraph,
    switchBranch,
    editMessage,
    regenerateMessage,
    recoverOperation,
    flushPersistence: persist,
    inflight,
    history,
    storageError,
    refreshPlan,
    expired,
    reconnecting,
    changingConnection,
    reconnectNotice,
    reconnectResults,
    sessionUnavailable,
    checkingConversation,
    recheckConversation,
    renameConversation,
    archiveConversation,
    deleteConversation,
    phase,
    opening,
    status,
    conversationId,
    workspaceLabel,
    memoryNote,
    workingMemory,
    saveWorkingMemory,
    knowledgeMemoryCleared,
    contextMemoryCleared,
    transcripts,
    turns,
    draft,
    toolMode,
    context,
    failure,
    lastContextBudget,
    sending,
    refreshStatus,
    restoreLastConversation,
    openConversation,
    beginDraft,
    selectConversation,
    send,
    cancelSend,
    connections,
    boundConnectionId,
    boundModel,
    pendingModel,
    pendingConnectionId,
    targetNotice,
    refreshConnections,
    applyConnectionDirectory,
    chooseConversationConnection,
    confirmConnectionChange,
    cancelConnectionChange,
    reconnectConversation,
  }
}
