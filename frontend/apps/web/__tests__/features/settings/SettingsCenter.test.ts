// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { createApp, nextTick } from 'vue'
import { runtimeApi } from '@eap/runtime-client'
import SettingsCenter from '../../../src/features/settings/SettingsCenter.vue'
import { i18n } from '../../../src/lib/i18n'

describe('SettingsCenter', () => {
  let root: HTMLDivElement
  let navigate: ReturnType<typeof vi.fn>

  beforeEach(() => {
    root = document.createElement('div')
    document.body.append(root)
    navigate = vi.fn()
    vi.spyOn(runtimeApi, 'modelConnections').mockResolvedValue({
      items: [
        {
          id: 'conn-1',
          name: '真实主连接',
          kind: 'api-key',
          enabled: true,
          baseUrl: 'https://example.test/v1',
          defaultModel: 'model-a',
          models: [],
          allowedModels: ['model-a', 'model-b'],
          discoveredAt: '2026-11-23T00:00:00Z',
          discoveryError: '',
          secretPresent: true,
          revision: 1,
          defaultSelected: true,
          configurationRevision: 'cfg-1',
        },
      ],
      effectiveDefaultId: 'conn-1',
    })
    vi.spyOn(runtimeApi, 'knowledgeBases').mockResolvedValue({
      items: [{ id: 'kb-1', name: '真实知识库', description: '来自 API', documents: 12 }],
    })
    vi.spyOn(runtimeApi, 'rulePacks').mockResolvedValue({ items: [] })
    vi.spyOn(runtimeApi, 'databases').mockResolvedValue({ items: [], policy: '只读资料' })
    vi.spyOn(runtimeApi, 'skills').mockResolvedValue({ items: [] })
    vi.spyOn(runtimeApi, 'capabilities').mockResolvedValue({
      capabilities: [],
      items: [],
      kinds: [],
      mcpServers: [],
      settings: {},
      disabledCapabilities: [],
      declared: [],
      unregistered: [],
      undeclared: [],
    })
    vi.spyOn(runtimeApi, 'mcpServers').mockResolvedValue({ items: [] })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    root.remove()
  })

  async function mount() {
    const app = createApp(SettingsCenter, { onNavigate: navigate })
    app.use(i18n)
    app.mount(root)
    await nextTick()
    await vi.waitFor(() => {
      expect(root.querySelector('[data-testid="settings-center-record-conn-1"]')).toBeTruthy()
    })
  }

  it('renders the prototype shell and eight categories', async () => {
    await mount()
    expect(root.querySelector('[data-testid="settings-center-rail"]')).toBeTruthy()
    expect(root.querySelector('[data-testid="settings-center-sidebar"]')).toBeTruthy()
    expect(root.querySelector('[data-testid="settings-center-topbar"]')).toBeTruthy()
    expect(root.textContent).toContain('模型与连接')
    expect(root.textContent).toContain('知识库')
    expect(root.textContent).toContain('规则库')
    expect(root.textContent).toContain('数据库资料')
    expect(root.textContent).toContain('技能')
    expect(root.textContent).toContain('能力目录')
    expect(root.textContent).toContain('插件中心')
    expect(root.textContent).toContain('外观')
    expect(root.querySelector('[data-testid="settings-center-record-conn-1"]')?.textContent).toContain(
      '真实主连接',
    )
  })

  it('loads a category from real API data instead of prototype sample rows', async () => {
    await mount()
    ;(root.querySelector('[data-testid="settings-center-category-knowledge"]') as HTMLElement).click()
    await vi.waitFor(() => {
      expect(
        root.querySelector('[data-testid="settings-center-record-kb-1"]')?.textContent,
      ).toContain('真实知识库')
    })
    expect(root.querySelector('[data-testid="settings-center-record-kb-1"]')?.textContent).toContain(
      '12',
    )
    expect(root.textContent).not.toContain('产品文档库')
  })

  it('shows a real failure state and opens the existing detailed settings', async () => {
    vi.mocked(runtimeApi.databases).mockRejectedValue({
      response: { status: 502, data: { code: 'DB_FAILED', detail: '真实数据库资料读取失败' } },
    })
    await mount()
    ;(root.querySelector('[data-testid="settings-center-category-databases"]') as HTMLElement).click()
    await vi.waitFor(() => {
      expect(root.querySelector('[data-testid="settings-center-error"]')?.textContent).toContain(
        '真实数据库资料读取失败',
      )
    })
    expect(root.querySelector('[data-testid="settings-center-empty"]')).toBeTruthy()
    ;(root.querySelector('[data-testid="settings-center-detail"]') as HTMLElement).click()
    expect(navigate).toHaveBeenCalledWith('databases')
  })
})
