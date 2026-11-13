import { randomUUID } from 'node:crypto'

/** Explicit development simulation; never calls a provider or creates tasks. */
export function createTaskDescriptionBackend() {
  const cancelled = new Set<string>()
  const connectionId = randomUUID()
  return {
    handle(method: string, path: string, body: Record<string, unknown>) {
      const match = /^\/ai\/task-description\/optimizations\/([^/]+)$/.exec(path)
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
      if (typeof body.text !== 'string' || !body.text.trim()) return failure(400, 'INVALID_REQUEST')
      if (body.text.length > 12000) return failure(413, 'INVALID_REQUEST')
      if (body.connectionId !== undefined && body.connectionId !== connectionId)
        return failure(400, 'INVALID_MODEL_SELECTION')
      if (body.model !== undefined && body.model !== 'task-description-simulation')
        return failure(400, 'INVALID_MODEL_SELECTION')
      if (cancelled.has(id)) return failure(409, 'AI_CANCELLED')
      const text = '任务目标\n' + body.text.trim()
      if (text.length > 2000) return failure(502, 'AI_RESPONSE_OUTPUT_LIMIT')
      return { status: 200, data: { text, connectionId, model: 'task-description-simulation' } }
    },
  }
}
