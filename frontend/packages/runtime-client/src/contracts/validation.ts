import { isToolExecutionStatus } from './toolExecution.ts'
import { isCodeProposalStatus } from './codeProposal.ts'
import { isCodeProposalStatusBlocking } from './codeProposal.ts'
import { isMissionExecutionStatus, isMissionExecutionStatusBlocking } from './missionExecution.ts'
import {
  isBoardVerificationStatus,
  isBoardVerificationStatusBlocking,
} from './boardVerification.ts'

/** A malformed protocol value is a read failure, never a fabricated execution UNKNOWN. */
export function validateToolExecution<T extends { status: unknown }>(record: T): T {
  if (!record || !isToolExecutionStatus(record.status))
    throw new Error('INVALID_TOOL_EXECUTION_STATUS')
  return record
}
export function validateCodeProposal<T extends { status: unknown }>(record: T): T {
  if (!record || !isCodeProposalStatus(record.status))
    throw new Error('INVALID_CODE_PROPOSAL_STATUS')
  return record
}

/** Aggregate rows still belong to three distinct state machines. */
export function isBoardRuntimeActivity(item: {
  kind: unknown
  status: unknown
  storedStatus: unknown
}): boolean {
  switch (item.kind) {
    case 'RUN':
      return (
        isMissionExecutionStatus(item.status) &&
        isMissionExecutionStatusBlocking(item.status) &&
        isMissionExecutionStatus(item.storedStatus)
      )
    case 'VERIFICATION':
      return (
        isBoardVerificationStatus(item.status) &&
        isBoardVerificationStatusBlocking(item.status) &&
        isBoardVerificationStatus(item.storedStatus)
      )
    case 'SOURCE_WRITE':
      return (
        isCodeProposalStatus(item.status) &&
        isCodeProposalStatusBlocking(item.status) &&
        isCodeProposalStatus(item.storedStatus)
      )
    default:
      return false
  }
}
