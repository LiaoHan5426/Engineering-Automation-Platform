import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test'
import { publishDirectory } from '../scripts/devtools/publish.ts'

const mocks = vi.hoisted(() => ({ rename: vi.fn(), delay: vi.fn() }))
vi.mock('node:fs/promises', () => ({ rename: mocks.rename }))
vi.mock('node:timers/promises', () => ({ setTimeout: mocks.delay }))
const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
beforeEach(() => {
  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
  mocks.rename.mockReset().mockResolvedValue(undefined)
  mocks.delay.mockReset().mockResolvedValue(undefined)
})
afterEach(() => { Object.defineProperty(process, 'platform', platform) })

it('publishes after a transient Windows sharing failure', async () => {
  mocks.rename.mockRejectedValueOnce(Object.assign(new Error('busy'), { code: 'EPERM' }))
  await publishDirectory('staged', 'published')
  expect(mocks.rename.mock.calls).toEqual([['staged', 'published'], ['staged', 'published']])
  expect(mocks.delay).toHaveBeenCalledExactlyOnceWith(100)
})
it('retains the original error after a bounded sharing failure', async () => {
  const error = Object.assign(new Error('busy'), { code: 'EBUSY' })
  mocks.rename.mockRejectedValue(error)
  await expect(publishDirectory('staged', 'published')).rejects.toBe(error)
  expect(mocks.rename).toHaveBeenCalledTimes(6)
  expect(mocks.delay.mock.calls).toEqual([[100], [200], [300], [400], [500]])
})
it.each(['ENOENT', 'EACCES'])('does not retry %s', async code => {
  const error = Object.assign(new Error('failed'), { code })
  mocks.rename.mockRejectedValue(error)
  await expect(publishDirectory('staged', 'published')).rejects.toBe(error)
  expect(mocks.delay).not.toHaveBeenCalled()
})
it('does not retry a non-Windows rename failure', async () => {
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
  const error = Object.assign(new Error('busy'), { code: 'EPERM' })
  mocks.rename.mockRejectedValue(error)
  await expect(publishDirectory('staged', 'published')).rejects.toBe(error)
  expect(mocks.delay).not.toHaveBeenCalled()
})
