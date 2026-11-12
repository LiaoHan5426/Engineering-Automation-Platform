import type { BoardTaskDraft } from '@eap/runtime-client'

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export type TaskHandoff = {
  source: { conversationId: string; executionId: string; text: string }
  draft: Pick<BoardTaskDraft, 'projectId' | 'title' | 'goal' | 'acceptanceCriteria'>
  linkSource: boolean
}
const key = (scope: string) => `${scope}.eap.board-task-handoff.v1`
function valid(value: unknown): value is TaskHandoff {
  if (!value || typeof value !== 'object') return false
  const item = value as TaskHandoff
  return (
    !!item.source &&
    !!item.draft &&
    typeof item.linkSource === 'boolean' &&
    typeof item.source.conversationId === 'string' &&
    item.source.conversationId.length > 0 &&
    item.source.conversationId.length <= 120 &&
    typeof item.source.executionId === 'string' &&
    item.source.executionId.length <= 120 &&
    typeof item.source.text === 'string' &&
    item.source.text.length > 0 &&
    item.source.text.length <= 20000 &&
    typeof item.draft.projectId === 'string' &&
    item.draft.projectId.length <= 120 &&
    typeof item.draft.title === 'string' &&
    item.draft.title.length <= 200 &&
    typeof item.draft.goal === 'string' &&
    item.draft.goal.length <= 20000 &&
    typeof item.draft.acceptanceCriteria === 'string' &&
    item.draft.acceptanceCriteria.length <= 4000
  )
}
/** Unsent UI draft, separate from the immutable request used for an uncertain POST. */
export function readTaskHandoff(store: Store, scope: string): TaskHandoff | null {
  const raw = store.getItem(key(scope))
  if (raw === null) return null
  const value: unknown = JSON.parse(raw)
  if (!valid(value)) throw new Error('Invalid task handoff')
  return value
}
export function writeTaskHandoff(
  store: Store,
  scope: string,
  next: TaskHandoff | null,
  expected: TaskHandoff | null,
) {
  const current = readTaskHandoff(store, scope)
  if (JSON.stringify(current) !== JSON.stringify(expected)) throw new Error('Task handoff changed')
  if (next !== null && !valid(next)) throw new Error('Invalid task handoff')
  if (next) store.setItem(key(scope), JSON.stringify(next))
  else store.removeItem(key(scope))
  if (JSON.stringify(readTaskHandoff(store, scope)) !== JSON.stringify(next))
    throw new Error('Task handoff readback failed')
}
