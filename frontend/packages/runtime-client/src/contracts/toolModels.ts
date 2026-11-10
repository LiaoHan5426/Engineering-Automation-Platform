import type { TrustedToolBindingStatus } from './toolBinding.ts'
import type { TrustedToolVersionStatus } from './toolBinding.ts'
import type { ToolExecutionStatus } from './toolExecution.ts'
import type { ProcessIdentityStatus } from './processIdentity.ts'

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
  bindingStatus?: TrustedToolBindingStatus
  bindingSource?: string
  binary?: string
  resolvedPath?: string
  versionStatus?: TrustedToolVersionStatus
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

export type GitExecutionOperation = 'git-status' | 'git-diff'

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
  status: ProcessIdentityStatus
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
  versionStatus: TrustedToolVersionStatus
  detectedVersion?: string
  probedAt?: string
  resolvedPath?: string
  success: boolean
  message: string
  output?: string
}
