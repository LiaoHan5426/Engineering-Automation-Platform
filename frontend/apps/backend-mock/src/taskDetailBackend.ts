import { randomUUID } from 'node:crypto'
/** Explicit simulation, with independent cancellation and no provider calls. */
export function createTaskDetailBackend() {
  const cancelled = new Set<string>(),
    connectionId = randomUUID()
  return {
    handle(method: string, path: string, body: Record<string, unknown>) {
      const match = /^\/ai\/task-detail\/optimizations\/([^/]+)$/.exec(path)
      if (!match) return null
      const failure = (status: number, code: string) => ({ status, data: { code } })
      const id = match[1]!
      if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))
        return failure(400, 'INVALID_REQUEST')
      if (method === 'DELETE') {
        cancelled.add(id)
        return { status: 204, data: {} }
      }
      if (method !== 'POST') return null
      if (
        ['goal', 'acceptanceCriteria'].some(
          (key) => typeof body[key] !== 'string' || !(body[key] as string).trim(),
        )
      )
        return failure(400, 'INVALID_REQUEST')
      if (['goal', 'acceptanceCriteria'].some((key) => (body[key] as string).length > 2000))
        return failure(413, 'INVALID_REQUEST')
      if (
        (body.connectionId !== undefined && body.connectionId !== connectionId) ||
        (body.model !== undefined && body.model !== 'task-detail-simulation')
      )
        return failure(400, 'INVALID_MODEL_SELECTION')
      if (cancelled.has(id)) return failure(409, 'AI_CANCELLED')
      return {
        status: 200,
        data: {
          goal: body.goal,
          acceptanceCriteria: body.acceptanceCriteria,
          connectionId,
          model: 'task-detail-simulation',
        },
      }
    },
  }
}
