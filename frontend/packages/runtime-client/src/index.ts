import axios from 'axios'
import NProgress from 'nprogress'
import { createExpertAgentApi } from './expertAgent'
export type {
  ExpertAgentState,
  ExpertAgentInput,
  ExpertAgentSummary,
  ExpertAgentRun,
  ExpertAgentDetail,
  ExpertAgentResult,
} from './expertAgent'

export type RuntimeHealth = { status: string; service: string }

export type DataLayoutEntry = {
  logical: string
  resolved: string
  exists: boolean
  note: string
  /** FS-01 observational kind; directories never carry recursive byteSize. */
  kind?: 'missing' | 'file' | 'directory' | 'other' | string
  byteSize?: number
}
export type DataLayoutMigrationCandidate = {
  id: string
  resolved: string
  present: boolean
  note: string
}

export type DataLayoutCandidateCounts = {
  present: number
  absent: number
  total: number
}

export type DataLayoutMigrationReadiness = {
  status: string
  physicalMigration: boolean
  approved: boolean
  note: string
  candidates: DataLayoutMigrationCandidate[]
  /** Observational present/absent over candidates; not migration progress. */
  candidateCounts?: DataLayoutCandidateCounts
}

export type DataLayoutInventoryByKind = {
  file: number
  directory: number
  missing: number
  other: number
}

export type DataLayoutInventory = {
  present: number
  missing: number
  total: number
  /** Observational kind tallies over entries; not recursive disk scan. */
  byKind?: DataLayoutInventoryByKind
}

export type DataLayoutResponse = {
  entries: DataLayoutEntry[]
  physicalMigration: boolean
  /** FS-01 observational counts over entries; not a migration progress meter. */
  inventory?: DataLayoutInventory
  migrationReadiness?: DataLayoutMigrationReadiness
}

export type TrustedToolBindingStatus =
  | 'ready'
  | 'disabled'
  | 'missing_binary'
  | 'conflict'
  | 'unknown_version'
export type TrustedToolVersionStatus = 'unknown' | 'known' | 'not_applicable' | 'probe_failed'

export type TrustedToolItem = {
  programId?: string
  operationId?: string
  id: string
  title: string
  kind: string
  scope: string
  readOnly: boolean
  enabled: boolean
  invocation: string
  summary: string
  bindingStatus?: TrustedToolBindingStatus | string
  bindingSource?: string
  binary?: string
  resolvedPath?: string
  versionStatus?: TrustedToolVersionStatus | string
  detectedVersion?: string
  probedAt?: string
  probeNote?: string
  bindingNote?: string
}
export type TrustedToolProbeCacheSummary = {
  cached: number
  known: number
  failed: number
  /** ISO timestamp of the newest durable probe; empty when cache is empty. */
  newestProbedAt?: string
}

export type TrustedToolResponse = {
  items: TrustedToolItem[]
  programs?: TrustedToolProgram[]
  source: string
  /** Durable probe snapshot counts; catalog GET never auto-probes. */
  probeCache?: TrustedToolProbeCacheSummary
}

export type TrustedToolProgram = Omit<
  TrustedToolItem,
  'scope' | 'readOnly' | 'enabled' | 'invocation' | 'summary'
> & {
  operations: TrustedToolItem[]
}
export type BoardRuntimeSnapshot = {
  projectId: string
  observedAt: string
  taskCount: number
  runCount: number
  activeRunCount: number
  unknownRunCount: number
  activeVerificationCount: number
  unknownVerificationCount: number
  activeWriteCount: number
  unknownWriteCount: number
  items: Array<{
    taskId: string
    id: string
    kind: 'RUN' | 'VERIFICATION' | 'SOURCE_WRITE'
    status: string
    storedStatus: string
  }>
  truncated: boolean
}
export type GitExecutionOperation = 'git-status' | 'git-diff'

export type ToolExecutionStatus =
  | 'CREATED'
  | 'RUNNING'
  | 'CANCELLING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'REJECTED'
  | 'TIMED_OUT'
  | 'CANCELLED'
  | 'UNKNOWN'
  | 'CLOSED_UNKNOWN'
export type ToolExecutionReadiness = {
  capabilityId: GitExecutionOperation
  scopeAccessible: boolean
  authorized: boolean
  canStart: boolean
  reason: string
  blockingExecutionId: string | null
  blockingStatus: ToolExecutionStatus | null
  checkedAt: string
}
export type ToolProcessReview = {
  executionId: string
  capabilityId: GitExecutionOperation
  executionStatus: ToolExecutionStatus
  observedAt: string
  completeProcessTreeEvidence: false
  truncated: boolean
  steps: Array<{
    stepId: string
    phase: string
    process: ToolProcessIdentityInspection
    /** Absent on historical servers; never implies a complete tree. */
    descendantsCaptured?: boolean
    descendantsTruncated?: boolean
    descendants?: ToolProcessIdentityInspection[]
  }>
}
export type ToolProcessIdentityInspection = {
  pid: number | null
  status:
    | 'NOT_CAPTURED'
    | 'NOT_FOUND'
    | 'MATCHING_ALIVE'
    | 'MATCHING_EXITED'
    | 'IDENTITY_MISMATCH'
    | 'UNVERIFIABLE'
    | 'UNAVAILABLE'
  capturedStartedAt: string | null
  observedStartedAt: string | null
  capturedExecutable: string
  observedExecutable: string
}
export type ToolUnknownReviewRequest = {
  requestId: string
  note: string
  processTreeStopped: true
}
export type ToolUnknownResolution = ToolUnknownReviewRequest & {
  requestDigest: string
  operator: 'local-operator'
  resolvedAt: string
}
export type ToolExecution = {
  resolution?: ToolUnknownResolution | null
  id: string
  requestId: string
  programId: string
  capabilityId: string
  workspacePath: string
  executable: string
  status: ToolExecutionStatus
  cancelRequested: boolean
  createdAt: string
  finishedAt: string | null
  exitCode: number | null
  stdout: string
  stderr: string
  truncated: boolean
  exitEvidence: string | null
  unconfirmedReason: string | null
  steps: Array<{
    id: string
    phase: string
    status: string
    command: string[]
    evidence: Record<string, unknown>
  }>
}

export type TrustedToolVersionProbeResult = {
  id: string
  versionStatus: TrustedToolVersionStatus | string
  detectedVersion?: string
  probedAt?: string
  resolvedPath?: string
  success: boolean
  message: string
  output?: string
}

/** Configuration, never runtime permission or execution evidence. */
export type ScenarioConfiguration = {
  name: string
  status: 'partial' | 'missing' | 'disabled'
  modes: Array<'code' | 'work'>
  summary: string
  instructions: string
  tools: string[]
  skills: string[]
  mcp: string[]
  dependencies: Array<{
    name: string
    state: 'installed' | 'missing' | 'unconfigured' | 'denied'
    where: string
  }>
  workflow?: 'prototype-to-code' | null
}
export type ScenarioSnapshot = { id: string; revision: number; definition: ScenarioConfiguration }
export type ScenarioWorkflowDependencies = {
  contractVersion: 1
  workflow: 'prototype-to-code'
  observedAt: string
  plugins: Array<{ id: 'builder' | 'board'; required: boolean }>
  services: Array<{ id: 'prototype-versions'; state: 'READABLE' }>
  resources: Array<{ id: 'prototype-version'; required: boolean; count: number }>
}
/** How a capability gets things done: built-in command, local CLI, MCP tool or HTTP service. */
/**
 * What an operator can do about a capability of a given kind.
 *
 * `description` answers "what can I change here", `creation` answers "how does one come into existence".
 * Both come from the runtime so the UI never promises an edit the backend would refuse.
 */
export type CapabilityManagement = {
  id: string
  label: string
  description: string
  creation: string
  manageable: boolean
}
export type CapabilityAvailabilityCounts = Record<string, number> & { total?: number }
export type CapabilityKindSummary = {
  id: string
  label: string
  description: string
  count: number
  /** Scope this kind is born with: platform-level or expert-level. */
  scope: string
  scopeLabel: string
  expertScoped: boolean
  management: CapabilityManagement
  manageable: boolean
  /** A kind earns a sub-page when it can be managed or has entries. */
  visible: boolean
  availability: CapabilityAvailabilityCounts
}
/** A registered MCP server, as far as the platform is willing to trust it. */
export type McpServerItem = {
  id: string
  name: string
  transport: string
  endpoint: string
  trusted: boolean
  enabled: boolean
  usable: boolean
  tools: string[]
  /** Tools that hit the locked official production allowlist (subset of tools). */
  productionGrantedTools?: string[]
  /** True when at least one tool is production-granted. */
  productionGranted?: boolean
  capabilities: string[]
  /** Experts granted one of its tools on activation. */
  authorisedExperts: string[]
  /** Enabled experts that depend on one of its tools. */
  enabledExperts: string[]
  /** Why it is not callable, computed rather than stored. */
  problems: string[]
}
/** Where the binary of a local CLI capability actually lives on this machine. */
export type CapabilityCliChannel = {
  binary: string
  /** `shipped` (the handler's default) or `operator` (an override). */
  source: string
  shipped: boolean
  overridden: boolean
  resolvedPath: string | null
  found: boolean
  availability: string
  availabilityLabel: string
}
export type CapabilitySetting = {
  capability: string
  enabled: boolean
  notes: string
  updatedAt: string
}
export type CapabilityItem = {
  programId?: string
  builtin?: boolean
  args?: string[]
  name: string
  kind: string
  kindLabel: string
  management: CapabilityManagement
  /** platform = the runtime may enable it for every expert; expert = only an expert that declared it may run it. */
  scope: string
  scopeLabel: string
  expertScoped: boolean
  /** False for a capability an MCP server publishes without a handler behind it. */
  registered: boolean
  title: string
  summary: string
  inputs: string[]
  grants: string[]
  executor: string
  /** For a local CLI capability: the executable it ships with, before any override. */
  binary?: string | null
  facts: string[]
  evidence: string[]
  readOnly: boolean
  enabled: boolean
  disabled: boolean
  notes: string
  availability: string
  availabilityLabel: string
  /** True only for a platform-scoped capability that is switched on and whose dependency is present. */
  globallyRunnable: boolean
  cli?: CapabilityCliChannel
  /** Why a published-but-unimplemented capability cannot run yet. */
  problems?: string[]
  /** Experts that were granted this expert-scoped capability on activation. */
  authorisedExperts: string[]
  /** Experts that are enabled and reference this capability. */
  usedBy: string[]
  /** Experts that reference it, including drafts. */
  declaredBy: string[]
}
export type CapabilityResponse = {
  cliPrograms?: CliProgramItem[]
  items: CapabilityItem[]
  kinds: CapabilityKindSummary[]
  capabilities: string[]
  /** Platform capabilities an expert editor may offer as an ordinary node. */
  globallyUsable: string[]
  /** Platform capabilities the operator switched off, so the editor can explain their absence. */
  disabledPlatform: string[]
  /** Capabilities that must be granted per expert; never globally enabled. */
  expertScoped: string[]
  platformScoped: string[]
  /** Expert-scoped capability ids the platform currently publishes (registered + trusted MCP servers). */
  expertScopedVocabulary: string[]
  mcpServers: McpServerItem[]
  /** Locked official read-only package matrix used for production grants. */
  mcpProductionMatrix?: Array<{
    packageName: string
    version: string
    packageAtVersion: string
    endpoint: string
    readonlyTools: string[]
    preferredTool: string
    /** Gate-proven via tools/call. */
    callVerifiedTools?: string[]
    /** Present in tools/list only; not call-verified (e.g. upstream schema bugs). */
    listOnlyTools?: string[]
  }>
  settings: Record<string, CapabilitySetting>
  disabledCapabilities: string[]
  scopeNotes?: Record<string, string>
  declared: string[]
  unregistered: string[]
  undeclared: string[]
}
export type CliProbeResult = {
  capability: string
  binary: string
  source: string
  resolvedPath: string | null
  executed: boolean
  exitCode?: number
  success?: boolean
  output?: string
  message: string
}

export type CliOperationRequest = {
  capabilityId: string
  title: string
  args: string[]
  description: string
}
export type CliOperationItem = CliOperationRequest & { programId: string; builtin: boolean }
export type CliProgramRequest = { id: string; name: string; binary: string }
export type CliProgramItem = CliProgramRequest & {
  builtin: boolean
  channel: { binary: string; source: string; resolvedPath: string | null }
  operations: CliOperationItem[]
}
export type McpProbeResult = {
  id: string
  checked: boolean
  transport?: string
  target?: string
  /** Always false until an MCP protocol client exists: a declared tool list is not a verified one. */
  verified?: boolean
  targetResolved?: string | null
  reachable?: boolean
  message: string
}
export type McpServerRequest = {
  id: string
  name: string
  transport: string
  endpoint: string
  tools: string[]
  trusted: boolean
  enabled: boolean
}
/**
 * Real counts behind the overview's headline figures, computed by the runtime from the task table.
 *
 * `model.share` and `deterministicShare` are null until at least one run records which route it took —
 * "no runs yet" is not the same claim as "0%", and only one of them is honest.
 */
export type TaskStatistics = {
  windowDays: number
  tasksTotal: number
  tasksInWindow: number
  observationsInWindow: number
  byStatus: Record<string, number>
  byDecision: Record<string, number>
  model: { recordedRuns: number; calls: number; share: number | null }
  deterministicShare: number | null
  source: string
  note: string
}
export type TaskObservation = {
  capability: string
  success: boolean
  exitCode: number
  stdout: string
  stderr: string
  metadata?: { nodeId?: string; state?: string; required?: boolean; expertId?: string }
}
export type TaskResult = {
  id: string
  goal: string
  status: string
  decision: string
  /** Which route the judgement stage took: `unverified-observation` / `skipped` / `unavailable`, or "" when the run never reached it. */
  modelEnhancement?: string
  observations?: TaskObservation[]
  createdAt?: string
}
export type MissionRecord = {
  id: string
  handoffId: string
  source: 'chat' | 'builder' | 'board'
  sourceRef: string
  summary: string
  status: 'created'
  execution:
    | 'not_started'
    | 'running'
    | 'cancelling'
    | 'succeeded'
    | 'failed'
    | 'timed_out'
    | 'cancelled'
    | 'interrupted'
  approval: 'not_requested'
  grant: 'none'
  verification: 'not_requested'
  createdAt?: string
}
export type MissionExecutionRecord = {
  id: string
  missionId: string
  status: string
  capability: 'git-status'
  principal: 'local-operator'
  exitCode?: number | null
  exitEvidence?: string | null
  unconfirmedReason?: string | null
  approval: 'NOT_REQUIRED'
  cancelRequested?: boolean
}
export type PrototypeVersionRecord = {
  id: string
  sourceRef: 'builder-alpha' | 'builder-beta'
  title: string
  body: string
  acceptance: string[]
  contentHash: string
  createdAt?: string
}
export type PrototypeDeliveryRecord = {
  id: string
  versionId: string
  createdAt?: string
}
export type HandoffRecord = {
  id: string
  source: 'chat' | 'builder' | 'board'
  sourceRef: string
  summary: string
  status: 'recorded'
  execution: 'not_started'
  approval: 'not_requested'
  grant: 'none'
  createdAt?: string
}
export type SqlFinding = {
  code: string
  title?: string
  category: string
  severity: string
  evidence: string
  suggestion: string
  confidence: number
}
export type BlockedRule = {
  rule: string
  missingFacts: string[]
  missingCapabilities: string[]
}
export type RuleCapabilityCheck = {
  id: string
  required: string[]
  met: boolean
  missing: string[]
}
export type DeterministicAnalysis = {
  parseStatus?: string
  statementType?: string
  normalizedSql?: string
  engineVersion?: string
  findings?: SqlFinding[]
  rulesFired?: string[]
  blockedRules?: BlockedRule[]
  ruleCapabilities?: RuleCapabilityCheck[]
  suggestions?: string[]
  tables?: string[]
  joinKeys?: string[]
  joinColumns?: Array<Record<string, string>>
  severityCounts?: Record<string, number>
  complexity?: number
  deterministicConfidence?: number
  requiresModelReview?: boolean
  summary?: string
  error?: string
  facts?: Record<string, unknown>
}
export type RulePackSummary = {
  id: string
  name: string
  description?: string | null
  version?: number | null
  ruleCount: number
  shipped: boolean
  editable: boolean
  enabled: boolean
  revision: number
  /** Capabilities this pack needs in order to produce findings. */
  requires?: string[]
  requiredFacts?: string[]
}
export type RuleRequirements = { declared: string[]; derived: string[]; facts?: string[] }
/** A saved pack's detail: the manifest as text, plus whether the editor may change it. */
export type RulePackDetail = {
  manifest: string
  shipped: boolean
  editable: boolean
  requirements?: RuleRequirements
}
/** What the backend says about a candidate manifest — the same checks that gate a save. */
export type RuleValidation = { valid: boolean; errors: string[]; requirements?: RuleRequirements }
export type RulePackWriteResult = { id: string; revision?: number; enabled?: boolean }
export type RuleCondition = {
  fact?: string
  op?: string
  value?: unknown
  all?: RuleCondition[]
  any?: RuleCondition[]
  not?: RuleCondition
}
export type RuleDefinition = {
  id: string
  title?: string
  category?: string
  severity?: string
  when?: RuleCondition
  severityWhen?: Array<{ when?: RuleCondition; severity?: string }>
  evidence?: string
  suggestion?: string
  confidence?: number
}
export type RulePackManifest = {
  apiVersion?: string
  kind?: string
  id: string
  name: string
  version?: number
  description?: string
  requires?: { capabilities?: string[]; note?: string }
  rules?: RuleDefinition[]
}
export type RuleFact = {
  key: string
  type: string
  group: string
  description: string
  /** Capability that publishes this fact; a rule pack referencing it therefore needs that capability. */
  producedBy: string
}
export type DryRunResult = {
  valid: boolean
  errors: string[]
  parseStatus?: string
  facts?: Record<string, unknown>
  findings?: SqlFinding[]
  rulesFired?: string[]
  blockedRules?: BlockedRule[]
  severityCounts?: Record<string, number>
  complexity?: number
  summary?: string
  requirements?: RuleRequirements
  factProducers?: Record<string, string>
}
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
export type SqlAnalysis = {
  modelEnhancement?: string
  id?: string
  nodes?: Array<{ id: string; label: string; capability: string; state: string; message: string }>
  status: string
  sql: string
  advice: string[]
  safety: string[]
  expertAdvice: string | null
  analysisMode: string
  message?: string
  deterministicAnalysis?: DeterministicAnalysis
  modelAdvisor?: ModelAdvisor
  rulePacks?: Array<{ id: string; name: string; ruleCount: number; requires?: string[] }>
  /** Per-pack check of whether this run could produce the facts the pack depends on. */
  rulePackRequirements?: RuleCapabilityCheck[]
  executedCapabilities?: string[]
  knowledgeEvidence?: Array<{
    source: string
    knowledgeBase: string
    score: number
    excerpt: string
  }>
}

export type AiConnectionState =
  | 'disabled'
  | 'not_configured'
  | 'configured_unverified'
  | 'available'
  | 'error'
export type AiToolMode = 'none' | 'git_status'
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
/** Read-only generation-prep baseline. Never includes file contents. */
export type WorkspaceBaseline = {
  path: string
  exists: boolean
  baseHash: string
  denial: string
}
/** Read-only workspace excerpt for generation prep. Does not grant write authorization. */
export type WorkspaceSource = {
  path: string
  exists: boolean
  baseHash: string
  bytes: number
  excerpt: string
  denial: string
}
export type WorkspaceFiles = {
  path: string
  entries: Array<{ name: string; path: string; directory: boolean }>
  truncated: boolean
  denial: string
}
export type BoardColumn = 'planned' | 'ready' | 'running' | 'acceptance' | 'done'
export type BoardTask = {
  id: string
  projectId: string
  title: string
  column: BoardColumn
  notes: string
  sessionId: string
  revision: number
  events: string[]
  priority: 'none' | 'p0' | 'p1' | 'p2'
  goal: string
  acceptanceCriteria: string
  executionActive: boolean
  prototypeVersionId: string | null
  preparationIssues: Array<'goal' | 'acceptanceCriteria'>
  allowedColumns: BoardColumn[]
}
export type BoardTaskDraft = {
  projectId: string
  title: string
  column: 'planned' | 'ready'
  sessionId: string
  goal: string
  acceptanceCriteria: string
  requestId: string
}
export type BoardPrototypeReference = {
  id: string
  sourceRef: string
  title: string
  contentHash: string
  createdAt: string
}
export type BoardRunStart = {
  projectId: string
  revision: number
  requestId: string
  workspacePath: string
}
export type BoardRun = {
  requestId: string
  taskRevision: number
  task: {
    title: string
    goal: string
    acceptanceCriteria: string
    prototype?: BoardPrototypeReference | null
  }
  execution: MissionExecutionRecord & {
    workspacePath: string
    workspaceLabel: string
    executable: string
    stdout: string | null
    stderr: string | null
    startedAt: string
    finishedAt: string | null
  }
}
export type BoardRunPage = {
  availability: { allowed: boolean; workspacePath: string; workspaceLabel: string; reason: string }
  items: BoardRun[]
}
export type BoardReviewEvidence = {
  contentHash: string
  snapshot: {
    workspacePath: string
    baseCommit: string
    headAfter: string
    startedAt: string
    finishedAt: string
    status: 'CAPTURED' | 'INCOMPLETE' | 'FAILED' | 'CHANGED'
    issues: string[]
    repositoryStatus: string
    diff: string
    check: {
      status: 'NOT_RUN' | 'PASSED' | 'FAILED' | 'INCOMPLETE' | 'STALE'
      exitCode: number | null
      output: string
    }
    steps: Array<{
      name: string
      command: string[]
      exitCode: number
      processStatus: string
      truncated: boolean
      stderr: string
    }>
  }
}
export type BoardReviewPage = {
  evidence: BoardReviewEvidence | null
  captureAllowed: boolean
  reason: string
}
export type BoardVerificationSource = {
  scope: string
  contentHash: string
  files: Array<{ path: string; contentHash: string; bytes: number }>
  exclusions: string[]
}
export type BoardVerificationCommand = {
  id: string
  command: string[]
  workingDirectory: string
  timeoutSeconds: number
}
export type BoardVerificationPlan = {
  planHash: string
  workspacePath: string
  baseCommit: string
  source: BoardVerificationSource
  commands: BoardVerificationCommand[]
}
export type BoardVerificationStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'PASSED'
  | 'FAILED'
  | 'STALE'
  | 'UNKNOWN'
export type BoardVerificationCheck = Omit<BoardVerificationCommand, 'timeoutSeconds'> & {
  status: BoardVerificationStatus | 'TIMED_OUT'
  exitCode: number | null
  stdout: string
  stderr: string
  truncated: boolean
  processTreeCleanup: boolean
  startedAt: string
  finishedAt: string | null
}
export type BoardVerificationRecord = {
  id: string
  status: BoardVerificationStatus
  reason: string
  plan: BoardVerificationPlan | null
  workspacePath?: string | null
  checks: BoardVerificationCheck[]
  sourceAfter: BoardVerificationSource | null
  startedAt: string
  finishedAt: string | null
}
export type BoardVerificationPage = {
  record: BoardVerificationRecord | null
  prepareAllowed: boolean
  reason: string
}
export type BoardApplicationRef = { conversationId: string; proposalId: string }
export type BoardApplicationEvidence = BoardApplicationRef & {
  association: 'POST_HOC' | 'PREBOUND'
  taskBinding?: CodeTaskRef | null
  generationId: string
  targetPath: string
  generationBaseHash: string
  appliedAfterHash: string
  generationCapturedAt: string
  prototypeVersionId: string | null
  prototypeContentHash: string | null
  associatedAt: string
  operator: 'local-operator'
}
export type BoardDeliveryRequest = BoardRunStart & {
  paths: string[]
  note: string
  applicationRef?: BoardApplicationRef
}
export type BoardDeliveryDecisionRequest = {
  projectId: string
  revision: number
  requestId: string
  deliveryId: string
  decision: 'ACCEPT' | 'REJECT'
  criteriaConfirmed: boolean
  previewConfirmed: boolean
  comment: string
}
export type BoardDeliveryDecision = Omit<
  BoardDeliveryDecisionRequest,
  'projectId' | 'revision' | 'deliveryId'
> & { id: string; operator: 'local-operator'; createdAt: string }
export type BoardDeliveryFile = {
  path: string
  beforeHash: string
  afterHash: string
  before: string
  after: string
}
export type BoardDelivery = {
  id: string
  source: 'EXTERNAL_MANUAL' | 'CHAT_APPLIED_POST_HOC' | 'CHAT_APPLIED_PREBOUND'
  applicationEvidence?: BoardApplicationEvidence | null
  requestId: string
  taskRevision: number
  submittedRevision: number
  workspacePath: string
  baseCommit: string
  verificationId: string
  sourceHash: string
  prototypeVersionId: string | null
  goal: string
  acceptanceCriteria: string
  note: string
  files: BoardDeliveryFile[]
  createdAt: string
  decision: BoardDeliveryDecision | null
}
export type BoardDeliveryPage = {
  record: BoardDelivery | null
  prepareAllowed: boolean
  reason: string
}

/** Read-only dirty-file summary. requested=false means git was not run. */
export type WorkspaceDirty = {
  requested: boolean
  denial: string
  count: number
  paths: string[]
  detail: string
}
/**
 * Safe verification probe. requested=false means the probe did not run.
 * Never marks apply verification as passed; never enables configured heavy checks.
 */
export type VerificationProbe = {
  requested: boolean
  denial: string
  name: string
  exitCode: number | null
  summary: string
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
  state:
    | 'waiting'
    | 'exchanging'
    | 'connected'
    | 'permission_required'
    | 'failed'
    | 'expired'
    | 'cancelled'
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
export type ConversationConnection = {
  conversationId: string
  connectionId: string
  connectionName: string
  model: string
  endpoint: string
  revision: number
  memoryCleared: boolean
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
export type KnowledgeContext = {
  expertRef: KnowledgeExpertRef
  status: 'ready' | 'no_matches'
  references: Array<{
    id: string
    source: string
    knowledgeBase: string
    excerpt: string
    retrievalMode: string
    knowledgeBaseId?: string
    documentId?: string
  }>
}
export type ContextBudgetObservation = {
  platformLimit: number
  outputReserve: number
  inputMaterialLimit: number
  usedChars: number
  materialChars: number
  remainingChars: number
  metering: 'CHAR_ESTIMATE' | 'UNKNOWN' | string
  sources: Array<{
    source: string
    chars: number
    metering: string
    disposition: string
  }>
  notes: string[]
}
export type AiMessageResult = {
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

export type CodeTaskRef = { projectId: string; taskId: string; revision: number }
export type KnowledgeExpertRef = { id: string; revision: number }
export type SkillRef = { id: string; version: string; digest: string; stateRevision: number }
export type SkillResource = {
  path: string
  mediaType: 'text/markdown' | 'text/plain'
  content: string
}
export type SkillImportInput = {
  rawSkillMd: string
  version: string
  sourceLabel: string
  resources: SkillResource[]
  requiredCapabilities: string[]
}
export type SkillDependency = { id: string; status: string }
export type SkillSummary = SkillRef & {
  description: string
  enabled: boolean
  sourceLabel: string
  createdAt: string
  dependencies: SkillDependency[]
}
export type SkillSnapshot = Omit<SkillSummary, 'createdAt'> &
  SkillImportInput & {
    createdAt: string | null
    schemaVersion: 1
    entry: 'SKILL.md'
    instructions: string
    scope: string
    trust: { operator: string; confirmedAt: string } | null
  }
export type SkillSaveRequest = { input: SkillImportInput; expectedDigest: string; confirmed: true }
export type SkillContext = {
  skillRef: SkillRef
  instructions: string
  resources: SkillResource[]
  dependencies: SkillDependency[]
}
export type TaskContext = {
  skillRef?: SkillRef
  skillResourcePaths?: string[]
  knowledgeExpertRef?: KnowledgeExpertRef
  taskRef?: CodeTaskRef
  mode: 'chat' | 'code'
  expert: 'general' | 'sql' | 'frontend'
  instructions: string
  reasoning: 'default' | 'low' | 'medium' | 'high'
  approval: 'review' | 'read_only'
  files: Array<{ name: string; content: string }>
  prototypeVersionId: string
  /** Workspace-relative page the server may read for generation prep; never a write grant. */
  targetPath: string
}
export type CodeGenerationSnapshot = {
  taskBinding?: CodeTaskRef | null
  id: string
  targetPath: string
  baseHash: string
  capturedAt: string
  prototypeVersionId: string
  prototypeContentHash: string
}
export type CodeProposal = {
  id: string
  conversationId: string
  workspace: string
  summary: string
  files: Array<{ path: string; before: string | null; content: string; baseHash: string }>
  generation?: CodeGenerationSnapshot | null
  applied: boolean
  writeAllowed: boolean
  verification: string
}

export type CodeApplied = {
  id: string
  written: string[]
  verification: string
  checks: Array<{ name: string; exitCode: number | null; summary: string }>
  status?: string
  afterHash?: string
  reason?: string
}
export type CodeProposalState = {
  proposal: CodeProposal
  status: 'PROPOSED' | 'APPLYING' | 'APPLIED' | 'FAILED' | 'UNKNOWN' | 'REFUSED'
  result: CodeApplied | null
  reason: string
}

export function proposalRefused(status: string | null | undefined): boolean {
  return status === 'REFUSED'
}

const baseUrl = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8080/api'

const client = axios.create({
  baseURL: baseUrl,
  timeout: 10_000,
  headers: { Accept: 'application/json' },
})

client.interceptors.request.use((config) => {
  if (pendingRequests++ === 0) NProgress.start()
  return config
})
client.interceptors.response.use(
  (response) => {
    finishRequest()
    return response
  },
  (error) => {
    finishRequest()
    return Promise.reject(error)
  },
)

let pendingRequests = 0
function finishRequest() {
  pendingRequests = Math.max(0, pendingRequests - 1)
  if (!pendingRequests) NProgress.done()
}

async function get<T>(path: string): Promise<T> {
  return (await client.get<T>(path)).data
}

function gitExecutionPath(operation: GitExecutionOperation) {
  if (operation !== 'git-status' && operation !== 'git-diff') {
    throw new Error('TOOL_OPERATION_NOT_FOUND')
  }
  return '/cli-programs/git/operations/' + operation + '/executions'
}
const gitOperationApi = {
  start: (
    operation: GitExecutionOperation,
    requestId: string,
    options?: { signal?: AbortSignal; mockOutcome?: string },
  ) =>
    client
      .post<ToolExecution>(
        gitExecutionPath(operation),
        { requestId },
        {
          signal: options?.signal,
          params: options?.mockOutcome ? { mockOutcome: options.mockOutcome } : undefined,
        },
      )
      .then((r) => r.data),
  list: (operation: GitExecutionOperation, signal?: AbortSignal) =>
    client
      .get<{ items: ToolExecution[] }>(gitExecutionPath(operation), { signal })
      .then((r) => r.data),
  get: (operation: GitExecutionOperation, id: string, signal?: AbortSignal) =>
    client
      .get<ToolExecution>(gitExecutionPath(operation) + '/' + encodeURIComponent(id), { signal })
      .then((r) => r.data),
  cancel: (operation: GitExecutionOperation, id: string, signal?: AbortSignal) =>
    client
      .post<ToolExecution>(
        gitExecutionPath(operation) + '/' + encodeURIComponent(id) + '/cancel',
        {},
        { signal },
      )
      .then((r) => r.data),
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
  saveScenario: (
    id: string,
    revision: number,
    definition: ScenarioConfiguration,
    options?: { mockOutcome?: 'save-lost' },
  ) =>
    client
      .put<ScenarioSnapshot>(
        '/scenarios/' + encodeURIComponent(id),
        { revision, definition },
        {
          params: options?.mockOutcome ? { mockOutcome: options.mockOutcome } : undefined,
        },
      )
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
  probeTrustedToolVersion: (
    id: string,
    options?: { mockOutcome?: 'success' | 'fail' | 'conflict' | 'disabled'; signal?: AbortSignal },
  ) =>
    client
      .post<TrustedToolVersionProbeResult>(
        '/runtime/trusted-tools/' + encodeURIComponent(id) + '/probe-version',
        {},
        {
          signal: options?.signal,
          params: options?.mockOutcome ? { mockOutcome: options.mockOutcome } : undefined,
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
  startTrustedGitExecution: (
    requestId: string,
    options?: { signal?: AbortSignal; mockOutcome?: string },
  ) => gitOperationApi.start('git-status', requestId, options),
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
              !['RUN', 'VERIFICATION', 'SOURCE_WRITE'].includes(item.kind) ||
              !['CREATED', 'QUEUED', 'RUNNING', 'CANCELLING', 'APPLYING', 'UNKNOWN'].includes(
                item.status,
              ) ||
              typeof item.storedStatus !== 'string' ||
              !item.storedStatus,
          )
        )
          throw new Error('INVALID_BOARD_RUNTIME_RESPONSE')
        return data
      }),
  boardTasks: (projectId: string) =>
    get<{ items: BoardTask[] }>('/board/tasks?projectId=' + encodeURIComponent(projectId)),
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
  createBoardTask: (draft: BoardTaskDraft) =>
    client.post<BoardTask>('/board/tasks', draft).then((response) => response.data),
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
  savePrototypeVersion: (draft: {
    sourceRef: 'builder-alpha' | 'builder-beta'
    title: string
    body: string
    acceptance: string[]
  }) =>
    client
      .post<PrototypeVersionRecord>('/prototype-versions', draft)
      .then((response) => response.data),
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
  baseURL: string,
  path: string,
  body: unknown,
  options?: { signal?: AbortSignal; onEvent?: (event: ChatExecutionEvent) => void },
): Promise<AiMessageResult> {
  const response = await fetch(joinUrl(baseURL, path), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(body),
    signal: options?.signal,
  })
  if (!response.ok) {
    let detail = 'AI_PROVIDER_ERROR'
    let data: Record<string, unknown> = {}
    try {
      data = (await response.json()) as Record<string, unknown>
      if (typeof data.detail === 'string') detail = data.detail
    } catch {
      // Keep generic detail when the error body is not JSON.
    }
    const error = Object.assign(new Error(detail), {
      response: { status: response.status, data: { ...data, detail } },
    })
    throw error
  }
  if (!response.body) {
    throw Object.assign(new Error('AI_EMPTY_RESPONSE'), {
      response: { status: 502, data: { detail: 'AI_EMPTY_RESPONSE' } },
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
    throw chatStreamError('AI_RESPONSE_INCOMPLETE')
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

function joinUrl(baseURL: string, path: string): string {
  return baseURL.replace(/\/$/, '') + (path.startsWith('/') ? path : '/' + path)
}

function chatStreamError(detail: string): Error {
  return Object.assign(new Error(detail), {
    response: { status: 502, data: { detail } },
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
    !Number.isSafeInteger(event.sequence) ||
    (event.sequence as number) < 0
  )
    throw chatStreamError('AI_RESPONSE_INVALID')
  if (event.type === 'final' && event.payload != null) {
    const payload = event.payload
    if (
      !isStreamRecord(payload) ||
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
  transport = axios.create({ baseURL, timeout: 10_000, headers: { Accept: 'application/json' } }),
) {
  const client = transport
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
    workspaceDirty: () => get<WorkspaceDirty>('/ai/workspace/dirty'),
    workspaceFiles: (path = '') =>
      get<WorkspaceFiles>('/ai/workspace/files?path=' + encodeURIComponent(path)),
    workspaceVerificationProbe: () =>
      client
        .post<VerificationProbe>('/ai/workspace/verification/probe', {})
        .then((response) => response.data),
    aiConversation: (id: string) =>
      get<AiConversation>('/ai/conversations/' + encodeURIComponent(id)),
    putWorkingMemory: (
      id: string,
      body: {
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
    reconnectAiConversation: (id: string, expectedWorkspaceLabel: string) =>
      client
        .post<AiConversation & { contextReset: boolean }>(
          '/ai/conversations/' + encodeURIComponent(id) + '/reconnect',
          { confirmContextReset: true, expectedWorkspaceLabel },
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
        baseURL,
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
      ),
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
