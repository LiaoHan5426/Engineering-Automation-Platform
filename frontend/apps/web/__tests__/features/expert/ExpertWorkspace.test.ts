// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test'
import { createApp, h, nextTick, type App } from 'vue'
import { runtimeApi } from '@eap/runtime-client'
import { i18n } from '../../../src/lib/i18n'
import ExpertManager from '../../../src/features/expert/ExpertManager.vue'
import { expertHash, readExpertRoute } from '../../../src/features/expert/expertNavigation'

vi.mock('../../../src/lib/serviceConfig', () => ({ useMockServices: false }))
let app: App | undefined
let host: HTMLElement
let manifest: Record<string, unknown>
const workflow = {
  id: 'workflow',
  name: 'Fixed SQL',
  apiVersion: 'eap/v1',
  kind: 'Expert',
  steps: [{ id: 'parse', capability: 'sql.parse', required: true }],
  edges: [],
  rules: ['database.credentials.never-expose'],
}
function button(text: string) {
  return [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.textContent?.trim() === text,
  )!
}
function change(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
async function route(hash: string) {
  window.history.replaceState(null, '', '#' + hash)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
  await nextTick()
}
async function mount(hash = 'experts') {
  window.history.replaceState(null, '', '#' + hash)
  host = document.createElement('div')
  document.body.append(host)
  app = createApp({ render: () => h(ExpertManager) })
  app.use(i18n).mount(host)
  await vi.waitFor(() => expect(runtimeApi.experts).toHaveBeenCalled())
  await nextTick()
}
beforeEach(() => {
  manifest = {
    id: 'reviewer',
    name: 'SQL reviewer',
    apiVersion: 'eap/v2',
    kind: 'Expert',
    behavior: { id: 'sql-readonly-agent', version: 1 },
    agent: { goal: 'Collect evidence', tools: ['sql.parse', 'database.explain'] },
    steps: [],
    edges: [],
    knowledgeBases: [],
    databaseProfiles: [],
    rules: ['database.credentials.never-expose'],
    rulePacks: [],
    mcpTools: [],
  }
  vi.spyOn(runtimeApi, 'experts').mockImplementation(async () => ({
    items: [JSON.stringify(manifest), JSON.stringify(workflow)],
    states: {
      reviewer: { enabled: true, builtin: false, revision: 3 },
      workflow: { enabled: true, builtin: true, revision: 1 },
    },
  }))
  vi.spyOn(runtimeApi, 'expertCatalog').mockResolvedValue({
    capabilities: ['sql.parse', 'database.explain'],
    rules: [],
  })
  vi.spyOn(runtimeApi, 'knowledgeBases').mockResolvedValue({ items: [] })
  vi.spyOn(runtimeApi, 'databases').mockResolvedValue({ items: [] })
  vi.spyOn(runtimeApi, 'saveExpert').mockImplementation(async (definition) => {
    manifest = JSON.parse(definition.manifest)
    return { saved: true }
  })
  vi.spyOn(runtimeApi, 'activateExpert').mockResolvedValue({})
  vi.spyOn(runtimeApi, 'expertAgentRuns').mockResolvedValue({
    items: [],
    automaticScheduling: true,
  })
})
afterEach(() => {
  app?.unmount()
  app = undefined
  host?.remove()
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '#experts')
})

it('opens a list without task/editor panels and preserves search on parent return', async () => {
  await mount()
  expect(host.querySelector('[data-testid=expert-agent-panel]')).toBeNull()
  expect(host.textContent).not.toContain('流程画布')
  change(host.querySelector('input')!, 'reviewer')
  await nextTick()
  expect(host.textContent).not.toContain('Fixed SQL')
  await route('experts?view=overview&expert=reviewer')
  expect(host.textContent).toContain('Collect evidence')
  expect(host.querySelector('[data-testid=expert-start]')).not.toBeNull()
  await route('experts')
  expect(host.querySelector('input')!.value).toBe('reviewer')
})

it('loads an Agent deep link into its behavior editor, protects a draft and preserves v2 on save', async () => {
  await mount('experts?view=config&expert=reviewer')
  await vi.waitFor(() =>
    expect(host.querySelector('[data-testid=expert-agent-goal]')).not.toBeNull(),
  )
  expect(host.textContent).not.toContain('流程画布')
  change(host.querySelector('[data-testid=expert-agent-goal]')!, 'Updated evidence goal')
  await nextTick()
  await route('experts?view=overview&expert=reviewer')
  expect(location.hash).toContain('view=config')
  expect(host.textContent).toContain('当前修改尚未保存')
  button('保存草稿').click()
  await vi.waitFor(() => expect(runtimeApi.saveExpert).toHaveBeenCalledTimes(1))
  expect(manifest).toMatchObject({
    apiVersion: 'eap/v2',
    behavior: { id: 'sql-readonly-agent', version: 1 },
    agent: { goal: 'Updated evidence goal', tools: ['sql.parse', 'database.explain'] },
    steps: [],
    edges: [],
  })
  await vi.waitFor(() => expect(button('保存草稿').disabled).toBe(false))
  await route('experts?view=overview&expert=reviewer')
  expect(host.querySelector('[data-testid=expert-agent-goal]')).toBeNull()
  expect(host.textContent).toContain('Updated evidence goal')
})

it('retains fixed workflow editing and never converts it into an Agent', async () => {
  await mount('experts?view=config&expert=workflow')
  await vi.waitFor(() => expect(host.textContent).toContain('流程画布'))
  expect(host.querySelector('[data-testid=expert-agent-goal]')).toBeNull()
  expect(button('保存草稿').disabled).toBe(true)
  expect(runtimeApi.saveExpert).not.toHaveBeenCalled()
})

it('preserves unsupported behavior versions instead of silently rebinding them', async () => {
  manifest.behavior = { id: 'future-agent', version: 2 }
  await mount('experts?view=config&expert=reviewer')
  await vi.waitFor(() => expect(host.textContent).toContain('当前界面不支持编辑'))
  expect(button('保存草稿')).toBeUndefined()
  expect(runtimeApi.saveExpert).not.toHaveBeenCalled()
})

it('binds the task form to the selected expert and protects unsubmitted input', async () => {
  await mount('experts?view=start&expert=reviewer')
  await vi.waitFor(() => expect(host.querySelector('#agent-sql')).not.toBeNull())
  expect(host.querySelector('#agent-expert')).toBeNull()
  change(host.querySelector('#agent-sql')!, 'select 1')
  await nextTick()
  await route('experts?view=overview&expert=reviewer')
  expect(location.hash).toContain('view=start')
  expect(host.textContent).toContain('输入尚未提交')
  button('清空本次输入').click()
  await nextTick()
  await route('experts?view=overview&expert=reviewer')
  expect(host.querySelector('#agent-sql')).toBeNull()
})

it('round-trips nested routes and handles incomplete links without guessing a task', () => {
  const route = {
    page: 'review' as const,
    expertId: 'reviewer',
    runId: 'run-1',
    from: 'all' as const,
  }
  expect(readExpertRoute('#' + expertHash(route))).toMatchObject(route)
  expect(readExpertRoute('#experts?view=task&expert=reviewer')).toEqual({
    page: 'tasks',
    expertId: 'reviewer',
  })
  expect(readExpertRoute('#experts?view=config')).toEqual({ page: 'list' })
})

it('separates configuration categories using shared tabs and retains drafts when switching categories', async () => {
  await mount('experts?view=config&expert=reviewer')
  await vi.waitFor(() =>
    expect(host.querySelector('[data-testid=expert-agent-goal]')).not.toBeNull(),
  )
  expect(host.textContent).not.toContain('知识库配置')
  change(host.querySelector('[data-testid=expert-agent-goal]')!, 'Keep this goal')
  button('资料授权').click()
  await nextTick()
  expect(host.textContent).toContain('知识库配置')
  expect(host.textContent).not.toContain('规则包（专家判定依据）')
  button('规则').click()
  await nextTick()
  expect(host.textContent).toContain('规则包（专家判定依据）')
  expect(host.textContent).not.toContain('知识库配置')
  // Behavior remains on the canvas while right-side settings change.
  button('基本信息').click()
  await nextTick()
  expect(host.querySelector<HTMLTextAreaElement>('[data-testid=expert-agent-goal]')?.value).toBe(
    'Keep this goal',
  )
  expect(runtimeApi.saveExpert).not.toHaveBeenCalled()
})

it('adds catalog nodes, synchronizes canvas and structure selection, and removes incident edges', async () => {
  await mount('experts?view=config&expert=workflow')
  await vi.waitFor(() =>
    expect(host.querySelector('[data-testid="node-add-database.explain"]')).not.toBeNull(),
  )
  button('复制为新专家').click()
  host.querySelector<HTMLButtonElement>('[data-testid="node-add-database.explain"]')!.click()
  await nextTick()
  expect(host.querySelectorAll('.workflow-node')).toHaveLength(2)
  expect(host.querySelector('.workflow-node.selected')?.textContent).toContain('database.explain')
  expect(host.querySelector('.property-panel')?.textContent).toContain('节点属性')
  button('流程结构').click()
  await nextTick()
  button('按当前排列串联').click()
  await nextTick()
  expect(host.querySelectorAll('svg g')).toHaveLength(1)
  const tree = host.querySelector('[role=tree]')!
  ;(tree.querySelector('[role=treeitem]') as HTMLElement).click()
  await nextTick()
  expect(host.querySelector('.workflow-node.selected')?.textContent).toContain('sql.parse')
  button('移除节点及连线').click()
  await nextTick()
  expect(host.querySelectorAll('.workflow-node')).toHaveLength(1)
  expect(host.querySelectorAll('svg g')).toHaveLength(0)
  expect(host.textContent).not.toContain('节点标识：parse')
  button('保存草稿').click()
  await vi.waitFor(() => expect(runtimeApi.saveExpert).toHaveBeenCalledOnce())
  expect(manifest).toMatchObject({
    apiVersion: 'eap/v1',
    edges: [],
    steps: [{ capability: 'database.explain' }],
  })
})

it('does not invent fallback nodes when the capability catalog is unavailable', async () => {
  vi.mocked(runtimeApi.expertCatalog).mockRejectedValue(new Error('offline'))
  await mount('experts?view=config&expert=workflow')
  await vi.waitFor(() => expect(host.textContent).toContain('没有匹配的可用节点'))
  expect(host.querySelector('[data-testid^="node-add-"]')).toBeNull()
  expect(host.querySelector('.workflow-node')?.textContent).toContain('sql.parse')
  expect(runtimeApi.saveExpert).not.toHaveBeenCalled()
})
