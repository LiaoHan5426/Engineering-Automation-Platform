export const BoardDeliverySource = {
  EXTERNAL_MANUAL: 'EXTERNAL_MANUAL',
  CHAT_APPLIED_POST_HOC: 'CHAT_APPLIED_POST_HOC',
  CHAT_APPLIED_PREBOUND: 'CHAT_APPLIED_PREBOUND',
} as const
export type BoardDeliverySource = (typeof BoardDeliverySource)[keyof typeof BoardDeliverySource]
export const boardDeliverySourceValues: readonly BoardDeliverySource[] =
  Object.values(BoardDeliverySource)
export function isBoardDeliverySource(value: unknown): value is BoardDeliverySource {
  return (
    typeof value === 'string' && (boardDeliverySourceValues as readonly string[]).includes(value)
  )
}

export const BoardDeliveryDecision = {
  ACCEPT: 'ACCEPT',
  REJECT: 'REJECT',
} as const
export type BoardDeliveryDecision =
  (typeof BoardDeliveryDecision)[keyof typeof BoardDeliveryDecision]
export const boardDeliveryDecisionValues: readonly BoardDeliveryDecision[] =
  Object.values(BoardDeliveryDecision)
export function isBoardDeliveryDecision(value: unknown): value is BoardDeliveryDecision {
  return (
    typeof value === 'string' && (boardDeliveryDecisionValues as readonly string[]).includes(value)
  )
}
