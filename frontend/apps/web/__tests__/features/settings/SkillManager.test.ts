// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { createApp, h, KeepAlive, nextTick, ref, type App, type Component } from 'vue'
import { runtimeApi, type SkillSnapshot } from '@eap/runtime-client'
import { i18n } from '../../../src/lib/i18n'
let app: App, host: HTMLDivElement
afterEach(() => {
  app?.unmount()
  host?.remove()
  vi.restoreAllMocks()
  sessionStorage.clear()
})
const raw = '---\nname: guide\ndescription: Guide\n---\nReview carefully.'
const snapshot: SkillSnapshot = {
  id: 'guide',
  version: '1.0.0',
  description: 'Guide',
  digest: 'a'.repeat(64),
  enabled: false,
  stateRevision: 1,
  sourceLabel: 'operator',
  createdAt: '',
  dependencies: [],
  schemaVersion: 1,
  entry: 'SKILL.md',
  rawSkillMd: raw,
  instructions: 'Review carefully.',
  resources: [],
  requiredCapabilities: [],
  scope: 'mock',
  trust: null,
}
function node<T extends HTMLElement = HTMLButtonElement>(id: string) {
  const value = document.querySelector<T>(`[data-testid="${id}"]`)
  expect(value, id).not.toBeNull()
  return value!
}
async function click(id: string) {
  node(id).click()
  await nextTick()
}
async function input(id: string, value: string) {
  const el = node<HTMLInputElement>(id)
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
async function flush() {
  await new Promise((done) => setTimeout(done, 0))
  await nextTick()
}
async function prepareSave(version = '1.0.0') {
  await click('skill-import')
  await input('skill-raw', raw)
  await input('skill-source', 'operator')
  await input('skill-version', version)
  await click('skill-preview')
  await vi.waitFor(() => expect(node('skill-confirm').disabled).toBe(false))
  await click('skill-confirm')
}
async function mount(props: Record<string, unknown> = {}, keepAlive = false) {
  const modules = import.meta.glob('../../../src/features/settings/SkillManager.vue')
  expect(modules['../../../src/features/settings/SkillManager.vue']).toBeDefined()
  const component = (await modules['../../../src/features/settings/SkillManager.vue']!()) as {
    default: Component
  }
  host = document.createElement('div')
  document.body.append(host)
  const visible = ref(true)
  app = createApp(
    keepAlive
      ? {
          render: () =>
            h(KeepAlive, null, {
              default: () => (visible.value ? h(component.default, props) : null),
            }),
        }
      : component.default,
    props,
  )
  app.use(i18n).mount(host)
  await nextTick()
  return async (value: boolean) => {
    visible.value = value
    await nextTick()
  }
}
it.each([
  ['POST', 'success'],
  ['POST', 'failure'],
  ['GET', 'success'],
  ['GET', 'failure'],
] as const)(
  'does not retry an unsettled save after KeepAlive reentry (%s %s)',
  async (stage, outcome) => {
    const trusted = { ...snapshot, trust: { operator: 'local', confirmedAt: 'now' } }
    const list = vi.spyOn(runtimeApi, 'skills').mockResolvedValue({ items: [] })
    vi.spyOn(runtimeApi, 'previewSkill').mockResolvedValue(snapshot)
    const first = deferred<SkillSnapshot>()
    const save = vi.spyOn(runtimeApi, 'saveSkill').mockResolvedValue(trusted)
    const get = vi.spyOn(runtimeApi, 'skill').mockResolvedValue(trusted)
    if (stage === 'POST') save.mockReturnValueOnce(first.promise)
    else get.mockReturnValueOnce(first.promise)
    const show = await mount({}, true)
    await prepareSave()
    await click('skill-save')
    if (stage === 'GET') await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(1))
    const key = sessionStorage.key(0)!
    const journal = sessionStorage.getItem(key)
    await show(false)
    await show(true)
    expect(node('skill-retry').disabled).toBe(true)
    await click('skill-retry')
    expect(save).toHaveBeenCalledTimes(1)
    if (outcome === 'success') first.resolve(trusted)
    else first.reject(new Error('response lost'))
    await flush()
    expect(sessionStorage.getItem(key)).toBe(journal)
    expect(document.querySelector('[data-testid="skill-error"]')).toBeNull()
    expect(get).toHaveBeenCalledTimes(stage === 'GET' ? 1 : 0)
    expect(list).toHaveBeenCalledTimes(1)
    expect(node('skill-retry').disabled).toBe(false)
    save.mockRejectedValue(new Error('still offline'))
    await click('skill-retry')
    await flush()
    expect(save.mock.calls[1]![0]).toEqual(save.mock.calls[0]![0])
    expect(sessionStorage.getItem(key)).toBe(journal)
  },
)
it.each(['identity', 'digest', 'input'] as const)(
  'does not clear a replacement journal with different %s even for the same skill version',
  async (difference) => {
    vi.spyOn(runtimeApi, 'skills').mockResolvedValue({ items: [] })
    vi.spyOn(runtimeApi, 'previewSkill').mockResolvedValue(snapshot)
    const first = deferred<SkillSnapshot>()
    vi.spyOn(runtimeApi, 'saveSkill').mockReturnValue(first.promise)
    vi.spyOn(runtimeApi, 'skill').mockResolvedValue({
      ...snapshot,
      trust: { operator: 'local', confirmedAt: 'now' },
    })
    await mount()
    await prepareSave()
    await click('skill-save')
    const key = sessionStorage.key(0)!
    const replacement = JSON.parse(sessionStorage.getItem(key)!)
    if (difference === 'identity') replacement.journalId = 'another-save'
    if (difference === 'digest') replacement.expectedDigest = 'b'.repeat(64)
    if (difference === 'input') replacement.input.sourceLabel = 'another operator'
    const journal = JSON.stringify(replacement)
    sessionStorage.setItem(key, journal)
    first.resolve(snapshot)
    await flush()
    expect(sessionStorage.getItem(key)).toBe(journal)
    expect(document.querySelector('[data-testid="skill-pending"]')).not.toBeNull()
  },
)
it.each([
  ['POST', 'success'],
  ['POST', 'failure'],
  ['GET', 'success'],
  ['GET', 'failure'],
] as const)(
  'scopes late activation %s %s to its original KeepAlive entry',
  async (stage, outcome) => {
    const list = vi
      .spyOn(runtimeApi, 'skills')
      .mockResolvedValue({ items: [{ ...snapshot, createdAt: '' }] })
    const late = deferred<SkillSnapshot>()
    const activated = { ...snapshot, enabled: true, stateRevision: 2 }
    const activate = vi
      .spyOn(runtimeApi, 'activateSkill')
      .mockReturnValue(stage === 'POST' ? late.promise : Promise.resolve(activated))
    const get = vi.spyOn(runtimeApi, 'skill').mockReturnValue(late.promise)
    const show = await mount({}, true)
    await flush()
    await click('skill-activate-guide-1.0.0')
    if (stage === 'GET') await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(1))
    await show(false)
    await show(true)
    expect(node('skill-activate-guide-1.0.0').disabled).toBe(true)
    if (outcome === 'success') late.resolve(activated)
    else late.reject({ response: { status: 409, data: { detail: 'STALE_OLD_ACTIVATION' } } })
    await flush()
    expect(activate).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledTimes(stage === 'GET' ? 1 : 0)
    expect(list).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[data-testid="skill-error"]')).toBeNull()
    expect(node('skill-activate-guide-1.0.0').disabled).toBe(false)
  },
)
it.each([
  ['POST', 'success'],
  ['POST', 'failure'],
  ['GET', 'success'],
  ['GET', 'failure'],
] as const)('keeps B recoverable after remount when A has a late %s %s', async (stage, outcome) => {
  const trustedA = { ...snapshot, trust: { operator: 'local', confirmedAt: 'now' } }
  const trustedB = { ...trustedA, version: '2.0.0', digest: 'b'.repeat(64) }
  const list = vi.spyOn(runtimeApi, 'skills').mockResolvedValue({ items: [] })
  const preview = vi.spyOn(runtimeApi, 'previewSkill').mockResolvedValue(snapshot)
  const oldA = deferred<SkillSnapshot>()
  const b = deferred<SkillSnapshot>()
  const save = vi.spyOn(runtimeApi, 'saveSkill').mockResolvedValue(trustedA)
  const get = vi.spyOn(runtimeApi, 'skill').mockResolvedValue(trustedA)
  if (stage === 'POST') save.mockReturnValueOnce(oldA.promise)
  else get.mockReturnValueOnce(oldA.promise)
  await mount({}, true)
  await prepareSave()
  await click('skill-save')
  if (stage === 'GET') await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(1))
  const requestA = save.mock.calls[0]![0]
  app.unmount()
  host.remove()
  const show = await mount({}, true)
  await click('skill-retry')
  await flush()
  expect(save.mock.calls[1]![0]).toEqual(requestA)
  expect(document.querySelector('[data-testid="skill-pending"]')).toBeNull()

  preview.mockResolvedValue(trustedB)
  save.mockReturnValueOnce(b.promise)
  await prepareSave('2.0.0')
  await click('skill-save')
  const requestB = save.mock.calls[2]![0]
  const key = sessionStorage.key(0)!
  const journalB = sessionStorage.getItem(key)
  await show(false)
  await show(true)
  const listsBefore = list.mock.calls.length
  const readsBefore = get.mock.calls.length
  if (outcome === 'success') oldA.resolve(trustedA)
  else oldA.reject({ response: { status: 409, data: { detail: 'OLD_A_CONFLICT' } } })
  await flush()
  expect(sessionStorage.getItem(key)).toBe(journalB)
  expect(node('skill-retry').disabled).toBe(true)
  expect(document.querySelector('[data-testid="skill-error"]')).toBeNull()
  expect(list).toHaveBeenCalledTimes(listsBefore)
  expect(get).toHaveBeenCalledTimes(readsBefore)
  b.reject(new Error('B response lost'))
  await flush()
  expect(node('skill-retry').disabled).toBe(false)
  expect(sessionStorage.getItem(key)).toBe(journalB)
  app.unmount()
  host.remove()
  await mount()
  await click('skill-import')
  expect(node<HTMLInputElement>('skill-version').value).toBe('2.0.0')
  expect(node('skill-version').disabled).toBe(true)
  save.mockResolvedValue(trustedB)
  get.mockResolvedValue({ ...trustedB, digest: trustedA.digest })
  await click('skill-retry')
  await flush()
  // Same ID/version is insufficient proof: a different digest stays unresolved.
  expect(sessionStorage.getItem(key)).toBe(journalB)
  expect(node('skill-save').disabled).toBe(true)
  expect(save.mock.calls[3]![0]).toEqual(requestB)
  get.mockResolvedValue(trustedB)
  await click('skill-retry')
  await flush()
  expect(save.mock.calls[4]![0]).toEqual(requestB)
  expect(sessionStorage.getItem(key)).toBeNull()
  expect(document.querySelector('[data-testid="skill-pending"]')).toBeNull()
})
it('imports via a separate form, requires preview and trust, saves disabled then activates by CAS', async () => {
  const list = vi.spyOn(runtimeApi, 'skills').mockResolvedValue({ items: [] })
  const preview = vi.spyOn(runtimeApi, 'previewSkill').mockResolvedValue(snapshot)
  const save = vi
    .spyOn(runtimeApi, 'saveSkill')
    .mockResolvedValue({ ...snapshot, trust: { operator: 'local', confirmedAt: 'now' } })
  const get = vi
    .spyOn(runtimeApi, 'skill')
    .mockResolvedValue({ ...snapshot, trust: { operator: 'local', confirmedAt: 'now' } })
  const activate = vi
    .spyOn(runtimeApi, 'activateSkill')
    .mockResolvedValue({ ...snapshot, enabled: true, stateRevision: 2 })
  await mount()
  expect(document.querySelector('[data-testid=skill-raw]')).toBeNull()
  await click('skill-import')
  await input('skill-raw', raw)
  await input('skill-version', '1.0.0')
  await input('skill-source', 'operator')
  expect(node<HTMLButtonElement>('skill-save').disabled).toBe(true)
  await click('skill-preview')
  await vi.waitFor(() =>
    expect(document.querySelector('[data-testid=skill-preview-result]')).not.toBeNull(),
  )
  expect(preview).toHaveBeenCalledWith({
    rawSkillMd: raw,
    version: '1.0.0',
    sourceLabel: 'operator',
    resources: [],
    requiredCapabilities: [],
  })
  expect(node<HTMLButtonElement>('skill-save').disabled).toBe(true)
  await click('skill-confirm')
  list.mockResolvedValue({ items: [{ ...snapshot, createdAt: '' }] })
  await click('skill-save')
  await vi.waitFor(() => expect(get).toHaveBeenCalledWith('guide', '1.0.0'))
  await vi.waitFor(() =>
    expect(document.querySelector('[data-testid="skill-activate-guide-1.0.0"]')).not.toBeNull(),
  )
  expect(save).toHaveBeenCalledWith({
    input: preview.mock.calls[0]![0],
    expectedDigest: snapshot.digest,
    confirmed: true,
  })
  expect(activate).not.toHaveBeenCalled()
  get.mockResolvedValue({ ...snapshot, enabled: true, stateRevision: 2 })
  await click('skill-activate-guide-1.0.0')
  await vi.waitFor(() =>
    expect(activate).toHaveBeenCalledWith('guide', '1.0.0', { enabled: true, stateRevision: 1 }),
  )
})
it('retains a response-lost save across reopen and retries only the identical confirmed request', async () => {
  vi.spyOn(runtimeApi, 'skills').mockResolvedValue({ items: [] })
  vi.spyOn(runtimeApi, 'previewSkill').mockResolvedValue(snapshot)
  const save = vi.spyOn(runtimeApi, 'saveSkill').mockRejectedValue(new Error('response lost'))
  const get = vi.spyOn(runtimeApi, 'skill').mockRejectedValue(new Error('offline'))
  await mount()
  await click('skill-import')
  await input('skill-raw', raw)
  await input('skill-source', 'operator')
  await click('skill-preview')
  await vi.waitFor(() =>
    expect(document.querySelector('[data-testid=skill-preview-result]')).not.toBeNull(),
  )
  await click('skill-confirm')
  await click('skill-save')
  await vi.waitFor(() =>
    expect(document.querySelector('[data-testid=skill-pending]')).not.toBeNull(),
  )
  const original = save.mock.calls[0]![0]
  app.unmount()
  host.remove()
  await mount()
  await click('skill-import')
  expect(node<HTMLInputElement>('skill-raw').value).toBe(raw)
  expect(node<HTMLInputElement>('skill-version').disabled).toBe(true)
  expect(node<HTMLButtonElement>('skill-save').disabled).toBe(true)
  save.mockResolvedValue({ ...snapshot, trust: { operator: 'local', confirmedAt: 'now' } })
  get.mockResolvedValue({ ...snapshot, trust: { operator: 'local', confirmedAt: 'now' } })
  await click('skill-retry')
  await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2))
  expect(save.mock.calls[1]![0]).toEqual(original)
  expect(save.mock.calls[1]![0].input.version).toBe('1.0.0')
})
it('keeps the original pending save when POST succeeds but verification GET is rejected', async () => {
  vi.spyOn(runtimeApi, 'skills').mockResolvedValue({ items: [] })
  vi.spyOn(runtimeApi, 'previewSkill').mockResolvedValue(snapshot)
  vi.spyOn(runtimeApi, 'saveSkill').mockResolvedValue({
    ...snapshot,
    trust: { operator: 'local', confirmedAt: 'now' },
  })
  vi.spyOn(runtimeApi, 'skill').mockRejectedValue({
    response: { status: 404, data: { detail: 'SKILL_NOT_FOUND' } },
  })
  await mount()
  await click('skill-import')
  await input('skill-raw', raw)
  await input('skill-source', 'operator')
  await click('skill-preview')
  await vi.waitFor(() =>
    expect(document.querySelector('[data-testid=skill-preview-result]')).not.toBeNull(),
  )
  await click('skill-confirm')
  await click('skill-save')
  await vi.waitFor(() => expect(document.querySelector('[data-testid=skill-error]')).not.toBeNull())
  expect(document.querySelector('[data-testid=skill-pending]')).not.toBeNull()
  expect(node<HTMLInputElement>('skill-version').disabled).toBe(true)
  expect(node<HTMLButtonElement>('skill-save').disabled).toBe(true)
})
it('preserves import text after a same-version content conflict and requires a fresh preview and trust confirmation', async () => {
  vi.spyOn(runtimeApi, 'skills').mockResolvedValue({ items: [] })
  vi.spyOn(runtimeApi, 'previewSkill').mockResolvedValue(snapshot)
  const save = vi
    .spyOn(runtimeApi, 'saveSkill')
    .mockRejectedValue({ response: { status: 409, data: { detail: 'SKILL_VERSION_CONFLICT' } } })
  await mount()
  await click('skill-import')
  await input('skill-raw', raw)
  await input('skill-source', 'operator')
  await click('skill-preview')
  await vi.waitFor(() =>
    expect(document.querySelector('[data-testid=skill-preview-result]')).not.toBeNull(),
  )
  await click('skill-confirm')
  await click('skill-save')
  await vi.waitFor(() => expect(document.body.textContent).toContain('SKILL_VERSION_CONFLICT'))
  expect(node<HTMLInputElement>('skill-raw').value).toBe(raw)
  expect(node<HTMLInputElement>('skill-version').value).toBe('1.0.0')
  expect(node<HTMLButtonElement>('skill-save').disabled).toBe(true)
  expect(document.querySelector('[data-testid=skill-pending]')).toBeNull()
  expect(save).toHaveBeenCalledTimes(1)
})
it('offers the exact explicitly labelled fixture only in mock mode', async () => {
  vi.spyOn(runtimeApi, 'skills').mockResolvedValue({ items: [] })
  await mount({ mock: true })
  await click('skill-import')
  await click('skill-fixture')
  expect(node<HTMLInputElement>('skill-raw').value).toBe(
    '---\nname: mock-review\ndescription: Safe mock review fixture\n---\nReview changes and verify tests. This is simulated guidance.\n',
  )
  expect(document.body.textContent).toContain('不声称通用 YAML 解析')
})
it('reads saved versions explicitly and keeps a CAS conflict until operator refresh', async () => {
  const list = vi
    .spyOn(runtimeApi, 'skills')
    .mockResolvedValue({ items: [{ ...snapshot, createdAt: '' }] })
  const get = vi
    .spyOn(runtimeApi, 'skill')
    .mockResolvedValue({ ...snapshot, stateRevision: 4, enabled: true })
  const activate = vi
    .spyOn(runtimeApi, 'activateSkill')
    .mockRejectedValue({ response: { status: 409, data: { detail: 'SKILL_STATE_STALE' } } })
  await mount()
  await vi.waitFor(() =>
    expect(document.querySelector('[data-testid="skill-activate-guide-1.0.0"]')).not.toBeNull(),
  )
  await click('skill-detail-guide-1.0.0')
  await vi.waitFor(() =>
    expect(document.querySelector('[data-testid=skill-detail-result]')).not.toBeNull(),
  )
  expect(get).toHaveBeenCalledWith('guide', '1.0.0')
  await click('skill-activate-guide-1.0.0')
  await vi.waitFor(() => expect(document.body.textContent).toContain('SKILL_STATE_STALE'))
  expect(activate).toHaveBeenCalledTimes(1)
  expect(list).toHaveBeenCalledTimes(1)
})
it('invalidates a late preview on leaving the import workspace while preserving text', async () => {
  vi.spyOn(runtimeApi, 'skills').mockResolvedValue({ items: [] })
  let resolve!: (s: SkillSnapshot) => void
  vi.spyOn(runtimeApi, 'previewSkill').mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  await mount()
  await click('skill-import')
  await input('skill-raw', raw)
  await click('skill-preview')
  await click('skill-cancel')
  await click('skill-import')
  resolve(snapshot)
  await nextTick()
  await nextTick()
  expect(document.querySelector('[data-testid=skill-preview-result]')).toBeNull()
  expect(node<HTMLInputElement>('skill-raw').value).toBe(raw)
  expect(node<HTMLButtonElement>('skill-save').disabled).toBe(true)
})
async function upload(id: string, files: File[]) {
  const el = node<HTMLInputElement>(id)
  Object.defineProperty(el, 'files', { configurable: true, value: files })
  el.dispatchEvent(new Event('change', { bubbles: true }))
  await nextTick()
}
it('ignores late local file reads after leaving and reopening the import workspace', async () => {
  vi.spyOn(runtimeApi, 'skills').mockResolvedValue({ items: [] })
  await mount()
  await click('skill-import')
  let resolve!: (value: string) => void
  const file = new File(['late'], 'SKILL.md')
  Object.defineProperty(file, 'text', {
    value: () =>
      new Promise<string>((done) => {
        resolve = done
      }),
  })
  await upload('skill-file', [file])
  await click('skill-cancel')
  await click('skill-import')
  await input('skill-raw', 'new draft')
  resolve(raw)
  await new Promise((done) => setTimeout(done, 0))
  await nextTick()
  expect(node<HTMLInputElement>('skill-raw').value).toBe('new draft')
})
it('rejects an individual resource over 16000 characters even below the total budget', async () => {
  vi.spyOn(runtimeApi, 'skills').mockResolvedValue({ items: [] })
  await mount()
  await click('skill-import')
  await upload('skill-resources', [new File(['x'.repeat(16001)], 'large.txt')])
  await vi.waitFor(() => expect(document.querySelector('[data-testid=skill-error]')).not.toBeNull())
  expect(document.body.textContent).not.toContain('large.txt')
})
it('reads only explicit text uploads and rejects oversized or fifth resources without losing the draft', async () => {
  vi.spyOn(runtimeApi, 'skills').mockResolvedValue({ items: [] })
  const preview = vi.spyOn(runtimeApi, 'previewSkill').mockResolvedValue(snapshot)
  await mount()
  await click('skill-import')
  await upload('skill-file', [new File([raw], 'SKILL.md', { type: 'text/markdown' })])
  await vi.waitFor(() => expect(node<HTMLInputElement>('skill-raw').value).toBe(raw))
  await upload('skill-resources', [new File(['notes'], 'guide.txt', { type: 'text/plain' })])
  await vi.waitFor(() => expect(document.body.textContent).toContain('guide.txt'))
  await click('skill-preview')
  await vi.waitFor(() => expect(preview).toHaveBeenCalled())
  expect(preview.mock.calls[0]![0].resources).toEqual([
    { path: 'guide.txt', mediaType: 'text/plain', content: 'notes' },
  ])
  await upload('skill-file', [new File(['x'.repeat(16001)], 'SKILL.md')])
  await vi.waitFor(() => expect(document.querySelector('[data-testid=skill-error]')).not.toBeNull())
  expect(node<HTMLInputElement>('skill-raw').value).toBe(raw)
  await upload(
    'skill-resources',
    Array.from({ length: 4 }, (_, i) => new File(['x'], `r${i}.txt`)),
  )
  await nextTick()
  await click('skill-preview')
  await vi.waitFor(() => expect(preview).toHaveBeenCalledTimes(2))
  expect(preview.mock.calls[1]![0].resources).toHaveLength(1)
})
