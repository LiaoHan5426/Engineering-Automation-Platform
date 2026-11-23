// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { createApp, nextTick, type App } from 'vue'
import { i18n } from '../../../src/lib/i18n'
import { runtimeApi } from '@eap/runtime-client'
import WorkDocumentWorkspace from '../../../src/features/work/WorkDocumentWorkspace.vue'
import { chatBinding, workbench, type ChatBinding } from '../../../src/features/shell/workbench'

let app: App
let root: HTMLDivElement

function binding(overrides: Partial<ChatBinding> = {}): ChatBinding {
  return {
    history: [],
    activeId: null,
    references: ['src/App.vue'],
    draft: '',
    sending: false,
    workspaceLabel: '默认分组',
    memory: '',
    model: 'opus-4.6',
    connectionName: '测试连接',
    approval: 'read_only',
    goal: '',
    executionMode: 'plan',
    scenarioId: null,
    proposalFiles: [],
    verification: '',
    select: () => {},
    create: () => {},
    ...overrides,
  }
}

afterEach(() => {
  app?.unmount()
  root?.remove()
  chatBinding.value = null
  workbench.pendingDraft = ''
  workbench.pendingNewChat = false
  workbench.executionMode = 'chat'
  vi.restoreAllMocks()
})

async function mount(navigate?: (view: string) => void) {
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(WorkDocumentWorkspace, navigate ? { onNavigate: navigate } : {})
  app.use(i18n).mount(root)
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
  await vi.waitFor(() => expect(root.querySelector('[data-testid="workdoc-root"]')).toBeTruthy())
  await nextTick()
}

it('renders the three-column shell with the work area highlighted', async () => {
  vi.spyOn(runtimeApi, 'knowledgeBases').mockResolvedValue({ items: [] })
  vi.spyOn(runtimeApi, 'knowledgeDocuments').mockResolvedValue({ items: [] })
  await mount()
  expect(root.querySelector('[data-testid="workdoc-root"]')).toBeTruthy()
  expect(root.querySelector('[data-testid="workdoc-search"]')).toBeTruthy()
  expect(root.querySelector('[data-testid="workdoc-inspector"]')).toBeTruthy()
  expect(root.querySelector('[data-testid="workdoc-composer"]')).toBeTruthy()
  const workEntry = [...root.querySelectorAll('.wd-rail-entry')].find(
    (node) => node.getAttribute('aria-label') === 'work · 办公',
  )
  expect(workEntry?.getAttribute('aria-current')).toBe('page')
})

it('fills the sidebar, editor and outline from real knowledge-base documents', async () => {
  vi.spyOn(runtimeApi, 'knowledgeBases').mockResolvedValue({
    items: [{ id: 'base-a', name: '产品文档空间', description: '', documents: 2 }],
  })
  vi.spyOn(runtimeApi, 'knowledgeDocuments').mockResolvedValue({
    items: [
      { id: 'doc-1', title: '路线图', content: '# 路线图\n## 本季度目标\n围绕自动化平台。' },
      { id: 'doc-2', title: '访谈纪要', content: '# 访谈' },
    ],
  })
  await mount()
  expect(root.querySelector('[data-testid="workdoc-doc-doc-1"]')?.textContent).toContain('路线图')
  expect(root.querySelector('[data-testid="workdoc-doc-doc-2"]')?.textContent).toContain('访谈纪要')
  const body = root.querySelector('[data-testid="workdoc-body"]') as HTMLTextAreaElement
  expect(body.value).toContain('本季度目标')
  const outline = [...root.querySelectorAll('.wd-outline li')].map((n) => n.textContent?.trim())
  expect(outline).toEqual(['路线图', '本季度目标'])
})

it('shows a truthful load error instead of fabricated document content', async () => {
  vi.spyOn(runtimeApi, 'knowledgeBases').mockRejectedValue(new Error('HTTP 502'))
  await mount()
  expect(root.textContent).toContain('文档列表取不到')
  expect(root.textContent).not.toContain('Q4 产品路线图')
  expect(root.querySelector('[data-testid="workdoc-body"]')).toBeNull()
})

it('switches inspector tabs without inventing reference data', async () => {
  vi.spyOn(runtimeApi, 'knowledgeBases').mockResolvedValue({ items: [] })
  vi.spyOn(runtimeApi, 'knowledgeDocuments').mockResolvedValue({ items: [] })
  await mount()
  ;(root.querySelector('[data-testid="workdoc-tab-references"]') as HTMLButtonElement).click()
  await nextTick()
  expect(root.textContent).toContain('暂无引用资料')
})

it('renders the real draft as a markdown preview from the prototype action', async () => {
  vi.spyOn(runtimeApi, 'knowledgeBases').mockResolvedValue({
    items: [{ id: 'base-a', name: '产品文档空间', description: '', documents: 1 }],
  })
  vi.spyOn(runtimeApi, 'knowledgeDocuments').mockResolvedValue({
    items: [
      {
        id: 'doc-1',
        title: '路线图',
        content: '# 路线图\n## 本季度目标\n围绕自动化平台。\n- 第一项\n- 第二项',
      },
    ],
  })
  await mount()

  ;(root.querySelector('[data-testid="workdoc-preview-action"]') as HTMLButtonElement).click()
  await nextTick()
  expect(
    root.querySelector('[data-testid="workdoc-tab-preview"]')?.getAttribute('aria-selected'),
  ).toBe('true')
  const preview = root.querySelector('[data-testid="workdoc-preview"]')
  expect(preview).not.toBeNull()
  const headings = [...(preview?.querySelectorAll('[role="heading"]') ?? [])].map(
    (node) => node.textContent,
  )
  expect(headings).toContain('本季度目标')
  expect(preview?.textContent).toContain('围绕自动化平台')
  expect(preview?.querySelectorAll('li')).toHaveLength(2)
})

it('exports markdown locally instead of pretending the draft was saved', async () => {
  vi.spyOn(runtimeApi, 'knowledgeBases').mockResolvedValue({
    items: [{ id: 'base-a', name: '产品文档空间', description: '', documents: 1 }],
  })
  vi.spyOn(runtimeApi, 'knowledgeDocuments').mockResolvedValue({
    items: [{ id: 'doc-1', title: '路线图', content: '# 路线图\n\n## 目标\n正文' }],
  })
  const update = vi.spyOn(runtimeApi, 'updateKnowledgeDocument').mockResolvedValue({} as never)
  await mount()

  ;(root.querySelector('[data-testid="workdoc-export"]') as HTMLButtonElement).click()
  await nextTick()
  expect(update).not.toHaveBeenCalled()
  expect(root.textContent).toContain('已导出 Markdown')
  expect(root.querySelector('[data-testid="workdoc-save"]')).not.toBeNull()
})

it('mirrors real session/workbench state into the composer selection axes', async () => {
  vi.spyOn(runtimeApi, 'knowledgeBases').mockResolvedValue({
    items: [{ id: 'base-a', name: '产品文档空间', description: '', documents: 1 }],
  })
  vi.spyOn(runtimeApi, 'knowledgeDocuments').mockResolvedValue({
    items: [{ id: 'doc-1', title: '路线图', content: '# 路线图\n正文' }],
  })
  chatBinding.value = binding()
  workbench.executionMode = 'plan'
  await mount()

  const axes = root.querySelector('[data-testid="workdoc-axes"]')?.textContent ?? ''
  expect(axes).toContain('引用 1 个文件')
  expect(axes).toContain('规划模式')
  expect(axes).toContain('只读')
  expect(axes).toContain('opus-4.6')
  expect(axes).not.toContain('model · —')
})

it('hands an actual typed composer message to the chat workspace without executing it', async () => {
  vi.spyOn(runtimeApi, 'knowledgeBases').mockResolvedValue({
    items: [{ id: 'base-a', name: '产品文档空间', description: '', documents: 1 }],
  })
  vi.spyOn(runtimeApi, 'knowledgeDocuments').mockResolvedValue({
    items: [{ id: 'doc-1', title: '路线图', content: '# 路线图\n正文' }],
  })
  const navigations: string[] = []
  await mount((view) => navigations.push(view))

  const composer = root.querySelector('[data-testid="workdoc-composer"]') as HTMLInputElement
  expect(composer.value).toBe('')
  composer.value = '把本季度目标改成三条'
  composer.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()

  ;(root.querySelector('[data-testid="workdoc-send"]') as HTMLButtonElement).click()
  await vi.waitFor(() => expect(workbench.pendingDraft).toContain('把本季度目标改成三条'))
  await nextTick()

  expect(workbench.pendingDraft).toContain('把本季度目标改成三条')
  expect(workbench.pendingDraft).toContain('路线图')
  expect(navigations).toEqual(['chat'])
  expect(composer.value).toBe('')
})

it('does not hand off an empty composer message', async () => {
  vi.spyOn(runtimeApi, 'knowledgeBases').mockResolvedValue({ items: [] })
  vi.spyOn(runtimeApi, 'knowledgeDocuments').mockResolvedValue({ items: [] })
  const navigations: string[] = []
  await mount((view) => navigations.push(view))

  const send = root.querySelector('[data-testid="workdoc-send"]') as HTMLButtonElement
  expect(send.disabled).toBe(true)
  send.click()
  expect(workbench.pendingDraft).toBe('')
  expect(navigations).toEqual([])
})
