// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test'
import { createApp, h, type App } from 'vue'
import { i18n } from '../../../src/lib/i18n'
import RepositoryBrowser from '../../../src/components/RepositoryBrowser.vue'
import { runtimeApi } from '@eap/runtime-client'
import { openCandidateDiff, workbench } from '../../../src/features/shell/workbench'

let app: App | undefined
let root: HTMLDivElement | undefined

beforeEach(() =>
  vi.spyOn(runtimeApi, 'workspaceFiles').mockResolvedValue({
    path: '',
    entries: [{ name: 'frontend', path: 'frontend', directory: true }],
    denial: '',
    truncated: false,
  }),
)

afterEach(() => {
  app?.unmount()
  root?.remove()
  workbench.diffFocusPath = ''
  workbench.panel = null
  vi.restoreAllMocks()
})

it('exposes path denial from the workspace files API in the source browser', async () => {
  vi.mocked(runtimeApi.workspaceFiles).mockResolvedValueOnce({
    path: '',
    entries: [],
    denial: 'OUTSIDE_AUTHORIZED_ROOT',
    truncated: false,
  })
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({ render: () => h(RepositoryBrowser) })
  app.use(i18n).mount(root)
  await vi.waitFor(
    () => {
      const alert = root!.querySelector('[role="alert"]')?.textContent ?? ''
      expect(alert).toMatch(/超出授权|Outside authorized/i)
    },
    { timeout: 3000 },
  )
})

it('opens changes with a focused candidate path', () => {
  openCandidateDiff('conv-1', 'frontend/apps/web/src/App.vue')
  expect(workbench.panel).toBe('changes')
  expect(workbench.diffFocusPath).toBe('frontend/apps/web/src/App.vue')
})
