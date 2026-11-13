import { expect, it } from 'vite-plus/test'
import { randomUUID } from 'node:crypto'
import { createTaskDetailBackend } from '../src/taskDetailBackend'
it('simulates dual fields without splitting or truncation, validates each and cancels independently', () => {
  const backend = createTaskDetailBackend(),
    id = randomUUID(),
    path = '/ai/task-detail/optimizations/' + id
  const valid = { goal: 'Goal\nwith detail', acceptanceCriteria: 'x'.repeat(2000) }
  expect(backend.handle('POST', path, valid)).toMatchObject({ status: 200, data: valid })
  for (const key of ['goal', 'acceptanceCriteria'])
    for (const value of ['', '   ', 'x'.repeat(2001), null, 4])
      expect(backend.handle('POST', path, { ...valid, [key]: value })).toMatchObject({
        status: typeof value === 'string' && value.length > 2000 ? 413 : 400,
        data: { code: 'INVALID_REQUEST' },
      })
  expect(backend.handle('DELETE', path, {})).toMatchObject({ status: 204 })
  expect(backend.handle('DELETE', path, {})).toMatchObject({ status: 204 })
  expect(backend.handle('POST', path, valid)).toMatchObject({
    status: 409,
    data: { code: 'AI_CANCELLED' },
  })
  expect(backend.handle('POST', '/ai/task-description/optimizations/' + id, valid)).toBeNull()
})
