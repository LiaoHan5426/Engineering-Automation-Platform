// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { createApp, nextTick, type App } from 'vue'
import { i18n } from '../../../src/lib/i18n'
import { runtimeApi } from '@eap/runtime-client'
import SceneDesigner from '../../../src/features/work/SceneDesigner.vue'

let app: App
let root: HTMLDivElement

afterEach(() => {
  app?.unmount()
  root?.remove()
  vi.restoreAllMocks()
})

async function mount() {
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(SceneDesigner)
  app.use(i18n).mount(root)
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
  await vi.waitFor(() =>
    expect(root.querySelector('[data-testid="scenedesigner-root"]')).toBeTruthy(),
  )
  await nextTick()
}

it('renders stepper, palette, canvas and inspector shell', async () => {
  vi.spyOn(runtimeApi, 'prototypeVersions').mockResolvedValue({ items: [] })
  await mount()
  const stepper = root.querySelector('[data-testid="scenedesigner-stepper"]')!
  expect(stepper.querySelectorAll('.scd-step')).toHaveLength(4)
  expect(root.querySelector('[data-testid="scenedesigner-canvas"]')).toBeTruthy()
  expect(root.querySelector('[data-testid="scenedesigner-inspector"]')).toBeTruthy()
  expect(root.querySelector('[data-testid="scenedesigner-add-button"]')).toBeTruthy()
  expect(root.querySelector('.scd-title-group small')?.textContent).toBe(
    'Scene · 场景中心 / 工作流',
  )
})

it('adds only registered component kinds to the real schema canvas', async () => {
  vi.spyOn(runtimeApi, 'prototypeVersions').mockResolvedValue({ items: [] })
  await mount()
  expect(root.querySelectorAll('[data-testid^="scenedesigner-node-"]')).toHaveLength(0)
  ;(root.querySelector('[data-testid="scenedesigner-add-button"]') as HTMLButtonElement).click()
  await nextTick()
  const nodes = root.querySelectorAll('[data-testid^="scenedesigner-node-"]')
  expect(nodes).toHaveLength(1)
  expect(nodes[0].textContent).toContain('button')
})

it('does not navigate to implementation without an explicitly selected version', async () => {
  const navigate = vi.fn()
  vi.spyOn(runtimeApi, 'prototypeVersions').mockResolvedValue({ items: [] })
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(SceneDesigner, { onNavigate: navigate })
  app.use(i18n).mount(root)
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
  ;(root.querySelector('[data-testid="scenedesigner-to-code"]') as HTMLButtonElement).click()
  await nextTick()
  expect(navigate).not.toHaveBeenCalled()
})

it('loads real versions and allows hand-off after an explicit selection', async () => {
  const navigate = vi.fn()
  vi.spyOn(runtimeApi, 'prototypeVersions').mockImplementation(async (source) => ({
    items:
      source === 'builder-alpha'
        ? [
            {
              id: 'v-1',
              requestId: 'r-1',
              sourceRef: source,
              title: '登录页',
              body: '',
              acceptance: [],
              contentHash: 'a1b2c3',
            },
          ]
        : [],
  }))
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(SceneDesigner, { onNavigate: navigate })
  app.use(i18n).mount(root)
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
  await vi.waitFor(() =>
    expect(root.querySelector('[data-testid="scenedesigner-version-v-1"]')).toBeTruthy(),
  )
  ;(root.querySelector('[data-testid="scenedesigner-version-v-1"]') as HTMLButtonElement).click()
  await nextTick()
  ;(root.querySelector('[data-testid="scenedesigner-to-code"]') as HTMLButtonElement).click()
  await nextTick()
  expect(navigate).toHaveBeenCalledWith('builder-alpha')
})

it('shows the immutable version review after selection without starting a Run', async () => {
  const navigate = vi.fn()
  vi.spyOn(runtimeApi, 'prototypeVersions').mockImplementation(async (source) => ({
    items:
      source === 'builder-alpha'
        ? [
            {
              id: 'v-1',
              requestId: 'r-1',
              sourceRef: source,
              title: '登录页',
              body: '{}',
              acceptance: ['A1'],
              contentHash: 'a1b2c3',
            },
          ]
        : [],
  }))
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(SceneDesigner, { onNavigate: navigate })
  app.use(i18n).mount(root)
  await vi.waitFor(() =>
    expect(root.querySelector('[data-testid="scenedesigner-version-v-1"]')).toBeTruthy(),
  )
  ;(root.querySelector('[data-testid="scenedesigner-step-1"]') as HTMLButtonElement).click()
  await nextTick()
  ;(
    root.querySelector('[data-testid="scenedesigner-version-card-v-1"]') as HTMLButtonElement
  ).click()
  await nextTick()
  expect(root.querySelector('[data-testid="scenedesigner-version-body"]')?.textContent).toContain(
    '登录页',
  )
  expect(navigate).not.toHaveBeenCalled()
  expect(
    (root.querySelector('[data-testid="scenedesigner-next"]') as HTMLButtonElement).disabled,
  ).toBe(false)
})

it('lists only real discovered files in the read-only preparation step', async () => {
  vi.spyOn(runtimeApi, 'prototypeVersions').mockImplementation(async (source) => ({
    items:
      source === 'builder-alpha'
        ? [
            {
              id: 'v-1',
              requestId: 'r-1',
              sourceRef: source,
              title: '登录页',
              body: '{}',
              acceptance: [],
              contentHash: 'a1b2c3',
            },
          ]
        : [],
  }))
  vi.spyOn(runtimeApi, 'discoverCodeDependencies').mockResolvedValue({
    workspace: 'orders-web',
    files: [{ path: 'src/App.vue', exists: true, baseHash: 'hash-a', bytes: 42 }],
    totalBytes: 42,
  })
  await mount()
  ;(root.querySelector('[data-testid="scenedesigner-step-1"]') as HTMLButtonElement).click()
  await nextTick()
  ;(
    root.querySelector('[data-testid="scenedesigner-version-card-v-1"]') as HTMLButtonElement
  ).click()
  await nextTick()
  ;(root.querySelector('[data-testid="scenedesigner-next"]') as HTMLButtonElement).click()
  await nextTick()
  const input = root.querySelector('[data-testid="scenedesigner-target"]') as HTMLInputElement
  input.value = 'src/App.vue'
  input.dispatchEvent(new Event('input'))
  await nextTick()
  ;(root.querySelector('[data-testid="scenedesigner-discover"]') as HTMLButtonElement).click()
  await vi.waitFor(() =>
    expect(
      root.querySelector('[data-testid="scenedesigner-file-src/App.vue"]')?.textContent,
    ).toContain('src/App.vue'),
  )
  expect(runtimeApi.discoverCodeDependencies).toHaveBeenCalledWith('src/App.vue')
  expect(
    root.querySelector('[data-testid="scenedesigner-readonly-banner"]')?.textContent,
  ).toContain('只读')
})

it('publishes the real canvas schema and refreshes the immutable version list', async () => {
  const version = {
    id: 'v-new',
    requestId: 'r-new',
    sourceRef: 'builder-alpha' as const,
    title: '登录页草稿',
    body: '{}',
    acceptance: [],
    contentHash: 'abcd1234',
  }
  const publish = vi.spyOn(runtimeApi, 'savePrototypeVersion').mockResolvedValue(version)
  let loads = 0
  vi.spyOn(runtimeApi, 'prototypeVersions').mockImplementation(async (source) => ({
    items: source === 'builder-alpha' ? (loads++ === 0 ? [] : [version]) : [],
  }))
  await mount()
  ;(root.querySelector('[data-testid="scenedesigner-add-button"]') as HTMLButtonElement).click()
  await nextTick()
  ;(root.querySelector('[data-testid="scenedesigner-save-draft"]') as HTMLButtonElement).click()
  await vi.waitFor(() => expect(publish).toHaveBeenCalledTimes(1))

  const request = publish.mock.calls[0]![0]
  const body = JSON.parse(request.body) as {
    schema: { root: { children: Array<{ kind: string }> } }
  }
  expect(body.schema.root.children[0]!.kind).toBe('button')
  expect(request.sourceRef).toBe('builder-alpha')
  await vi.waitFor(() =>
    expect(root.querySelector('[data-testid="scenedesigner-version-card-v-new"]')).toBeTruthy(),
  )
  expect(root.textContent).toContain('abcd1234')
})

it('does not publish an empty canvas and explains the real blocker', async () => {
  const publish = vi.spyOn(runtimeApi, 'savePrototypeVersion')
  vi.spyOn(runtimeApi, 'prototypeVersions').mockResolvedValue({ items: [] })
  await mount()
  ;(root.querySelector('[data-testid="scenedesigner-save-draft"]') as HTMLButtonElement).click()
  await nextTick()
  expect(publish).not.toHaveBeenCalled()
  expect(root.querySelector('[data-testid="scenedesigner-save-error"]')?.textContent).toContain(
    '画布为空',
  )
})

it('reuses the publication request id for retry and never claims success on failure', async () => {
  const publish = vi
    .spyOn(runtimeApi, 'savePrototypeVersion')
    .mockRejectedValue(new Error('offline'))
  vi.spyOn(runtimeApi, 'prototypeVersions').mockResolvedValue({ items: [] })
  await mount()
  ;(root.querySelector('[data-testid="scenedesigner-add-button"]') as HTMLButtonElement).click()
  await nextTick()
  ;(root.querySelector('[data-testid="scenedesigner-save-draft"]') as HTMLButtonElement).click()
  await vi.waitFor(() => expect(publish).toHaveBeenCalledTimes(1))
  const requestId = publish.mock.calls[0]![0].requestId
  await vi.waitFor(() =>
    expect(root.querySelector('[data-testid="scenedesigner-save-error"]')?.textContent).toContain(
      '保存失败',
    ),
  )
  expect(root.textContent).not.toContain('已保存不可变版本')

  ;(root.querySelector('[data-testid="scenedesigner-save-draft"]') as HTMLButtonElement).click()
  await vi.waitFor(() => expect(publish).toHaveBeenCalledTimes(2))
  expect(publish.mock.calls[1]![0].requestId).toBe(requestId)
})

it('keeps independent verification UNKNOWN when no recorded evidence exists', async () => {
  vi.spyOn(runtimeApi, 'prototypeVersions').mockResolvedValue({ items: [] })
  await mount()
  const steps = root.querySelectorAll('[data-testid^="scenedesigner-step-"]')
  ;(steps[3] as HTMLButtonElement).click()
  await nextTick()
  const body = root.querySelector('[data-testid="scenedesigner-verify-body"]')!
  expect(body.textContent).toContain('UNKNOWN')
  expect(body.querySelector('.scd-verdict-badge')?.textContent).toBe('UNKNOWN')
  expect(body.textContent).not.toContain('验证通过')
  expect(root.querySelector('[data-testid="scenedesigner-back"]')).toBeTruthy()
})
