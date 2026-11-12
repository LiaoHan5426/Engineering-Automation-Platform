// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { createApp, nextTick, type App } from 'vue'
import {
  runtimeApi,
  type PrototypeDeliveryRecord,
  type PrototypeVersionRecord,
} from '@eap/runtime-client'
import { i18n } from '../../../src/lib/i18n'
import BuilderWorkspace from '../../../src/features/plugins/BuilderWorkspace.vue'
vi.mock('grapesjs', () => ({
  default: {
    init: () => ({
      on: () => {},
      setComponents: () => {},
      destroy: () => {},
      getProjectData: () => ({ pages: [] }),
      loadProjectData: () => {},
    }),
  },
}))
import { createPluginHost, type PluginHost } from '../../../src/features/plugins/host'
import { memoryStore } from '../../../src/features/plugins/model'
import { emptyPrototypeSchema } from '../../../src/features/shell/prototypeSchema'

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  let reject: (reason?: unknown) => void = () => {}
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

function version(id: string, title: string, _presses = 0): PrototypeVersionRecord {
  const schema = emptyPrototypeSchema(title)
  schema.root.children = [
    { id: 'title', kind: 'text', props: { text: title }, children: [] },
    { id: 'action', kind: 'button', props: { label: 'Action' }, children: [] },
  ]
  return {
    id,
    requestId: crypto.randomUUID(),
    sourceRef: 'builder-alpha',
    title,
    body: JSON.stringify({ format: 'eap-prototype-v1', schema }),
    acceptance: ['看标题'],
    contentHash: 'hash-' + id,
  }
}

async function settled() {
  for (let i = 0; i < 8; i += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

describe('builder version preview', () => {
  let app: App<Element> | null = null
  let root: HTMLElement | null = null
  let host: PluginHost | null = null

  afterEach(() => {
    app?.unmount()
    root?.remove()
    app = null
    root = null
    host = null
    vi.restoreAllMocks()
  })

  async function mount(items: PrototypeVersionRecord[] = [], surface = 'versions') {
    vi.spyOn(runtimeApi, 'handoffs').mockResolvedValue({ items: [] })
    vi.spyOn(runtimeApi, 'missions').mockResolvedValue({ items: [] })
    vi.spyOn(runtimeApi, 'prototypeVersions').mockResolvedValue({ items })
    host = createPluginHost(memoryStore())
    root = document.createElement('div')
    document.body.appendChild(root)
    app = createApp(BuilderWorkspace, { instanceId: 'alpha', host })
    app.use(i18n)
    app.mount(root)
    await settled()
    root.querySelector<HTMLButtonElement>(`[data-testid="builder-tab-${surface}"]`)?.click()
    await settled()
    return { host, root }
  }

  async function tab(id: string) {
    root!.querySelector<HTMLButtonElement>(`[data-testid="builder-tab-${id}"]`)!.click()
    await settled()
  }

  it('retains the designer across its two tabs and has no legacy production write surface', async () => {
    await mount([], 'design')
    expect(root!.querySelectorAll('.eap-tabs [role="tab"]')).toHaveLength(2)
    await vi.waitFor(() =>
      expect(root!.querySelector('[data-testid="grapes-title"]')).not.toBeNull(),
    )
    const design = root!.querySelector<HTMLInputElement>('[data-testid="grapes-title"]')!
    design.value = '未保存设计'
    design.dispatchEvent(new Event('input'))
    await tab('versions')
    await tab('design')
    expect(root!.querySelector('[data-testid="grapes-title"]')).toBe(design)
    expect(design.value).toBe('未保存设计')
    expect(root!.querySelector('[data-testid="builder-tab-legacy"]')).toBeNull()
    expect(root!.querySelector('[data-testid="save-version"]')).toBeNull()
    expect(runtimeApi.handoffs).not.toHaveBeenCalled()
    root!.querySelector<HTMLButtonElement>('[data-testid="builder-back-scenes"]')!.click()
    await settled()
    expect(localStorage.getItem('eap.prototype-recovery.v1.builder-alpha')).toContain('未保存设计')
  })

  function openButton(title: string) {
    const item = [...root!.querySelectorAll('[data-testid="prototype-version"] li')].find((entry) =>
      entry.textContent?.includes(title),
    )
    if (!item) throw new Error(`missing version ${title}`)
    return item.querySelector<HTMLButtonElement>('[data-testid="open-version"]')!
  }

  it('ignores an older version response after a newer one is shown', async () => {
    await mount([version('a', '版本甲'), version('b', '版本乙')])
    const first = deferred<PrototypeVersionRecord>()
    const second = deferred<PrototypeVersionRecord>()
    vi.spyOn(runtimeApi, 'prototypeVersion').mockImplementation((id: string) =>
      id === 'a' ? first.promise : second.promise,
    )
    openButton('版本甲').click()
    openButton('版本乙').click()
    second.resolve(version('b', '版本乙', 5))
    await settled()
    expect(root!.querySelector('[data-testid="version-preview"]')?.textContent).toContain('版本乙')
    first.resolve(version('a', '版本甲', 9))
    await settled()
    expect(root!.querySelector('[data-testid="version-preview"]')?.textContent).toContain('版本乙')
    expect(root!.querySelector('[data-testid="version-preview"]')?.textContent).not.toContain(
      '版本甲',
    )
  })

  it('renders semantic versions with real interactions instead of the legacy counter', async () => {
    const schema = emptyPrototypeSchema('语义设计')
    schema.root.children = [
      {
        id: 'action',
        kind: 'button',
        props: { label: '语义按钮', action: { type: 'TOGGLE', target: 'detail' } },
        children: [],
      },
      {
        id: 'detail',
        kind: 'dialog',
        props: { label: '语义说明' },
        children: [{ id: 'message', kind: 'text', props: { text: '查看任务说明' }, children: [] }],
      },
    ]
    const semantic = {
      ...version('semantic', '语义设计'),
      body: JSON.stringify({ format: 'eap-prototype-v1', schema }),
    }
    await mount([semantic])
    vi.spyOn(runtimeApi, 'prototypeVersion').mockResolvedValue(semantic)
    openButton('语义设计').click()
    await settled()
    const preview = root!.querySelector('[data-testid=version-preview]')!
    expect(preview.querySelector('[data-testid=semantic-preview]')).not.toBeNull()
    expect(preview.querySelector('[data-testid=preview-button]')).toBeNull()
    ;(preview.querySelector('[data-testid=semantic-preview] button') as HTMLButtonElement).click()
    await settled()
    expect(document.querySelector('[role=dialog]')?.textContent).toContain('查看任务说明')
    expect(preview.querySelector('output')).toBeNull()
  })

  it('blocks unsupported semantic versions instead of treating them as legacy demos', async () => {
    const schema = emptyPrototypeSchema('未知设计')
    schema.root.children = [{ id: 'unknown', kind: 'unsupported', props: {}, children: [] }]
    const semantic = {
      ...version('unknown', '未知设计'),
      body: JSON.stringify({ format: 'eap-prototype-v1', schema }),
    }
    await mount([semantic])
    vi.spyOn(runtimeApi, 'prototypeVersion').mockResolvedValue(semantic)
    openButton('未知设计').click()
    await settled()
    expect(root!.querySelector('[data-testid=version-design-blocked]')).not.toBeNull()
    expect(
      (root!.querySelector('[data-testid=prototype-to-code]') as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(
      (root!.querySelector('[data-testid=create-delivery]') as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(
      root!.querySelector('[data-testid=version-preview] [data-testid=preview-button]'),
    ).toBeNull()
  })

  it('does not reopen a preview when the response arrives after close or unmount', async () => {
    await mount([version('a', '版本甲'), version('b', '版本乙')])
    const opening = deferred<PrototypeVersionRecord>()
    vi.spyOn(runtimeApi, 'prototypeVersion').mockImplementation(() => opening.promise)
    openButton('版本甲').click()
    await settled()
    opening.resolve(version('a', '版本甲'))
    await settled()
    const late = deferred<PrototypeVersionRecord>()
    vi.spyOn(runtimeApi, 'prototypeVersion').mockImplementation(() => late.promise)
    openButton('版本乙').click()
    root!.querySelector<HTMLButtonElement>('[data-testid="close-version"]')!.click()
    await settled()
    late.resolve(version('b', '迟到的版本'))
    await settled()
    expect(root!.querySelector('[data-testid="version-preview"]')).toBeNull()

    const afterClose = deferred<PrototypeVersionRecord>()
    vi.spyOn(runtimeApi, 'prototypeVersion').mockImplementation(() => afterClose.promise)
    openButton('版本甲').click()
    app!.unmount()
    afterClose.resolve(version('a', '卸载后的版本'))
    await settled()
    expect(root!.querySelector('[data-testid="version-preview"]')).toBeNull()
    expect(root!.textContent).not.toContain('卸载后的版本')
    app = null
  })

  it('keeps a delivery for A off the preview after switching to B', async () => {
    await mount([version('a', '版本甲'), version('b', '版本乙')])
    vi.spyOn(runtimeApi, 'prototypeVersion').mockImplementation(async (id: string) =>
      version(id, id === 'a' ? '版本甲' : '版本乙'),
    )
    openButton('版本甲').click()
    await settled()
    const delivery = deferred<PrototypeDeliveryRecord>()
    vi.spyOn(runtimeApi, 'createPrototypeDelivery').mockImplementation(() => delivery.promise)
    root!.querySelector<HTMLButtonElement>('[data-testid="create-delivery"]')!.click()
    openButton('版本乙').click()
    await settled()
    delivery.resolve({ id: 'sheet-a', versionId: 'a' })
    await settled()
    expect(root!.querySelector('[data-testid="version-preview"]')?.textContent).toContain('版本乙')
    expect(root!.querySelector('[data-testid="delivery-sheet"]')).toBeNull()
  })

  it('preserves an earlier list and designer when refresh or open fails', async () => {
    await mount([version('a', '版本甲')])
    vi.spyOn(runtimeApi, 'prototypeVersions').mockRejectedValue({
      response: {
        status: 409,
        data: { code: 'PROTOTYPE_VERSION_NOT_FOUND', detail: '版本列表不可用' },
      },
    })
    const refresh = [...root!.querySelectorAll<HTMLButtonElement>('button')].find((item) =>
      item.textContent?.includes('刷新版本'),
    )!
    refresh.click()
    await settled()
    expect(root!.querySelector('[data-testid="version-list-error"]')?.textContent).toContain(
      '版本列表不可用',
    )
    expect(root!.textContent).toContain('版本甲')
    vi.spyOn(runtimeApi, 'prototypeVersion').mockRejectedValue({
      response: {
        status: 404,
        data: { code: 'PROTOTYPE_VERSION_NOT_FOUND', detail: '版本打不开' },
      },
    })
    openButton('版本甲').click()
    await settled()
    expect(root!.querySelector('[data-testid="version-note"]')?.textContent).toContain('版本打不开')
    expect(root!.querySelector('[data-testid="version-preview"]')).toBeNull()
  })

  it('rejects text-only versions for preview, chat and delivery', async () => {
    const invalid = { ...version('old', '旧版本'), body: 'plain old text' }
    await mount([invalid])
    vi.spyOn(runtimeApi, 'prototypeVersion').mockResolvedValue(invalid)
    openButton('旧版本').click()
    await settled()
    expect(root!.querySelector('[data-testid="version-design-blocked"]')).not.toBeNull()
    expect(
      root!.querySelector<HTMLButtonElement>('[data-testid="prototype-to-code"]')!.disabled,
    ).toBe(true)
    expect(
      root!.querySelector<HTMLButtonElement>('[data-testid="create-delivery"]')!.disabled,
    ).toBe(true)
    expect(root!.querySelector('[data-testid="preview-button"]')).toBeNull()
  })
})
