import { isChatPlanSnapshot, type ChatPlanSnapshot } from '@eap/runtime-client'

export type PlanObservation = {
  snapshot: ChatPlanSnapshot | null
  state: 'empty' | 'loading' | 'ready' | 'error'
  authority: 'server' | 'cache'
}
/** One observer belongs to one immutable conversation/execution pair. GET and SSE share revision authority. */
export function createPlanObserver(
  conversationId: string,
  executionId: string,
  read: () => Promise<ChatPlanSnapshot | null>,
  publish: (value: PlanObservation) => void,
  cached: ChatPlanSnapshot | null = null,
) {
  let snapshot = cached
  let authority: PlanObservation['authority'] = cached ? 'cache' : 'server'
  let generation = 0
  const emit = (state: PlanObservation['state']) => publish({ snapshot, state, authority })
  const scoped = (v: unknown): v is ChatPlanSnapshot =>
    isChatPlanSnapshot(v) && v.conversationId === conversationId && v.executionId === executionId
  function accept(value: ChatPlanSnapshot) {
    if (!scoped(value)) return false
    if (
      authority === 'server' &&
      snapshot &&
      (value.planId !== snapshot.planId || value.revision <= snapshot.revision)
    )
      return false
    snapshot = value
    authority = 'server'
    return true
  }
  async function refresh() {
    const request = ++generation
    const revision = authority === 'server' ? (snapshot?.revision ?? 0) : 0
    emit('loading')
    try {
      const value = await read()
      if (request !== generation) return
      if (value !== null && !scoped(value)) throw new Error('AI_RESPONSE_INVALID')
      if (value) accept(value)
      else if (authority === 'cache' || (snapshot?.revision ?? 0) === revision) {
        snapshot = null
        authority = 'server'
      }
      emit(snapshot ? 'ready' : 'empty')
    } catch {
      if (request === generation) emit('error')
    }
  }
  function event(value: unknown) {
    if (!scoped(value)) return
    const gap = snapshot ? value.revision > snapshot.revision + 1 : value.revision > 1
    if (accept(value)) emit('ready')
    if (gap) void refresh()
  }
  return { event, refresh }
}
