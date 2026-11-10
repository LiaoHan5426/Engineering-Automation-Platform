// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { createApp, h, type App } from 'vue'
import { i18n } from '../../../src/lib/i18n'
import { resetPrototypeSchemaForTests } from '../../../src/features/shell/prototypeSchema'
import GrapesEditorScaffold from '../../../src/features/shell/GrapesEditorScaffold.vue'
vi.mock('grapesjs', () => {
  throw new Error('Editor unavailable in this test')
})

let app: App | undefined
let root: HTMLDivElement | undefined

beforeEach(() => {
  localStorage.clear()
  resetPrototypeSchemaForTests()
})

afterEach(() => {
  app?.unmount()
  root?.remove()
  localStorage.clear()
  resetPrototypeSchemaForTests()
})

describe('grapes editor scaffold', () => {
  it('refuses editing and saving when the actual designer is unavailable', async () => {
    root = document.createElement('div')
    document.body.append(root)
    app = createApp({ render: () => h(GrapesEditorScaffold) })
    app.use(i18n).mount(root)
    await vi.waitFor(() =>
      expect(root!.querySelector('[data-testid=grapes-status]')?.textContent).toMatch(
        /脚手架|Scaffold/,
      ),
    )
    await vi.waitFor(() =>
      expect(root!.querySelector('[data-testid=grapes-boundary]')?.textContent).toMatch(
        /HTML\/CSS|Vue/,
      ),
    )
    expect((root.querySelector('[data-testid=grapes-title]') as HTMLInputElement).disabled).toBe(
      true,
    )
    expect((root.querySelector('[data-testid=grapes-save]') as HTMLButtonElement).disabled).toBe(
      true,
    )
    expect(localStorage.getItem('eap.prototype-schema.v1.builder-alpha')).toBeNull()
  })
})
