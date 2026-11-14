// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { createApp, nextTick, ref, h, type App } from 'vue'
import { runtimeApi, type CliProgramItem, type CapabilityResponse } from '@eap/runtime-client'
import { i18n } from '../../../src/lib/i18n'
import CapabilityManager from '../../../src/features/capability/CapabilityManager.vue'
import CliProgramManager from '../../../src/features/capability/CliProgramManager.vue'
let app: App
let root: HTMLDivElement
afterEach(() => {
  app?.unmount()
  root?.remove()
  vi.restoreAllMocks()
})
async function flush() {
  for (let i = 0; i < 15; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
function button(text: string, scope: ParentNode = document) {
  const found = [...scope.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)
  expect(found, text).toBeDefined()
  return found!
}
async function mount(component: Parameters<typeof createApp>[0]) {
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(component)
  app.use(i18n).mount(root)
  await flush()
}
it('preserves unrelated CLI binary edits across catalog refresh and locks pending operation close', async () => {
  const programs: CliProgramItem[] = ['git', 'rg'].map((id) => ({
    id,
    name: id,
    binary: id,
    builtin: false,
    channel: { binary: id, source: 'shipped', resolvedPath: '/bin/' + id },
    operations: [],
  }))
  vi.spyOn(runtimeApi, 'cliPrograms').mockResolvedValue({ items: programs })
  const items = ref([])
  const active = ref(true)
  await mount({
    render: () => h(CliProgramManager, { items: items.value, kind: null, active: active.value }),
  })
  const path = root.querySelector('input[aria-label="git 二进制位置"]') as HTMLInputElement
  path.value = '/custom/git'
  path.dispatchEvent(new Event('input'))
  await flush()
  items.value = []
  await flush()
  expect(path.value).toBe('/custom/git')
  button('＋ 增加操作').click()
  await flush()
  const dialog = document.querySelector('.eap-dialog')!
  const inputs = dialog.querySelectorAll('input')
  inputs[0].value = 'git.custom'
  inputs[0].dispatchEvent(new Event('input'))
  let reject!: (error: Error) => void
  const save = vi.spyOn(runtimeApi, 'saveCliOperation').mockImplementation(
    () =>
      new Promise((_res, rej) => {
        reject = rej
      }),
  )
  dialog
    .querySelector('form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await flush()
  expect(button('取消', dialog).disabled).toBe(true)
  expect(inputs[0].disabled).toBe(true)
  dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await flush()
  expect(document.querySelector('.eap-dialog')).not.toBeNull()
  expect(save).toHaveBeenCalledOnce()
  active.value = false
  await flush()
  expect(document.querySelector('.eap-dialog')).toBeNull()
  active.value = true
  await flush()
  expect((document.querySelector('.eap-dialog input') as HTMLInputElement).value).toBe('git.custom')
  reject(new Error('write unavailable'))
  await flush()
  expect((document.querySelector('.eap-dialog input') as HTMLInputElement).value).toBe('git.custom')
  expect(document.querySelector('.eap-dialog .eap-feedback--error')).not.toBeNull()
})
it('guards MCP dirty dismissal and blocks overlapping writes while retaining failed drafts inside dialog', async () => {
  const catalog = {
    kinds: [{ id: 'mcp', label: 'MCP', count: 0, visible: true, availability: {} }],
    items: [],
    mcpServers: [],
    settings: {},
  } as CapabilityResponse
  vi.spyOn(runtimeApi, 'capabilities').mockResolvedValue(catalog)
  vi.spyOn(runtimeApi, 'trustedTools').mockResolvedValue({ items: [] })
  vi.spyOn(runtimeApi, 'dataLayout').mockRejectedValue(new Error('not available'))
  await mount(CapabilityManager)
  button('MCP').click()
  await flush()
  button('＋ 登记服务器').click()
  await flush()
  let dialog = document.querySelector('.eap-dialog')!
  const id = dialog.querySelector('input') as HTMLInputElement
  id.value = 'draft'
  id.dispatchEvent(new Event('input'))
  await flush()
  button('取消', dialog).click()
  await flush()
  expect(document.querySelector('.eap-confirm')).not.toBeNull()
  ;(document.querySelector('[data-confirm-cancel]') as HTMLButtonElement).click()
  await flush()
  let reject!: (error: Error) => void
  const save = vi.spyOn(runtimeApi, 'saveMcpServer').mockImplementation(
    () =>
      new Promise((_res, rej) => {
        reject = rej
      }),
  )
  button('登记服务器', dialog).click()
  await flush()
  expect(button('登记服务器', dialog).disabled).toBe(true)
  expect(button('取消', dialog).disabled).toBe(true)
  dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await flush()
  expect(document.querySelector('.eap-dialog')).not.toBeNull()
  expect(save).toHaveBeenCalledOnce()
  reject(new Error('save unavailable'))
  await flush()
  dialog = document.querySelector('.eap-dialog')!
  expect((dialog.querySelector('input') as HTMLInputElement).value).toBe('draft')
  expect(dialog.querySelector('.eap-feedback--error')).not.toBeNull()
})
