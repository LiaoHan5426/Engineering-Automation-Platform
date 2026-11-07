import { describe, expect, it, vi } from 'vite-plus/test'
import { createContributionHost } from '../../../src/features/plugins/contributionHost'

describe('contribution host PoC', () => {
  it('registers views and commands with dispose cleanup', async () => {
    const host = createContributionHost()
    const changes: string[] = []
    const stop = host.subscribe(() => changes.push('changed'))

    const dropView = host.registerView({ id: 'board', title: 'Board' })
    const dropCmd = host.registerCommand({
      id: 'board.refresh',
      title: 'Refresh',
      handler: vi.fn(),
    })
    expect(host.views.get('board')?.title).toBe('Board')
    expect(host.commands.has('board.refresh')).toBe(true)
    expect(changes.length).toBeGreaterThan(0)

    dropView()
    dropCmd()
    expect(host.views.has('board')).toBe(false)
    expect(host.commands.has('board.refresh')).toBe(false)
    stop()
    host.dispose()
    expect(host.views.size).toBe(0)
    expect(host.commands.size).toBe(0)
  })

  it('rejects duplicate registration until disposed', () => {
    const host = createContributionHost()
    host.registerView({ id: 'demo', title: 'Demo' })
    expect(() => host.registerView({ id: 'demo', title: 'Again' })).toThrow(/already registered/)
    host.dispose()
    expect(() => host.registerView({ id: 'demo', title: 'Again' })).not.toThrow()
  })
})
