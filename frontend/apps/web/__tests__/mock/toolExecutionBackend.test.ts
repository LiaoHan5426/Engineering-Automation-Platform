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
