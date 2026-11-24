import { describe, expect, it, vi } from 'vite-plus/test'
import { createPluginApi } from '../src/plugins.ts'

function mockClient(handlers: Record<string, unknown>) {
  return {
    get: vi.fn(async (path: string) => {
      const data = handlers[`GET ${path}`]
      if (data === undefined) throw new Error(`unexpected GET ${path}`)
      return { data }
    }),
    post: vi.fn(async (path: string, body?: unknown) => {
      const data = handlers[`POST ${path}`]
      if (typeof data === 'function') return { data: (data as (b: unknown) => unknown)(body) }
      if (data === undefined) throw new Error(`unexpected POST ${path}`)
      return { data }
    }),
  } as never
}

describe('createPluginApi', () => {
  it('lists and manages plugins via py-backend paths only', async () => {
    const client = mockClient({
      'GET /plugins': {
        items: [
          {
            name: 'dsh-better-sidebar',
            version: '0.31.1',
            description: '',
            enabled: false,
            broken: false,
            clientEntry: 'lib/client.js',
            clientUrl: '/api/plugins/dsh-better-sidebar/files/lib/client.js',
            filesBaseUrl: '/api/plugins/dsh-better-sidebar/files',
            hostApiBase: '/api/plugins/host/dsh-better-sidebar',
            controlPlane: 'py-backend',
          },
        ],
      },
      'POST /plugins/dsh-better-sidebar/enable': {
        name: 'dsh-better-sidebar',
        version: '0.31.1',
        description: '',
        enabled: true,
        broken: false,
        clientEntry: 'lib/client.js',
        clientUrl: '/api/plugins/dsh-better-sidebar/files/lib/client.js',
        filesBaseUrl: '/api/plugins/dsh-better-sidebar/files',
        hostApiBase: '/api/plugins/host/dsh-better-sidebar',
        controlPlane: 'py-backend',
      },
      'GET /plugins/contributions': {
        uiClients: [
          {
            name: 'dsh-better-sidebar',
            version: '0.31.1',
            description: '',
            clientEntry: 'lib/client.js',
            clientUrl: '/api/plugins/dsh-better-sidebar/files/lib/client.js',
            filesBaseUrl: '/api/plugins/dsh-better-sidebar/files',
            inject: [],
            hostApiBase: '/api/plugins/host/dsh-better-sidebar',
            controlPlane: 'py-backend',
          },
        ],
      },
      'POST /plugins/host/dsh-better-sidebar/sidebar/api/settings.get': {
        ok: true,
        value: { externalDisable: false },
        controlPlane: 'py-backend',
      },
    })
    const api = createPluginApi(client)
    const listed = await api.plugins.list()
    expect(listed.items[0]?.controlPlane).toBe('py-backend')
    const enabled = await api.plugins.enable('dsh-better-sidebar')
    expect(enabled.enabled).toBe(true)
    const contrib = await api.plugins.contributions()
    expect(contrib.uiClients).toHaveLength(1)
    const host = await api.plugins.hostSidebarApi('dsh-better-sidebar', 'settings.get', {})
    expect(host.ok).toBe(true)
    expect(host.controlPlane).toBe('py-backend')
  })

  it('rejects contributions that claim a non-server control plane', async () => {
    const client = mockClient({
      'GET /plugins/contributions': {
        uiClients: [{ name: 'x', controlPlane: 'browser', clientUrl: '', hostApiBase: '' }],
      },
    })
    await expect(createPluginApi(client).plugins.contributions()).rejects.toThrow(
      'INVALID_PLUGIN_CONTROL_PLANE',
    )
  })
})
