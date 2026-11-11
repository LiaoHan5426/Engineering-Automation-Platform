export const CodeProposalStatus = {
  PROPOSED: 'PROPOSED',
  APPLYING: 'APPLYING',
  APPLIED: 'APPLIED',
  FAILED: 'FAILED',
  UNKNOWN: 'UNKNOWN',
  CLOSED_UNKNOWN: 'CLOSED_UNKNOWN',
  REFUSED: 'REFUSED',
} as const
export type CodeProposalStatus = (typeof CodeProposalStatus)[keyof typeof CodeProposalStatus]
export const codeProposalStatusValues: readonly CodeProposalStatus[] =
  Object.values(CodeProposalStatus)
export function isCodeProposalStatus(value: unknown): value is CodeProposalStatus {
  return (
    typeof value === 'string' && (codeProposalStatusValues as readonly string[]).includes(value)
  )
}

export function isCodeProposalStatusActive(value: unknown): boolean {
  return value === CodeProposalStatus.APPLYING
}

export function isCodeProposalStatusBlocking(value: unknown): boolean {
  return value === CodeProposalStatus.APPLYING || value === CodeProposalStatus.UNKNOWN
}

export function proposalRefused(status: string | null | undefined): boolean {
  return status === CodeProposalStatus.REFUSED
}

export const SourceFileMatch = {
  BASELINE: 'BASELINE',
  CANDIDATE: 'CANDIDATE',
  BOTH: 'BOTH',
  DIFFERENT: 'DIFFERENT',
} as const
export type SourceFileMatch = (typeof SourceFileMatch)[keyof typeof SourceFileMatch]
export type SourceWriteReviewItem = {
  id: string
  status:
    | typeof CodeProposalStatus.APPLYING
    | typeof CodeProposalStatus.UNKNOWN
    | typeof CodeProposalStatus.CLOSED_UNKNOWN
  reason: string
  startedAt: string
}
export type SourceWriteObservation = {
  digest: string
  files: Array<{
    path: string
    baselineHash: string
    candidateHash: string
    currentHash: string
    match: SourceFileMatch
  }>
}
export type SourceWriteReviewRequest = {
  requestId: string
  digest: string
  note: string
  confirmed: true
}
export type SourceWriteReviewDetail = {
  item: SourceWriteReviewItem
  workspace: string
  observation: SourceWriteObservation
  resolution: {
    requestId: string
    operator: string
    closedAt: string
    note: string
    observation: SourceWriteObservation
  } | null
}
