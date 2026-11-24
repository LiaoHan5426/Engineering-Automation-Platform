// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { createPluginIsland, islandControlSurface } from '../src/island.ts'

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  delete window.__ModuleLoader__
  delete window.__EAP_PLUGIN_MODULES__
})

describe('plugin island control surface', () => {
  it('exposes only UI sync APIs — no install/enable/tool execution', () => {
    expect(islandControlSurface()).toEqual(['sync', 'dispose', 'mounted'])
    const island = createPluginIsland()
    expect(Object.keys(island).sort()).toEqual(['dispose', 'mounted', 'sync'])
    expect('enable' in island).toBe(false)
    expect('install' in island).toBe(false)
    expect('runTool' in island).toBe(false)
    expect('agent' in island).toBe(false)
  })

  it('rejects contributions that claim browser control plane', async () => {
    const island = createPluginIsland()
    await expect(
      island.sync([
        {
          name: 'x',
          version: '1',
          description: '',
          clientEntry: 'lib/client.js',
          clientUrl: '/x.js',
          filesBaseUrl: '/files',
          inject: [],
          hostApiBase: '/api/plugins/host/x',
          controlPlane: 'browser' as 'py-backend',
        },
      ]),
    ).rejects.toThrow('INVALID_PLUGIN_CONTROL_PLANE')
  })

  it('loads apply() from ModuleLoader and dispose removes sidebar host', async () => {
    window.__EAP_PLUGIN_MODULES__ = new Map()
    window.__ModuleLoader__ = {
      load(reg) {
        window.__EAP_PLUGIN_MODULES__!.set(reg.id, { id: reg.id, factory: reg.factory })
      },
      get(id) {
        return window.__EAP_PLUGIN_MODULES__!.get(id)?.exports
      },
    }
    // Simulate DSH client bundle registration without network.
    window.__ModuleLoader__.load({
      id: 'dsh-better-sidebar',
      factory: () => ({
        inject: ['slots', 'locale'],
        apply(ctx: { effect: (fn: () => () => void) => void }) {
          ctx.effect(() => {
            const host = document.createElement('div')
            host.setAttribute('data-dsh-better-sidebar', '')
            host.setAttribute('data-testid', 'better-sidebar-ui')
            host.textContent = 'Better Sidebar'
            document.body.appendChild(host)
            return () => host.remove()
          })
        },
      }),
    })

    const appendChild = document.head.appendChild.bind(document.head)
    vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
      if (node instanceof HTMLScriptElement) {
        queue.resolve().then(() => node.onload?.(new Event('load') as never))
        return node
      }
      return appendChild(node)
    })

    const island = createPluginIsland()
    await island.sync([
      {
        name: 'dsh-better-sidebar',
        version: '0.31.1',
        description: 'Better Sidebar',
        clientEntry: 'lib/client.js',
        clientUrl: '/api/plugins/dsh-better-sidebar/files/lib/client.js',
        filesBaseUrl: '/api/plugins/dsh-better-sidebar/files',
        inject: [],
        hostApiBase: '/api/plugins/host/dsh-better-sidebar',
        controlPlane: 'py-backend',
      },
    ])
    expect(island.mounted()).toEqual(['dsh-better-sidebar'])
    expect(document.querySelector('[data-dsh-better-sidebar]')?.textContent).toContain(
      'Better Sidebar',
    )
    island.dispose()
    expect(document.querySelector('[data-dsh-better-sidebar]')).toBeNull()
    expect(island.mounted()).toEqual([])
  })
})
