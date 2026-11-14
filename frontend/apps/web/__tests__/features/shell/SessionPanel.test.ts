// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test'
import { createApp, h, nextTick, ref, type App } from 'vue'
import { ChatExecutionStatus, runtimeApi, type CodeProposal } from '@eap/runtime-client'
import { i18n } from '../../../src/lib/i18n'
import SessionPanel from '../../../src/components/SessionPanel.vue'
import {
  chatBinding,
  openCandidateDiff,
  workbench,
  type ChatBinding,
} from '../../../src/features/shell/workbench'

let app: App | undefined
let root: HTMLDivElement | undefined
beforeEach(() =>
  vi.spyOn(runtimeApi, 'workspaceFiles').mockResolvedValue({
    path: '',
    entries: [],
    denial: 'AUTHORIZED_ROOT_MISSING',
    truncated: false,
  }),
)
afterEach(() => {
  app?.unmount()
  root?.remove()
  chatBinding.value = null
  workbench.sessionExtras = {}
  workbench.diffFocusPath = ''
  workbench.panel = null
  workbench.sessionPanels = {}
  vi.restoreAllMocks()
})

function binding(extra: Partial<ChatBinding> = {}): ChatBinding {
  return {
    history: [],
    activeId: 's1',
    references: [],
    draft: '',
    sending: false,
    workspaceLabel: '',
    memory: '',
    model: '',
    connectionName: '',
    approval: 'review',
    goal: 'chat',
    executionMode: 'chat',
    scenarioId: null,
    proposalFiles: [],
    verification: 'not_requested',
    select: () => {},
    create: () => {},
    ...extra,
  }
}

it('replaces the summary when the active session changes', async () => {
  chatBinding.value = binding({
    activeId: 'a',
    executionMode: 'agent',
    scenarioId: 'prototype-to-code',
    proposalFiles: ['src/App.vue'],
    references: ['notes.md'],
    model: 'reasoning-demo',
    connectionName: 'Mock',
  })
  workbench.sessionExtras.a = {
    scenarioId: 'prototype-to-code',
    experts: [],
    resources: [],
    projectId: 'local-eap',
    executionMode: 'agent',
  }
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({ render: () => h(SessionPanel, { mode: 'summary' }) })
  app.use(i18n).mount(root)
  await nextTick()
  expect(root.textContent).toContain('智能体')
  expect(root.textContent).toContain('原型到代码')
  expect(root.textContent).toContain('候选 1 个文件')
  expect(root.textContent).toContain('基线未知，不能把候选当成可以写入')
  expect(root.textContent).toContain('notes.md')
  expect(root.querySelector('[data-testid="panel-session"] span')?.textContent).toBe('当前会话')
  expect(root.querySelector('[data-testid="session-project"]')?.textContent).toBe('项目分组：EAP')
  expect(root.querySelector('[data-testid="expert-none"]')?.textContent).toMatch(
    /未加入协作专家|No collaborator expert/,
  )
  expect(root.querySelector('[data-testid="risk-review-off"]')?.textContent).toMatch(
    /风险审核未接入|Risk review is not connected/,
  )
  expect(root.querySelector('[data-testid="run-recovery-off"]')?.textContent).toMatch(
    /不会恢复后台 Run|will not resume a background Run/,
  )
  chatBinding.value = binding({
    activeId: 'b',
    executionMode: 'chat',
    scenarioId: null,
    proposalFiles: [],
    references: [],
  })
  workbench.sessionExtras.b = {
    scenarioId: null,
    experts: [],
    resources: [],
    projectId: null,
    executionMode: 'chat',
  }
  await nextTick()
  expect(root.textContent).toContain('聊天')
  expect(root.textContent).not.toContain('原型到代码')
  expect(root.textContent).toContain('无候选')
  expect(root.textContent).toContain('这次回复没有待确认的写入')
  expect(root.textContent).not.toContain('基线未知')
  expect(root.querySelector('[data-testid="panel-session"] span')?.textContent).toBe('当前会话')
  expect(root.querySelector('[data-testid="session-project"]')?.textContent).toBe('未选择项目分组')
  chatBinding.value = binding({
    activeId: 'b',
    proposalFiles: ['src/App.vue'],
    writeRefused: true,
  })
  await nextTick()
  expect(root.textContent).toContain('这次写入已拒绝，不会应用')
  expect(root.textContent).toContain('仓库文件未读取')
  expect(root.textContent).not.toContain('notes.md')
})

it('shows only recorded execution evidence and isolates sessions and drafts', async () => {
  const execution = {
    conversationId: 'a',
    executionId: 'exec-a',
    status: ChatExecutionStatus.RUNNING,
    observing: true,
    toolEvents: [{ sequence: 2, code: 'TOOL_STARTED' }],
    error: '',
  }
  chatBinding.value = binding({
    activeId: 'a',
    draft: '保留正文',
    sending: true,
    proposalFiles: ['src/App.vue'],
    latestExecution: execution,
  })
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({ render: () => h(SessionPanel, { mode: 'summary' }) })
  app.use(i18n).mount(root)
  await nextTick()
  expect(root.querySelector('[data-testid=summary-steps]')).toBeNull()
  expect(root.querySelector('[data-testid=summary-execution-status]')?.textContent).toBe('执行中')
  expect(root.querySelector('[data-testid=summary-execution-id]')?.textContent).toContain('exec-a')
  expect(root.querySelector('[data-testid=summary-execution-tools]')?.textContent).toContain(
    '2 · TOOL_STARTED',
  )
  expect(root.querySelector('[data-testid=summary-execution-observation]')?.textContent).toContain(
    '正在接收',
  )
  expect(chatBinding.value?.draft).toBe('保留正文')
  // A stale projection cannot appear in another conversation.
  chatBinding.value = binding({ activeId: 'b', latestExecution: execution })
  await nextTick()
  expect(root.querySelector('[data-testid=summary-execution-empty]')).not.toBeNull()
  expect(root.querySelector('[data-testid=summary-execution]')?.textContent).not.toContain('exec-a')
  // Drafts and candidates alone do not manufacture execution progress.
  chatBinding.value = binding({
    activeId: null,
    draft: 'new draft',
    sending: true,
    proposalFiles: ['other.vue'],
  })
  await nextTick()
  expect(root.querySelector('[data-testid=summary-execution-empty]')).not.toBeNull()
  expect(root.querySelector('[data-testid=summary-execution-status]')).toBeNull()
})

it.each(Object.values(ChatExecutionStatus))(
  'shows the recorded %s without inferring background activity or acceptance',
  async (status) => {
    chatBinding.value = binding({
      latestExecution: {
        conversationId: 's1',
        executionId: 'exec',
        status,
        observing: false,
        toolEvents: [],
        error: '',
      },
    })
    root = document.createElement('div')
    document.body.append(root)
    app = createApp({ render: () => h(SessionPanel, { mode: 'summary' }) })
    app.use(i18n).mount(root)
    await nextTick()
    expect(root.querySelector('[data-testid=summary-execution-status]')?.textContent).toBe(
      i18n.global.t(`desktop.chatExecutionStatuses.${status}`),
    )
    const summary = root.querySelector('[data-testid=summary-execution]')!.textContent!
    expect(summary).toContain('本地历史记录')
    expect(summary).toContain('不代表后台仍在运行')
    expect(summary).not.toContain('检查已通过')
    expect(summary).not.toContain('交互验收')
    if (status === ChatExecutionStatus.UNKNOWN)
      expect(summary).toContain('停止等待不代表执行已取消')
    if (status === ChatExecutionStatus.CANCELLING) expect(summary).toContain('仍需等待实际终态')
  },
)

it('does not report an unconfirmed local placeholder as a running server execution', async () => {
  chatBinding.value = binding({
    latestExecution: {
      conversationId: 's1',
      executionId: null,
      status: ChatExecutionStatus.RUNNING,
      observing: true,
      toolEvents: [],
      error: '',
    },
  })
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({ render: () => h(SessionPanel, { mode: 'summary' }) })
  app.use(i18n).mount(root)
  await nextTick()
  expect(root.querySelector('[data-testid=summary-execution-status]')?.textContent).toBe(
    '等待执行确认',
  )
  expect(root.querySelector('[data-testid=summary-execution-id]')?.textContent).toContain(
    '没有执行号',
  )
  chatBinding.value = binding({
    latestExecution: {
      conversationId: 's1',
      executionId: null,
      status: null,
      observing: false,
      toolEvents: [],
      error: 'AI_RESPONSE_INVALID',
    },
  })
  await nextTick()
  const summary = root.querySelector('[data-testid=summary-execution]')!.textContent!
  expect(summary).toContain('没有有效的执行状态记录')
  expect(summary).not.toContain('结果未知')
  expect(summary).toContain('AI_RESPONSE_INVALID')
})

it('shows an unavailable terminal without fake session controls and can close it', async () => {
  chatBinding.value = binding({ activeId: 'a' })
  const close = vi.fn()
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({ render: () => h(SessionPanel, { mode: 'terminal', onClose: close }) })
  app.use(i18n).mount(root)
  await nextTick()
  expect(root.textContent).toContain('终端尚未开放')
  expect(root.textContent).toContain('任务看板')
  expect(root.querySelector('.terminal-tab-add')).toBeNull()
  expect(root.querySelector('[data-testid="terminal-stop"]')).toBeNull()
  expect(root.textContent).not.toContain('UTF-8')
  expect(root.querySelector('pre')).toBeNull()
  ;(root.querySelector('[data-testid="close-terminal"]') as HTMLButtonElement).click()
  expect(close).toHaveBeenCalledOnce()
})

it('shows an empty background state as 暂无 without inventing a run', async () => {
  chatBinding.value = binding({ activeId: 'a' })
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({ render: () => h(SessionPanel, { mode: 'summary' }) })
  app.use(i18n).mount(root)
  await nextTick()
  expect(root.querySelector('[data-testid=summary-none]')?.textContent).toMatch(/暂无|None/)
  expect(root.querySelector('[data-testid=summary-background]')?.textContent).toMatch(
    /当前没有后台任务|No background tasks/,
  )
  expect(root.querySelector('[data-testid=run-recovery-off]')?.textContent).toMatch(
    /不会恢复|will not resume/,
  )
})

it('traces the adopted expert version, guidance and resource scope', async () => {
  chatBinding.value = binding({ activeId: 'a' })
  workbench.sessionExtras.a = {
    scenarioId: null,
    resources: [],
    projectId: null,
    experts: [
      {
        id: 'writer',
        name: '文档整理',
        category: '办公',
        version: 'demo-1',
        resources: '无外部工具',
        guidance: '只整理已给出的材料。',
        mine: true,
      },
    ],
  }
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({ render: () => h(SessionPanel, { mode: 'summary' }) })
  app.use(i18n).mount(root)
  await nextTick()
  expect(root.textContent).toContain('文档整理@demo-1')
  expect(root.textContent).toContain('只整理已给出的材料。')
  expect(root.textContent).toContain('无外部工具')
  expect(root.textContent).toContain('工具未接入')
  expect(root.querySelector('[data-testid="expert-trace"]')?.textContent).toContain(
    '文档整理@demo-1',
  )
  chatBinding.value = binding({ activeId: 'b' })
  workbench.sessionExtras.b = { scenarioId: null, experts: [], resources: [], projectId: null }
  await nextTick()
  expect(root.textContent).not.toContain('只整理已给出的材料。')
  expect(root.querySelector('[data-testid="expert-none"]')?.textContent).toMatch(
    /未加入协作专家|No collaborator expert/,
  )
})

it('shows delivery input without inventing a preview URL from a source path', async () => {
  chatBinding.value = binding({ activeId: 'a' })
  workbench.sessionExtras.a = {
    scenarioId: 'prototype-to-code',
    experts: [],
    resources: [],
    projectId: null,
    delivery: {
      versionId: 'draft-1',
      pagePath: 'frontend/apps/web/src/features/chat/TaskComposer.vue',
      pageLabel: 'desktop.sources',
    },
  }
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({ render: () => h(SessionPanel, { mode: 'summary' }) })
  app.use(i18n).mount(root)
  await nextTick()
  expect(root.textContent).toContain('draft-1')
  expect(root.textContent).toContain('TaskComposer.vue')
  expect(root.textContent).toContain('无退出码')
  expect(root.querySelector('[data-testid=delivery-preview]')?.textContent).toBe(
    i18n.global.t('desktop.deliveryPreview'),
  )
  expect(root.textContent).not.toContain('/#chat')
  expect(root.textContent).toContain(i18n.global.t('desktop.acceptanceStillOpen'))
  expect(root.textContent).not.toContain('demo passed')
})

it('keeps a recorded verification value from looking complete', async () => {
  chatBinding.value = binding({ verification: 'passed' })
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({ render: () => h(SessionPanel, { mode: 'summary' }) })
  app.use(i18n).mount(root)
  await nextTick()
  expect(root.textContent).toContain('检查明细尚不完整')
  expect(root.textContent).not.toContain('检查已通过')
})

it('keeps a local upload apart from the design version and the unread repository', async () => {
  chatBinding.value = binding({
    localFiles: ['notes.md'],
    versionId: 'draft-1',
    references: ['notes.md', 'draft-1'],
  })
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({ render: () => h(SessionPanel, { mode: 'files' }) })
  app.use(i18n).mount(root)
  await nextTick()
  const uploads = root.querySelector('[data-testid="files-local-uploads"]')?.textContent ?? ''
  const version = root.querySelector('[data-testid="files-design-version"]')?.textContent ?? ''
  expect(uploads).toContain('本地上传')
  expect(uploads).toContain('notes.md')
  expect(uploads).toContain('哈希：未知')
  expect(version).toContain('设计版本')
  expect(version).toContain('draft-1')
  expect(root.querySelector('[data-testid="repository-browser"]')).not.toBeNull()
  expect(root.querySelector('[data-testid="repo-tree-hint"]')?.textContent).toMatch(
    /展开目录|Expand folders/,
  )
})

function bindCandidateFiles() {
  const files = ['src/First.vue', 'src/Second.vue'].map((path, index) => ({
    path,
    before: `before-${index}`,
    content: `after-${index}`,
    baseHash: `hash-${index}`,
  }))
  chatBinding.value = binding({
    proposalFiles: files.map((file) => file.path),
    proposal: {
      id: 'focus-proposal',
      conversationId: 's1',
      workspace: 'w',
      summary: 'Candidate file focus',
      applied: false,
      writeAllowed: false,
      verification: 'not_requested',
      files,
    },
  })
  return files
}

function expectFocusedCandidate(path: string) {
  expect(root!.querySelector('.codex-file[aria-pressed="true"]')?.textContent?.trim()).toBe(path)
  expect(root!.querySelector('.codex-detail > strong')?.textContent).toBe(path)
  expect(workbench.diffFocusPath).toBe('')
  expect(chatBinding.value?.draft).toBe('Keep the unsent draft')
}

it('focuses a non-first candidate requested before the changes panel first mounts', async () => {
  const files = bindCandidateFiles()
  chatBinding.value = { ...chatBinding.value!, draft: 'Keep the unsent draft' }
  openCandidateDiff('s1', files[1]!.path)
  expect(workbench.panel).toBe('changes')
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({ render: () => h(SessionPanel, { mode: 'changes' }) })
  app.use(i18n).mount(root)
  await nextTick()
  expectFocusedCandidate(files[1]!.path)
})

it('retains a pending candidate while outside changes and consumes it on mode switch', async () => {
  const files = bindCandidateFiles()
  chatBinding.value = { ...chatBinding.value!, draft: 'Keep the unsent draft' }
  const mode = ref<'summary' | 'changes'>('summary')
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({ render: () => h(SessionPanel, { mode: mode.value }) })
  app.use(i18n).mount(root)
  openCandidateDiff('s1', files[1]!.path)
  await nextTick()
  expect(workbench.diffFocusPath).toBe(files[1]!.path)
  expect(root.querySelector('.codex-detail')).toBeNull()
  mode.value = 'changes'
  await nextTick()
  expectFocusedCandidate(files[1]!.path)
})

it('updates the requested candidate again while the changes panel stays mounted', async () => {
  const files = bindCandidateFiles()
  chatBinding.value = { ...chatBinding.value!, draft: 'Keep the unsent draft' }
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({ render: () => h(SessionPanel, { mode: 'changes' }) })
  app.use(i18n).mount(root)
  await nextTick()
  openCandidateDiff('s1', files[1]!.path)
  await nextTick()
  expectFocusedCandidate(files[1]!.path)
  openCandidateDiff('s1', files[0]!.path)
  await nextTick()
  expectFocusedCandidate(files[0]!.path)
})

it('keeps candidate, applied and unread directory changes apart', async () => {
  const proposal: CodeProposal = {
    id: 'p',
    conversationId: 's1',
    workspace: 'w',
    summary: 's',
    applied: false,
    writeAllowed: false,
    verification: 'not_requested',
    files: [{ path: 'src/App.vue', before: 'a', content: 'b', baseHash: '' }],
  }
  chatBinding.value = binding({
    activeId: 'a',
    proposalFiles: ['src/App.vue'],
    appliedFiles: ['src/done.vue'],
    proposal,
  })
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({ render: () => h(SessionPanel, { mode: 'changes' }) })
  app.use(i18n).mount(root)
  await nextTick()
  const text = root.textContent ?? ''
  const candidate = text.indexOf('本次候选')
  const applied = text.indexOf('本次已应用')
  const existing = text.indexOf('目录中原有修改')
  expect(candidate).toBeGreaterThanOrEqual(0)
  expect(candidate).toBeLessThan(text.indexOf('src/App.vue'))
  expect(text.indexOf('src/App.vue')).toBeLessThan(applied)
  expect(applied).toBeLessThan(text.indexOf('src/done.vue'))
  expect(text.indexOf('src/done.vue')).toBeLessThan(existing)
  expect(text).toContain('未读取工作区')
  expect(text).toContain('生成前基线：未知')
  expect(text).toContain('当前不能应用')
  expect(text).toContain('不能用候选内容覆盖')
  expect(root.querySelector('[data-testid="live-verification-config"]')?.textContent).toMatch(
    /未启用|verification\.enabled=false|Verification config: off/i,
  )
  expect(text).toContain('尚未运行检查')
  expect(root.querySelector('[data-testid="delivery-preview-link"]')).toBeNull()
  expect(text).toContain('待人工验收')
  expect(text).not.toContain('检查已通过')
  expect(
    (root.querySelector('[data-testid="verification-details"]') as HTMLDetailsElement).open,
  ).toBe(false)
  expect(root.querySelector('[data-testid="panel-session"] span')?.textContent).toBe('当前会话')
  ;(root.querySelector('.codex-file') as HTMLButtonElement).click()
  await nextTick()
  expect(root.querySelector(".codex-file[aria-pressed='true']")?.textContent).toContain(
    'src/App.vue',
  )
  chatBinding.value = binding({
    activeId: 'b',
    proposalFiles: ['src/Other.vue'],
    proposal: {
      ...proposal,
      conversationId: 'b',
      files: [{ path: 'src/Other.vue', before: 'x', content: 'y', baseHash: 'hash' }],
    },
  })
  await nextTick()
  expect(root.textContent).toContain('src/Other.vue')
  expect(root.textContent).not.toContain('src/App.vue')
  expect(root.querySelector(".codex-file[aria-pressed='true']")?.textContent).toContain(
    'src/Other.vue',
  )
})
