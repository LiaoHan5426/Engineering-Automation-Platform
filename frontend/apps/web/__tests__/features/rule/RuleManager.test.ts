// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { createApp, nextTick, type App } from 'vue'
import { runtimeApi, type RulePackManifest } from '@eap/runtime-client'
import { i18n } from '../../../src/lib/i18n'
import RuleManager from '../../../src/features/rule/RuleManager.vue'

let app: App, root: HTMLDivElement
const manifest = (id = 'one'): RulePackManifest => ({
  apiVersion: 'eap/v1',
  kind: 'RulePack',
  id,
  name: id,
  requires: { capabilities: [] },
  rules: [{ id: 'check', title: 'Original' }],
})
const detail = (id = 'one') => ({
  manifest: JSON.stringify(manifest(id)),
  shipped: false,
  editable: true,
})
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
const button = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => node.textContent?.trim() === text,
  )!
async function click(text: string) {
  button(text).click()
  await nextTick()
}
async function input(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
}
async function mount() {
  vi.spyOn(runtimeApi, 'rulePacks').mockResolvedValue({
    items: ['one', 'two'].map((id) => ({
      id,
      name: id,
      shipped: false,
      editable: true,
      enabled: false,
      ruleCount: 1,
      revision: 1,
    })),
  })
  vi.spyOn(runtimeApi, 'ruleVocabulary').mockResolvedValue({ facts: [], operators: [] })
  const get = vi.spyOn(runtimeApi, 'rulePack').mockImplementation(async (id) => detail(id))
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(RuleManager)
  app.use(i18n).mount(root)
  await vi.waitFor(() => expect(root.querySelectorAll('.list button')).toHaveLength(2))
  return get
}
async function selectOne() {
  root.querySelector<HTMLButtonElement>('.list button')!.click()
  await vi.waitFor(() => expect(root.querySelector('[data-testid="rule-open-0"]')).not.toBeNull())
}
afterEach(() => {
  app?.unmount()
  root?.remove()
  vi.restoreAllMocks()
})

it('keeps edits made while a save is pending dirty and visible', async () => {
  await mount()
  await selectOne()
  root.querySelector<HTMLButtonElement>('[data-testid="rule-open-0"]')!.click()
  await nextTick()
  await input(document.querySelector<HTMLInputElement>('[role="dialog"] input')!, 'Submitted')
  document.querySelector<HTMLButtonElement>('[role="dialog"] button[aria-label]')!.click()
  await nextTick()
  const pending = deferred<Awaited<ReturnType<typeof runtimeApi.updateRulePack>>>()
  const save = vi.spyOn(runtimeApi, 'updateRulePack').mockReturnValue(pending.promise)
  await click('保存草稿')
  root.querySelector<HTMLButtonElement>('[data-testid="rule-open-0"]')!.click()
  await nextTick()
  await input(document.querySelector<HTMLInputElement>('[role="dialog"] input')!, 'Later edit')
  expect(JSON.parse(save.mock.calls[0]![2]).rules[0].title).toBe('Submitted')
  pending.resolve({ id: 'one', revision: 2 })
  await vi.waitFor(() => expect(button('保存草稿').disabled).toBe(false))
  expect(root.textContent).toContain('有未保存的修改')
  expect(root.textContent).toContain('Later edit')
})

it('preserves unapplied JSON across collapse and protects return to the catalog', async () => {
  await mount()
  await selectOne()
  await click('编辑 JSON 草稿')
  const raw = '{ unfinished JSON'
  await input(root.querySelector<HTMLTextAreaElement>('[aria-label="规则包 JSON 草稿"]')!, raw)
  expect(root.textContent).toContain('有未保存的修改')
  await click('收起 JSON 草稿')
  await click('编辑 JSON 草稿')
  expect(root.querySelector<HTMLTextAreaElement>('[aria-label="规则包 JSON 草稿"]')!.value).toBe(
    raw,
  )
  root.querySelector<HTMLButtonElement>('[data-testid="rule-back"]')!.click()
  await nextTick()
  expect(document.querySelector('[role="dialog"]')).not.toBeNull()
  button('取消').click()
  await nextTick()
  expect(root.querySelector<HTMLTextAreaElement>('[aria-label="规则包 JSON 草稿"]')!.value).toBe(
    raw,
  )
})

it('discards invalid raw JSON back to the saved version', async () => {
  await mount()
  await selectOne()
  await click('编辑 JSON 草稿')
  await input(
    root.querySelector<HTMLTextAreaElement>('[aria-label="规则包 JSON 草稿"]')!,
    '{ invalid',
  )
  expect(button('保存草稿').disabled).toBe(true)
  expect(button('校验').disabled).toBe(true)
  await click('放弃修改')
  expect(
    JSON.parse(root.querySelector<HTMLTextAreaElement>('[aria-label="规则包 JSON 草稿"]')!.value),
  ).toEqual(manifest())
  expect(button('保存草稿').disabled).toBe(true)
})

it('does not replace edits made during the saved detail readback or close their dialog', async () => {
  const get = await mount()
  await selectOne()
  await click('编辑 JSON 草稿')
  const edited = { ...manifest(), name: 'Submitted' }
  await input(
    root.querySelector<HTMLTextAreaElement>('[aria-label="规则包 JSON 草稿"]')!,
    JSON.stringify(edited),
  )
  await click('应用到草稿')
  const readback = deferred<Awaited<ReturnType<typeof runtimeApi.rulePack>>>()
  get.mockReturnValueOnce(readback.promise)
  vi.spyOn(runtimeApi, 'updateRulePack').mockResolvedValue({ id: 'one', revision: 2 })
  await click('保存草稿')
  await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(2))
  root.querySelector<HTMLButtonElement>('[data-testid="rule-open-0"]')!.click()
  await nextTick()
  await input(document.querySelector<HTMLInputElement>('[role="dialog"] input')!, 'Readback edit')
  readback.resolve({ ...detail(), manifest: JSON.stringify(edited) })
  await vi.waitFor(() => expect(button('保存草稿').disabled).toBe(false))
  expect(root.textContent).toContain('Readback edit')
  expect(document.querySelector('[role="dialog"]')).not.toBeNull()
})

it.each(['success', 'failure'] as const)(
  'ignores a stale trial %s after leaving its pack',
  async (outcome) => {
    await mount()
    await selectOne()
    await click('SQL 试算')
    await input(root.querySelector<HTMLTextAreaElement>('#dry-sql')!, 'SELECT 1')
    const pending = deferred<Awaited<ReturnType<typeof runtimeApi.dryRunRulePack>>>()
    vi.spyOn(runtimeApi, 'dryRunRulePack').mockReturnValue(pending.promise)
    await click('试算')
    root.querySelector<HTMLButtonElement>('[data-testid="rule-back"]')!.click()
    await nextTick()
    root.querySelectorAll<HTMLButtonElement>('.list button')[1]!.click()
    await vi.waitFor(() => expect(root.querySelector('article h2')?.textContent).toBe('two'))
    if (outcome === 'success')
      pending.resolve({ valid: true, summary: 'Old trial', findings: [], errors: [] })
    else pending.reject(new Error('Old trial failure'))
    await new Promise((done) => setTimeout(done, 0))
    await click('SQL 试算')
    expect(root.textContent).not.toContain('Old trial')
  },
)

it.each(['success', 'failure'] as const)(
  'ignores a stale detail %s after a newer selection',
  async (outcome) => {
    const get = await mount()
    const old = deferred<Awaited<ReturnType<typeof runtimeApi.rulePack>>>()
    get.mockReturnValueOnce(old.promise)
    const items = root.querySelectorAll<HTMLButtonElement>('.list button')
    items[0]!.click()
    items[1]!.click()
    await vi.waitFor(() => expect(root.querySelector('article h2')?.textContent).toBe('two'))
    if (outcome === 'success') old.resolve(detail('one'))
    else old.reject(new Error('Old selection failed'))
    await new Promise((done) => setTimeout(done, 0))
    await nextTick()
    expect(root.querySelector('article h2')?.textContent).toBe('two')
    expect(root.querySelector('[role="alert"]')).toBeNull()
  },
)
