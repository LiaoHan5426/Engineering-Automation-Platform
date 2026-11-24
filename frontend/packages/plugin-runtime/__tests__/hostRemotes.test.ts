// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vite-plus/test'
import { createHostProxiedRemote } from '../src/client/hostRemotes.ts'

describe('host remotes boundary (DSH namespaces)', () => {
  it('proxies session/settings and maps workspaceFiles → fs.*', async () => {
    const fetchHost = vi.fn(async (method: string, body?: Record<string, unknown>) => ({
      method,
      body,
    }))
    const remote = createHostProxiedRemote(fetchHost)

    await remote.fs?.tree?.({ path: '/src' })
    await remote.settings?.get?.({})
    await remote.session.cwd?.({ sessionId: 'eap' })
    await remote.workspaceFiles?.tree?.({ path: '/docs' })
    await remote.workspaceFiles?.trees?.({ paths: ['/a', '/b'] })

    expect(fetchHost).toHaveBeenCalledWith('fs.tree', { path: '/src' })
    expect(fetchHost).toHaveBeenCalledWith('settings.get', {})
    expect(fetchHost).toHaveBeenCalledWith('session.cwd', { sessionId: 'eap' })
    expect(fetchHost).toHaveBeenCalledWith('fs.tree', { path: '/docs' })
    expect(fetchHost).toHaveBeenCalledWith('fs.trees', { paths: ['/a', '/b'] })
  })

  it('does not invent local Host success for unknown Agent-adjacent remotes', async () => {
    const fetchHost = vi.fn(async () => ({ ok: true }))
    const remote = createHostProxiedRemote(fetchHost)
    const tools = remote.tools as { run?: (args: unknown) => Promise<unknown> }
    await tools.run?.({ name: 'sidebar_open' })
    expect(fetchHost).toHaveBeenCalledWith('tools.run', { name: 'sidebar_open' })
  })
})
