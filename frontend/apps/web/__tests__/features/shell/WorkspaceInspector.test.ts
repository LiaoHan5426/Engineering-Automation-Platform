// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { createApp, h, nextTick, ref, type App } from 'vue'
import { i18n } from '../../../src/lib/i18n'
import WorkspaceInspector from '../../../src/features/shell/WorkspaceInspector.vue'
import { INSPECTOR_TABS, type InspectorSnapshot } from '../../../src/features/shell/inspectorTabs'

let app: App | undefined
let root: HTMLDivElement | undefined

const snapshot: InspectorSnapshot = {
  references: ['src/App.vue'],
  localFiles: ['notes/local.md'],
  proposalFiles: ['src/features/chat/ChatWorkspace.vue'],
  appliedFiles: ['src/lib/i18n.ts'],
  memory: '记住：不要伪造证据',
  workspaceLabel: 'Atlas 工程组',
  model: 'gpt-6.1',
  connectionName: '本机模型',
  verification: '独立验证通过',
  runtimeStatus: '已连接',
  title: '重构会话工作区布局',
  contextLabel: 'EAP / 编程',
}

type Harness = {
  close: ReturnType<typeof vi.fn>
  area: ReturnType<typeof ref<keyof typeof INSPECTOR_TABS>>
}
function mountInspector(area: keyof typeof INSPECTOR_TABS = 'code'): Harness {
  root = document.createElement('div')
  document.body.append(root)
  const close = vi.fn()
  const areaRef = ref(area)
  app = createApp({
    render: () =>
      h(WorkspaceInspector, {
        area: areaRef.value,
        snapshot,
        open: true,
        narrow: false,
        onClose: close,
      }),
  })
  app.use(i18n).mount(root)
  return { close, area: areaRef }
}
const tabs = () => [...(root!.querySelectorAll<HTMLButtonElement>('[role=tab]') ?? [])]
const tabNames = () => tabs().map((tab) => tab.textContent?.trim())

beforeEach(() => {
  i18n.global.locale.value = 'zh-CN'
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  vi.restoreAllMocks()
})

describe('prototype workspace inspector', () => {
  it('shows the five-area tab sets from the Ardot prototype', async () => {
    mountInspector('code')
    await nextTick()
    expect(tabNames()).toEqual(['变更', '文件', 'Git', '浏览器', '记忆'])
  })

  it('scopes tabs to the active area and resets selection when the area changes', async () => {
    const harness = mountInspector('code')
    await nextTick()
    tabs()[3]!.click()
    await nextTick()
    expect(tabs()[3]!.getAttribute('aria-selected')).toBe('true')

    harness.area.value = 'experts'
    await nextTick()
    expect(tabNames()).toEqual(['详情', '指令', '能力', '记忆', '任务'])
    expect(tabs()[0]!.getAttribute('aria-selected')).toBe('true')
    expect(root!.querySelector('[role=tabpanel]')?.getAttribute('aria-labelledby')).toBe(
      tabs()[0]!.id,
    )
  })

  it('moves selection with arrow, Home and End keys without leaving the tablist', async () => {
    mountInspector('work')
    await nextTick()
    const list = tabs()
    list[0]!.focus()
    list[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await nextTick()
    expect(tabs()[1]!.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tabs()[1])

    tabs()[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    await nextTick()
    expect(tabs().at(-1)!.getAttribute('aria-selected')).toBe('true')

    tabs()
      .at(-1)!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    await nextTick()
    expect(tabs()[0]!.getAttribute('aria-selected')).toBe('true')

    tabs()[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    await nextTick()
    expect(tabs().at(-1)!.getAttribute('aria-selected')).toBe('true')
  })

  it('renders real session evidence, never invented sample data', async () => {
    mountInspector('code')
    await nextTick()
    tabs()[1]!.click()
    await nextTick()
    const panel = root!.querySelector('[role=tabpanel]')!.textContent ?? ''
    expect(panel).toContain('src/App.vue')
    expect(panel).toContain('notes/local.md')
    expect(panel).not.toContain('示例文件')
    expect(panel).not.toContain('TaskComposer.vue')

    tabs()[0]!.click()
    await nextTick()
    const changes = root!.querySelector('[role=tabpanel]')!.textContent ?? ''
    expect(changes).toContain('src/features/chat/ChatWorkspace.vue')
    expect(changes).toContain('src/lib/i18n.ts')
  })

  it('states an explicit boundary for tabs without a connected read-only source', async () => {
    mountInspector('code')
    await nextTick()
    tabs()[2]!.click()
    await nextTick()
    const panel = root!.querySelector('[role=tabpanel]')!.textContent ?? ''
    expect(panel).toContain('尚未接入只读来源')
    expect(panel).toContain('不会展示模拟数据')
  })

  it('shows an empty state instead of empty-looking success for missing evidence', async () => {
    root = document.createElement('div')
    document.body.append(root)
    app = createApp({
      render: () =>
        h(WorkspaceInspector, {
          area: 'code',
          snapshot: {
            ...snapshot,
            references: [],
            localFiles: [],
            proposalFiles: [],
            appliedFiles: [],
          },
          open: true,
          narrow: false,
        }),
    })
    app.use(i18n).mount(root)
    await nextTick()
    tabs()[1]!.click()
    await nextTick()
    const panel = root.querySelector('[role=tabpanel]')!.textContent ?? ''
    expect(panel).toContain('这里还没有可检查的内容')
    expect(panel).toContain('开始一次任务或选择已有记录')
  })

  it('emits close and exposes a labelled toggle target', async () => {
    const harness = mountInspector()
    await nextTick()
    const closeButton = root!.querySelector<HTMLButtonElement>('[data-testid=inspector-close]')!
    expect(closeButton.getAttribute('aria-label')).toBe('收起检查器')
    closeButton.click()
    expect(harness.close).toHaveBeenCalledTimes(1)
  })

  it('uses the English tab set when the UI language is English', async () => {
    i18n.global.locale.value = 'en-US'
    mountInspector('code')
    await nextTick()
    expect(tabNames()).toEqual(['Changes', 'Files', 'Git', 'Browser', 'Memory'])
  })

  it('keeps the tabs in a single 56px header row with the collapse control', async () => {
    const harness = mountInspector('code')
    await nextTick()
    expect(root!.querySelector('[data-testid=inspector-tab-bar]')).not.toBeNull()
    expect(root!.querySelector('.workspace-inspector__title')).toBeNull()
    const bar = root!.querySelector('[data-testid=inspector-tab-bar]')!
    expect(bar.contains(root!.querySelector('[role=tablist]'))).toBe(true)
    expect(bar.contains(root!.querySelector('[data-testid=inspector-close]'))).toBe(true)
    root!.querySelector<HTMLButtonElement>('[data-testid=inspector-close]')!.click()
    expect(harness.close).toHaveBeenCalledTimes(1)
  })

  it('groups real evidence into a labelled file tree with counts', async () => {
    mountInspector('code')
    await nextTick()
    tabs()[1]!.click()
    await nextTick()
    const tree = root!.querySelector('[data-testid=inspector-file-tree]')!
    expect(tree.textContent).toContain('文件树')
    expect(tree.querySelector('h3')?.textContent).toContain('4')
    expect(tree.textContent).toContain('src/App.vue')
    expect(tree.textContent).toContain('notes/local.md')
    expect(tree.querySelectorAll('[data-testid^="inspector-file-node-"]').length).toBeGreaterThan(2)
  })

  it('collapses folders and previews real candidate file content', async () => {
    root = document.createElement('div')
    document.body.append(root)
    app = createApp({
      render: () =>
        h(WorkspaceInspector, {
          area: 'code',
          snapshot: {
            ...snapshot,
            proposalFiles: ['src/features/chat/ChatWorkspace.vue'],
            proposalDiffs: [
              {
                path: 'src/features/chat/ChatWorkspace.vue',
                before: 'const tabs = [changes]',
                content: 'const tabs = [changes, files, git]\n// mountInspector',
                baseHash: 'a1b2',
              },
            ],
          },
          open: true,
          narrow: false,
        }),
    })
    app.use(i18n).mount(root)
    await nextTick()
    tabs()[1]!.click()
    await nextTick()

    const nodes = () => [...root!.querySelectorAll('[data-testid^="inspector-file-node-"]')]
    const folder = nodes().find((node) => node.textContent?.includes('features'))!
    expect(folder.getAttribute('aria-expanded')).toBe('true')
    folder.click()
    await nextTick()
    expect(nodes().some((node) => node.textContent?.includes('ChatWorkspace.vue'))).toBe(false)
    expect(folder.getAttribute('aria-expanded')).toBe('false')

    folder.click()
    await nextTick()
    const file = nodes().find((node) => node.textContent?.includes('ChatWorkspace.vue'))!
    expect(file.textContent).toContain('候选')
    file.click()
    await nextTick()
    const preview = root!.querySelector('[data-testid=inspector-file-preview]')!
    expect(preview.textContent).toContain('src/features/chat/ChatWorkspace.vue')
    expect(preview.textContent).toContain('mountInspector')
  })

  it('renders real candidate diffs as file cards with line counts and diff rows', async () => {
    root = document.createElement('div')
    document.body.append(root)
    app = createApp({
      render: () =>
        h(WorkspaceInspector, {
          area: 'code',
          snapshot: {
            ...snapshot,
            proposalDiffs: [
              {
                path: 'src/features/chat/ChatWorkspace.vue',
                before: 'import { useChat } from "@/chat"\nconst tabs = [changes, files]',
                content:
                  'import { mountInspector } from "./shell"\nconst tabs = [changes, files, git]',
                baseHash: 'a1b2',
              },
            ],
          },
          open: true,
          narrow: false,
        }),
    })
    app.use(i18n).mount(root)
    await nextTick()
    const panel = root.querySelector('[role=tabpanel]')!.textContent ?? ''
    expect(panel).toContain('候选变更')
    expect(panel).toContain('src/features/chat/ChatWorkspace.vue')
    expect(panel).toContain('+2')
    expect(panel).toContain('−2')
    expect(panel).toContain('useChat')
    expect(panel).toContain('mountInspector')
  })

  it('renders working memory and verification checks from real session evidence', async () => {
    root = document.createElement('div')
    document.body.append(root)
    app = createApp({
      render: () =>
        h(WorkspaceInspector, {
          area: 'code',
          snapshot: {
            ...snapshot,
            memory: '约束：写入需人工审批；退出码 0 ≠ 完成',
            verificationChecks: [
              { name: 'typecheck', exitCode: 0, summary: 'ok' },
              { name: 'test', exitCode: null, summary: '未执行' },
            ],
          },
          open: true,
          narrow: false,
        }),
    })
    app.use(i18n).mount(root)
    await nextTick()
    const panel = root.querySelector('[role=tabpanel]')!.textContent ?? ''
    expect(panel).toContain('工作记忆')
    expect(panel).toContain('写入需人工审批')
    expect(panel).toContain('UNKNOWN')
    expect(panel).toContain('typecheck')
  })
})
