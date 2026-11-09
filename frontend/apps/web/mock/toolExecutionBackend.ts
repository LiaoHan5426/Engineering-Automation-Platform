import { createHash } from 'node:crypto'
import type { GitExecutionOperation, ToolExecution } from '@eap/runtime-client'

type Entry = { row: ToolExecution; outcome: string }
const persisted = new Map<string, Entry>()
const active = (row: ToolExecution) => ['CREATED', 'RUNNING', 'CANCELLING'].includes(row.status)
const copy = (row: ToolExecution) => structuredClone(row)

/** Mock service records survive browser remounts. Every output is explicitly simulated. */
export function createMockToolExecutionBackend(
  records = persisted,
  enabled: (operation: GitExecutionOperation) => boolean = () => true,
) {
  return {
    async handle(method: string, path: string, body?: unknown) {
      const url = new URL(path, 'http://mock.invalid')
      const route = url.pathname
      const match = route.match(
        /^\/cli-programs\/git\/operations\/(git-status|git-diff)\/executions(?:\/|$)/,
      )
      if (!match) return null
      const operation = match[1] as GitExecutionOperation
      const base = '/cli-programs/git/operations/' + operation + '/executions'
      if (route === base && method === 'GET') {
        const limit = Number(url.searchParams.get('limit') ?? 20)
        if (!Number.isInteger(limit) || limit < 1 || limit > 100)
          return { status: 400, data: { detail: 'INVALID_LIMIT' } }
        return {
          status: 200,
          data: {
            items: [...records.values()]
              .filter((entry) => entry.row.capabilityId === operation)
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
        if (prior)
          return prior.row.capabilityId === operation
            ? { status: 202, data: copy(prior.row) }
            : { status: 409, data: { detail: 'REQUEST_ID_OPERATION_CONFLICT' } }
        const blocking = [...records.values()].find(
          (entry) =>
            entry.row.capabilityId === operation &&
            (active(entry.row) || entry.row.status === 'UNKNOWN'),
        )
        if (blocking)
          return {
            status: 409,
            data: { detail: 'TOOL_EXECUTION_BLOCKED', execution: copy(blocking.row) },
          }
        const outcome = url.searchParams.get('mockOutcome') ?? 'success'
        if (!enabled(operation) || outcome === 'denied')
          return { status: 403, data: { detail: 'CAPABILITY_DISABLED' } }
        const row: ToolExecution = {
          id: crypto.randomUUID(),
          requestId: request.requestId,
          programId: 'git',
          capabilityId: operation,
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
      if (!entry || entry.row.capabilityId !== operation)
        return { status: 404, data: { detail: 'TOOL_EXECUTION_NOT_FOUND' } }
      const row = entry.row
      if (tail.length === 2 && tail[1] === 'resolve-unknown' && method === 'POST') {
        const review = body as {
          requestId?: unknown
          note?: unknown
          processTreeStopped?: unknown
        } | null
        if (
          !review ||
          Object.keys(review).length !== 3 ||
          typeof review.requestId !== 'string' ||
          !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(review.requestId) ||
          typeof review.note !== 'string' ||
          review.note.trim().length < 10 ||
          review.note.length > 2000 ||
          review.processTreeStopped !== true
        )
          return { status: 400, data: { detail: 'UNKNOWN_REVIEW_REQUIRED' } }
        const digest = createHash('sha256').update(review.note.trim(), 'utf8').digest('hex')
        if (row.resolution)
          return row.resolution.requestId === review.requestId.toLowerCase() &&
            row.resolution.requestDigest === digest
            ? { status: 200, data: copy(row) }
            : { status: 409, data: { detail: 'UNKNOWN_REVIEW_CONFLICT' } }
        if (row.status !== 'UNKNOWN')
          return { status: 409, data: { detail: 'EXECUTION_NOT_UNKNOWN' } }
        row.resolution = {
          requestId: review.requestId.toLowerCase(),
          requestDigest: digest,
          note: review.note
            .trim()
            .replace(
              /((?:password|passwd|token|secret|api[_-]?key)\s*[:=]\s*)[^\s,;}]+/gi,
              '$1[REDACTED]',
            )
            .slice(0, 2000),
          processTreeStopped: true,
          operator: 'local-operator',
          resolvedAt: new Date().toISOString(),
        }
        row.status = 'CLOSED_UNKNOWN'
        return { status: 200, data: copy(row) }
      }
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
              ? operation === 'git-diff'
                ? 'mock: no real Git executed\ndiff --git a/mock/file.vue b/mock/file.vue\n-old\n+new'
                : 'mock: no real Git executed\n## mock-branch\n M mock/file.vue'
              : ''
        }
        if (!active(row) && row.status !== 'UNKNOWN' && row.status !== 'CLOSED_UNKNOWN')
          row.finishedAt ??= new Date().toISOString()
        return { status: 200, data: copy(row) }
      }
      return { status: 404, data: { detail: 'MOCK_ROUTE_NOT_FOUND' } }
    },
  }
}
