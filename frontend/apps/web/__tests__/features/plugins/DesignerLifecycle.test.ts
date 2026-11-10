// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { createApp, h, nextTick, ref, type App } from 'vue'
import { runtimeApi } from '@eap/runtime-client'
import { i18n } from '../../../src/lib/i18n'
import PluginSlot from '../../../src/features/plugins/PluginSlot.vue'
import { createPluginHost } from '../../../src/features/plugins/host'
import { memoryStore } from '../../../src/features/plugins/model'
import { scenarioComposition } from '../../../src/features/plugins/scenarioComposition'
import { designerSnapshot } from './designerFixtures'
const state = vi.hoisted(() => ({
  editors: [] as Array<{
    project: Record<string, unknown>
    events: Record<string, () => void>
    destroyed: boolean
  }>,
}))
vi.mock('grapesjs', () => ({
  default: {
    init: () => {
      const item = {
        project: { pages: [] } as Record<string, unknown>,
        events: {} as Record<string, () => void>,
        destroyed: false,
      }
      state.editors.push(item)
      return {
        on: (name: string, handler: () => void) => {
          item.events[name] = handler
        },
        setComponents: () => {},
        getProjectData: () => item.project,
        loadProjectData: (project: Record<string, unknown>) => {
          item.project = structuredClone(project)
        },
        getSelected: () => undefined,
        getWrapper: () => ({ components: () => ({ models: [] }) }),
        destroy: () => {
          item.destroyed = true
          item.events.destroy?.()
        },
      }
    },
  },
}))
let app: App | undefined
let root: HTMLDivElement
afterEach(() => {
  app?.unmount()
  root?.remove()
  state.editors.length = 0
  vi.restoreAllMocks()
  localStorage.clear()
})
async function mount() {
  vi.spyOn(runtimeApi, 'prototypeVersions').mockResolvedValue({ items: [] })
  const host = createPluginHost(memoryStore())
  const view = ref('builder-alpha')
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({
    render: () =>
      h(PluginSlot, { viewId: view.value, host, chatView: { render: () => h('p', 'chat') } }),
  })
  app.use(i18n).mount(root)
  await vi.waitFor(() => expect(state.editors).toHaveLength(1))
  await nextTick()
  return { host, view }
}
async function title(source: string, value: string) {
  const input = root.querySelector<HTMLInputElement>(
    `[data-testid="${source}"] [data-testid="grapes-title"]`,
  )!
  input.value = value
  input.dispatchEvent(new Event('input'))
  await nextTick()
}
it('destroys both disabled instances and recreates independent unsaved projects and titles without publication', async () => {
  const publish = vi.spyOn(runtimeApi, 'savePrototypeVersion')
  const { host, view } = await mount()
  await title('builder-alpha', 'Alpha unsaved')
  state.editors[0]!.project = { pages: [{ id: 'alpha-page' }] }
  state.editors[0]!.events.update!()
  view.value = 'builder-beta'
  await vi.waitFor(() => expect(state.editors).toHaveLength(2))
  await title('builder-beta', 'Beta unsaved')
  state.editors[1]!.project = { pages: [{ id: 'beta-page' }] }
  state.editors[1]!.events.update!()
  host.setEnabled('builder', false)
  await nextTick()
  expect(state.editors.slice(0, 2).every((x) => x.destroyed)).toBe(true)
  expect(root.querySelector('[data-testid="grapes-scaffold"]')).toBeNull()
  host.setEnabled('builder', true)
  await vi.waitFor(() => expect(state.editors).toHaveLength(4))
  expect(
    root.querySelector<HTMLInputElement>(
      '[data-testid="builder-alpha"] [data-testid="grapes-title"]',
    )?.value,
  ).toBe('Alpha unsaved')
  expect(
    root.querySelector<HTMLInputElement>(
      '[data-testid="builder-beta"] [data-testid="grapes-title"]',
    )?.value,
  ).toBe('Beta unsaved')
  expect(state.editors[2]!.project).toEqual({ pages: [{ id: 'alpha-page' }] })
  expect(state.editors[3]!.project).toEqual({ pages: [{ id: 'beta-page' }] })
  expect(publish).not.toHaveBeenCalled()
})
it('refuses disable when recovery storage fails, retains the canvas, and allows retry after repair', async () => {
  const { host } = await mount()
  const fail = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
    throw new Error('quota')
  })
  await title('builder-alpha', 'Keep this draft')
  expect(() => host.setEnabled('builder', false)).toThrow('DESIGNER_SUSPEND_BLOCKED')
  expect(host.installation.value.enabled.builder).toBe(true)
  expect(state.editors[0]!.destroyed).toBe(false)
  fail.mockRestore()
  host.setEnabled('builder', false)
  await nextTick()
  expect(localStorage.getItem('eap.prototype-recovery.v1.builder-alpha')).toContain(
    'Keep this draft',
  )
})
it('keeps service failure, required designer, optional board and sticky activation independent', async () => {
  const host = createPluginHost(memoryStore())
  expect(scenarioComposition(host).ready).toBe(false)
  host.builderDependencyCheck.value = {
    status: 'available',
    reason: '',
    snapshot: designerSnapshot(1),
  }
  host.setEnabled('board', false)
  expect(scenarioComposition(host).ready).toBe(true)
  host.setEnabled('builder', false)
  host.armActivationFailure('activation failed', 'builder')
  expect(() => host.setEnabled('builder', true)).toThrow('PLUGIN_ACTIVATION_FAILED')
  host.refreshFromStore()
  expect(host.runtimeOf('builder').kind).toBe('activation_failed')
  expect(scenarioComposition(host).ready).toBe(false)
  host.setEnabled('builder', true)
  host.builderDependencyCheck.value = {
    status: 'failed',
    reason: 'HTTP 503',
    snapshot: designerSnapshot(1),
  }
  expect(host.runtimeOf('builder').message).toBe('HTTP 503')
  expect(scenarioComposition(host).ready).toBe(false)
  host.setServiceAvailable('runtime.prototype-api', false)
  expect(host.builderContributionVisible.value).toBe(false)
  expect(() => host.setEnabled('builder', true)).toThrow('PLUGIN_DEPENDENCY_MISSING')
})

it('keeps concurrent activation failures isolated when another contribution is repaired', () => {
  const host = createPluginHost(memoryStore())
  host.setEnabled('board', false)
  host.setEnabled('builder', false)
  host.armActivationFailure('board failed', 'board')
  expect(() => host.setEnabled('board', true)).toThrow('PLUGIN_ACTIVATION_FAILED')
  host.armActivationFailure('designer failed', 'builder')
  expect(() => host.setEnabled('builder', true)).toThrow('PLUGIN_ACTIVATION_FAILED')
  expect(host.runtimeOf('board').message).toBe('board failed')
  expect(host.runtimeOf('builder').message).toBe('designer failed')
  host.setEnabled('builder', true)
  expect(host.runtimeOf('board').message).toBe('board failed')
  expect(host.boardContributionVisible.value).toBe(false)
  expect(host.builderContributionVisible.value).toBe(true)
})

it('allows recoverable navigation but refuses replacing a dirty document with a new design', async () => {
  await mount()
  await title('builder-alpha', 'Do not overwrite this document')
  root.querySelector<HTMLButtonElement>('[data-testid="grapes-new"]')!.click()
  await nextTick()
  expect(root.querySelector<HTMLInputElement>('[data-testid="grapes-title"]')!.value).toBe(
    'Do not overwrite this document',
  )
  expect(root.textContent).toContain('新建设计前请先保存或放弃修改')
  expect(localStorage.getItem('eap.prototype-recovery.v1.builder-alpha')).toContain(
    'Do not overwrite this document',
  )
})
