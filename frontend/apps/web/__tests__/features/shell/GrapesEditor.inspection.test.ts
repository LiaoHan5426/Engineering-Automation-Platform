// @vitest-environment happy-dom
import { afterEach, expect, it, vi, type Mock } from 'vite-plus/test'
import { createApp, h, nextTick, ref, type App } from 'vue'
import { runtimeApi } from '@eap/runtime-client'
import { i18n } from '../../../src/lib/i18n'
import GrapesEditorScaffold from '../../../src/features/shell/GrapesEditorScaffold.vue'
import PluginSlot from '../../../src/features/plugins/PluginSlot.vue'
import { createPluginHost } from '../../../src/features/plugins/host'

const fixtures = vi.hoisted(() => ({
  editors: [] as Array<{
    events: Record<string, () => void>
    project: { pages: unknown[] }
    destroy: Mock<() => void>
  }>,
}))
vi.mock('grapesjs', () => ({
  default: {
    init: () => {
      const fixture = {
        events: {} as Record<string, () => void>,
        project: { pages: [] },
        destroy: vi.fn(),
      }
      fixtures.editors.push(fixture)
      return {
        on: (event: string, handler: () => void) => {
          fixture.events[event] = handler
        },
        setComponents: () => {},
        loadProjectData: () => {},
        destroy: fixture.destroy,
        getProjectData: () => fixture.project,
        getSelected: () => ({ toJSON: () => ({ id: 'selection', content: '<b>unsaved</b>' }) }),
      }
    },
  },
}))
let app: App | undefined
let root: HTMLDivElement
const click = async (id: string, index = 0) => {
  const button = root.querySelectorAll(`[data-testid=${id}]`)[index] as HTMLButtonElement
  expect(button).toBeTruthy()
  button.click()
  await nextTick()
}
afterEach(() => {
  app?.unmount()
  root?.remove()
  fixtures.editors.length = 0
  localStorage.clear()
  vi.restoreAllMocks()
})

it('manually inspects the addressed live instance, invalidates edits and discards results on surface exit', async () => {
  const save = vi.spyOn(runtimeApi, 'savePrototypeVersion')
  const active = ref(true)
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({
    render: () =>
      h('div', [
        h(GrapesEditorScaffold, { sourceRef: 'builder-alpha', active: active.value }),
        h(GrapesEditorScaffold, { sourceRef: 'builder-beta' }),
      ]),
  })
  app.use(i18n).mount(root)
  await vi.waitFor(() => expect(fixtures.editors).toHaveLength(2))
  await nextTick()
  const storage = localStorage.length
  await click('grapes-inspect')
  const result = () =>
    root
      .querySelector('[data-testid=grapes-scaffold]')!
      .querySelector('[data-testid=grapes-inspection-result]')
  const first = JSON.parse(result()!.textContent!)
  expect(first.target.sourceRef).toBe('builder-alpha')
  expect(first.draft.selection.content).toBe('<b>unsaved</b>')
  expect(result()!.querySelector('b')).toBeNull()
  await click('grapes-inspect', 1)
  const second = JSON.parse(
    root.querySelectorAll('[data-testid=grapes-inspection-result]')[1]!.textContent!,
  )
  expect(second.target.sourceRef).toBe('builder-beta')
  expect(second.target.instanceId).not.toBe(first.target.instanceId)
  fixtures.editors[0]!.events.update!()
  await nextTick()
  expect(root.querySelector('[data-testid=grapes-inspection-stale]')).not.toBeNull()
  await click('grapes-inspect')
  expect(root.querySelector('[data-testid=grapes-inspection-stale]')).toBeNull()
  expect(JSON.parse(result()!.textContent!).target.revision).toBeGreaterThan(first.target.revision)
  await click('grapes-new')
  expect(result()).toBeNull()
  await click('grapes-inspect')
  expect(JSON.parse(result()!.textContent!).target.documentId).not.toBe(first.target.documentId)
  active.value = false
  await nextTick()
  expect(root.querySelectorAll('[data-testid=grapes-inspection-result]')).toHaveLength(1)
  expect((root.querySelector('[data-testid=grapes-inspect]') as HTMLButtonElement).disabled).toBe(
    true,
  )
  expect(save).not.toHaveBeenCalled()
  expect(localStorage.length).toBe(storage)
  fixtures.editors[1]!.destroy()
  fixtures.editors[1]!.events.destroy!()
  await nextTick()
  expect(root.querySelector('[data-testid=grapes-inspection-result]')).toBeNull()
  expect(
    (root.querySelectorAll('[data-testid=grapes-inspect]')[1] as HTMLButtonElement).disabled,
  ).toBe(true)
  app.unmount()
  app = undefined
  expect(fixtures.editors.every((editor) => editor.destroy.mock.calls.length === 1)).toBe(true)
})

it('discards inspection across actual cached Host navigation without discarding the draft', async () => {
  vi.spyOn(runtimeApi, 'prototypeVersions').mockResolvedValue({ items: [] })
  const host = createPluginHost({ getItem: () => null, setItem: () => {} })
  host.setEnabled('builder', true)
  const view = ref('builder-alpha')
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({
    render: () => h(PluginSlot, { viewId: view.value, host, chatView: { render: () => h('div') } }),
  })
  app.use(i18n).mount(root)
  await vi.waitFor(() => expect(fixtures.editors).toHaveLength(1))
  await nextTick()
  const alpha = root.querySelector('[data-testid=builder-alpha]')!
  const title = alpha.querySelector<HTMLInputElement>('[data-testid=grapes-title]')!
  title.value = 'retained local draft'
  title.dispatchEvent(new Event('input', { bubbles: true }))
  await click('grapes-inspect')
  const prior = JSON.parse(
    alpha.querySelector('[data-testid=grapes-inspection-result]')!.textContent!,
  )
  for (const destination of ['builder-beta', 'model-settings', 'chat']) {
    view.value = destination
    await nextTick()
    expect(alpha.querySelector('[data-testid=grapes-inspection-result]')).toBeNull()
    expect(
      (alpha.querySelector('[data-testid=grapes-inspect]') as HTMLButtonElement).disabled,
    ).toBe(true)
    view.value = 'builder-alpha'
    await nextTick()
    expect(alpha.querySelector('[data-testid=grapes-inspection-result]')).toBeNull()
    expect(title.value).toBe('retained local draft')
    await click('grapes-inspect')
    const next = JSON.parse(
      alpha.querySelector('[data-testid=grapes-inspection-result]')!.textContent!,
    )
    expect(next.target.instanceId).toBe(prior.target.instanceId)
    expect(next.target.documentId).toBe(prior.target.documentId)
  }
})
