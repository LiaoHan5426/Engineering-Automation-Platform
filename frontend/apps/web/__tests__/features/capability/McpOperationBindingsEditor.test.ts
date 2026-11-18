// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { createApp, h, nextTick, type App } from 'vue'
import { runtimeApi } from '@eap/runtime-client'
import Editor from '../../../src/features/capability/McpOperationBindingsEditor.vue'
import { i18n } from '../../../src/lib/i18n'
let app: App | undefined
let root: HTMLElement
const settle = async () => {
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
}
afterEach(() => {
  app?.unmount()
  root?.remove()
  vi.restoreAllMocks()
})
async function mount() {
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({ render: () => h(Editor, { serverId: 'web-review' }) })
  app.use(i18n).mount(root)
  await settle()
}
function button(label: string) {
  const result = Array.from(document.querySelectorAll('button')).find(
    (button) => button.textContent?.trim() === label,
  )
  expect(result).toBeDefined()
  return result!
}
it('saves an empty configuration explicitly, reopens the authoritative snapshot, and never enables or calls services', async () => {
  let revision = 0
  const get = vi
    .spyOn(runtimeApi, 'getMcpOperationBindings')
    .mockImplementation(async () => ({ revision, bindings: [] }))
  const save = vi
    .spyOn(runtimeApi, 'saveMcpOperationBindings')
    .mockImplementation(async (_id, request) => {
      expect(request.expectedRevision).toBe(revision)
      revision++
      return { revision, bindings: request.bindings }
    })
  const activate = vi.spyOn(runtimeApi, 'setMcpServerActivation')
  const probe = vi.spyOn(runtimeApi, 'probeMcpServer')
  await mount()
  expect(save).not.toHaveBeenCalled()
  button('保存').click()
  await settle()
  expect(save).toHaveBeenCalledWith('web-review', { expectedRevision: 0, bindings: [] })
  expect(get).toHaveBeenCalledTimes(1)
  app!.unmount()
  root.remove()
  await mount()
  expect(get).toHaveBeenCalledTimes(2)
  expect(activate).not.toHaveBeenCalled()
  expect(probe).not.toHaveBeenCalled()
})
it('recovers a lost successful PUT response with GET only, preserving request identity and avoiding duplicate writes', async () => {
  let revision = 4
  vi.spyOn(runtimeApi, 'getMcpOperationBindings').mockImplementation(async () => ({
    revision,
    bindings: [],
  }))
  const save = vi.spyOn(runtimeApi, 'saveMcpOperationBindings').mockImplementation(async () => {
    revision++
    throw new Error('Response lost')
  })
  await mount()
  button('保存').click()
  await settle()
  expect(button('保存').disabled).toBe(true)
  button('重新核对保存结果').click()
  await settle()
  expect(save).toHaveBeenCalledTimes(1)
  expect(document.body.textContent).toContain('已确认配置已保存')
  expect(button('保存').disabled).toBe(false)
})
it('locks edits after a lost save response until GET reconciliation verifies the attempted mapping', async () => {
  const binding = {
    operation: 'SEARCH' as const,
    tool: 'search',
    expertId: 'web',
    approved: false,
    inputSchema: { type: 'object' as const, properties: { query: { type: 'string' } } },
    inputArgument: 'query',
    resultsField: 'items',
    titleField: 'title',
    urlField: 'url',
    textField: 'text',
  }
  let saved = binding,
    revision = 1
  vi.spyOn(runtimeApi, 'getMcpOperationBindings').mockImplementation(async () => ({
    revision,
    bindings: [saved],
  }))
  const save = vi
    .spyOn(runtimeApi, 'saveMcpOperationBindings')
    .mockImplementation(async (_id, request) => {
      saved = request.bindings[0] as typeof binding
      revision++
      throw new Error('Response lost')
    })
  await mount()
  const input = document.querySelector<HTMLInputElement>('.operation-binding input')!
  input.value = 'search-new'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
  button('保存').click()
  await settle()
  expect(input.disabled).toBe(true)
  expect(document.querySelector<HTMLTextAreaElement>('.operation-binding textarea')!.disabled).toBe(
    true,
  )
  expect(button('添加操作').disabled).toBe(true)
  expect(button('移除操作').disabled).toBe(true)
  expect(button('重新核对保存结果').disabled).toBe(false)
  button('重新核对保存结果').click()
  await settle()
  expect(save).toHaveBeenCalledTimes(1)
  expect(document.querySelector<HTMLInputElement>('.operation-binding input')!.value).toBe(
    'search-new',
  )
  expect(document.querySelector<HTMLInputElement>('.operation-binding input')!.disabled).toBe(false)
})
it('keeps JSON parse errors inside the dialog and never submits incomplete mappings', async () => {
  vi.spyOn(runtimeApi, 'getMcpOperationBindings').mockResolvedValue({ revision: 0, bindings: [] })
  const save = vi.spyOn(runtimeApi, 'saveMcpOperationBindings')
  await mount()
  button('添加操作').click()
  await settle()
  const textarea = document.querySelector('textarea')!
  textarea.value = '{broken'
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
  button('保存').click()
  await settle()
  expect(save).not.toHaveBeenCalled()
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('JSON 对象')
})
