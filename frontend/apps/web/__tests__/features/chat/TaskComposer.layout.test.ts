// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { createApp, h, nextTick, ref, type App } from 'vue'
import { runtimeApi, type TaskContext } from '@eap/runtime-client'
import { i18n } from '../../../src/lib/i18n'
import { workbench } from '../../../src/features/shell/workbench'
import TaskComposer from '../../../src/features/chat/TaskComposer.vue'

let app: App, host: HTMLDivElement
afterEach(() => {
  app?.unmount()
  host?.remove()
  vi.restoreAllMocks()
  sessionStorage.clear()
  workbench.sessionExtras = {}
})
const empty = (): TaskContext => ({
  mode: 'chat',
  expert: 'general',
  instructions: '',
  reasoning: 'default',
  approval: 'review',
  files: [],
  prototypeVersionId: '',
  targetPath: '',
})
const expertRef = { id: 'saved', revision: 4 }
const skillRef = { id: 'guide', version: '1.0.0', digest: 'a'.repeat(64), stateRevision: 2 }
function button(id: string) {
  const node = document.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)
  expect(node, id).not.toBeNull()
  return node!
}
async function click(id: string) {
  button(id).focus()
  button(id).click()
  await nextTick()
}
async function category(name: string) {
  await click('composer-add')
  await click('composer-cat-' + name)
}
async function mount(initial = empty()) {
  const context = ref(initial),
    active = ref(true),
    disabled = ref(false),
    toolMode = ref('none'),
    draft = ref('keep draft')
  const catalog = vi.spyOn(runtimeApi, 'experts').mockResolvedValue({
    items: [JSON.stringify({ id: 'saved', name: 'Saved expert' })],
    states: { saved: { enabled: true, builtin: false, revision: 4 } },
  })
  vi.spyOn(runtimeApi, 'skills').mockResolvedValue({ items: [] })
  host = document.createElement('div')
  document.body.append(host)
  app = createApp({
    render: () =>
      h('form', [
        h(
          TaskComposer,
          {
            context: context.value,
            draft: draft.value,
            active: active.value,
            disabled: disabled.value,
            toolMode: toolMode.value,
            reasoningEfforts: [],
            onUpdate: (value: TaskContext) => {
              context.value = value
            },
          },
          {
            draft: () => h('textarea', { value: draft.value, 'data-testid': 'draft' }),
            send: () => h('button', { type: 'submit', 'data-testid': 'layout-send' }, 'Send'),
            status: () => h('p', { 'data-testid': 'layout-status' }, 'Choose a model'),
          },
        ),
      ]),
  })
  app.use(i18n).mount(host)
  await nextTick()
  return { context, active, disabled, toolMode, draft, catalog }
}

it('keeps model and send together and places status outside the wrapping controls', async () => {
  await mount()
  const group = host.querySelector('.composer-submit-controls')
  expect(group).not.toBeNull()
  expect(group!.contains(button('model-picker'))).toBe(true)
  expect(group!.contains(button('layout-send'))).toBe(true)
  const status = host.querySelector('[data-testid="layout-status"]')
  expect(status).not.toBeNull()
  expect(status!.closest('.context-toolbar')).toBeNull()
  expect(status!.closest('.task-context')).not.toBeNull()
})

it('uses shared decorative icons for the composer controls', async () => {
  await mount()
  for (const id of [
    'composer-add',
    'execution-mode',
    'approval-policy',
    'context-meter',
    'model-picker',
  ]) {
    const icon = host.querySelector(`[data-testid="${id}"] svg.eap-icon`)
    expect(icon, id).not.toBeNull()
    expect(icon!.getAttribute('aria-hidden')).toBe('true')
  }
})

it('shows model setup instead of reasoning controls when no model is selected', async () => {
  await mount()
  expect(button('model-picker').textContent).not.toContain('模型默认')
  await click('model-picker')
  expect(document.querySelector('[data-testid="model-setup-link"]')).not.toBeNull()
  expect(document.querySelector('.effort-row')).toBeNull()
})

it('keeps context usage informational and adds attachments through a single entry', async () => {
  await mount()
  const meter = host.querySelector('[data-testid="context-meter"]') as HTMLElement
  expect(meter.querySelector('svg')).not.toBeNull()
  expect(meter.getAttribute('aria-valuenow')).toBeNull()
  expect(meter.getAttribute('aria-label')).toContain('不统计 token')
  expect(meter.closest('button')).toBeNull()
  meter.click()
  await nextTick()
  expect(document.querySelector('[data-testid="composer-add-menu"]')).toBeNull()
  await click('composer-add')
  expect(document.querySelector('[data-testid="context-usage-detail"]')?.textContent).toContain(
    '文件 0/6',
  )
  expect(document.querySelector('[data-testid="composer-add-menu"]')).not.toBeNull()
})

it('explains unavailable execution modes while allowing real approval changes', async () => {
  const { context } = await mount()
  await click('execution-mode')
  expect(document.querySelector('[data-testid="execution-availability"]')?.textContent).toContain(
    '聊天与只读规划可用',
  )
  expect(button('execution-plan').disabled).toBe(false)
  expect(button('execution-agent').disabled).toBe(true)
  expect(button('execution-plugin').disabled).toBe(true)
  await click('approval-policy')
  expect(document.querySelector('[data-testid="approval-menu"] h3')?.textContent).toBe('写入策略')
  await click('approval-read-only')
  expect(context.value.approval).toBe('read_only')
  await click('approval-policy')
  expect(button('approval-read-only').getAttribute('aria-pressed')).toBe('true')
  await click('approval-review')
  expect(context.value.approval).toBe('review')
})

it.each(['knowledge', 'skill'] as const)(
  'renders selected %s as a compact accessible removable chip, not permanent guidance',
  async (kind) => {
    const selected =
      kind === 'knowledge'
        ? { knowledgeExpertRef: expertRef }
        : { skillRef, skillResourcePaths: ['guide.txt'] }
    const { context, disabled, draft } = await mount({ ...empty(), ...selected })
    const chip = button(kind + '-remove')
    expect(chip.closest('.context-chips')).not.toBeNull()
    expect(chip.classList.contains('eap-tag')).toBe(true)
    expect(chip.getAttribute('aria-label')).toContain(
      i18n.global.t(kind === 'knowledge' ? 'knowledgeContext.remove' : 'skill.remove'),
    )
    expect(chip.textContent).toContain(kind === 'knowledge' ? 'saved · r4' : 'guide · 1.0.0 · r2')
    expect(host.textContent).not.toContain(i18n.global.t('knowledgeContext.limit'))
    expect(host.textContent).not.toContain(i18n.global.t('skill.boundary'))
    disabled.value = true
    await nextTick()
    chip.click()
    await nextTick()
    expect(context.value).toEqual({ ...empty(), ...selected })
    disabled.value = false
    await nextTick()
    await click(kind + '-remove')
    expect(context.value).toEqual(empty())
    expect(draft.value).toBe('keep draft')
    expect(host.querySelector('.context-chips')).toBeNull()
    expect(host.textContent).toContain(
      i18n.global.t(kind === 'knowledge' ? 'knowledgeContext.removed' : 'skill.removed'),
    )
  },
)

it.each(['knowledge', 'skill'] as const)(
  'hands focus from the + menu to the %s dialog and back to the draft',
  async (kind) => {
    await mount()
    await category(kind === 'knowledge' ? 'experts' : 'skills')
    await click(kind + '-open')
    await new Promise((resolve) => setTimeout(resolve, 30))
    await nextTick()
    const dialog = document.querySelector(`[data-testid="${kind}-dialog"] [role="dialog"]`)
    expect(dialog).not.toBeNull()
    expect(dialog!.contains(document.activeElement)).toBe(true)
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    )
    await nextTick()
    expect(document.querySelector(`[data-testid="${kind}-dialog"]`)).toBeNull()
    expect(document.activeElement).toBe(host.querySelector('[data-testid="draft"]'))
  },
)

it('closes knowledge selection when the session context is replaced and discards its pending preview', async () => {
  const { context, draft } = await mount({ ...empty(), knowledgeExpertRef: expertRef })
  let resolve!: (value: Awaited<ReturnType<typeof runtimeApi.previewExpertContext>>) => void
  vi.spyOn(runtimeApi, 'previewExpertContext').mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  await category('experts')
  await click('knowledge-open')
  await vi.waitFor(() => expect(button('knowledge-use').disabled).toBe(false))
  await click('knowledge-preview')
  context.value = { ...context.value }
  await nextTick()
  expect(document.querySelector('[data-testid="knowledge-dialog"]')).toBeNull()
  resolve({ expertRef, status: 'ready', references: [] })
  await nextTick()
  await nextTick()
  expect(document.querySelector('[data-testid="knowledge-preview-result"]')).toBeNull()
  expect(context.value.knowledgeExpertRef).toEqual(expertRef)
  expect(draft.value).toBe('keep draft')
})

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

it.each([
  ['knowledge', 'success'],
  ['knowledge', 'failure'],
  ['skill', 'success'],
  ['skill', 'failure'],
] as const)('invalidates a pending %s catalog on leaving the page (%s)', async (kind, outcome) => {
  const { active, context, draft } = await mount()
  const old = deferred<
    Awaited<ReturnType<typeof runtimeApi.experts>> & Awaited<ReturnType<typeof runtimeApi.skills>>
  >()
  const fresh = deferred<
    Awaited<ReturnType<typeof runtimeApi.experts>> & Awaited<ReturnType<typeof runtimeApi.skills>>
  >()
  if (kind === 'knowledge')
    vi.mocked(runtimeApi.experts)
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(fresh.promise)
  else
    vi.mocked(runtimeApi.skills).mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise)
  await category(kind === 'knowledge' ? 'experts' : 'skills')
  await click(kind + '-open')
  active.value = false
  await nextTick()
  expect(document.querySelector(`[data-testid="${kind}-dialog"]`)).toBeNull()
  active.value = true
  await nextTick()
  await category(kind === 'knowledge' ? 'experts' : 'skills')
  await click(kind + '-open')
  if (outcome === 'success') old.resolve({ items: [] })
  else old.reject(new Error('stale catalog'))
  await old.promise.catch(() => {})
  await nextTick()
  expect(document.body.textContent).toContain(
    i18n.global.t(kind === 'knowledge' ? 'knowledgeContext.loading' : 'skill.loading'),
  )
  fresh.resolve({ items: [] })
  await fresh.promise
  await nextTick()
  expect(document.body.textContent).not.toContain(
    i18n.global.t(kind === 'knowledge' ? 'knowledgeContext.failed' : 'skill.failure'),
  )
  expect(context.value).toEqual(empty())
  expect(draft.value).toBe('keep draft')
})

it.each(['success', 'failure'])(
  'invalidates pending knowledge preview on leaving the page (%s)',
  async (outcome) => {
    const { active, context, draft } = await mount({ ...empty(), knowledgeExpertRef: expertRef })
    const old = deferred<Awaited<ReturnType<typeof runtimeApi.previewExpertContext>>>()
    vi.spyOn(runtimeApi, 'previewExpertContext').mockReturnValueOnce(old.promise)
    await category('experts')
    await click('knowledge-open')
    await click('knowledge-preview')
    active.value = false
    await nextTick()
    expect(document.querySelector('[data-testid="knowledge-dialog"]')).toBeNull()
    active.value = true
    await nextTick()
    await category('experts')
    await click('knowledge-open')
    if (outcome === 'success') old.resolve({ expertRef, status: 'ready', references: [] })
    else old.reject(new Error('stale preview'))
    await old.promise.catch(() => {})
    await nextTick()
    expect(document.querySelector('[data-testid="knowledge-preview-result"]')).toBeNull()
    expect(document.body.textContent).not.toContain(i18n.global.t('knowledgeContext.failed'))
    expect(button('knowledge-preview').disabled).toBe(false)
    expect(context.value.knowledgeExpertRef).toEqual(expertRef)
    expect(draft.value).toBe('keep draft')
  },
)

it.each(['tool', 'skill', 'code'] as const)(
  'preserves the knowledge entry restriction for %s context',
  async (restriction) => {
    const { context, toolMode, catalog } = await mount()
    if (restriction === 'tool') toolMode.value = 'git_status'
    if (restriction === 'skill') context.value = { ...context.value, skillRef }
    if (restriction === 'code') context.value.mode = 'code'
    await nextTick()
    await category('experts')
    if (restriction === 'code')
      expect(host.querySelector('[data-testid="knowledge-open"]')).toBeNull()
    else {
      expect(button('knowledge-open').disabled).toBe(true)
      button('knowledge-open').click()
    }
    expect(catalog).not.toHaveBeenCalled()
  },
)

it.each(['tool', 'knowledge', 'code', 'task'] as const)(
  'preserves the skill entry restriction for %s context',
  async (restriction) => {
    const { context, toolMode } = await mount()
    if (restriction === 'tool') toolMode.value = 'git_status'
    if (restriction === 'knowledge')
      context.value = { ...context.value, knowledgeExpertRef: expertRef }
    if (restriction === 'code') context.value.mode = 'code'
    if (restriction === 'task') context.value.taskRef = { projectId: 'p', taskId: 't', revision: 1 }
    await nextTick()
    await category('skills')
    expect(button('skill-open').disabled).toBe(true)
    button('skill-open').click()
    expect(host.textContent).toContain(i18n.global.t('skill.unavailable'))
    expect(runtimeApi.skills).not.toHaveBeenCalled()
  },
)

it('keeps an empty composer compact and exposes knowledge only through + experts', async () => {
  const { catalog, context, draft } = await mount()
  expect(host.querySelector('[data-testid="knowledge-open"]')).toBeNull()
  expect(host.querySelector('.knowledge-selector')).toBeNull()
  expect(host.querySelector('.context-chips')).toBeNull()
  expect(host.querySelector('[data-testid="skill-open"]')).toBeNull()
  expect(catalog).not.toHaveBeenCalled()
  await category('experts')
  expect(button('knowledge-open').disabled).toBe(false)
  await click('knowledge-open')
  await vi.waitFor(() =>
    expect(document.querySelector('[data-testid="knowledge-candidate-saved"]')).not.toBeNull(),
  )
  expect(host.querySelector('[data-testid="composer-add-menu"]')).toBeNull()
  expect(document.querySelector('[data-testid="knowledge-dialog"]')?.textContent).toContain(
    i18n.global.t('knowledgeContext.limit'),
  )
  await click('knowledge-candidate-saved')
  expect(document.querySelector('[data-testid="knowledge-dialog"]')).not.toBeNull()
  await click('knowledge-cancel')
  expect(context.value).toEqual(empty())
  expect(draft.value).toBe('keep draft')
})
