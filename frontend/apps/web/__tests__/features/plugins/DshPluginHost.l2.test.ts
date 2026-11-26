// @vitest-environment happy-dom
/**
 * L2 acceptance: DSH plugin enable/disable is server-authoritative;
 * Cordis island has no Host/Agent execution surface.
 */
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { createApp, nextTick, type App } from 'vue'
import { runtimeApi } from '@eap/runtime-client'
import { createPluginIsland, islandControlSurface } from '@eap/plugin-runtime'
import { i18n } from '../../../src/lib/i18n'
import DshPluginManager from '../../../src/features/plugins/DshPluginManager.vue'
import DshBootHost from '../../../src/features/plugins/DshBootHost.vue'

let app: App | undefined
let root: HTMLDivElement

afterEach(() => {
  app?.unmount()
  app = undefined
  root?.remove()
  vi.restoreAllMocks()
  document.querySelectorAll('[data-dsh-better-sidebar]').forEach((n) => n.remove())
})

describe('L2 DSH plugin host (control on server)', () => {
  it('island control surface forbids install/enable/tools/agent', () => {
    expect(islandControlSurface()).toEqual(['sync', 'dispose', 'mounted'])
    const island = createPluginIsland()
    expect('enable' in island).toBe(false)
    expect('install' in island).toBe(false)
    expect('runTool' in island).toBe(false)
    expect('agent' in island).toBe(false)
  })

  it('plugin manager enable/disable only via runtimeApi.plugins (py-backend)', async () => {
    const base = {
      name: 'dsh-better-sidebar',
      version: '0.31.1',
      description: 'Better Sidebar',
      installSpec: 'dsh-better-sidebar',
      broken: false,
      clientEntry: 'lib/client.js',
      clientUrl: '/api/plugins/dsh-better-sidebar/files/lib/client.js',
      filesBaseUrl: '/api/plugins/dsh-better-sidebar/files',
      hostApiBase: '/api/plugins/host/dsh-better-sidebar',
      controlPlane: 'py-backend' as const,
    }
    const list = vi
      .spyOn(runtimeApi.plugins, 'list')
      .mockResolvedValueOnce({ items: [{ ...base, enabled: false }] })
      .mockResolvedValueOnce({ items: [{ ...base, enabled: true }] })
      .mockResolvedValue({ items: [{ ...base, enabled: false }] })
    const enable = vi
      .spyOn(runtimeApi.plugins, 'enable')
      .mockResolvedValue({ ...base, enabled: true })
    const disable = vi
      .spyOn(runtimeApi.plugins, 'disable')
      .mockResolvedValue({ ...base, enabled: false })

    root = document.createElement('div')
    document.body.append(root)
    app = createApp(DshPluginManager)
    app.use(i18n).mount(root)
    await vi.waitFor(() => {
      expect(
        document.querySelector('[data-testid="dsh-plugin-toggle-dsh-better-sidebar"]'),
      ).toBeTruthy()
    })
    expect(list).toHaveBeenCalled()
    expect(document.querySelector('[data-testid="dsh-plugin-control-plane"]')?.textContent).toContain(
      'py-backend',
    )
    ;(document.querySelector(
      '[data-testid="dsh-plugin-toggle-dsh-better-sidebar"]',
    ) as HTMLButtonElement).click()
    await vi.waitFor(() => {
      expect(enable).toHaveBeenCalledExactlyOnceWith('dsh-better-sidebar')
    })
    await vi.waitFor(() => {
      expect(
        document.querySelector('[data-testid="dsh-plugin-toggle-dsh-better-sidebar"]')?.textContent,
      ).toMatch(/停用|Disable/)
    })
    ;(document.querySelector(
      '[data-testid="dsh-plugin-toggle-dsh-better-sidebar"]',
    ) as HTMLButtonElement).click()
    await vi.waitFor(() => {
      expect(disable).toHaveBeenCalledWith('dsh-better-sidebar')
    })
    await vi.waitFor(() => {
      const button = document.querySelector(
        '[data-testid="dsh-plugin-update-dsh-better-sidebar"]',
      ) as HTMLButtonElement
      expect(button.disabled).toBe(false)
    })
    const update = vi.spyOn(runtimeApi.plugins, 'update').mockResolvedValue({ ...base, enabled: false })
    const uninstall = vi
      .spyOn(runtimeApi.plugins, 'uninstall')
      .mockResolvedValue({ name: 'dsh-better-sidebar', removed: true })
    ;(document.querySelector(
      '[data-testid="dsh-plugin-update-dsh-better-sidebar"]',
    ) as HTMLButtonElement).click()
    await vi.waitFor(() => {
      expect(update).toHaveBeenCalledExactlyOnceWith('dsh-better-sidebar')
    })
    await vi.waitFor(() => {
      const button = document.querySelector(
        '[data-testid="dsh-plugin-uninstall-dsh-better-sidebar"]',
      ) as HTMLButtonElement
      expect(button.disabled).toBe(false)
    })
    ;(document.querySelector(
      '[data-testid="dsh-plugin-uninstall-dsh-better-sidebar"]',
    ) as HTMLButtonElement).click()
    await vi.waitFor(() => {
      expect(document.querySelector('[role="dialog"]')).toBeTruthy()
    })
    const confirm = document.querySelector('.eap-confirm__actions button') as HTMLButtonElement
    confirm.click()
    await vi.waitFor(() => {
      expect(uninstall).toHaveBeenCalledExactlyOnceWith('dsh-better-sidebar')
    })
  })

  it('DshBootHost syncs contributions then dispose clears sidebar UI', async () => {
    window.__EAP_PLUGIN_MODULES__ = new Map()
    window.__ModuleLoader__ = {
      load(reg) {
        window.__EAP_PLUGIN_MODULES__!.set(reg.id, { id: reg.id, factory: reg.factory })
      },
      get(id) {
        return window.__EAP_PLUGIN_MODULES__!.get(id)?.exports
      },
    }
    window.__ModuleLoader__.load({
      id: 'dsh-better-sidebar',
      factory: (require) => {
        expect(require('react')).toBeDefined()
        expect(require('@deepseek-ai/dsh-client-ui-primitives')).toBeDefined()
        return {
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
        }
      },
    })
    vi.spyOn(document.head, 'appendChild').mockImplementation((node) => node)
    const uiClients = [
      {
        name: 'dsh-better-sidebar',
        version: '0.31.1',
        description: 'Better Sidebar',
        clientEntry: 'lib/client.js',
        clientUrl: '/api/plugins/dsh-better-sidebar/files/lib/client.js',
        filesBaseUrl: '/api/plugins/dsh-better-sidebar/files',
        inject: [],
        hostApiBase: '/api/plugins/host/dsh-better-sidebar',
        controlPlane: 'py-backend' as const,
        enabled: true,
      },
    ]
    const contributions = vi.spyOn(runtimeApi.plugins, 'contributions').mockResolvedValue({ uiClients })

    root = document.createElement('div')
    document.body.append(root)
    app = createApp(DshBootHost)
    app.use(i18n).mount(root)
    await nextTick()
    for (let i = 0; i < 40; i++) await Promise.resolve()
    expect(contributions).toHaveBeenCalled()
    expect(document.querySelector('[data-testid="better-sidebar-ui"]')?.textContent).toContain(
      'Better Sidebar',
    )
    expect(document.querySelector('[data-testid="dsh-boot-host"]')?.getAttribute('data-mounted'))
      .toContain('dsh-better-sidebar')

    app.unmount()
    app = undefined
    expect(document.querySelector('[data-dsh-better-sidebar]')).toBeNull()
  })

  it('Host API client path stays on /api/plugins/host (never local Host)', async () => {
    const hostSidebarApi = vi.spyOn(runtimeApi.plugins, 'hostSidebarApi').mockResolvedValue({
      ok: true,
      value: { externalDisable: false },
      controlPlane: 'py-backend',
    })
    const result = await runtimeApi.plugins.hostSidebarApi(
      'dsh-better-sidebar',
      'settings.get',
      {},
    )
    expect(result.controlPlane).toBe('py-backend')
    expect(hostSidebarApi).toHaveBeenCalledWith('dsh-better-sidebar', 'settings.get', {})
  })
})

declare global {
  interface Window {
    __DSH_BOOT_READY__?: PromiseWithResolvers<void>
    __ModuleLoader__?: {
      load: (registration: {
        id: string
        factory: (require: (id: string) => unknown) => unknown
      }) => void
      get: (id: string) => unknown
    }
    __EAP_PLUGIN_MODULES__?: Map<
      string,
      { id: string; factory: (require: (id: string) => unknown) => unknown; exports?: unknown }
    >
  }
}
