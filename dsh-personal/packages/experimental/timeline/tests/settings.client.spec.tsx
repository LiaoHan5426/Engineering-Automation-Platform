// @vitest-environment jsdom
import { cloneVNode, computed, defineComponent, h, shallowRef } from 'vue'
import { act, cleanup, render } from '../../../test-support/client-runtime/src/vue-test.ts'
import { fireEvent, screen, waitFor, within } from '@testing-library/dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Settings, editableSettings } from '../src/client/Settings.tsx'
import type { EditableSettings } from '../src/client/Settings.tsx'
import type { SettingsState } from '../src/client/store.ts'
import { Config, liveConfig } from '../src/config.ts'
import { HISTORY_MS } from '../src/policy.ts'
import { en } from '../src/client/locales.ts'
import type { TimelineKey } from '../src/client/locales.ts'
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const actual = await vi.importActual<typeof import('@deepseek-ai/dsh-client-ui-primitives')>('@deepseek-ai/dsh-client-ui-primitives')
  return { ...actual,
    MarkdownText: defineComponent((props: {
      text: string
    }) => () => h('div', props.text), { props: ['text'] }),
    Tag: defineComponent((props: {
      tone: string
    }, { slots }) => () => h('span', { 'data-tone': props.tone }, slots.default?.()), { props: ['tone'] }),
    IconPauseOutlineRegular: () => h('span', { 'data-icon': 'pause' }),
    IconPlayOutlineRegular: () => h('span', { 'data-icon': 'play' }),
    Tooltip: defineComponent((props: {
      label: string
      disabled?: boolean
    }, { slots }) => () => { const child = slots.default?.()[0]; return child ? cloneVNode(child, { 'data-tooltip': props.disabled ? undefined : props.label }) : null }, { props: ['label', 'disabled'], inheritAttrs: false }),
  }
})
afterEach(cleanup)
const accepted = liveConfig(Config({ summaryPrompt: 'Summarize actual progress briefly.' }))
const value = editableSettings(accepted)
const snapshot = {
  status: 'ready' as const,
  value: accepted,
  revision: 9,
  writable: true,
  base: {},
  user: {},
}
const Fixture = defineComponent((input: {
  save: (value: EditableSettings, revision: number | undefined) => Promise<boolean>
  source?: typeof accepted
  status?: 'ready' | 'loading' | 'unavailable'
  writable?: boolean
}) => {
  const state = shallowRef<SettingsState>({
    draft: null,
    revision: undefined,
    saving: false,
    level: -1,
    units: [],
    messageKey: null,
  })
  const props = computed(() => ({
    t: (key: TimelineKey, values?: Record<string, string | number>) => en[key].replace(/\{(\w+)\}/gu, (token,
      field: string) => String(values?.[field] ?? token)),
    useLocale: (selector: (value: {
      active: string
    }) => unknown) => computed(() => selector({ active: 'en' })),
    useSettings: (selector: (current: unknown) => unknown) => computed(() => selector({ ...snapshot, status: (input.status ?? 'ready'), writable: (input.writable ?? true), value: (input.status ?? 'ready') === 'ready' ? (input.source ?? accepted) : undefined })),
    useStore: (selector: (current: SettingsState) => unknown) => computed(() => selector(state.value)),
    actions: { update: (patch: Partial<SettingsState>) => { state.value = (current => ({ ...current, ...patch }))(state.value) } },
    save: input.save,
  } as InstanceType<typeof Settings>['$props']))
  return () => {
    return h(Settings, { ...props.value })
  }
}, { name: 'Fixture', inheritAttrs: false, props: ['save', 'source', 'status', 'writable'] })
const saveButton = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Save changes' })
describe('the Timeline Settings section', () => {
  it('shows the connection state and retains the draft through a rejected save', async () => {
    const save = vi.fn().mockRejectedValue(new Error('Connection lost'))
    const mountedView1 = await (async () => {
      const mounted = render(h(Fixture, { 'save': save, 'status': 'loading', 'writable': false }))
      await act(() => { })
      return mounted
    })()
    const rerender = (...args: Parameters<typeof mountedView1.rerender>) => mountedView1.rerender(...args)
    expect(screen.getByText(en.loading)).toBeTruthy()
    await rerender(h(Fixture, { 'save': save, 'status': 'unavailable', 'writable': false }))
    expect(screen.getByText(en.settingsUnavailable)).toBeTruthy()
    await rerender(h(Fixture, { 'save': save, 'writable': false }))
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: en.language }).disabled).toBe(true)
    await rerender(h(Fixture, { 'save': save }))
    const task = screen.getByRole<HTMLTextAreaElement>('textbox', { name: en.taskPrompt })
    await act(() => fireEvent.input(task, { target: { value: 'Show verification evidence.' } }))
    await act(() => fireEvent.click(saveButton()))
    await screen.findByText(en.saveFailed)
    expect(task.value).toBe('Show verification evidence.')
    await act(() => fireEvent.click(screen.getByRole('button', { name: en.discard })))
    expect(task.value).toBe(accepted.taskPrompt)
  })
  it('submits a draft once when two clicks occur before the form renders as disabled', async () => {
    const pending = Promise.withResolvers<boolean>()
    const save = vi.fn().mockReturnValue(pending.promise)
    await (async () => {
      const mounted = render(h(Fixture, { 'save': save }))
      await act(() => { })
      return mounted
    })()
    await act(() => fireEvent.click(screen.getByRole('switch', { name: en.segmentedProgress })))
    const button = saveButton()
    await act(() => {
      button.click()
      button.click()
    })
    expect(save).toHaveBeenCalledOnce()
    await act(async () => { pending.resolve(true) })
    expect(screen.getByText(en.saved)).toBeTruthy()
  })
  it('turns off new interval reports without changing the hierarchy or task settings', async () => {
    const save = vi.fn().mockResolvedValue(true)
    await (async () => {
      const mounted = render(h(Fixture, { 'save': save }))
      await act(() => { })
      return mounted
    })()
    const reports = screen.getByRole('region', { name: en.progressReports })
    const toggle = within(reports).getByRole('switch', { name: en.reportsEnabled })
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    await act(() => fireEvent.click(toggle))
    await act(() => fireEvent.click(saveButton()))
    await waitFor(() => { expect(save).toHaveBeenCalledWith({ ...value, reportsEnabled: false }, 9) })
  })
  it('saves the progress display without changing other settings', async () => {
    const save = vi.fn().mockResolvedValue(true)
    await (async () => {
      const mounted = render(h(Fixture, { 'save': save }))
      await act(() => { })
      return mounted
    })()
    const toggle = within(screen.getByRole('region', { name: 'Progress display' })).getByRole('switch', {
      name: en.segmentedProgress,
    })
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    await act(() => fireEvent.click(toggle))
    await act(() => fireEvent.click(saveButton()))
    await waitFor(() => { expect(save).toHaveBeenCalledWith({ ...value, segmentedProgress: false }, 9) })
  })
  it('opens the sidebar automatically by default and saves an opt-out', async () => {
    const save = vi.fn().mockResolvedValue(true)
    await (async () => {
      const mounted = render(h(Fixture, { 'save': save }))
      await act(() => { })
      return mounted
    })()
    const tracking = screen.getByRole('region', { name: en.taskTracking })
    const toggle = within(tracking).getByRole('switch', { name: en.autoOpenSidebar })
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    await act(() => fireEvent.click(toggle))
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    await act(() => fireEvent.click(saveButton()))
    await waitFor(() => { expect(save).toHaveBeenCalledWith({ ...value, autoOpenSidebar: false }, 9) })
  })
  it('saves task-writing guidance separately and restores its default without changing report prompts', async () => {
    const save = vi.fn().mockResolvedValue(false)
    await (async () => {
      const mounted = render(h(Fixture, { 'save': save }))
      await act(() => { })
      return mounted
    })()
    const taskPrompt = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Task writing guidance' })
    const section = screen.getByRole('region', { name: 'Task writing guidance' })
    expect(within(section).getByRole('heading', { level: 2 }).textContent).toBe('Task writing guidance')
    expect(section.previousElementSibling).toBe(screen.getByRole('region', { name: 'Timed reports' }))
    expect(taskPrompt.maxLength).toBe(32768)
    const count = (length: number) => `${length.toLocaleString()} / ${taskPrompt.maxLength.toLocaleString()}`
    const prompt = 'Explain results and remaining evidence in task details.'
    expect(within(section).getByText(count(value.taskPrompt.length))).toBeTruthy()
    await act(() => fireEvent.input(taskPrompt, { target: { value: prompt } }))
    expect(within(section).getByText(count(prompt.length))).toBeTruthy()
    await act(() => fireEvent.click(saveButton()))
    await waitFor(() => {
      expect(save).toHaveBeenCalledWith({ ...value, taskPrompt: prompt }, 9)
    })
    expect(taskPrompt.value).toBe(prompt)
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Report instructions' }).value).toBe(value.summaryPrompt)
    await act(() => fireEvent.click(screen.getByRole('button', { name: 'Restore default: Task writing guidance' })))
    expect(taskPrompt.value).toBe(value.taskPrompt)
    expect(within(section).getByText(count(value.taskPrompt.length))).toBeTruthy()
  })
  it('groups settings and saves a positive whole reminder interval with the accepted revision', async () => {
    const save = vi.fn().mockResolvedValue(true)
    await (async () => {
      const mounted = render(h(Fixture, { 'save': save }))
      await act(() => { })
      return mounted
    })()
    expect(screen.getByRole('region', { name: 'Progress display' })).toBeTruthy()
    const tracking = screen.getByRole('region', { name: 'Task tracking' })
    expect(screen.getByRole('region', { name: 'Timed reports' })).toBeTruthy()
    const reminder = within(tracking).getByRole('spinbutton', { name: 'Task update reminder' })
    expect((reminder as HTMLInputElement).value).toBe('24')
    for (const count of ['0', '-1', '1.5']) {
      await act(() => fireEvent.input(reminder, { target: { value: count } }))
      expect(saveButton().disabled).toBe(true)
      expect(screen.getByRole('alert').textContent).toBe(en.invalidReminder)
    }
    await act(() => fireEvent.input(reminder, { target: { value: '48' } }))
    expect(saveButton().disabled).toBe(false)
    await act(() => fireEvent.click(saveButton()))
    await waitFor(() => { expect(save).toHaveBeenCalledWith({ ...value, reminderIterations: 48 }, 9) })
  })
  it('replaces Todo by default and restores its tools when the switch is turned off', async () => {
    const save = vi.fn().mockResolvedValue(true)
    await (async () => {
      const mounted = render(h(Fixture, { 'save': save }))
      await act(() => { })
      return mounted
    })()
    const toggle = screen.getByRole('switch', { name: 'Replace Todo tools (recommended)' })
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Report instructions' }).maxLength).toBe(32768)
    await act(() => fireEvent.click(toggle))
    await act(() => fireEvent.click(saveButton()))
    await waitFor(() => { expect(save).toHaveBeenCalledWith({ ...value, allowTodo: true }, 9) })
  })
  it('keeps prompt selection and resets global instructions when editing hour intervals', async () => {
    await (async () => {
      const mounted = render(h(Fixture, { 'save': vi.fn() }))
      await act(() => { })
      return mounted
    })()
    await act(() => fireEvent.input(screen.getByRole('combobox', { name: en.language }), { target: { value: 'invalid' } }))
    await act(() => fireEvent.input(screen.getByRole('combobox', { name: en.progressDecimals }), { target: { value: 'invalid' } }))
    expect(saveButton().disabled).toBe(true)
    const prompt = screen.getByRole<HTMLTextAreaElement>('textbox', { name: en.prompt })
    await act(() => fireEvent.input(prompt, { target: { value: 'Temporary guidance.' } }))
    await act(() => fireEvent.click(screen.getByRole('button', { name: en.resetPrompt })))
    expect(prompt.value).not.toBe('Temporary guidance.')
    const unit = screen.getByRole('combobox', { name: 'Unit 2' })
    await act(() => fireEvent.input(unit, { target: { value: 'minute' } }))
    await act(() => fireEvent.input(unit, { target: { value: 'hour' } }))
    const second = screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Period 2' })
    await act(() => fireEvent.input(second, { target: { value: '2' } }))
    expect(second.value).toBe('2')
    await act(() => fireEvent.click(screen.getByRole('button', { name: /^4h/ })))
    await act(() => fireEvent.click(screen.getByRole('button', { name: 'Delete level 1' })))
    expect(screen.getByRole('heading', { name: 'Level 2 · 4h Additional instructions' })).toBeTruthy()
    await act(() => fireEvent.click(screen.getByRole('button', { name: 'Delete level 2' })))
    expect(screen.getByRole('heading', { name: en.globalPrompt })).toBeTruthy()
  })
  it('keeps a custom prompt when deleting a different hierarchy level', async () => {
    const save = vi.fn().mockResolvedValue(true)
    const source = liveConfig(Config({ summaryPrompt: accepted.summaryPrompt, levelPrompts: ['', 'Keep this first-level prompt.'] }))
    await (async () => {
      const mounted = render(h(Fixture, { 'save': save, 'source': source }))
      await act(() => { })
      return mounted
    })()
    await act(() => fireEvent.click(screen.getByRole('button', { name: 'Delete level 3' })))
    await act(() => fireEvent.click(saveButton()))
    await waitFor(() => {
      expect(save).toHaveBeenCalledWith({ ...value, periods: [900000, 3600000], levelPrompts: ['', 'Keep this first-level prompt.'] }, 9)
    })
  })
  it('keeps the global prompt and adds independent instructions for every level, including the first', async () => {
    const save = vi.fn().mockResolvedValue(false)
    await (async () => {
      const mounted = render(h(Fixture, { 'save': save }))
      await act(() => { })
      return mounted
    })()
    expect(screen.getByRole('button', { name: /^4h/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^15m/ })).toBeTruthy()
    await act(() => fireEvent.input(screen.getByRole('textbox', { name: 'Report instructions' }), {
      target: { value: 'Global progress instructions.' },
    }))
    await act(() => fireEvent.click(screen.getByRole('button', { name: /^15m/ })))
    await act(() => fireEvent.input(screen.getByRole('textbox', { name: 'Report instructions' }), {
      target: { value: 'First-level details.' },
    }))
    await act(() => fireEvent.click(screen.getByRole('button', { name: /^1h/ })))
    expect(screen.getByRole('heading', { name: 'Level 2 · 1h Additional instructions' })).toBeTruthy()
    await act(() => fireEvent.input(screen.getByRole('textbox', { name: 'Report instructions' }), {
      target: { value: 'Combine child results.' },
    }))
    await act(() => fireEvent.click(saveButton()))
    await waitFor(() => {
      expect(save).toHaveBeenCalledWith({
        ...value,
        summaryPrompt: 'Global progress instructions.',
        levelPrompts: ['First-level details.', 'Combine child results.', ''],
      }, 9)
    })
    await act(() => fireEvent.click(screen.getByRole('button', { name: 'Restore default' })))
    await act(() => fireEvent.click(screen.getByRole('button', { name: /Instructions for all levels/ })))
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Report instructions' }).value).toBe('Global progress instructions.')
  })
  it('offers Follow app and precision choices, retaining drafts after a refused write', async () => {
    const save = vi.fn().mockResolvedValue(false)
    await (async () => {
      const mounted = render(h(Fixture, { 'save': save }))
      await act(() => { })
      return mounted
    })()
    expect(screen.queryByLabelText(/Visible history/)).toBeNull()
    const language = screen.getByRole('combobox', { name: 'Task and report language' })
    expect((language as HTMLSelectElement).value).toBe('ui')
    expect(within(language)
      .getAllByRole('option')
      .map(option => option.textContent)).toEqual([
      'Follow app',
      'English',
      '简体中文',
      '日本語',
      'Español',
      'Français',
      'Deutsch',
      'Русский',
      'Português (Brasil)',
    ])
    await act(() => fireEvent.input(language, { target: { value: 'ui' } }))
    await act(() => fireEvent.input(screen.getByRole('combobox', { name: 'Progress decimal places' }), {
      target: { value: '3' },
    }))
    await act(() => fireEvent.input(screen.getByRole('textbox', { name: 'Report instructions' }), { target: { value: '' } }))
    expect(saveButton().disabled).toBe(true)
    await act(() => fireEvent.input(screen.getByRole('textbox', { name: 'Report instructions' }), {
      target: { value: 'Keep this draft.' },
    }))
    await act(() => fireEvent.click(saveButton()))
    expect(await screen.findByText(en.saveFailed)).toBeTruthy()
    expect(save).toHaveBeenCalledWith({ ...value, language: 'ui', progressDecimals: 3, summaryPrompt: 'Keep this draft.' }, 9)
    await act(() => fireEvent.click(screen.getByRole('button', { name: 'Discard' })))
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Report instructions' }).value).toBe(value.summaryPrompt)
  })
  it('rejects sub-minute, equal, or descending periods and accepts non-multiples in either unit', async () => {
    const save = vi.fn().mockResolvedValue(true)
    await (async () => {
      const mounted = render(h(Fixture, { 'save': save }))
      await act(() => { })
      return mounted
    })()
    const first = screen.getByRole('spinbutton', { name: 'Period 1' })
    await act(() => fireEvent.input(first, { target: { value: '0' } }))
    expect(saveButton().disabled).toBe(true)
    await act(() => fireEvent.input(first, { target: { value: '10' } }))
    await act(() => fireEvent.input(screen.getByRole('combobox', { name: 'Unit 2' }), { target: { value: 'minute' } }))
    const second = screen.getByRole('spinbutton', { name: 'Period 2' })
    expect((second as HTMLInputElement).value).toBe('60')
    for (const period of ['10', '9']) {
      await act(() => fireEvent.input(second, { target: { value: period } }))
      expect(saveButton().disabled).toBe(true)
    }
    await act(() => fireEvent.input(second, { target: { value: '25' } }))
    expect(saveButton().disabled).toBe(false)
    await act(() => fireEvent.click(saveButton()))
    await waitFor(() => {
      expect(save).toHaveBeenCalledWith({ ...value, periods: [600000, 1500000, 14400000] }, 9)
    })
  })
  it('adds a level through the dashed card and deletes any level with its prompt', async () => {
    await (async () => {
      const mounted = render(h(Fixture, { 'save': vi.fn().mockResolvedValue(false) }))
      await act(() => { })
      return mounted
    })()
    await act(() => fireEvent.click(screen.getByRole('button', { name: 'Add level' })))
    expect(screen.getByRole('button', { name: /^8h/ })).toBeTruthy()
    await act(() => fireEvent.input(screen.getByRole('textbox', { name: 'Report instructions' }), {
      target: { value: 'Retain this last prompt.' },
    }))
    await act(() => fireEvent.click(screen.getByRole('button', { name: 'Delete level 2' })))
    expect(screen.queryByRole('button', { name: /^1h/ })).toBeNull()
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Report instructions' }).value).toBe('Retain this last prompt.')
  })
  it('offers the seven-day level when doubling the last period would exceed the limit', async () => {
    const day = HISTORY_MS / 7
    const source = liveConfig(Config({ intervalMs: day, rollupFactors: [5] }))
    const save = vi.fn().mockResolvedValue(true)
    await (async () => {
      const mounted = render(h(Fixture, { 'save': save, 'source': source }))
      await act(() => { })
      return mounted
    })()
    const add = screen.getByRole<HTMLButtonElement>('button', { name: en.addLevel })
    expect(add.disabled).toBe(false)
    await act(() => fireEvent.click(add))
    expect(add.disabled).toBe(true)
    await act(() => fireEvent.click(saveButton()))
    await waitFor(() => {
      expect(save.mock.calls[0]?.[0]).toMatchObject({ periods: [day, 5 * day, HISTORY_MS] })
    })
  })
})
