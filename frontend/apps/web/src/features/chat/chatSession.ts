import { AiToolMode, ChatErrors } from '@eap/runtime-client'

import { hasWireValue } from '@eap/runtime-client'
import { ChatExecutionStatus } from '@eap/runtime-client'
import { AgentErrors, CodeErrors, ModelErrors } from '@eap/runtime-client'
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
import { contextBudgetFromError } from './contextBudgetView'
import { runtimeLanguage } from '@eap/runtime-client'
import { createChatHistoryWriter, readChatHistory, type ChatHistorySnapshot } from './chatHistory'

export type ChatApi = {
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
  sendAiMessage: (
    id: string,
    message: string,
    toolMode: AiToolMode,
    context?: TaskContext,
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
        payload?: unknown
      }) => void
    },
  ) => Promise<AiMessageResult>
  cancelAiConversation?: (id: string) => Promise<{ cancelled: boolean; executionId: string }>
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
    if (saved?.version === 1 && Array.isArray(saved.items))
      history.value = saved.items.filter(
        (x: ConversationHistory) =>
          typeof x.id === 'string' && typeof x.title === 'string' && typeof x.draft === 'string',
      )
  } catch {
    storageError.value = true
  }
  const opening = ref(false)
  const phase = ref<'loading' | 'ready' | 'offline'>('loading')
  const status = ref<AiStatus | null>(null)
  const conversationId = ref<string | null>(null)
  const workspaceLabel = ref('')
  const memoryNote = ref('')
  const workingMemory = ref<TaskWorkingMemorySnapshot | null>(null)
  const transcripts = ref<Record<string, ChatTurn[]>>({})
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
  try {
    if (saved?.version === 1 && saved.transcripts && typeof saved.transcripts === 'object') {
      for (const item of history.value)
        if (Array.isArray(saved.transcripts[item.id]))
          transcripts.value[item.id] = saved.transcripts[item.id]!
    }
  } catch {
    storageError.value = true
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
      version: 1,
      items: history.value,
      transcripts: transcripts.value,
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
  watch(transcripts, historyWriter.schedule, { flush: 'sync' })
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
    if (!transcripts.value[id]) return
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

  function append(id: string, turn: ChatTurn) {
    const existing = transcripts.value[id] ?? []
    transcripts.value = { ...transcripts.value, [id]: [...existing, turn] }
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
      !text.trim() ||
      pendingConnectionId.value
    )
      return
    const entry = history.value.find((x) => x.id === id)
    if (entry) {
      if (!entry.title) entry.title = text.trim().slice(0, 50)
      entry.updatedAt = new Date().toISOString()
    }
    if (entry) entry.context = JSON.parse(JSON.stringify(context.value)) as TaskContext
    const requestMetadata = {
      ...(planning && requestContext.taskRef
        ? { planningTask: { ...requestContext.taskRef } }
        : {}),
      model: boundModel.value,
      connectionName:
        connections.value.find((item) => item.id === boundConnectionId.value)?.name ?? '',
      reasoning: requestContext.reasoning,
    }
    const mode = selectedToolMode
    const requestLanguage = runtimeLanguage()
    const current = ++ticket
    let receivedEvent = false
    const controller = new AbortController()
    abortControllers.value = { ...abortControllers.value, [id]: controller }
    inflight.value = { ...inflight.value, [id]: current }
    append(id, {
      ...requestMetadata,
      role: 'user',
      text,
      error: '',
      status: '',
      approval: '',
      verification: '',
      toolEvents: [],
      artifactError: '',
      artifacts: [],
    })
    const assistantIndex = transcripts.value[id]?.length ?? 0
    append(id, {
      ...requestMetadata,
      role: 'assistant',
      text: '',
      error: '',
      status: ChatExecutionStatus.RUNNING,
      approval: '',
      verification: '',
      toolEvents: [],
      artifactError: '',
      artifacts: [],
    })
    try {
      const result = await api.sendAiMessage(
        id,
        text,
        mode,
        {
          ...requestContext,
          files: requestContext.files.map((file) => ({ ...file })),
        },
        {
          signal: controller.signal,
          onEvent: (event) => {
            if (inflight.value[id] !== current) return
            receivedEvent = true
            const turns = transcripts.value[id]
            if (!turns || !turns[assistantIndex]) return
            const next = [...turns]
            const turn = { ...next[assistantIndex]! }
            if (event.executionId) turn.executionId = event.executionId
            if (event.type === 'answer.delta') turn.text = (turn.text || '') + (event.text || '')
            if (event.type === 'tool') {
              turn.toolEvents = [
                ...turn.toolEvents,
                {
                  sequence: event.sequence,
                  code: event.code || event.text,
                },
              ]
            }
            if (event.status) turn.status = event.status
            if (event.type === 'error') turn.error = event.code || event.text || turn.error
            if (event.message) {
              turn.errorMessage = event.message
              turn.errorLanguage = requestLanguage
            }
            next[assistantIndex] = turn
            transcripts.value = { ...transcripts.value, [id]: next }
          },
        },
      )
      if (inflight.value[id] !== current) return
      if (entry && result.contextMemoryCleared) entry.contextMemoryCleared = true
      const turns = transcripts.value[id] ? [...transcripts.value[id]!] : []
      if (conversationId.value === id && result.contextBudget)
        lastContextBudget.value = result.contextBudget
      const streamedTurn = turns[assistantIndex]
      // Only a confirmed successful result clears the failed draft.
      const succeeded = result.status === ChatExecutionStatus.SUCCEEDED && !result.error
      turns[assistantIndex] = {
        ...requestMetadata,
        role: 'assistant',
        skillContext: result.skillContext,
        contextMemoryCleared: result.contextMemoryCleared,
        knowledgeContext: result.knowledgeContext,
        knowledgeMemoryCleared: result.knowledgeMemoryCleared,
        contextBudget: result.contextBudget ?? null,
        executionId: result.executionId || streamedTurn?.executionId,
        proposal: result.proposal,
        text: result.answer || (!succeeded ? streamedTurn?.text : '') || '',
        error: result.error,
        errorMessage: result.errorMessage ?? streamedTurn?.errorMessage,
        errorLanguage: result.errorLanguage ?? streamedTurn?.errorLanguage,
        status:
          !result.status || result.status === ChatExecutionStatus.RUNNING
            ? ChatExecutionStatus.UNKNOWN
            : result.status,
        approval: result.approval,
        verification: result.verification,
        toolEvents: result.toolEvents?.length
          ? result.toolEvents
          : (streamedTurn?.toolEvents ?? []),
        artifactError: result.artifactError,
        artifacts: result.artifacts ?? [],
      }
      transcripts.value = { ...transcripts.value, [id]: turns }
      if (api.aiConversation && conversationId.value === id) {
        try {
          const live = await api.aiConversation(id)
          if (inflight.value[id] === current && conversationId.value === id) {
            workingMemory.value = live.workingMemory ?? workingMemory.value
          }
        } catch {
          /* association refresh is best-effort; send result already applied */
        }
      }
      if (succeeded) {
        if (entry && entry.draft === text) entry.draft = ''
        if (conversationId.value === id && draft.value === text) draft.value = ''
        if (conversationId.value === id) failure.value = ''
      }
      if (conversationId.value === id && !succeeded)
        failure.value =
          result.error === ModelErrors.AI_CANCELLED
            ? 'cancelled'
            : result.error === CodeErrors.CODE_PROPOSAL_TOO_LARGE
              ? 'generation-too-large'
              : result.error === ChatErrors.CONTEXT_BUDGET_EXCEEDED ||
                  result.error === 'TASK_CONTEXT_TOO_LARGE'
                ? 'context-budget-exceeded'
                : 'kept'
    } catch (error) {
      if (inflight.value[id] !== current) return
      const detail = (error as { response?: { data?: { code?: string } } } | null)?.response?.data
        ?.code
      const currentTurns = transcripts.value[id] ?? []
      // A rejected HTTP request has no accepted turn. Once streaming starts (or the
      // transport outcome is uncertain), keep its evidence rather than erasing it.
      if (
        !receivedEvent &&
        httpStatus(error) != null &&
        detail !== ModelErrors.AI_RESPONSE_INCOMPLETE
      ) {
        transcripts.value = {
          ...transcripts.value,
          [id]: currentTurns.slice(0, assistantIndex - 1),
        }
      } else {
        const next = [...currentTurns]
        const turn = next[assistantIndex]
        if (turn) {
          next[assistantIndex] = {
            ...turn,
            status: hasWireValue(
              [
                ChatExecutionStatus.SUCCEEDED,
                ChatExecutionStatus.FAILED,
                ChatExecutionStatus.CANCELLED,
                ChatExecutionStatus.REFUSED,
                ChatExecutionStatus.UNKNOWN,
              ],
              turn.status,
            )
              ? turn.status
              : ChatExecutionStatus.UNKNOWN,
            error: turn.error || detail || ModelErrors.AI_RESPONSE_INCOMPLETE,
          }
          transcripts.value = { ...transcripts.value, [id]: next }
        }
      }
      if ((error as { name?: string } | null)?.name === 'AbortError') {
        // Aborting the client wait does not acknowledge backend termination.
        if (conversationId.value === id) failure.value = 'failed'
        return
      }
      if (
        entry &&
        (error as { response?: { data?: { contextMemoryCleared?: unknown } } } | null)?.response
          ?.data?.contextMemoryCleared === true
      )
        entry.contextMemoryCleared = true
      if (
        entry &&
        (error as { response?: { data?: { knowledgeMemoryCleared?: unknown } } } | null)?.response
          ?.data?.knowledgeMemoryCleared === true
      )
        entry.knowledgeMemoryCleared = true
      const budget = contextBudgetFromError(error)
      if (conversationId.value === id && budget) lastContextBudget.value = budget
      if (httpStatus(error) === 404 && !generationFailure(error)) {
        if (conversationId.value === id) await recheckConversation()
      }
      if (conversationId.value === id)
        failure.value =
          generationFailure(error) ??
          ((error as { response?: { data?: { code?: string } } } | null)?.response?.data?.code ===
          ModelErrors.AI_CANCELLED
            ? 'cancelled'
            : httpStatus(error) === 409
              ? 'target-changed'
              : httpStatus(error) === 403
                ? 'model-unavailable'
                : httpStatus(error) === 503
                  ? 'not-configured'
                  : 'failed')
    } finally {
      const nextAbort = { ...abortControllers.value }
      delete nextAbort[id]
      abortControllers.value = nextAbort
      if (inflight.value[id] === current) {
        const next = { ...inflight.value }
        delete next[id]
        inflight.value = next
      }
      persist()
    }
  }

  async function cancelSend() {
    const id = conversationId.value
    if (!id || inflight.value[id] == null) return
    abortControllers.value[id]?.abort()
    if (api.cancelAiConversation) {
      try {
        await api.cancelAiConversation(id)
      } catch {
        // Local abort still stops the UI spinner even if the cancel POST fails.
      }
    }
  }

  return {
    flushPersistence: persist,
    inflight,
    history,
    storageError,
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
