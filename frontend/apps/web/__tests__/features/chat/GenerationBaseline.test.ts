// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vite-plus/test'
import { createApp, h, type App } from 'vue'
import { i18n } from '../../../src/lib/i18n'
import GenerationBaseline from '../../../src/features/chat/GenerationBaseline.vue'
let app: App | undefined
afterEach(() => {
  app?.unmount()
  document.body.innerHTML = ''
})
function mount(generation?: object | null) {
  const root = document.createElement('div')
  document.body.append(root)
  app = createApp({ render: () => h(GenerationBaseline, { generation } as never) })
  app.use(i18n).mount(root)
  return root
}
it('shows the captured target identity without claiming code was applied or verified', () => {
  const root = mount({
    id: 'generation-1',
    targetPath: 'frontend/App.vue',
    baseHash: 'source-sha',
    capturedAt: '2026-11-01T01:00:00Z',
    prototypeVersionId: 'version-1',
    prototypeContentHash: 'design-sha',
  })
  expect(root.textContent).toContain('生成前快照')
  expect(root.textContent).toContain('generation-1')
  expect(root.textContent).toContain('frontend/App.vue')
  expect(root.textContent).toContain('source-sha')
  expect(root.textContent).toContain('design-sha')
  expect(root.textContent).toContain('不代表写入、测试或人工验收')
})
it.each([null, undefined])(
  'does not invent a persisted baseline for old or mock candidates (%s)',
  (value) => {
    const root = mount(value)
    expect(root.textContent).toContain('未关联生成前持久快照')
    expect(root.querySelector('[data-testid=generation-record]')).toBeNull()
  },
)
it('labels an absent target as a state rather than a SHA digest', () => {
  const root = mount({
    id: 'g',
    targetPath: 'New.vue',
    baseHash: 'absent',
    capturedAt: 'now',
    prototypeVersionId: '',
    prototypeContentHash: '',
  })
  expect(root.textContent).toContain('目标不存在（新增文件）')
  expect(root.textContent).not.toContain('SHA-256：absent')
})
