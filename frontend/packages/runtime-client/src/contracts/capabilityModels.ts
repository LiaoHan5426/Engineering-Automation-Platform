import type { ModelAdvisor } from './chatModels.ts'
import type { KnowledgeExpertRef } from './chatModels.ts'

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

export type ConversationConnection = {
  conversationId: string
  connectionId: string
  connectionName: string
  model: string
  endpoint: string
  revision: number
  memoryCleared: boolean
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
