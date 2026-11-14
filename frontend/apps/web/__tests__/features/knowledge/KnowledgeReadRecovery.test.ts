// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { createApp, nextTick, type App } from 'vue'
import { runtimeApi } from '@eap/runtime-client'
import { i18n } from '../../../src/lib/i18n'
import KnowledgeManager from '../../../src/features/knowledge/KnowledgeManager.vue'
let app: App | undefined
let host: HTMLElement
function mount() {
  host = document.createElement('div')
  document.body.append(host)
  app = createApp(KnowledgeManager)
  app.use(i18n).mount(host)
}
function button(text: string) {
  return [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => node.textContent?.trim() === text,
  )!
}
afterEach(() => {
  app?.unmount()
  host?.remove()
  vi.restoreAllMocks()
})
const offline = {
  response: { status: 503, data: { code: 'SERVICE_UNAVAILABLE', detail: 'knowledge offline' } },
}
it('distinguishes a failed catalog from an empty result and retries reads', async () => {
  let reject!: (error: unknown) => void
  const list = vi
    .spyOn(runtimeApi, 'knowledgeBases')
    .mockReturnValueOnce(
      new Promise((_resolve, fail) => {
        reject = fail
      }),
    )
    .mockResolvedValue({ items: [] })
  mount()
  await nextTick()
  expect(host.querySelector('aside [role=status]')).not.toBeNull()
  expect(host.textContent).not.toContain('还没有知识库')
  reject(offline)
  await vi.waitFor(() => expect(host.textContent).toContain('knowledge offline'))
  expect(host.textContent).not.toContain('还没有知识库')
  button('重试').click()
  await vi.waitFor(() => expect(host.textContent).toContain('还没有知识库'))
  expect(host.textContent).not.toContain('knowledge offline')
  expect(list).toHaveBeenCalledTimes(2)
})
it.each(['list', 'documents'])(
  'settles accepted creation before failed %s readback',
  async (failure) => {
    const base = { id: 'accepted-base', name: 'Accepted base', description: '', documents: 0 }
    const list = vi.spyOn(runtimeApi, 'knowledgeBases').mockResolvedValue({ items: [base] })
    list.mockResolvedValueOnce({ items: [] })
    if (failure === 'list') list.mockRejectedValueOnce(offline)
    const documents = vi.spyOn(runtimeApi, 'knowledgeDocuments').mockResolvedValue({ items: [] })
    if (failure === 'documents') documents.mockRejectedValueOnce(offline)
    const create = vi.spyOn(runtimeApi, 'createKnowledgeBase').mockResolvedValue({ id: base.id })
    mount()
    await nextTick()
    await vi.waitFor(() => expect(host.textContent).toContain('还没有知识库'))
    button('＋ 新建').click()
    await nextTick()
    const input = document.querySelector<HTMLInputElement>('[role=dialog] form input')!
    input.value = base.name
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    button('创建').click()
    await vi.waitFor(() => expect(host.textContent).toContain('知识库已创建，列表或文档刷新失败'))
    expect(document.querySelector('[role=dialog]')).toBeNull()
    expect(host.querySelector('aside .manager-item[data-active=true]')?.textContent).toContain(
      base.name,
    )
    button('重试').click()
    await vi.waitFor(() => expect(documents).toHaveBeenCalledWith(base.id))
    await vi.waitFor(() => expect(button('重试')).toBeUndefined())
    expect(create).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(button('＋ 新建').disabled).toBe(false))
    button('＋ 新建').click()
    await nextTick()
    expect(document.querySelector<HTMLInputElement>('[role=dialog] form input')?.value).toBe('')
  },
)

it('closes accepted document creation before readback failure and retries without another write', async () => {
  const base = { id: 'base-a', name: 'Base A', description: '', documents: 0 }
  vi.spyOn(runtimeApi, 'knowledgeBases').mockResolvedValue({ items: [base] })
  const documents = vi.spyOn(runtimeApi, 'knowledgeDocuments').mockResolvedValue({ items: [] })
  documents.mockResolvedValueOnce({ items: [] }).mockRejectedValueOnce(offline)
  const add = vi.spyOn(runtimeApi, 'addKnowledgeDocument').mockResolvedValue({ id: 'doc-a' })
  mount()
  await vi.waitFor(() => expect(host.querySelector('.manager-item')).not.toBeNull())
  ;(host.querySelector('.manager-item') as HTMLButtonElement).click()
  await vi.waitFor(() => expect(host.textContent).toContain('＋ 录入文档'))
  button('＋ 录入文档').click()
  await nextTick()
  const title = document.querySelector<HTMLInputElement>('[role=dialog] form input')!
  const content = document.querySelector<HTMLTextAreaElement>('[role=dialog] form textarea')!
  title.value = 'Accepted document'
  title.dispatchEvent(new Event('input', { bubbles: true }))
  content.value = 'Saved content'
  content.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
  button('保存文档').click()
  await vi.waitFor(() => expect(host.textContent).toContain('文档已保存，列表或文档刷新失败'))
  expect(host.textContent).not.toContain('暂无文档')
  expect(document.querySelector('[role=dialog]')).toBeNull()
  button('重试').click()
  await vi.waitFor(() => expect(button('重试')).toBeUndefined())
  expect(add).toHaveBeenCalledOnce()
  expect(add).toHaveBeenCalledWith(base.id, 'Accepted document', 'Saved content')
  expect(documents).toHaveBeenLastCalledWith(base.id)
  button('＋ 录入文档').click()
  await nextTick()
  expect(document.querySelector<HTMLInputElement>('[role=dialog] form input')?.value).toBe('')
  expect(document.querySelector<HTMLTextAreaElement>('[role=dialog] form textarea')?.value).toBe('')
})
