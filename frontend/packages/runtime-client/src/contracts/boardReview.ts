export const BoardReviewStatus = {
  CAPTURED: 'CAPTURED',
  INCOMPLETE: 'INCOMPLETE',
  FAILED: 'FAILED',
  CHANGED: 'CHANGED',
} as const
export type BoardReviewStatus = (typeof BoardReviewStatus)[keyof typeof BoardReviewStatus]
export const boardReviewStatusValues: readonly BoardReviewStatus[] =
  Object.values(BoardReviewStatus)
export function isBoardReviewStatus(value: unknown): value is BoardReviewStatus {
  return typeof value === 'string' && (boardReviewStatusValues as readonly string[]).includes(value)
}

export const BoardReviewCheckStatus = {
  NOT_RUN: 'NOT_RUN',
  PASSED: 'PASSED',
  FAILED: 'FAILED',
  INCOMPLETE: 'INCOMPLETE',
  STALE: 'STALE',
} as const
export type BoardReviewCheckStatus =
  (typeof BoardReviewCheckStatus)[keyof typeof BoardReviewCheckStatus]
export const boardReviewCheckStatusValues: readonly BoardReviewCheckStatus[] =
  Object.values(BoardReviewCheckStatus)
export function isBoardReviewCheckStatus(value: unknown): value is BoardReviewCheckStatus {
  return (
    typeof value === 'string' && (boardReviewCheckStatusValues as readonly string[]).includes(value)
  )
}
