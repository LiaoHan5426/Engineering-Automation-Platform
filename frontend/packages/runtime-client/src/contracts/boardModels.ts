import type { BoardTaskColumn } from './boardTask.ts'
import type { MissionExecutionRecord } from './workflowModels.ts'
import type { BoardReviewStatus } from './boardReview.ts'
import type { BoardReviewCheckStatus } from './boardReview.ts'
import type { BoardVerificationCheckStatus } from './boardVerification.ts'
import type { BoardVerificationStatus } from './boardVerification.ts'
import type { CodeProposalState } from './codeModels.ts'
import type { BoardDeliveryDecision } from './boardDelivery.ts'
import type { BoardDeliverySource } from './boardDelivery.ts'
import type { MissionExecutionStatus } from './missionExecution.ts'
import type { CodeProposalStatus } from './codeProposal.ts'

export type BoardRuntimeActivity = { taskId: string; id: string } & (
  | { kind: 'RUN'; status: MissionExecutionStatus; storedStatus: MissionExecutionStatus }
  | { kind: 'VERIFICATION'; status: BoardVerificationStatus; storedStatus: BoardVerificationStatus }
  | { kind: 'SOURCE_WRITE'; status: CodeProposalStatus; storedStatus: CodeProposalStatus }
)

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
  items: BoardRuntimeActivity[]
  truncated: boolean
}

export type BoardColumn = BoardTaskColumn

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
    status: BoardReviewStatus
    issues: string[]
    repositoryStatus: string
    diff: string
    check: {
      status: BoardReviewCheckStatus
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

export type BoardVerificationCheck = Omit<BoardVerificationCommand, 'timeoutSeconds'> & {
  status: BoardVerificationCheckStatus
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

export type BoardCodeCandidate = {
  fileCount: number
  id: string
  conversationId: string
  generationId: string
  taskRevision: number
  targetPath: string
  status: CodeProposalState['status']
  writeAllowed: boolean
  createdAt: string
}

export type BoardCodeCandidates = {
  taskId: string
  projectId: string
  currentRevision: number
  workspacePath: string
  items: BoardCodeCandidate[]
  truncated: boolean
}

export type BoardAppliedCandidate = BoardApplicationRef & {
  paths: string[]
  generationId: string
  targetPath: string
  afterHash: string
  appliedAt: string
}

export type BoardAppliedCandidates = {
  taskBinding: CodeTaskRef
  workspacePath: string
  items: BoardAppliedCandidate[]
  truncated: boolean
}

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
  decision: BoardDeliveryDecision
  criteriaConfirmed: boolean
  previewConfirmed: boolean
  comment: string
}

export type BoardDeliveryDecisionRecord = Omit<
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
  source: BoardDeliverySource
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
  decision: BoardDeliveryDecisionRecord | null
}

export type BoardDeliveryPage = {
  record: BoardDelivery | null
  prepareAllowed: boolean
  reason: string
}

export type CodeTaskRef = { projectId: string; taskId: string; revision: number }
