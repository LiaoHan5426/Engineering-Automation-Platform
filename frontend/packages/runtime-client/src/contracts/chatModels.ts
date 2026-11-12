import type { TaskMode } from './taskMode'
import type { ModelConnectionState } from './modelConnection.ts'
import type { ChatGptLoginStatus } from './modelConnection.ts'
import type { SkillContext } from './skillModels.ts'
import type { KnowledgeContext } from './capabilityModels.ts'
import type { CodeProposal } from './codeModels.ts'
import type { SkillRef } from './skillModels.ts'
import type { CodeTaskRef } from './boardModels.ts'

export type ModelAdvisor = {
  attempted?: boolean
  succeeded?: boolean
  decision?: string
  rationale?: string
  provider?: string | null
  model?: string | null
  latencyMs?: number
  promptTokens?: number
  completionTokens?: number
  preprocessing?: {
    estimatedTokens?: number
    baselineTokens?: number
    compressionRatio?: number
    includedSections?: string[]
    droppedSections?: string[]
  }
}

export type AiConnectionState = ModelConnectionState

export type { AiToolMode } from './aiToolMode'

export type AiStatus = {
  state: AiConnectionState
  provider: string
  model: string
  configurationRevision: string
  lastObservedAt: string | null
  errorCode: string
  tools: { git_status: boolean }
  workspaceLabel: string
  /** Absolute Java-process machine workspace directory when known; never a local group label. */
  workspacePath?: string
  /**
   * Optional co-located process-bound root on that same JVM machine; empty when denied/missing.
   * Not a remote user directory grant.
   */
  authorizedRootPath?: string
  /** Denial code when authorizedRootPath is empty (e.g. AUTHORIZED_ROOT_MISSING). */
  authorizedRootDenial?: string
  /**
   * Always false when the runtime follows Cursor/Codex-style local hosting:
   * the server does not persist operator directory grants.
   */
  storesUserDirectoryGrants?: boolean
  /** Post-apply verification flag from local-service config; false by default. */
  verificationEnabled?: boolean
  /** Configured check names when verification is listed; empty means not_requested even if enabled. */
  verificationCommands?: string[]
}

export type TaskWorkingMemorySnapshot = {
  goal: string
  constraints: string[]
  facts: Array<{ kind: string; id: string; revisionOrDigest: string }>
  evidenceRefs: string[]
  dependencyKeys: string[]
  invalidation: string
  updatedAt: string
  layers: string[]
}

export type AiConversationRecovery = AiConversation & {
  contextReset: boolean
  memoryCleared: boolean
}

export type ModelHistoryUsage = { messages: number; chars: number }
export type ModelHistorySummary = {
  text: string
  sourceMessages: number
  sourceChars: number
  model: string
}

export type AiConversation = {
  conversationId: string
  workspaceLabel: string
  memory: string
  connectionId?: string | null
  connectionName?: string | null
  connectionRevision?: number | null
  model?: string | null
  workingMemory?: TaskWorkingMemorySnapshot | null
}

export type ChatGptLoginAttempt = { loginId: string; authorizationUrl: string; expiresAt: string }

export type ChatGptLoginState = {
  loginId: string
  state: ChatGptLoginStatus
  connectionId: string | null
  error: string
}

export type ModelOption = { id: string; reasoningEfforts: Array<'low' | 'medium' | 'high'> }

export type ModelSelection = {
  models: ModelOption[]
  allowedModels: string[]
  defaultModel: string
}

export type ModelConnection = {
  id: string
  name: string
  kind: string
  wireApi?: ModelWireApi
  enabled: boolean
  baseUrl: string
  defaultModel: string
  models: ModelOption[]
  allowedModels: string[]
  discoveredAt: string
  discoveryError: string
  secretPresent: boolean
  revision: number
  defaultSelected: boolean
  configurationRevision: string
}

export type ModelWireApi = 'chat-completions' | 'responses'

export type ModelConnectionList = { items: ModelConnection[]; effectiveDefaultId: string | null }

export type ModelConnectionInput = {
  name: string
  baseUrl: string
  wireApi?: ModelWireApi
  secret?: string
  enabled: boolean
  defaultSelected: boolean
}

export type AiArtifactSummary = {
  artifactId: string
  executionId: string
  kind: string
  sizeBytes: number
  sha256: string
}

export type AiToolEvent = { sequence: number; code: string }

export type ChatExecutionEvent = {
  message?: string
  eventId: string
  sequence: number
  executionId: string
  conversationId: string
  taskId?: string | null
  type: string
  protocolVersion: string
  occurredAt: string
  text: string
  code: string
  status: string
  payload?: unknown
}

export type ChatExecutionSnapshot = {
  executionId: string
  conversationId: string
  latestSequence: number
  complete: boolean
  status: string
  events: ChatExecutionEvent[]
}

export type ContextBudgetObservation = {
  platformLimit: number
  outputReserve: number
  inputMaterialLimit: number
  usedChars: number
  materialChars: number
  remainingChars: number
  metering: import('./contextBudget.ts').ContextMetering
  sources: Array<{
    source: string
    chars: number
    metering: import('./contextBudget.ts').ContextMetering
    disposition: string
  }>
  notes: string[]
}

export type AiMessageResult = {
  errorMessage?: string
  errorLanguage?: string
  skillContext?: SkillContext | null
  contextMemoryCleared?: boolean
  knowledgeContext?: KnowledgeContext | null
  knowledgeMemoryCleared?: boolean
  contextBudget?: ContextBudgetObservation | null
  proposal?: CodeProposal | null
  executionId: string | null
  answer: string
  error: string
  status: string
  approval: string
  verification: string
  toolEvents: AiToolEvent[]
  artifactError: string
  artifacts: AiArtifactSummary[]
}

export type KnowledgeExpertRef = { id: string; revision: number }

export type TaskContext = {
  componentPaths?: string[]
  skillRef?: SkillRef
  skillResourcePaths?: string[]
  knowledgeExpertRef?: KnowledgeExpertRef
  taskRef?: CodeTaskRef
  mode: TaskMode
  expert: 'general' | 'sql' | 'frontend'
  instructions: string
  reasoning: 'default' | 'low' | 'medium' | 'high'
  approval: 'review' | 'read_only'
  files: Array<{ name: string; content: string }>
  prototypeVersionId: string
  /** Workspace-relative page the server may read for generation prep; never a write grant. */
  targetPath: string
}
