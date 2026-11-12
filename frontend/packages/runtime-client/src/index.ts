import type { GitExecutionOperation } from './contracts/toolModels'
import type { ToolExecution } from './contracts/toolModels'
import type { ScenarioSnapshot } from './contracts/scenarioModels'
import type { ScenarioWorkflowDependencies } from './contracts/scenarioModels'
import type { ScenarioConfiguration } from './contracts/scenarioModels'
import type { TaskResult } from './contracts/capabilityModels'
import type { CapabilityItem } from './contracts/capabilityModels'
import type { CapabilityKindSummary } from './contracts/capabilityModels'
import type { McpServerItem } from './contracts/capabilityModels'
import type { RulePackSummary } from './contracts/capabilityModels'
import type { RuleFact } from './contracts/capabilityModels'
import type { RuleRequirements } from './contracts/capabilityModels'
import type { DryRunResult } from './contracts/capabilityModels'
import type { RuleValidation } from './contracts/capabilityModels'
import type { RulePackWriteResult } from './contracts/capabilityModels'
import type { TaskStatistics } from './contracts/capabilityModels'
import type { RuntimeHealth } from './contracts/runtimeModels'
import type { DataLayoutResponse } from './contracts/runtimeModels'
import type { TrustedToolResponse } from './contracts/toolModels'
import type { TrustedToolVersionProbeResult } from './contracts/toolModels'
import type { ToolExecutionReadiness } from './contracts/toolModels'
import type { ToolProcessReview } from './contracts/toolModels'
import type { ToolUnknownReviewRequest } from './contracts/toolModels'
import type { CapabilityResponse } from './contracts/capabilityModels'
import type { CliProgramItem } from './contracts/capabilityModels'
import type { CliProgramRequest } from './contracts/capabilityModels'
import type { CliProbeResult } from './contracts/capabilityModels'
import type { CliOperationRequest } from './contracts/capabilityModels'
import type { McpServerRequest } from './contracts/capabilityModels'
import type { McpProbeResult } from './contracts/capabilityModels'
import type { HandoffRecord } from './contracts/workflowModels'
import type { BoardRuntimeSnapshot } from './contracts/boardModels'
import type { BoardTask } from './contracts/boardModels'
import type { BoardCodeCandidates } from './contracts/boardModels'
import type { CodeProposalState } from './contracts/codeModels'
import type { CodeApplied } from './contracts/codeModels'
import type {
  SourceWriteReviewDetail,
  SourceWriteReviewItem,
  SourceWriteReviewRequest,
} from './contracts/codeProposal'
import type { BoardRunPage } from './contracts/boardModels'
import type { BoardReviewPage } from './contracts/boardModels'
import type { BoardReviewEvidence } from './contracts/boardModels'
import type { BoardVerificationPage } from './contracts/boardModels'
import type { BoardVerificationPlan } from './contracts/boardModels'
import type { BoardVerificationRecord } from './contracts/boardModels'
import type { BoardAppliedCandidates } from './contracts/boardModels'
import type { BoardDeliveryPage } from './contracts/boardModels'
import type { BoardDeliveryRequest } from './contracts/boardModels'
import type { BoardDelivery } from './contracts/boardModels'
import type { BoardDeliveryDecisionRequest } from './contracts/boardModels'
import type { BoardRunStart } from './contracts/boardModels'
import type { BoardRun } from './contracts/boardModels'
import type { BoardTaskDraft } from './contracts/boardModels'
import type { MissionRecord } from './contracts/workflowModels'
import type { PrototypeVersionRecord } from './contracts/workflowModels'
import type { PrototypePublicationRequest } from './contracts/workflowModels'
import type { PrototypeDeliveryRecord } from './contracts/workflowModels'
import type { MissionExecutionRecord } from './contracts/workflowModels'
import type { SqlAnalysis } from './contracts/capabilityModels'
import type { ChatExecutionEvent } from './contracts/chatModels'
import type { AiMessageResult } from './contracts/chatModels'
import type { AiToolEvent } from './contracts/chatModels'
import type { AiStatus } from './contracts/chatModels'
import type { SkillSummary } from './contracts/skillModels'
import type { SkillSnapshot } from './contracts/skillModels'
import type { SkillImportInput } from './contracts/skillModels'
import type { SkillSaveRequest } from './contracts/skillModels'
import type { SkillRef } from './contracts/skillModels'
import type { SkillContext } from './contracts/skillModels'
import type { KnowledgeExpertRef } from './contracts/chatModels'
import type { KnowledgeContext } from './contracts/capabilityModels'
import type { WorkspaceBaseline } from './contracts/codeModels'
import type { WorkspaceSource } from './contracts/codeModels'
import type { WorkspaceDirty } from './contracts/codeModels'
import type { WorkspaceFiles } from './contracts/codeModels'
import type { VerificationProbe } from './contracts/codeModels'
import type { AiConversation, ModelHistoryUsage, ModelHistorySummary } from './contracts/chatModels'
import type { AiConversationRecovery } from './contracts/chatModels'
import type { TaskWorkingMemorySnapshot } from './contracts/chatModels'
import type { AiToolMode } from './contracts/chatModels'
import type { TaskContext } from './contracts/chatModels'
import type { ChatExecutionSnapshot } from './contracts/chatModels'
import type { ChatGptLoginAttempt } from './contracts/chatModels'
import type { ChatGptLoginState } from './contracts/chatModels'
import type { ModelConnectionList } from './contracts/chatModels'
import type { ModelConnectionInput } from './contracts/chatModels'
import type { ModelConnection } from './contracts/chatModels'
import type { ModelSelection } from './contracts/chatModels'
import type { ConversationConnection } from './contracts/capabilityModels'

import {
  isBoardRuntimeActivity,
  validateCodeProposal,
  validateToolExecution,
} from './contracts/validation'

import { runtimeLanguage } from './problem'
import { isChatExecutionStatus } from './contracts/chatExecution'
export { ContextMetering } from './contracts/contextBudget'
import { ModelErrors } from './errors/modelErrors'
import { ToolErrors } from './errors/toolErrors'
import { createRequestClient, openStream, type RequestClient } from '@eap/request'
import { createExpertAgentApi } from './expertAgent'
export type {
  ExpertAgentInput,
  ExpertAgentSummary,
  ExpertAgentRun,
  ExpertAgentDetail,
  ExpertAgentResult,
} from './expertAgent'

const baseUrl = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8080/api'

let onPendingChange: ((pending: number) => void) | undefined
export function configureRuntimeRequests(options: { onPendingChange?: (pending: number) => void }) {
  onPendingChange = options.onPendingChange
}
const client = createRequestClient({
  baseURL: baseUrl,
  headers: { Accept: 'application/json' },
  headersForRequest: () => ({ 'Accept-Language': runtimeLanguage() }),
  onPendingChange: (pending) => onPendingChange?.(pending),
})

async function get<T>(path: string): Promise<T> {
  return (await client.get<T>(path)).data
}

function gitExecutionPath(operation: GitExecutionOperation) {
  if (operation !== 'git-status' && operation !== 'git-diff') {
    throw new Error(ToolErrors.TOOL_OPERATION_NOT_FOUND)
  }
  return '/cli-programs/git/operations/' + operation + '/executions'
}
const gitOperationApi = {
  start: (
    operation: GitExecutionOperation,
    requestId: string,
    options?: { signal?: AbortSignal },
  ) =>
    client
      .post<ToolExecution>(
        gitExecutionPath(operation),
        { requestId },
        {
          signal: options?.signal,
        },
      )
      .then((r) => validateToolExecution(r.data)),
  list: (operation: GitExecutionOperation, signal?: AbortSignal) =>
    client.get<{ items: ToolExecution[] }>(gitExecutionPath(operation), { signal }).then((r) => {
      r.data.items.forEach(validateToolExecution)
      return r.data
    }),
  get: (operation: GitExecutionOperation, id: string, signal?: AbortSignal) =>
    client
      .get<ToolExecution>(gitExecutionPath(operation) + '/' + encodeURIComponent(id), { signal })
      .then((r) => validateToolExecution(r.data)),
  cancel: (operation: GitExecutionOperation, id: string, signal?: AbortSignal) =>
    client
      .post<ToolExecution>(
        gitExecutionPath(operation) + '/' + encodeURIComponent(id) + '/cancel',
        {},
        { signal },
      )
      .then((r) => validateToolExecution(r.data)),
}

export const runtimeApi = {
  ...createExpertAgentApi(client),
  scenarios: () => get<{ items: ScenarioSnapshot[] }>('/scenarios'),
  scenarioWorkflowDependencies: (signal?: AbortSignal) =>
    client
      .get<ScenarioWorkflowDependencies>('/scenarios/workflows/prototype-to-code/dependencies', {
        signal,
      })
      .then(({ data }) => {
        if (
          !data ||
          data.contractVersion !== 1 ||
          data.workflow !== 'prototype-to-code' ||
          typeof data.observedAt !== 'string' ||
          !Number.isFinite(Date.parse(data.observedAt)) ||
          !Array.isArray(data.plugins) ||
          data.plugins.length !== 2 ||
          !data.plugins.some((p) => p?.id === 'builder' && p.required === true) ||
          !data.plugins.some((p) => p?.id === 'board' && p.required === false) ||
          !Array.isArray(data.services) ||
          data.services.length !== 1 ||
          data.services[0]?.id !== 'prototype-versions' ||
          data.services[0]?.state !== 'READABLE' ||
          !Array.isArray(data.resources) ||
          data.resources.length !== 1 ||
          data.resources[0]?.id !== 'prototype-version' ||
          data.resources[0]?.required !== true ||
          !Number.isSafeInteger(data.resources[0]?.count) ||
          data.resources[0]!.count < 0
        )
          throw new Error('INVALID_SCENARIO_DEPENDENCY_RESPONSE')
        return data
      }),
  scenario: (id: string) => get<ScenarioSnapshot>('/scenarios/' + encodeURIComponent(id)),
  saveScenario: (id: string, revision: number, definition: ScenarioConfiguration) =>
    client
      .put<ScenarioSnapshot>('/scenarios/' + encodeURIComponent(id), { revision, definition })
      .then((r) => r.data),
  deleteScenario: (id: string, revision: number) =>
    client
      .delete('/scenarios/' + encodeURIComponent(id), { params: { revision } })
      .then((r) => r.data),
  task: (id: string) => get<TaskResult>('/tasks/' + encodeURIComponent(id)),
  expertCatalog: () =>
    get<{
      /** Platform capabilities only: what may be used as an ordinary node. */
      capabilities: string[]
      capabilityItems?: CapabilityItem[]
      capabilityKinds?: CapabilityKindSummary[]
      platformScoped?: string[]
      /** Platform capabilities the operator switched off, so the picker's omissions are explainable. */
      disabledPlatform?: string[]
      /** Expert-scoped capabilities; a node using one must be declared in mcpTools. */
      expertScoped?: string[]
      expertScopedVocabulary?: string[]
      mcpServers?: McpServerItem[]
      scopeNotes?: Record<string, string>
      rules: string[]
      rulePacks?: RulePackSummary[]
      facts?: RuleFact[]
    }>('/experts/catalog'),
  rulePacks: () => get<{ items: RulePackSummary[] }>('/rule-packs'),
  rulePack: (id: string) =>
    get<{ manifest: string; shipped: boolean; editable: boolean; requirements?: RuleRequirements }>(
      '/rule-packs/' + encodeURIComponent(id),
    ),
  ruleVocabulary: () =>
    get<{ facts: RuleFact[]; operators: string[]; producers?: string[] }>('/rule-packs/vocabulary'),
  dryRunRulePack: (sql: string, manifest: string) =>
    client.post<DryRunResult>('/rule-packs/dry-run', { sql, manifest }).then((r) => r.data),
  /** Validate a candidate pack without saving it — the same checks that gate a save. */
  validateRulePack: (manifest: string) =>
    client.post<RuleValidation>('/rule-packs/validate', { manifest }).then((r) => r.data),
  /**
   * Create a pack. Shipped ids are reserved, so copying a shipped pack *is* this call with a new id —
   * which is why the editor's only remedy on a read-only pack is 复制为自定义.
   */
  createRulePack: (name: string, manifest: string) =>
    client.post<RulePackWriteResult>('/rule-packs', { name, manifest }).then((r) => r.data),
  /** Overwrite an authored pack. The manifest's own id must match; the revision increments server-side. */
  updateRulePack: (id: string, name: string, manifest: string) =>
    client
      .put<RulePackWriteResult>('/rule-packs/' + encodeURIComponent(id), { id, name, manifest })
      .then((r) => r.data),
  setRulePackActivation: (id: string, enabled: boolean) =>
    client
      .put<RulePackWriteResult>('/rule-packs/' + encodeURIComponent(id) + '/activation', {
        enabled,
      })
      .then((r) => r.data),
  /** Refused by the backend while an enabled expert still references the pack, naming the experts. */
  deleteRulePack: (id: string) =>
    client.delete('/rule-packs/' + encodeURIComponent(id)).then((r) => r.data),
  /** Real counts behind the overview's headline figures. Nothing here is sampled. */
  stats: (windowDays = 7) => get<TaskStatistics>('/stats?windowDays=' + windowDays),
  activateExpert: (id: string, enabled: boolean) =>
    client
      .put('/experts/' + encodeURIComponent(id) + '/activation', { enabled })
      .then((r) => r.data),
  database: (id: string) =>
    get<{
      id: string
      label: string
      engine: string
      environment: string
      metadata: Record<string, unknown>
    }>('/databases/' + encodeURIComponent(id)),
  saveDatabase: (
    id: string | null,
    profile: {
      label: string
      engine: string
      environment: string
      metadata: Record<string, unknown>
    },
  ) =>
    (id
      ? client.put('/databases/' + encodeURIComponent(id), profile)
      : client.post('/databases', profile)
    ).then((r) => r.data),
  deleteDatabase: (id: string) =>
    client
      .delete<{ id: string; status: string }>('/databases/' + encodeURIComponent(id))
      .then((r) => r.data),
  tasks: () => get<{ items: TaskResult[] }>('/tasks'),
  knowledgeBases: () =>
    get<{ items: Array<{ id: string; name: string; description: string; documents: number }> }>(
      '/knowledge',
    ),
  createKnowledgeBase: (name: string, description: string) =>
    client.post('/knowledge', { name, description }).then((r) => r.data),
  knowledgeDocuments: (id: string) =>
    get<{ items: Array<{ id: string; title: string; content: string }> }>(
      '/knowledge/' + id + '/documents',
    ),
  updateKnowledgeDocument: (
    baseId: string,
    documentId: string,
    body: { title: string; content: string; expectedHash: string },
  ) =>
    client
      .put(
        '/knowledge/' + encodeURIComponent(baseId) + '/documents/' + encodeURIComponent(documentId),
        body,
      )
      .then((response) => response.data),
  addKnowledgeDocument: (id: string, title: string, content: string) =>
    client.post('/knowledge/' + id + '/documents', { title, content }).then((r) => r.data),
  renameKnowledgeBase: (id: string, name: string, description: string) =>
    client.put('/knowledge/' + encodeURIComponent(id), { name, description }).then((r) => r.data),
  deleteKnowledgeBase: (id: string) =>
    client.delete('/knowledge/' + encodeURIComponent(id)).then((r) => r.data),
  deleteKnowledgeDocument: (baseId: string, documentId: string) =>
    client
      .delete(
        '/knowledge/' + encodeURIComponent(baseId) + '/documents/' + encodeURIComponent(documentId),
      )
      .then((r) => r.data),
  searchKnowledge: (q: string, baseId?: string) =>
    client.get('/knowledge/search', { params: { q, baseId } }).then((r) => r.data),
  validateExpert: (definition: { id: string; name: string; manifest: string }) =>
    client.post('/experts/validate', definition).then((response) => response.data),
  saveExpert: (definition: { id: string; name: string; manifest: string }) =>
    client.post('/experts', definition).then((response) => response.data),
  health: () => get<RuntimeHealth>('/health'),
  dataLayout: () => get<DataLayoutResponse>('/runtime/data-layout'),
  trustedTools: () => get<TrustedToolResponse>('/runtime/trusted-tools'),
  probeTrustedToolVersion: (id: string, options?: { signal?: AbortSignal }) =>
    client
      .post<TrustedToolVersionProbeResult>(
        '/runtime/trusted-tools/' + encodeURIComponent(id) + '/probe-version',
        {},
        {
          signal: options?.signal,
        },
      )
      .then((r) => r.data),
  clearTrustedToolProbeCache: () =>
    client
      .post<{ cleared: number; remaining: number; message: string }>(
        '/runtime/trusted-tools/probe-cache/clear',
        {},
      )
      .then((r) => r.data),
  startGitOperationExecution: gitOperationApi.start,
  gitOperationExecutions: gitOperationApi.list,
  gitOperationReadiness: (operation: GitExecutionOperation, signal?: AbortSignal) =>
    client
      .get<ToolExecutionReadiness>(gitExecutionPath(operation) + '/readiness', { signal })
      .then((r) => r.data),
  gitOperationExecution: gitOperationApi.get,
  cancelGitOperationExecution: gitOperationApi.cancel,
  gitExecutionProcessReview: (operation: GitExecutionOperation, id: string, signal?: AbortSignal) =>
    client
      .get<ToolProcessReview>(
        gitExecutionPath(operation) + '/' + encodeURIComponent(id) + '/process-review',
        { signal },
      )
      .then((r) => r.data),
  resolveUnknownGitExecution: (
    operation: GitExecutionOperation,
    id: string,
    request: ToolUnknownReviewRequest,
    signal?: AbortSignal,
  ) =>
    client
      .post<ToolExecution>(
        gitExecutionPath(operation) + '/' + encodeURIComponent(id) + '/resolve-unknown',
        request,
        { signal },
      )
      .then(({ data }) => {
        if (
          !data ||
          data.id !== id ||
          data.capabilityId !== operation ||
          data.status !== 'CLOSED_UNKNOWN' ||
          data.resolution?.requestId !== request.requestId ||
          data.resolution.processTreeStopped !== true
        )
          throw new Error('UNKNOWN_REVIEW_RESPONSE_UNCONFIRMED')
        return data
      }),
  startTrustedGitExecution: (requestId: string, options?: { signal?: AbortSignal }) =>
    gitOperationApi.start('git-status', requestId, options),
  trustedGitExecutions: (signal?: AbortSignal) => gitOperationApi.list('git-status', signal),
  trustedGitExecution: (id: string, signal?: AbortSignal) =>
    gitOperationApi.get('git-status', id, signal),
  cancelTrustedGitExecution: (id: string, signal?: AbortSignal) =>
    gitOperationApi.cancel('git-status', id, signal),
  capabilities: () => get<CapabilityResponse>('/capabilities'),
  cliPrograms: () => get<{ items: CliProgramItem[] }>('/cli-programs'),
  registerCliProgram: (program: CliProgramRequest) =>
    client.post('/cli-programs', program).then((r) => r.data),
  configureCliProgram: (id: string, binary: string) =>
    client.put('/cli-programs/' + encodeURIComponent(id), { binary }).then((r) => r.data),
  deleteCliProgram: (id: string) =>
    client.delete('/cli-programs/' + encodeURIComponent(id)).then((r) => r.data),
  probeCliProgram: (id: string) =>
    client
      .post<CliProbeResult>('/cli-programs/' + encodeURIComponent(id) + '/probe')
      .then((r) => r.data),
  saveCliOperation: (programId: string, operation: CliOperationRequest, editing: boolean) => {
    const url =
      '/cli-programs/' +
      encodeURIComponent(programId) +
      '/operations/' +
      encodeURIComponent(operation.capabilityId)
    return (editing ? client.put(url, operation) : client.post(url, operation)).then((r) => r.data)
  },
  deleteCliOperation: (programId: string, id: string) =>
    client
      .delete(
        '/cli-programs/' + encodeURIComponent(programId) + '/operations/' + encodeURIComponent(id),
      )
      .then((r) => r.data),
  /**
   * The one on/off switch, for any kind. Refused by the backend while an enabled expert runs the
   * capability, and the refusal names the experts.
   */
  setCapabilityActivation: (name: string, enabled: boolean, notes: string) =>
    client
      .put('/capabilities/' + encodeURIComponent(name) + '/activation', { enabled, notes })
      .then((r) => r.data),
  /** Point a local CLI capability at a specific binary; blank restores the shipped default. */
  setCliChannel: (name: string, binary: string) =>
    client
      .put('/capabilities/' + encodeURIComponent(name) + '/cli', { binary })
      .then((r) => r.data),
  /** Explicitly run `<binary> --version`. The only place a binary is executed for a management check. */
  probeCliChannel: (name: string) =>
    client
      .post<CliProbeResult>('/capabilities/' + encodeURIComponent(name) + '/cli/probe')
      .then((r) => r.data),
  mcpServers: () => get<{ items: McpServerItem[] }>('/mcp-servers'),
  saveMcpServer: (server: McpServerRequest) =>
    client.post('/mcp-servers', server).then((r) => r.data),
  updateMcpServer: (id: string, server: McpServerRequest) =>
    client.put('/mcp-servers/' + encodeURIComponent(id), server).then((r) => r.data),
  setMcpServerActivation: (id: string, enabled: boolean, trusted: boolean) =>
    client
      .put('/mcp-servers/' + encodeURIComponent(id) + '/activation', { enabled, trusted })
      .then((r) => r.data),
  deleteMcpServer: (id: string) =>
    client.delete('/mcp-servers/' + encodeURIComponent(id)).then((r) => r.data),
  probeMcpServer: (id: string) =>
    client
      .post<McpProbeResult>('/mcp-servers/' + encodeURIComponent(id) + '/probe')
      .then((r) => r.data),
  createTask: (goal: string) =>
    client
      .post<TaskResult>('/tasks', { goal }, { timeout: 60_000 })
      .then((response) => response.data),
  handoffs: () => get<{ items: HandoffRecord[] }>('/handoffs'),
  boardRuntime: (projectId: string, signal?: AbortSignal) =>
    client
      .get<BoardRuntimeSnapshot>('/board/runtime', { params: { projectId }, signal })
      .then(({ data }) => {
        const counts = [
          'taskCount',
          'runCount',
          'activeRunCount',
          'unknownRunCount',
          'activeVerificationCount',
          'unknownVerificationCount',
          'activeWriteCount',
          'unknownWriteCount',
        ] as const
        if (
          !data ||
          data.projectId !== projectId ||
          typeof data.observedAt !== 'string' ||
          !Number.isFinite(Date.parse(data.observedAt)) ||
          counts.some((key) => !Number.isSafeInteger(data[key]) || data[key] < 0) ||
          !Array.isArray(data.items) ||
          data.items.length > 20 ||
          typeof data.truncated !== 'boolean' ||
          data.items.some(
            (item) =>
              !item ||
              typeof item.taskId !== 'string' ||
              typeof item.id !== 'string' ||
              !isBoardRuntimeActivity(item),
          )
        )
          throw new Error('INVALID_BOARD_RUNTIME_RESPONSE')
        return data
      }),
  boardTasks: (projectId: string) =>
    get<{ items: BoardTask[] }>('/board/tasks?projectId=' + encodeURIComponent(projectId)),
  sourceWriteReviews: () => get<SourceWriteReviewItem[]>('/board/source-write-reviews'),
  sourceWriteReview: (id: string) =>
    get<SourceWriteReviewDetail>('/board/source-write-reviews/' + encodeURIComponent(id)),
  closeSourceWriteReview: (id: string, request: SourceWriteReviewRequest) =>
    client
      .post<SourceWriteReviewDetail>(
        '/board/source-write-reviews/' + encodeURIComponent(id) + '/close',
        request,
      )
      .then((response) => response.data),
  boardCodeCandidates: (taskId: string, projectId: string) =>
    get<BoardCodeCandidates>(
      '/board/tasks/' +
        encodeURIComponent(taskId) +
        '/code-proposals?projectId=' +
        encodeURIComponent(projectId),
    ),
  boardCodeCandidate: (taskId: string, proposalId: string, projectId: string) =>
    get<CodeProposalState>(
      '/board/tasks/' +
        encodeURIComponent(taskId) +
        '/code-proposals/' +
        encodeURIComponent(proposalId) +
        '?projectId=' +
        encodeURIComponent(projectId),
    ).then(validateCodeProposal),
  applyBoardCodeCandidate: (
    taskId: string,
    proposalId: string,
    request: { projectId: string; revision: number; confirmed: true },
  ) =>
    client
      .post<CodeApplied>(
        '/board/tasks/' +
          encodeURIComponent(taskId) +
          '/code-proposals/' +
          encodeURIComponent(proposalId) +
          '/apply',
        request,
      )
      .then((response) => response.data),
  refuseBoardCodeCandidate: (
    taskId: string,
    proposalId: string,
    request: { projectId: string; revision: number; confirmed: true },
  ) =>
    client
      .post<CodeProposalState>(
        '/board/tasks/' +
          encodeURIComponent(taskId) +
          '/code-proposals/' +
          encodeURIComponent(proposalId) +
          '/refuse',
        request,
      )
      .then((response) => response.data),
  setBoardPrototype: (
    id: string,
    selection: { projectId: string; revision: number; versionId: string | null },
  ) =>
    client
      .post<BoardTask>('/board/tasks/' + encodeURIComponent(id) + '/prototype', selection)
      .then((response) => response.data),
  boardRuns: (id: string, projectId: string) =>
    get<BoardRunPage>(
      '/board/tasks/' + encodeURIComponent(id) + '/runs?projectId=' + encodeURIComponent(projectId),
    ),
  boardReview: (taskId: string, executionId: string, projectId: string) =>
    get<BoardReviewPage>(
      '/board/tasks/' +
        encodeURIComponent(taskId) +
        '/runs/' +
        encodeURIComponent(executionId) +
        '/review?projectId=' +
        encodeURIComponent(projectId),
    ),
  captureBoardReview: (
    taskId: string,
    executionId: string,
    request: { projectId: string; workspacePath: string },
  ) =>
    client
      .post<BoardReviewEvidence>(
        '/board/tasks/' +
          encodeURIComponent(taskId) +
          '/runs/' +
          encodeURIComponent(executionId) +
          '/review',
        request,
        { timeout: 90_000 },
      )
      .then((response) => response.data),
  boardVerification: (taskId: string, executionId: string, projectId: string) =>
    get<BoardVerificationPage>(
      '/board/tasks/' +
        encodeURIComponent(taskId) +
        '/runs/' +
        encodeURIComponent(executionId) +
        '/verification?projectId=' +
        encodeURIComponent(projectId),
    ),
  planBoardVerification: (
    taskId: string,
    executionId: string,
    request: { projectId: string; workspacePath: string },
  ) =>
    client
      .post<BoardVerificationPlan>(
        '/board/tasks/' +
          encodeURIComponent(taskId) +
          '/runs/' +
          encodeURIComponent(executionId) +
          '/verification/plan',
        request,
        { timeout: 90_000 },
      )
      .then((response) => response.data),
  startBoardVerification: (
    taskId: string,
    executionId: string,
    request: { projectId: string; workspacePath: string; planHash: string },
  ) =>
    client
      .post<BoardVerificationRecord>(
        '/board/tasks/' +
          encodeURIComponent(taskId) +
          '/runs/' +
          encodeURIComponent(executionId) +
          '/verification',
        request,
        { timeout: 90_000 },
      )
      .then((response) => response.data),
  boardAppliedCandidates: (taskId: string, executionId: string, projectId: string) =>
    get<BoardAppliedCandidates>(
      '/board/tasks/' +
        encodeURIComponent(taskId) +
        '/runs/' +
        encodeURIComponent(executionId) +
        '/delivery/applications?projectId=' +
        encodeURIComponent(projectId),
    ),
  boardDelivery: (taskId: string, executionId: string, projectId: string) =>
    get<BoardDeliveryPage>(
      '/board/tasks/' +
        encodeURIComponent(taskId) +
        '/runs/' +
        encodeURIComponent(executionId) +
        '/delivery?projectId=' +
        encodeURIComponent(projectId),
    ),
  submitBoardDelivery: (taskId: string, executionId: string, request: BoardDeliveryRequest) =>
    client
      .post<BoardDelivery>(
        '/board/tasks/' +
          encodeURIComponent(taskId) +
          '/runs/' +
          encodeURIComponent(executionId) +
          '/delivery',
        request,
        { timeout: 90_000 },
      )
      .then((response) => response.data),
  decideBoardDelivery: (
    taskId: string,
    executionId: string,
    request: BoardDeliveryDecisionRequest,
  ) =>
    client
      .post<BoardDelivery>(
        '/board/tasks/' +
          encodeURIComponent(taskId) +
          '/runs/' +
          encodeURIComponent(executionId) +
          '/delivery/decision',
        request,
        { timeout: 90_000 },
      )
      .then((response) => response.data),
  startBoardRun: (id: string, request: BoardRunStart) =>
    client
      .post<BoardRun>('/board/tasks/' + encodeURIComponent(id) + '/runs', request)
      .then((response) => response.data),
  boardTask: (id: string, projectId: string) =>
    get<BoardTask>(
      '/board/tasks/' + encodeURIComponent(id) + '?projectId=' + encodeURIComponent(projectId),
    ),
  createBoardTask: (draft: BoardTaskDraft) =>
    client.post<BoardTask>('/board/tasks', draft).then((response) => response.data),
  createPrototypeTask: (draft: import('./contracts/boardModels').PrototypeTaskDraft) =>
    client.post<BoardTask>('/board/tasks/from-prototype', draft).then((response) => response.data),
  updateBoardTask: (
    id: string,
    update: {
      projectId: string
      revision: number
      column?: BoardTask['column']
      notes?: string
      priority?: BoardTask['priority']
      goal?: string
      acceptanceCriteria?: string
    },
  ) =>
    client
      .post<BoardTask>('/board/tasks/' + encodeURIComponent(id), update)
      .then((response) => response.data),
  recordHandoff: (draft: {
    source: 'chat' | 'builder' | 'board'
    sourceRef: string
    summary: string
  }) => client.post<HandoffRecord>('/handoffs', draft).then((response) => response.data),
  missions: () => get<{ items: MissionRecord[] }>('/missions'),
  createMission: (handoffId: string) =>
    client.post<MissionRecord>('/missions', { handoffId }).then((response) => response.data),
  prototypeVersions: (sourceRef: 'builder-alpha' | 'builder-beta') =>
    get<{ items: PrototypeVersionRecord[] }>(
      '/prototype-versions?sourceRef=' + encodeURIComponent(sourceRef),
    ),
  savePrototypeVersion: (draft: PrototypePublicationRequest) =>
    client
      .post<PrototypeVersionRecord>('/prototype-versions', draft)
      .then((response) => response.data),
  prototypePublication: (requestId: string) =>
    get<PrototypeVersionRecord>('/prototype-publications/' + encodeURIComponent(requestId)),
  prototypeVersion: (id: string) =>
    get<PrototypeVersionRecord>('/prototype-versions/' + encodeURIComponent(id)),
  createPrototypeDelivery: (versionId: string) =>
    client
      .post<PrototypeDeliveryRecord>('/prototype-deliveries', { versionId })
      .then((response) => response.data),
  startMissionGitStatus: (missionId: string) =>
    client
      .post<MissionExecutionRecord>(
        '/missions/' + encodeURIComponent(missionId) + '/executions',
        { missionId },
        { timeout: 60_000 },
      )
      .then((response) => response.data),
  analyzeSql: (
    sql: string,
    question = '',
    options: {
      expertId?: string
      databaseId?: string
      explainPlan?: Record<string, unknown>
      enhanceWithModel?: boolean
      pattern?: string
    } = {},
  ) =>
    client
      .post<SqlAnalysis>('/sql/analyze', { sql, question, ...options }, { timeout: 90_000 })
      .then((response) => response.data),
  databases: () =>
    get<{
      items: Array<{
        id: string
        label: string
        engine: string
        environment: string
        credentialsExposed: boolean
      }>
      policy: string
    }>('/databases'),
  experts: () =>
    get<{
      items: string[]
      states?: Record<string, { enabled: boolean; builtin: boolean; revision: number }>
    }>('/experts'),
  ...createChatApi(baseUrl, client),
}

async function postChatSse(
  transport: RequestClient,
  path: string,
  body: unknown,
  options?: { signal?: AbortSignal; onEvent?: (event: ChatExecutionEvent) => void },
): Promise<AiMessageResult> {
  const requestLanguage = runtimeLanguage()
  const response = await openStream(transport, path, {
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      'Accept-Language': requestLanguage,
    },
    signal: options?.signal,
    timeout: 30_000,
  })
  if (!response.body) {
    throw Object.assign(new Error(ModelErrors.AI_EMPTY_RESPONSE), {
      response: { status: 502, data: { code: ModelErrors.AI_EMPTY_RESPONSE } },
    })
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let answer = ''
  const toolEvents: AiToolEvent[] = []
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let separator: RegExpExecArray | null
      while ((separator = /\r?\n\r?\n/.exec(buffer))) {
        if (separator.index > CHAT_SSE_FRAME_LIMIT) throw chatStreamError('AI_RESPONSE_TOO_LARGE')
        const chunk = buffer.slice(0, separator.index)
        buffer = buffer.slice(separator.index + separator[0].length)
        const event = parseSseChunk(chunk)
        if (!event) continue
        options?.onEvent?.(event)
        if (event.type === 'answer.delta') answer += event.text ?? ''
        if (event.type === 'tool') {
          const sequence =
            typeof (event.payload as { sequence?: number } | null)?.sequence === 'number'
              ? (event.payload as { sequence: number }).sequence
              : event.sequence
          toolEvents.push({ sequence, code: event.code || event.text })
        }
        if (event.type === 'final') {
          const payload = event.payload as AiMessageResult | null
          return {
            approval: '',
            verification: '',
            artifactError: '',
            artifacts: [],
            ...payload,
            executionId: payload?.executionId ?? event.executionId,
            answer: payload?.answer ?? (event.text || answer),
            error: payload?.error ?? event.code,
            ...(event.message
              ? {
                  errorMessage: event.message,
                  errorLanguage: response.headers.get('Content-Language') ?? requestLanguage,
                }
              : {}),
            status: payload?.status ?? event.status,
            toolEvents: payload?.toolEvents ?? toolEvents,
          }
        }
      }
      // A separator may straddle reads. Reserve at most three provisional code units.
      if (buffer.replace(/(?:\r?\n\r?|\r)$/, '').length > CHAT_SSE_FRAME_LIMIT) {
        throw chatStreamError('AI_RESPONSE_TOO_LARGE')
      }
    }
    throw chatStreamError(ModelErrors.AI_RESPONSE_INCOMPLETE)
  } finally {
    // Stop waiting at final or failure; cleanup must not replace the original error.
    await reader.cancel().catch(() => undefined)
    try {
      reader.releaseLock()
    } catch {
      // A cleanup error must not hide a provider, parser or caller error.
    }
  }
}

// Per frame, not per stream; decoded UTF-16 code units, separator excluded.
const CHAT_SSE_FRAME_LIMIT = 1_048_576

function chatStreamError(code: string): Error {
  return Object.assign(new Error(code), {
    response: { status: 502, data: { code } },
  })
}

function isStreamRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parseSseChunk(chunk: string): ChatExecutionEvent | null {
  const data: string[] = []
  for (const line of chunk.split(/\r?\n/)) {
    if (line === 'data') data.push('')
    else if (line.startsWith('data:')) {
      // SSE removes at most one space and joins data fields with LF.
      data.push(line.slice(5).replace(/^ /, ''))
    }
  }
  if (!data.length) return null // Comments and non-data fields are not execution events.
  let event: unknown
  try {
    event = JSON.parse(data.join('\n'))
  } catch {
    throw chatStreamError('AI_RESPONSE_INVALID')
  }
  // Validate only the execution envelope and fields consumed by this transport.
  // Event types and optional domain payloads remain extensible.
  if (
    !isStreamRecord(event) ||
    !['eventId', 'executionId', 'conversationId', 'type', 'protocolVersion'].every(
      (key) => typeof event[key] === 'string' && event[key] !== '',
    ) ||
    !['occurredAt', 'text', 'code', 'status'].every((key) => typeof event[key] === 'string') ||
    (event.status !== '' && !isChatExecutionStatus(event.status)) ||
    !Number.isSafeInteger(event.sequence) ||
    (event.sequence as number) < 0
  )
    throw chatStreamError('AI_RESPONSE_INVALID')
  if (event.type === 'final' && event.payload != null) {
    const payload = event.payload
    if (
      !isStreamRecord(payload) ||
      (payload.status !== undefined && !isChatExecutionStatus(payload.status)) ||
      !['answer', 'error', 'status', 'approval', 'verification', 'artifactError'].every(
        (key) => payload[key] === undefined || typeof payload[key] === 'string',
      ) ||
      (payload.executionId != null && typeof payload.executionId !== 'string') ||
      (payload.toolEvents !== undefined &&
        (!Array.isArray(payload.toolEvents) ||
          !payload.toolEvents.every(
            (tool) =>
              isStreamRecord(tool) &&
              Number.isSafeInteger(tool.sequence) &&
              typeof tool.code === 'string',
          ))) ||
      (payload.artifacts !== undefined && !Array.isArray(payload.artifacts))
    )
      throw chatStreamError('AI_RESPONSE_INVALID')
  }
  return event as ChatExecutionEvent
}

export function createChatApi(
  baseURL: string,
  transport = createRequestClient({
    baseURL,
    headers: { Accept: 'application/json' },
    headersForRequest: () => ({ 'Accept-Language': runtimeLanguage() }),
  }),
) {
  const client = transport
  client.interceptors.request.use((config) => {
    config.headers.set('Accept-Language', runtimeLanguage())
    return config
  })
  const get = <T>(path: string) => client.get<T>(path).then((response) => response.data)
  return {
    aiStatus: () => get<AiStatus>('/ai/status'),
    skills: () => get<{ items: SkillSummary[] }>('/skills'),
    skill: (id: string, version: string) =>
      get<SkillSnapshot>(
        `/skills/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}`,
      ),
    previewSkill: (input: SkillImportInput) =>
      client.post<SkillSnapshot>('/skills/preview', input).then((response) => response.data),
    saveSkill: (request: SkillSaveRequest) =>
      client.post<SkillSnapshot>('/skills', request).then((response) => response.data),
    activateSkill: (
      id: string,
      version: string,
      request: { enabled: boolean; stateRevision: number },
    ) =>
      client
        .post<SkillSnapshot>(
          `/skills/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}/activation`,
          request,
        )
        .then((response) => response.data),
    previewSkillContext: (skillRef: SkillRef, resourcePaths: string[]) =>
      client
        .post<SkillContext>('/skills/context/preview', { skillRef, resourcePaths })
        .then((response) => response.data),
    previewExpertContext: (expertRef: KnowledgeExpertRef, query: string) =>
      client
        .post<KnowledgeContext>('/ai/expert-context/preview', { expertRef, query })
        .then((response) => response.data),
    workspaceBaseline: (path: string) =>
      get<WorkspaceBaseline>('/ai/workspace/baseline?path=' + encodeURIComponent(path)),
    workspaceSource: (path: string) =>
      get<WorkspaceSource>('/ai/workspace/source?path=' + encodeURIComponent(path)),
    codeReferences: (paths: string[]) =>
      client
        .post<WorkspaceSource[]>('/ai/workspace/code-references', { paths })
        .then((response) => response.data),
    discoverCodeDependencies: (targetPath: string) =>
      client
        .post<import('./contracts/codeModels').CodePreparation>('/ai/workspace/code-dependencies', {
          targetPath,
        })
        .then((response) => response.data),
    prepareCode: (targetPath: string, componentPaths: string[]) =>
      client
        .post<import('./contracts/codeModels').CodePreparation>('/ai/workspace/code-preparation', {
          targetPath,
          componentPaths,
        })
        .then((response) => response.data),
    workspaceDirty: () => get<WorkspaceDirty>('/ai/workspace/dirty'),
    workspaceFiles: (path = '') =>
      get<WorkspaceFiles>('/ai/workspace/files?path=' + encodeURIComponent(path)),
    workspaceVerificationProbe: () =>
      client
        .post<VerificationProbe>('/ai/workspace/verification/probe', {})
        .then((response) => response.data),
    aiConversation: (id: string) =>
      get<AiConversation>('/ai/conversations/' + encodeURIComponent(id)),
    modelHistory: (id: string) =>
      get<ModelHistoryUsage>('/ai/conversations/' + encodeURIComponent(id) + '/model-history'),
    summarizeModelHistory: (id: string) =>
      client
        .post<ModelHistorySummary>(
          '/ai/conversations/' + encodeURIComponent(id) + '/model-history/summary',
          {},
          { timeout: 60_000 },
        )
        .then((response) => response.data),
    clearModelHistory: (id: string) =>
      client
        .delete('/ai/conversations/' + encodeURIComponent(id) + '/model-history')
        .then(() => undefined),
    putWorkingMemory: (
      id: string,
      body: {
        expectedUpdatedAt: string
        goal?: string
        constraints?: string[]
        facts?: Array<{ kind: string; id: string; revisionOrDigest: string }>
        evidenceRefs?: string[]
        dependencyKeys?: string[]
      },
    ) =>
      client
        .put<TaskWorkingMemorySnapshot>(
          '/ai/conversations/' + encodeURIComponent(id) + '/working-memory',
          body,
        )
        .then((response) => response.data),
    reconnectAiConversation: (
      id: string,
      expectedWorkspaceLabel: string,
      connectionId: string,
      model: string,
    ) =>
      client
        .post<AiConversationRecovery>(
          '/ai/conversations/' + encodeURIComponent(id) + '/reconnect',
          { confirmContextReset: true, expectedWorkspaceLabel, connectionId, model },
          { timeout: 10_000 },
        )
        .then((response) => response.data),
    deleteAiConversation: (id: string) =>
      client.delete('/ai/conversations/' + encodeURIComponent(id)).then(() => undefined),
    openAiConversation: () =>
      client
        .post<AiConversation>('/ai/conversations', {}, { timeout: 10_000 })
        .then((response) => response.data),
    sendAiMessage: (
      id: string,
      message: string,
      toolMode: AiToolMode,
      context?: TaskContext,
      options?: { signal?: AbortSignal; onEvent?: (event: ChatExecutionEvent) => void },
    ) =>
      postChatSse(
        client,
        '/ai/conversations/' + encodeURIComponent(id) + '/messages',
        { message, toolMode, ...(context ? { context } : {}) },
        options,
      ),
    cancelAiConversation: (id: string) =>
      client
        .post<{ cancelled: boolean; executionId: string }>(
          '/ai/conversations/' + encodeURIComponent(id) + '/cancel',
          {},
        )
        .then((response) => response.data),
    executionSnapshot: (id: string, executionId: string, afterSequence = 0) =>
      get<ChatExecutionSnapshot>(
        '/ai/conversations/' +
          encodeURIComponent(id) +
          '/executions/' +
          encodeURIComponent(executionId) +
          '/snapshot?afterSequence=' +
          encodeURIComponent(String(afterSequence)),
      ),
    applyCodeProposal: (id: string, proposal: string) =>
      client
        .post<CodeApplied>(
          '/ai/conversations/' +
            encodeURIComponent(id) +
            '/proposals/' +
            encodeURIComponent(proposal) +
            '/apply',
          { confirmed: true },
        )
        .then((response) => response.data),
    codeProposal: (id: string, proposal: string) =>
      get<CodeProposalState>(
        '/ai/conversations/' +
          encodeURIComponent(id) +
          '/proposals/' +
          encodeURIComponent(proposal),
      ).then(validateCodeProposal),
    refuseCodeProposal: (id: string, proposal: string, request?: { executionId?: string | null }) =>
      client
        .post<CodeProposalState>(
          '/ai/conversations/' +
            encodeURIComponent(id) +
            '/proposals/' +
            encodeURIComponent(proposal) +
            '/refuse',
          request ?? {},
        )
        .then((response) => response.data),
    startChatGptLogin: (connectionId?: string) =>
      client
        .post<ChatGptLoginAttempt>(
          '/ai/chatgpt/login' +
            (connectionId ? '?connectionId=' + encodeURIComponent(connectionId) : ''),
          {},
        )
        .then((response) => response.data),
    chatGptLoginState: (id: string) =>
      get<ChatGptLoginState>('/ai/chatgpt/login/' + encodeURIComponent(id)),
    cancelChatGptLogin: (id: string) =>
      client.delete('/ai/chatgpt/login/' + encodeURIComponent(id)),
    disconnectChatGpt: (id: string) =>
      client.delete('/ai/chatgpt/login/accounts/' + encodeURIComponent(id)),
    modelConnections: () => get<ModelConnectionList>('/ai/connections'),
    saveModelConnection: (input: ModelConnectionInput, id?: string) =>
      client
        .post<ModelConnection>(
          id ? '/ai/connections/' + encodeURIComponent(id) : '/ai/connections',
          input,
        )
        .then((response) => response.data),
    setModelConnectionEnabled: (id: string, enabled: boolean) =>
      client
        .post<ModelConnection>('/ai/connections/' + encodeURIComponent(id) + '/enabled', {
          enabled,
        })
        .then((response) => response.data),
    setDefaultModelConnection: (id: string) =>
      client
        .post<ModelConnection>('/ai/connections/' + encodeURIComponent(id) + '/default', {})
        .then((response) => response.data),
    refreshConnectionModels: (id: string) =>
      client
        .post<ModelConnection>('/ai/connections/' + encodeURIComponent(id) + '/models/refresh', {})
        .then((response) => response.data),
    configureConnectionModels: (id: string, selection: ModelSelection) =>
      client
        .post<ModelConnection>('/ai/connections/' + encodeURIComponent(id) + '/models', selection)
        .then((response) => response.data),
    assignConversationConnection: (
      id: string,
      connectionId: string,
      confirmTargetChange: boolean,
      model: string,
    ) =>
      client
        .post<ConversationConnection>(
          '/ai/conversations/' + encodeURIComponent(id) + '/connection',
          {
            connectionId,
            confirmTargetChange,
            model,
          },
        )
        .then((response) => response.data),
  }
}

export { SkillErrors } from './errors/skillErrors'
export { BoardVerificationErrors } from './errors/boardVerificationErrors'
export { BoardDeliveryErrors } from './errors/boardDeliveryErrors'
export { ToolErrors } from './errors/toolErrors'
export { ModelErrors } from './errors/modelErrors'

export * from './contracts/index'

export { AgentErrors } from './errors/agentErrors'

export { BoardErrors } from './errors/boardErrors'

export { CodeErrors } from './errors/codeErrors'

export { ExecutionErrors } from './errors/executionErrors'

export { SecurityErrors } from './errors/securityErrors'

export { WorkspaceErrors } from './errors/workspaceErrors'

export { ProtocolErrors } from './errors/protocolErrors'

export { CommonErrors } from './errors/commonErrors'

export { McpErrors } from './errors/mcpErrors'

export { ChatGptAuthErrors } from './errors/chatGptAuthErrors'

export { ChatErrors } from './errors/chatErrors'

export { ResourceErrors } from './errors/resourceErrors'

export { CliProgramErrors } from './errors/cliProgramErrors'

export { GitErrors } from './errors/gitErrors'
