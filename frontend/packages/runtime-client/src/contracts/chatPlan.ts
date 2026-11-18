/** Mirrored from the Chat domain enum; checked by verify-domain-contracts.py. */
export const ChatPlanItemStatus = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
} as const
export type ChatPlanItemStatus = (typeof ChatPlanItemStatus)[keyof typeof ChatPlanItemStatus]
export type ChatPlanSnapshot = {
  schemaVersion: 1
  planId: string
  conversationId: string
  executionId: string
  revision: number
  updatedAt: string
  items: Array<{ id: string; content: string; status: ChatPlanItemStatus }>
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)
export function isChatPlanSnapshot(v: unknown): v is ChatPlanSnapshot {
  if (
    !record(v) ||
    v.schemaVersion !== 1 ||
    !['planId', 'conversationId', 'executionId'].every(
      (k) => typeof v[k] === 'string' && uuid.test(v[k] as string),
    ) ||
    !Number.isSafeInteger(v.revision) ||
    (v.revision as number) < 1 ||
    typeof v.updatedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T/.test(v.updatedAt) ||
    !Number.isFinite(Date.parse(v.updatedAt)) ||
    !Array.isArray(v.items) ||
    v.items.length > 32
  )
    return false
  const ids = new Set<string>()
  if (
    !v.items.every((item) => {
      if (
        !record(item) ||
        typeof item.id !== 'string' ||
        !uuid.test(item.id) ||
        ids.has(item.id) ||
        typeof item.content !== 'string' ||
        !item.content.trim() ||
        Array.from(item.content).length > 500 ||
        !Object.values(ChatPlanItemStatus).includes(item.status as ChatPlanItemStatus)
      )
        return false
      ids.add(item.id)
      return true
    })
  )
    return false
  return new TextEncoder().encode(JSON.stringify(v)).length <= 32768
}
