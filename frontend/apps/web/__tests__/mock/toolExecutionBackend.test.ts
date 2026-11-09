import { describe, expect, it } from 'vite-plus/test'
import { createMockToolExecutionBackend } from '../../mock/toolExecutionBackend'

const base = '/cli-programs/git/operations/git-status/executions'
describe('mock durable operation protocol', () => {
  it('persists across remount, deduplicates starts, and confirms cancellation only on query', async () => {
    const records = new Map()
    const backend = createMockToolExecutionBackend(records)
    const request = { requestId: crypto.randomUUID() }
    const start = await backend.handle('POST', base + '?mockOutcome=running', request)
    expect(start?.status).toBe(202)
    expect((await backend.handle('POST', base, request))?.data).toEqual(start?.data)
    expect((await backend.handle('POST', base, { requestId: crypto.randomUUID() }))?.status).toBe(
      409,
    )
    const restored = createMockToolExecutionBackend(records)
    expect((await restored.handle('GET', base))?.data).toMatchObject({ items: [start?.data] })
    const id = (start!.data as { id: string }).id
    expect((await restored.handle('POST', base + '/' + id + '/cancel'))?.data).toMatchObject({
      status: 'CANCELLING',
    })
    expect((await restored.handle('GET', base + '/' + id))?.data).toMatchObject({
      status: 'CANCELLED',
      exitCode: 130,
    })
  })
  it('keeps UNKNOWN blocking, rejects arbitrary fields, and preserves late completion', async () => {
    const backend = createMockToolExecutionBackend(new Map())
    expect(
      (await backend.handle('POST', base, { requestId: crypto.randomUUID(), argv: [] }))?.status,
    ).toBe(400)
    const start = await backend.handle('POST', base, { requestId: crypto.randomUUID() })
    const id = (start!.data as { id: string }).id
    await backend.handle('GET', base + '/' + id)
    expect((await backend.handle('POST', base + '/' + id + '/cancel'))?.data).toMatchObject({
      status: 'SUCCEEDED',
    })
    await backend.handle('POST', base + '?mockOutcome=unknown', { requestId: crypto.randomUUID() })
    expect(
      (await backend.handle('POST', base, { requestId: crypto.randomUUID() }))?.data,
    ).toMatchObject({ detail: 'TOOL_EXECUTION_BLOCKED', execution: { status: 'UNKNOWN' } })
  })
})

it('isolates operations and rejects cross-operation request IDs and cancellation', async () => {
  const backend = createMockToolExecutionBackend(new Map())
  const diff = base.replace('git-status', 'git-diff')
  const request = { requestId: crypto.randomUUID() }
  const status = await backend.handle('POST', base + '?mockOutcome=unknown', request)
  const id = (status!.data as { id: string }).id
  expect((await backend.handle('POST', diff, request))?.data).toEqual({
    detail: 'REQUEST_ID_OPERATION_CONFLICT',
  })
  expect((await backend.handle('GET', diff))?.data).toEqual({ items: [] })
  expect((await backend.handle('GET', diff + '/' + id))?.status).toBe(404)
  expect((await backend.handle('POST', diff + '/' + id + '/cancel'))?.status).toBe(404)
  const started = await backend.handle('POST', diff, { requestId: crypto.randomUUID() })
  expect(started?.status).toBe(202)
  const diffId = (started!.data as { id: string }).id
  expect((await backend.handle('GET', diff + '/' + diffId))?.data).toMatchObject({
    capabilityId: 'git-diff',
    status: 'SUCCEEDED',
    stdout: expect.stringContaining('diff --git'),
  })
  expect((await backend.handle('GET', base))?.data).toMatchObject({
    items: [{ id, status: 'UNKNOWN' }],
  })
  expect(await backend.handle('POST', base.replace('git-status', 'git-log'), request)).toBeNull()
})

it('checks the selected operation switch while retaining history and the other operation', async () => {
  const backend = createMockToolExecutionBackend(
    new Map(),
    (operation) => operation === 'git-status',
  )
  expect(
    (
      await backend.handle('POST', base.replace('git-status', 'git-diff'), {
        requestId: crypto.randomUUID(),
      })
    )?.status,
  ).toBe(403)
  expect((await backend.handle('POST', base, { requestId: crypto.randomUUID() }))?.status).toBe(202)
  expect((await backend.handle('GET', base.replace('git-status', 'git-diff')))?.data).toEqual({
    items: [],
  })
})
