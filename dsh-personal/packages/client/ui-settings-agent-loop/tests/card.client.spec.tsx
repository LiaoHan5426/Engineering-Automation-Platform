import { h, nextTick } from 'vue'
// @vitest-environment jsdom
/** The agent-loop page as the Plugins page renders it: its one-liner and its one field. */
import {
  act,
  cleanup,
  render as mountNative,
} from '../../../test-support/client-runtime/src/vue-test.ts'
import { fireEvent, screen } from '@testing-library/dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SettingsFieldState, SettingsFormShell } from '@deepseek-ai/dsh-client-ui-primitives'
import { AgentLoopCard, type AgentLoopCardProps } from '../src/client/AgentLoopCard.tsx'
import type { AgentLoopCardState } from '../src/client/agent-loop-card-controller.ts'
import { en } from '../src/client/locales.ts'
afterEach(cleanup)
const t = (key: keyof typeof en) => en[key]
const settled: SettingsFormShell = {
  available: true,
  writable: true,
  dirty: false,
  invalid: false,
  saving: false,
  failed: false,
}
function field(text: string, rest: Partial<SettingsFieldState> = {}): SettingsFieldState {
  return { text, overridden: false, invalid: false, ...rest }
}
async function renderCard(
  state: Partial<AgentLoopCardState> = {},
  view: 'summary' | 'page' = 'page',
) {
  const store = createSnapshotStore<AgentLoopCardState>({
    ...settled,
    maxParallelToolCalls: field('10'),
    ...state,
  })
  const actions = { edit: vi.fn(), resetField: vi.fn(), save: vi.fn(), discard: vi.fn() }
  const props = {
    ...actions,
    view,
    t,
    useAgentLoopCard: bindSnapshotSelector(store),
  } as AgentLoopCardProps
  await render(h(AgentLoopCard, { ...props }))
  return actions
}
describe('AgentLoopCard', () => {
  it('renders its one-liner alone in the summary view', async () => {
    await renderCard({}, 'summary')
    expect(document.body.textContent).toBe(en.description)
    expect(screen.queryByLabelText(en.maxParallel)).toBeNull()
  })
  it('stages and saves the only field it owns', async () => {
    const actions = await renderCard({ dirty: true })
    await act(async () => { await nextTick(); fireEvent.input(screen.getByLabelText(en.maxParallel), { target: { value: '2' } }) })
    await act(async () => { await nextTick(); fireEvent.click(screen.getByRole('button', { name: en.save })) })
    expect(actions.edit).toHaveBeenCalledWith('maxParallelToolCalls', '2')
    expect(actions.save).toHaveBeenCalledOnce()
  })
  it('stages a reset for the field it owns', async () => {
    const actions = await renderCard({ maxParallelToolCalls: field('2', { overridden: true }) })
    await act(async () => { await nextTick(); fireEvent.click(screen.getByRole('button', { name: en.reset })) })
    expect(actions.resetField).toHaveBeenCalledWith('maxParallelToolCalls')
  })
  it('says the plugin is not loaded while its namespace is unavailable, and disables the field while the document is read-only', async () => {
    await renderCard({ available: false })
    expect(screen.getByRole('status').textContent).toBe(en.unavailable)
    cleanup()
    await renderCard({ writable: false })
    expect(screen.getByRole('status').textContent).toBe(en.readOnly)
    expect(screen.getByLabelText(en.maxParallel)).toHaveProperty('disabled', true)
  })
})
async function render(...args: Parameters<typeof mountNative>) {
  const view = mountNative(...args)
  await nextTick()
  return view
}
