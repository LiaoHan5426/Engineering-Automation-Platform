import type { ToolExecution } from '@eap/runtime-client'

type Entry = { row: ToolExecution; outcome: string }
const persisted = new Map<string, Entry>()
const base = '/cli-programs/git/operations/git-status/executions'
const active = (row: ToolExecution) => ['CREATED', 'RUNNING', 'CANCELLING'].includes(row.status)
const copy = (row: ToolExecution) => structuredClone(row)

/** Mock service records survive browser remounts. Every output is explicitly simulated. */
export function createMockToolExecutionBackend(records = persisted) {
  return {
    async handle(method: string, path: string, body?: unknown) {
      const url = new URL(path, 'http://mock.invalid')
      const route = url.pathname
      if (!route.startsWith(base)) return null
      if (route === base && method === 'GET') {
        const limit = Number(url.searchParams.get('limit') ?? 20)
        if (!Number.isInteger(limit) || limit < 1 || limit > 100)
          return { status: 400, data: { detail: 'INVALID_LIMIT' } }
        return {
          status: 200,
          data: {
            items: [...records.values()]
              .map((entry) => copy(entry.row))
              .reverse()
              .slice(0, limit),
          },
        }
      }
      if (route === base && method === 'POST') {
        const request = body as { requestId?: unknown } | null
        if (
          !request ||
          Object.keys(request).length !== 1 ||
          typeof request.requestId !== 'string' ||
          !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(request.requestId)
        ) {
          return { status: 400, data: { detail: 'ONLY_REQUEST_ID_ALLOWED' } }
        }
        const prior = [...records.values()].find(
          (entry) => entry.row.requestId === request.requestId,
        )
        if (prior) return { status: 202, data: copy(prior.row) }
        const blocking = [...records.values()].find(
          (entry) => active(entry.row) || entry.row.status === 'UNKNOWN',
        )
        if (blocking)
          return {
            status: 409,
            data: { detail: 'TOOL_EXECUTION_BLOCKED', execution: copy(blocking.row) },
          }
        const outcome = url.searchParams.get('mockOutcome') ?? 'success'
        if (outcome === 'denied') return { status: 403, data: { detail: 'CAPABILITY_DISABLED' } }
        const row: ToolExecution = {
          id: crypto.randomUUID(),
          requestId: request.requestId,
          programId: 'git',
          capabilityId: 'git-status',
          workspacePath: '/mock/workspace',
          executable: '/mock/bin/git',
          status: outcome === 'unknown' ? 'UNKNOWN' : 'RUNNING',
          cancelRequested: false,
          createdAt: new Date().toISOString(),
          finishedAt: null,
          exitCode: null,
          stdout: '',
          stderr: '',
          truncated: false,
          exitEvidence: null,
          unconfirmedReason:
            outcome === 'unknown' ? 'mock: SERVICE_RESTART_EXIT_UNCONFIRMED' : null,
          steps: [],
        }
        records.set(row.id, { row, outcome })
        return { status: 202, data: copy(row) }
      }
      const tail = route.slice(base.length + 1).split('/')
      const entry = records.get(tail[0] ?? '')
      if (!entry) return { status: 404, data: { detail: 'TOOL_EXECUTION_NOT_FOUND' } }
      const row = entry.row
      if (tail.length === 2 && tail[1] === 'cancel' && method === 'POST') {
        if (active(row)) {
          row.cancelRequested = true
          row.status = 'CANCELLING'
        }
        return { status: 200, data: copy(row) }
      }
      if (tail.length === 1 && method === 'GET') {
        if (row.status === 'CANCELLING') {
          row.status = 'CANCELLED'
          row.exitCode = 130
          row.exitEvidence = 'mock: process tree cleanup confirmed'
        } else if (active(row) && entry.outcome !== 'running') {
          row.status = entry.outcome === 'timeout' ? 'TIMED_OUT' : 'SUCCEEDED'
          row.exitCode = row.status === 'SUCCEEDED' ? 0 : 124
          row.exitEvidence = 'mock: process tree cleanup confirmed'
          row.stdout =
            row.status === 'SUCCEEDED'
              ? 'mock: no real Git executed\n## mock-branch\n M mock/file.vue'
              : ''
        }
        if (!active(row) && row.status !== 'UNKNOWN') row.finishedAt ??= new Date().toISOString()
        return { status: 200, data: copy(row) }
      }
      return { status: 404, data: { detail: 'MOCK_ROUTE_NOT_FOUND' } }
    },
  }
}
