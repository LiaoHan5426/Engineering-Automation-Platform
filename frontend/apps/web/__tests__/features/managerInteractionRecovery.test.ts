// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { createApp, nextTick, type App, type Component } from 'vue'
import { runtimeApi } from '@eap/runtime-client'
import { i18n } from '../../src/lib/i18n'
import DatabaseManager from '../../src/features/database/DatabaseManager.vue'
import KnowledgeManager from '../../src/features/knowledge/KnowledgeManager.vue'
import ExpertEditor from '../../src/features/expert/ExpertEditor.vue'

let app: App | undefined
let host: HTMLElement
function mount(component: Component, props = {}) {
  host = document.createElement('div')
  document.body.append(host)
  app = createApp(component, props)
  app.use(i18n).mount(host)
}
function button(text: string) {
  return [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => node.textContent?.trim() === text,
  )!
}
function change(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
afterEach(() => {
  app?.unmount()
  app = undefined
  host?.remove()
  vi.restoreAllMocks()
})

it('distinguishes database loading and failed retrieval from an empty catalog, and retries locally', async () => {
  let reject!: (error: unknown) => void
  const request = new Promise<never>((_resolve, fail) => {
    reject = fail
  })
  const list = vi
    .spyOn(runtimeApi, 'databases')
    .mockReturnValueOnce(request)
    .mockResolvedValue({
      items: [
        { id: 'profile-a', label: 'Recovered profile', engine: 'PostgreSQL', environment: 'local' },
      ],
    })
  mount(DatabaseManager)
  await nextTick()
  expect(host.querySelector('[role=status]')).not.toBeNull()
  expect(host.textContent).not.toContain('暂无资料')
  reject({
    response: { status: 503, data: { code: 'SERVICE_UNAVAILABLE', detail: 'catalog offline' } },
  })
  await vi.waitFor(() => expect(host.textContent).toContain('catalog offline'))
  expect(host.textContent).not.toContain('暂无资料')
  button('重试').click()
  await vi.waitFor(() => expect(host.textContent).toContain('Recovered profile'))
  expect(host.textContent).not.toContain('catalog offline')
  expect(list).toHaveBeenCalledTimes(2)
})

it('asks before closing a new knowledge base draft and clears it only on confirmed discard', async () => {
  vi.spyOn(runtimeApi, 'knowledgeBases').mockResolvedValue({ items: [] })
  mount(KnowledgeManager)
  await nextTick()
  await vi.waitFor(() => expect(host.textContent).toContain('还没有知识库'))
  button('＋ 新建').click()
  await nextTick()
  change(document.querySelector<HTMLInputElement>('[role=dialog] form input')!, 'Unsaved base')
  await nextTick()
  button('取消').click()
  await nextTick()
  expect(document.querySelectorAll('[role=dialog]')).toHaveLength(2)
  button('继续编辑').click()
  await nextTick()
  expect(document.querySelector<HTMLInputElement>('[role=dialog] form input')?.value).toBe(
    'Unsaved base',
  )
  button('取消').click()
  await nextTick()
  button('放弃修改').click()
  await nextTick()
  expect(document.querySelector('[role=dialog]')).toBeNull()
  button('＋ 新建').click()
  await nextTick()
  expect(document.querySelector<HTMLInputElement>('[role=dialog] form input')?.value).toBe('')
})

it('offers expert initialization retry without rebuilding the page', async () => {
  vi.spyOn(runtimeApi, 'experts')
    .mockRejectedValueOnce({
      response: { status: 503, data: { code: 'SERVICE_UNAVAILABLE', detail: 'experts offline' } },
    })
    .mockResolvedValue({ items: [], states: {} })
  vi.spyOn(runtimeApi, 'expertCatalog').mockResolvedValue({ capabilities: [], rules: [] })
  vi.spyOn(runtimeApi, 'knowledgeBases').mockResolvedValue({ items: [] })
  vi.spyOn(runtimeApi, 'databases').mockResolvedValue({ items: [] })
  mount(ExpertEditor, { createMode: 'agent' })
  await nextTick()
  expect(host.querySelector('[role=status]')).not.toBeNull()
  await vi.waitFor(() => expect(host.textContent).toContain('experts offline'))
  expect(host.querySelector('[data-testid=expert-agent-goal]')).toBeNull()
  button('重试').click()
  await vi.waitFor(() =>
    expect(host.querySelector('[data-testid=expert-agent-goal]')).not.toBeNull(),
  )
  expect(host.textContent).not.toContain('experts offline')
})

it('locks expert draft controls during save and emits the submitted expert identity', async () => {
  vi.spyOn(runtimeApi, 'experts').mockResolvedValue({ items: [], states: {} })
  vi.spyOn(runtimeApi, 'expertCatalog').mockResolvedValue({ capabilities: [], rules: [] })
  vi.spyOn(runtimeApi, 'knowledgeBases').mockResolvedValue({ items: [] })
  vi.spyOn(runtimeApi, 'databases').mockResolvedValue({ items: [] })
  let resolve!: (result: { saved: boolean }) => void
  const save = vi.spyOn(runtimeApi, 'saveExpert').mockReturnValue(
    new Promise((done) => {
      resolve = done
    }),
  )
  const saved = vi.fn()
  mount(ExpertEditor, { createMode: 'agent', onSaved: saved })
  await vi.waitFor(() =>
    expect(host.querySelector('[data-testid=expert-agent-goal]')).not.toBeNull(),
  )
  const id = host.querySelector<HTMLInputElement>('input[placeholder=sql-reviewer]')!
  const name = [...host.querySelectorAll<HTMLInputElement>('input')].find((input) =>
    input.closest('label')?.textContent?.includes('名称'),
  )!
  const goal = host.querySelector<HTMLTextAreaElement>('[data-testid=expert-agent-goal]')!
  change(id, 'new-reviewer')
  change(name, 'New reviewer')
  await nextTick()
  button('保存草稿').click()
  await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1))
  expect(id.disabled).toBe(true)
  expect(name.disabled).toBe(true)
  expect(goal.disabled).toBe(true)
  expect(
    [...host.querySelectorAll<HTMLInputElement>('input[type=checkbox]')].every(
      (input) => input.disabled,
    ),
  ).toBe(true)
  resolve({ saved: true })
  await vi.waitFor(() => expect(saved).toHaveBeenCalledWith('new-reviewer'))
  expect(goal.disabled).toBe(false)
})
