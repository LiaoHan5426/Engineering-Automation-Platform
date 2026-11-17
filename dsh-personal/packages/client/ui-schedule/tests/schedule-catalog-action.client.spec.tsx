// @vitest-environment jsdom
import { liveFixtureProps } from './vue-render.client.ts'
import { h as vueH, Fragment, computed, defineComponent, shallowRef } from 'vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, cleanup, fireEvent, render, screen, within } from './vue-render.client.ts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionSnapshot } from '@deepseek-ai/dsh-api-session-controller/client'
import type {
  ScheduleRecord,
  ScheduleCatalogEntry,
  ScheduleId,
} from '@deepseek-ai/dsh-schedule/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  formatScheduleAbsolute,
  formatScheduleFrequency,
  formatScheduleRelative,
  orderScheduleRecords,
  zoneLabel,
  type FrequencyTranslator,
} from '../src/client/schedule-format.ts'
import {
  ScheduleCatalogAction as NativeScheduleCatalogAction,
  type ScheduleCatalogActionProps,
} from '../src/client/ScheduleCatalogAction.tsx'
import type { CatalogSnapshot } from '../src/client/catalog-source.ts'
import { en, zh } from '../src/client/locales.ts'
import catalogCss from '../src/client/ScheduleCatalogAction.module.css'
import { en as managerEn, zh as managerZh } from '../src/client/task-manager-locales.ts'
import { brandString } from '@deepseek-ai/dsh-brand'
const SESSION = 'schedule-session' as SessionId
const START = Date.parse('2026-08-25T12:00:00.000Z')
const CREATED = '2026-08-24T12:00:00.000Z'
type Entry = ScheduleCatalogEntry
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(START)
  document.documentElement.lang = 'en'
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})
/** One Session-bound rule record, which the frequency formatter reads for a rule that predates Host tasks. */
function record(
  id: string,
  kind: ScheduleRecord['kind'],
  scheduledAt: number,
  options: {
    prompt?: string
    title?: string
    everySeconds?: number
    time?: string
    timeZone?: string
    weekdays?: number[]
    expression?: string
  } = {},
): ScheduleRecord {
  const prompt = options.prompt ?? id
  const common = {
    id: brandString<ScheduleId>(id),
    kind,
    title: options.title ?? prompt,
    prompt,
    scheduledAt: new Date(scheduledAt).toISOString(),
  }
  if (kind === 'after') return { ...common, kind, afterSeconds: 30 }
  if (kind === 'every') return { ...common, kind, everySeconds: options.everySeconds ?? 300 }
  if (kind === 'daily')
    return {
      ...common,
      kind,
      time: options.time ?? '23:00:00.000',
      timeZone: options.timeZone ?? 'Asia/Shanghai',
    }
  if (kind === 'weekly') {
    return {
      ...common,
      kind,
      time: options.time ?? '23:00:00.000',
      timeZone: options.timeZone ?? 'Asia/Shanghai',
      weekdays: options.weekdays ?? [1],
    }
  }
  if (kind === 'cron') {
    return {
      ...common,
      kind,
      expression: options.expression ?? '0 9 * * 1-5',
      timeZone: options.timeZone ?? 'Asia/Shanghai',
    }
  }
  return { ...common, kind: 'at' }
}
/**
 * One Host task that the Session catalog lists.
 * @param id - task identity, also the default name and instruction.
 * @param scheduledAt - next run in epoch milliseconds.
 * @param options - stored instruction, name, and rule; the rule defaults to one run at `scheduledAt`.
 * @returns the active catalog entry delivered to this Session.
 */
function entry(
  id: string,
  scheduledAt: number,
  options: {
    prompt?: string
    title?: string
    rrule?: string
  } = {},
): Entry {
  const prompt = options.prompt ?? id
  const instant = new Date(scheduledAt).toISOString()
  return {
    kind: 'rrule',
    id: brandString<ScheduleId>(id),
    title: options.title ?? prompt,
    prompt,
    scheduledAt: instant,
    rrule:
      options.rrule ??
      `DTSTART;TZID=UTC:${instant.replace(/[-:]|\.\d{3}Z$/g, '')}\nRRULE:FREQ=DAILY;COUNT=1`,
    target: { kind: 'session', sessionId: SESSION },
    involvedSessionIds: [SESSION],
    status: 'active',
    createdAt: CREATED,
    updatedAt: CREATED,
  }
}
/**
 * One Session snapshot for the stub.
 * @param openState - whether the Session is open, cold, or archived.
 * @returns the snapshot the component's selector reads.
 */
function sessionSnapshot(openState: SessionSnapshot['openState']): SessionSnapshot {
  return {
    sessionId: SESSION,
    pendingSubmissions: [],
    running: false,
    subagent: null,
    removed: false,
    openState,
    openError: null,
    hasMore: false,
    loadingOlder: false,
    historyLoadStatus: 'idle',
    historyWasPartial: false,
    promptError: null,
    blank: false,
    lastAgentError: null,
    promptAttempted: false,
    awaitingFirstTurn: false,
  }
}
function props(
  records: readonly Entry[] | undefined,
  openState: SessionSnapshot['openState'] = 'open',
  dictionary: typeof zh | typeof en = en,
  allowed = true,
): ScheduleCatalogActionProps {
  const snapshot = sessionSnapshot(openState)
  const useSession = <T,>(select: (value: SessionSnapshot) => T) =>
    computed(() => select(snapshot))
  // A settled read reports ordinal 1; a read that has not settled yet reports 0.
  const state: CatalogSnapshot<Entry> = {
    records: records ?? [],
    status: records === undefined ? 'loading' : 'ready',
    deleting: [],
    settled: records !== undefined,
    readRequest: records === undefined ? 0 : 1,
    readSettled: records === undefined ? 0 : 1,
  }
  const useCatalog = <T,>(select: (value: CatalogSnapshot<Entry>) => T) =>
    computed(() => select(state))
  return {
    sessionId: SESSION,
    useSession,
    useAccess: vi.fn((_action: string) => computed(() => allowed)),
    useCatalog,
    onDelete: vi.fn(async () => {}),
    onRetry: vi.fn(async () => {}),
    openTaskDetail: vi.fn(),
    t: makeTranslate(dictionary),
  } as ScheduleCatalogActionProps
}
function titles(): string[] {
  return within(screen.getByRole('list', { name: en['list.aria'] }))
    .getAllByRole('listitem')
    .map(item => item.querySelector('[class*="title"]')?.textContent ?? '')
}
/** Metadata line element of every rendered row. */
function metadataLines(): Element[] {
  return screen.getAllByRole('listitem').map(row => row.querySelector('[class*="metadata"]')!)
}
describe('ScheduleCatalogAction visibility', () => {
  it("renders nothing and reads no catalog while the current Peer may not list this Session's reminders", () => {
    const refused = props([entry('active', START + 60000)], 'open', en, false)
    let catalogReads = 0
    const useCatalog: ScheduleCatalogActionProps['useCatalog'] = (select) => {
      catalogReads++
      return refused.useCatalog(select)
    }
    const view = render(vueH(ScheduleCatalogAction, { ...refused, useCatalog: useCatalog }))
    expect(view.container.children.length).toBe(0)
    expect(refused.useAccess).toHaveBeenCalledWith('schedule/list')
    expect(catalogReads).toBe(0)
  })
  it('hides the entry once a successful read proves there are no active reminders', async () => {
    const active = [entry('active', START + 60000)]
    const view = render(vueH(ScheduleCatalogAction, { ...props(active, 'cold') }))
    expect(view.container.children.length).toBe(0)
    await view.rerender(vueH(ScheduleCatalogAction, { ...props(active) }))
    expect(screen.getByRole('button', { name: '1 automation task' })).toBeDefined()
    await view.rerender(vueH(ScheduleCatalogAction, { ...props([]) }))
    expect(view.container.children.length).toBe(0)
  })
  it('hides the entry and its open list when the last record disappears', async () => {
    const active = [entry('active', START + 60000), entry('next', START + 120000)]
    const view = render(vueH(ScheduleCatalogAction, { ...props(active) }))
    await fireEvent.click(screen.getByRole('button', { name: '2 automation tasks' }))
    expect(screen.getByRole('list', { name: en['list.aria'] })).toBeDefined()
    await view.rerender(vueH(ScheduleCatalogAction, { ...props([]) }))
    expect(view.container.children.length).toBe(0)
  })
  it('renders nothing until a read answers, then distinguishes loading and failure', async () => {
    // The first read must not mount a chip that an empty answer then removes.
    const first = render(vueH(ScheduleCatalogAction, { ...props(undefined) }))
    expect(first.container.children.length).toBe(0)
    // A refresh retains the known reminders, so the entry keeps its count and
    // its loading row stays visible.
    const known = entry('known', START + 60000)
    const p = props([known])
    const view = render(
      vueH(ScheduleCatalogAction, {
        ...p,
        useCatalog: select =>
          computed(() =>
            select({
              records: [known],
              status: 'loading',
              deleting: [],
              settled: true,
              readRequest: 0,
              readSettled: 0,
            }),
          ),
      }),
    )
    await fireEvent.click(screen.getByRole('button', { name: '1 automation task' }))
    expect(screen.getByRole('status').textContent).toBe(en['list.loading'])
    // A failed read with nothing known keeps the entry, and the open popover
    // replaces its loading row with the retry.
    await view.rerender(
      vueH(ScheduleCatalogAction, {
        ...p,
        useCatalog: select =>
          computed(() =>
            select({
              records: [],
              status: 'error',
              deleting: [],
              settled: false,
              readRequest: 0,
              readSettled: 0,
            }),
          ),
      }),
    )
    expect(screen.getByRole('alert').textContent).toBe(en['list.error'])
    await fireEvent.click(screen.getByRole('button', { name: en['list.retry'] }))
    expect(p.onRetry).toHaveBeenCalledOnce()
  })
  it('keeps the known count and the loading row while a refresh is in flight', async () => {
    // A `schedule/changed` refresh republishes `loading` while retaining the
    // rows, so the entry must keep naming the count it still lists instead of
    // falling back to the generic label for the length of the read.
    const only = entry('only', START + 60000)
    const state: CatalogSnapshot<Entry> = {
      records: [only],
      status: 'ready',
      deleting: [],
      settled: true,
      readRequest: 0,
      readSettled: 0,
    }
    const p = props(undefined)
    const view = render(
      vueH(ScheduleCatalogAction, { ...p, useCatalog: select => computed(() => select(state)) }),
    )
    expect(screen.getByRole('button', { name: '1 automation task' })).toBeDefined()
    await view.rerender(
      vueH(ScheduleCatalogAction, {
        ...p,
        useCatalog: select => computed(() => select({ ...state, status: 'loading' })),
      }),
    )
    const trigger = screen.getByRole('button', { name: '1 automation task' })
    expect(screen.queryByRole('button', { name: en['trigger.label'] })).toBeNull()
    await fireEvent.click(trigger)
    expect(screen.getByRole('status').textContent).toBe(en['list.loading'])
    expect(
      within(screen.getByRole('list', { name: en['list.aria'] })).getAllByRole('listitem'),
    ).toHaveLength(1)
    // Two known records keep their plural count through the same refresh.
    const second = entry('second', START + 120000)
    await view.rerender(
      vueH(ScheduleCatalogAction, {
        ...p,
        useCatalog: select =>
          computed(() =>
            select({
              records: [only, second],
              status: 'loading',
              deleting: [],
              settled: true,
              readRequest: 0,
              readSettled: 0,
            }),
          ),
      }),
    )
    expect(screen.getByRole('button', { name: '2 automation tasks' })).toBeDefined()
  })
  it('deletes only the selected reminder and marks the pending row', async () => {
    const row = entry('selected', START + 60000)
    const other = entry('other', START + 120000)
    const p = props([row, other])
    const view = render(vueH(ScheduleCatalogAction, { ...p }))
    await fireEvent.click(screen.getByRole('button', { name: '2 automation tasks' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Delete automation task: selected' }))
    expect(p.onDelete).toHaveBeenCalledWith(row.id)
    // A failed deletion keeps the row; the app-wide toast, not this popover, announces it.
    await view.rerender(
      vueH(ScheduleCatalogAction, {
        ...p,
        useCatalog: select =>
          computed(() =>
            select({
              records: [row],
              status: 'ready',
              deleting: [],
              settled: true,
              readRequest: 0,
              readSettled: 0,
            }),
          ),
      }),
    )
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('selected')).toBeDefined()
    await view.rerender(
      vueH(ScheduleCatalogAction, {
        ...p,
        useCatalog: select =>
          computed(() =>
            select({
              records: [row],
              status: 'ready',
              deleting: [row.id],
              settled: true,
              readRequest: 0,
              readSettled: 0,
            }),
          ),
      }),
    )
    const pending = screen.getByRole('button', { name: 'Delete automation task: selected' })
    expect(pending.hasAttribute('disabled')).toBe(true)
    // The icon-only delete button keeps its action copy as the tooltip.
    expect(pending.getAttribute('title')).toBe(en['delete.pending'])
    await view.rerender(vueH(ScheduleCatalogAction, { ...props([row], 'error') }))
    expect(screen.queryByRole('list')).toBeNull()
  })
})
describe('ScheduleCatalogAction positioning', () => {
  it('keeps DOM refs owned while opening and refreshing the catalog before a parent resize', async () => {
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const initial = props([entry('active', START + 60000), entry('next', START + 120000)])
    const catalog = shallowRef<CatalogSnapshot<Entry>>({
      records: [entry('active', START + 60000), entry('next', START + 120000)],
      status: 'ready',
      deleting: [],
      settled: true,
      readRequest: 1,
      readSettled: 1,
    })
    const narrow = shallowRef(false)
    const Parent = defineComponent(
      () => () =>
        vueH('section', { style: { width: narrow.value ? '360px' : '900px' } }, [
          vueH(NativeScheduleCatalogAction, {
            ...initial,
            useCatalog: select => computed(() => select(catalog.value)),
          }),
        ]),
    )
    const view = render(vueH(Parent))
    const trigger = screen.getByRole('button', { name: '2 automation tasks' })
    await fireEvent.click(trigger)
    await act(() => {
      catalog.value = {
        ...catalog.value,
        records: [...catalog.value.records, entry('third', START + 180000)],
      }
      narrow.value = true
    })
    expect(screen.getByRole('list', { name: en['list.aria'] }).parentElement).toBe(document.body)
    expect(screen.getByRole('button', { name: '3 automation tasks' })).toBe(trigger)
    screen.getByRole('button', { name: initial.t('list.open', { title: 'third' }) }).focus()
    await fireEvent.keyDown(screen.getByRole('list', { name: en['list.aria'] }), { key: 'Escape' })
    expect(screen.queryByRole('list', { name: en['list.aria'] })).toBeNull()
    expect(document.activeElement).toBe(trigger)
    view.unmount()
    expect(warnings.mock.calls.flat().join('\n')).not.toContain('Missing ref owner context')
  })
  it('portals the catalog to the body and binds it to the trigger CSS anchor', async () => {
    const active = [entry('active', START + 60000), entry('next', START + 120000)]
    const view = render(vueH(ScheduleCatalogAction, { ...props(active) }))
    const trigger = screen.getByRole('button', { name: '2 automation tasks' })
    const measure = vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      x: 240,
      y: 20,
      left: 240,
      right: 320,
      top: 20,
      bottom: 48,
      width: 80,
      height: 28,
      toJSON: () => ({}),
    })
    await fireEvent.click(trigger)
    const catalog = screen.getByRole('list', { name: en['list.aria'] })
    expect(view.container.contains(catalog)).toBe(false)
    expect(catalog.parentElement).toBe(document.body)
    expect(trigger.style.anchorName).not.toBe('')
    expect(catalog.style.positionAnchor).toBe(trigger.style.anchorName)
    expect(catalog.style.left).toBe('')
    expect(catalog.style.top).toBe('')
    expect(measure).not.toHaveBeenCalled()
    expect(catalog.style.visibility).toBe('')
  })
})
describe('ScheduleCatalogAction task reveal', () => {
  it('keeps only this Session’s active tasks from the shared catalog', async () => {
    const only = entry('only', START + 60000)
    const otherSession = 'other-session' as SessionId
    const p = props([
      only,
      {
        ...entry('other', START + 60000),
        target: { kind: 'session', sessionId: otherSession },
        involvedSessionIds: [otherSession],
      },
      { ...entry('paused', START + 60000), status: 'paused' },
      { ...entry('ended', START + 60000), status: 'ended' },
    ])
    render(vueH(ScheduleCatalogAction, { ...p }))
    await fireEvent.click(screen.getByRole('button', { name: '1 automation task' }))
    expect(p.openTaskDetail).toHaveBeenCalledExactlyOnceWith(only.id)
    expect(screen.queryByRole('list')).toBeNull()
  })
  it('opens the sole reminder detail directly without rendering the list', async () => {
    const only = entry('only', START + 60000)
    const p = props([only])
    render(vueH(ScheduleCatalogAction, { ...p }))
    const trigger = screen.getByRole('button', { name: '1 automation task' })
    // A sole reminder has no list to choose from, so the trigger keeps only the clock glyph
    // and states no disclosure: the press opens the detail instead of expanding a list.
    expect(trigger.getAttribute('data-schedule-reminder-entry')).toBe('')
    expect(trigger.querySelectorAll('svg')).toHaveLength(1)
    expect(trigger.textContent).toBe('')
    expect(trigger.hasAttribute('aria-expanded')).toBe(false)
    await fireEvent.click(trigger)
    expect(p.openTaskDetail).toHaveBeenCalledExactlyOnceWith(only.id)
    expect(screen.queryByRole('list')).toBeNull()
    expect(trigger.hasAttribute('aria-expanded')).toBe(false)
  })
  it('renders the list for two or more reminders and nothing for none', async () => {
    const empty = render(vueH(ScheduleCatalogAction, { ...props([]) }))
    expect(empty.container.children.length).toBe(0)
    const many = [entry('first', START + 60000), entry('second', START + 120000)]
    await empty.rerender(vueH(ScheduleCatalogAction, { ...props(many) }))
    // Icon-only: one clock glyph, no count chip, and no chevron.
    const trigger = screen.getByRole('button', { name: '2 automation tasks' })
    expect(trigger.querySelectorAll('svg')).toHaveLength(1)
    expect(trigger.textContent).toBe('')
    await fireEvent.click(trigger)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })
  it('keeps the known count while a read is unresolved and names the entry with it', async () => {
    const known = entry('known', START + 60000)
    const p = props([known])
    render(
      vueH(ScheduleCatalogAction, {
        ...p,
        useCatalog: select =>
          computed(() =>
            select({
              records: [known],
              status: 'loading',
              deleting: [],
              settled: true,
              readRequest: 0,
              readSettled: 0,
            }),
          ),
      }),
    )
    // The retained record supplies the count, so the icon-only entry names it
    // instead of falling back to the catalog label.
    const trigger = screen.getByRole('button', { name: '1 automation task' })
    expect(trigger.textContent).toBe('')
    await fireEvent.click(trigger)
    expect(screen.getByRole('status').textContent).toBe(en['list.loading'])
    expect(
      within(screen.getByRole('list', { name: en['list.aria'] })).getAllByRole('listitem'),
    ).toHaveLength(1)
  })
  it('opens one row task from its prompt button and closes the list', async () => {
    const first = entry('first', START + 60000, { prompt: 'First reminder' })
    const second = entry('second', START + 120000, { prompt: 'Second reminder' })
    const p = props([first, second])
    render(vueH(ScheduleCatalogAction, { ...p }))
    await fireEvent.click(screen.getByRole('button', { name: '2 automation tasks' }))
    const list = screen.getByRole('list', { name: en['list.aria'] })
    await fireEvent.click(
      within(list).getByRole('button', { name: 'Open automation task details: Second reminder' }),
    )
    expect(p.openTaskDetail).toHaveBeenCalledExactlyOnceWith(second.id)
    expect(screen.queryByRole('list')).toBeNull()
  })
})
describe('ScheduleCatalogAction rows', () => {
  it('shows the stored title, a frequency line above its own next-run line, and deletion with overdue records first', async () => {
    const rawPrompt =
      '<img src=x onerror=alert(1)> Keep the complete long reminder prompt visible without truncation.'
    const storedTitle = '<img src=x onerror=alert(1)> Review the rollout'
    const overdue = entry('hidden-id', START - 60000, { prompt: rawPrompt, title: storedTitle })
    const every = entry('every-id', START + 300000, {
      prompt: 'Check metrics',
      rrule: 'DTSTART;TZID=UTC:20260825T120500\nRRULE:FREQ=MINUTELY;INTERVAL=5',
    })
    const at = entry('at-id', START + 3600000, { prompt: 'Join meeting' })
    render(vueH(ScheduleCatalogAction, { ...props([at, every, overdue]) }))
    await fireEvent.click(screen.getByRole('button'))
    expect(titles()).toEqual([storedTitle, 'Check metrics', 'Join meeting'])
    const rows = screen.getAllByRole('listitem')
    // The row anatomy: the stored title as the only primary line, exactly one
    // metadata line, and the trash action's glyph as the row's only svg.
    expect(rows.every(row => row.querySelectorAll('svg').length === 1)).toBe(true)
    const frequencyLines = metadataLines()
    const lines = screen
      .getAllByRole('listitem')
      .map(row => row.querySelector<HTMLElement>(`.${catalogCss.nextRun}`)!)
    // The frequency keeps its own line, and the next target states a second one:
    // the label, the absolute stamp, and the parenthesized distance.
    expect(frequencyLines.every(line => line.children.length === 1)).toBe(true)
    expect(lines.every(line => line.children.length === 3)).toBe(true)
    expect(screen.getByRole('list').textContent).not.toContain('·')
    expect(rows[0]?.textContent).toContain('Once')
    expect(rows[1]?.textContent).toContain('Every 5 minutes')
    expect(rows[2]?.textContent).toContain('Once')
    // The metadata line states how long remains, not a clock time: the fake
    // clock in this suite fixes the distance from each stored instant.
    expect(lines[0]?.textContent).toContain(en['list.nextRun'])
    expect(lines[0]?.textContent).toContain('1 minute overdue')
    expect(lines[1]?.textContent).toContain(en['list.nextRun'])
    expect(lines[1]?.textContent).toContain('in 5 minutes')
    expect(lines[2]?.textContent).toContain(
      formatScheduleRelative(at.scheduledAt, START, makeTranslate(en)),
    )
    expect(lines[2]?.textContent).toContain('in 1 hour')
    // The line states the local stamp now, and the distance sits in parentheses
    // beside it.
    expect(lines.every(line => /\d{1,2}:\d{2}/.test(line.textContent ?? ''))).toBe(true)
    for (const [line, task] of [
      [lines[0]!, overdue],
      [lines[1]!, every],
      [lines[2]!, at],
    ] as const) {
      const stamp = line.querySelector('time')
      expect(stamp?.dateTime).toBe(task.scheduledAt)
      expect(stamp?.textContent).toBe(formatScheduleAbsolute(task.scheduledAt, en['time.locale']))
      const relative = line.querySelector<HTMLElement>(`.${catalogCss.nextRunRelative}`)
      expect(relative?.textContent).toBe(
        `(${formatScheduleRelative(task.scheduledAt, START, makeTranslate(en))})`,
      )
    }
    // Both surfaces read the whole next-run line in one color: the popover's
    // countdown declares no ink of its own and the Tasks page row inherits.
    const declared = (source: string): string =>
      /\.nextRunRelative\s*\{([^}]*)\}/.exec(source)?.[1] ?? ''
    const popoverCss = readFileSync(
      resolve(import.meta.dirname, '../src/client/ScheduleCatalogAction.module.css'),
      'utf8',
    )
    const listCss = readFileSync(
      resolve(import.meta.dirname, '../src/client/TaskManagerPage.module.css'),
      'utf8',
    )
    expect(declared(popoverCss)).not.toMatch(/color:/)
    expect(declared(listCss)).toMatch(/color:\s*inherit;/)
    // The retired status row is gone: its words no longer render anywhere.
    const text = screen.getByRole('list').textContent ?? ''
    expect(text).not.toContain('Scheduled')
    expect(text).not.toContain('Overdue')
    // The row is named by the stored title, never by the instruction.
    expect(text).not.toContain(rawPrompt)
    // Overdue stays distinguishable, now through the metadata line rather than
    // a status word.
    expect(metadataLines()[0]?.className).toContain('metadataOverdue')
    expect(metadataLines()[1]?.className).not.toContain('metadataOverdue')
    expect(metadataLines()[2]?.className).not.toContain('metadataOverdue')
    expect(document.querySelector('img')).toBeNull()
    expect(text).not.toContain('hidden-id')
    expect(text).not.toContain(overdue.scheduledAt)
    expect(text).not.toMatch(/Retry|Details/)
    // Each row carries its detail opener and the delete action.
    expect(within(screen.getByRole('list')).queryAllByRole('button')).toHaveLength(6)
    expect(rows.every(row => row.tabIndex === -1)).toBe(true)
  })
  it('renders exact recurring units without rounding and localizes both dictionaries', () => {
    const tEn = makeTranslate(en)
    const tZh = makeTranslate(zh)
    const samples = [
      [86400, 'Every 1 day', '1天一次'],
      [172800, 'Every 2 days', '2天一次'],
      [3600, 'Every 1 hour', '1小时一次'],
      [7200, 'Every 2 hours', '2小时一次'],
      [300, 'Every 5 minutes', '5分钟一次'],
      [301, 'Every 301 seconds', '301秒一次'],
    ] as const
    for (const [seconds, english, chinese] of samples) {
      const item = record(String(seconds), 'every', START + 1000, { everySeconds: seconds })
      expect(formatScheduleFrequency(item, tEn)).toBe(english)
      expect(formatScheduleFrequency(item, tZh)).toBe(chinese)
    }
    const frequency: FrequencyTranslator = tEn
    for (const kind of ['at', 'after'] as const) {
      const once = record(`once-${kind}`, kind, START + 1000)
      expect(formatScheduleFrequency(once, frequency)).toBe('Once')
      expect(formatScheduleFrequency(once, tZh)).toBe('单次')
    }
    expect(tZh('list.nextRun')).toBe('下次运行')
  })
  it.each([
    ['23:00:00.000', '23:00'],
    ['23:00:15.000', '23:00:15'],
    ['23:00:00.125', '23:00'],
    ['23:00:15.500', '23:00:15'],
  ])('trims fractional and zero seconds off a daily rule clock: %s', (time, displayed) => {
    const item = record('daily-clock', 'daily', START + 3600000, {
      time,
      timeZone: 'America/New_York',
    })
    expect(formatScheduleFrequency(item, makeTranslate(en))).toBe(
      `Daily at ${displayed} (${zoneLabel('America/New_York', makeTranslate(managerEn))})`,
    )
    expect(formatScheduleFrequency(item, makeTranslate(zh))).toBe(
      `每天 ${displayed}（${zoneLabel('America/New_York', makeTranslate(managerZh))}）`,
    )
  })
  it('labels a weekly rule with its localized weekday set, clock, and zone', () => {
    const item = record('weekly-clock', 'weekly', START + 3600000, {
      time: '09:00:00.000',
      timeZone: 'Asia/Shanghai',
      weekdays: [1, 3],
    })
    expect(formatScheduleFrequency(item, makeTranslate(en))).toBe(
      `Weekly on Mon, Wed at 09:00 (${zoneLabel('Asia/Shanghai', makeTranslate(managerEn))})`,
    )
    expect(formatScheduleFrequency(item, makeTranslate(zh))).toBe(
      `每周一、三 09:00（${zoneLabel('Asia/Shanghai', makeTranslate(managerZh))}）`,
    )
  })
  it('labels a weekly rule with whole seconds and for a single weekday', () => {
    const seconds = record('weekly-seconds', 'weekly', START + 3600000, {
      time: '09:00:15.000',
      timeZone: 'UTC',
      weekdays: [7],
    })
    expect(formatScheduleFrequency(seconds, makeTranslate(en))).toBe(
      'Weekly on Sun at 09:00:15 (UTC+00:00)',
    )
    expect(formatScheduleFrequency(seconds, makeTranslate(zh))).toBe(
      '每周日 09:00:15（UTC+00:00）',
    )
    const milliseconds = record('weekly-milliseconds', 'weekly', START + 3600000, {
      time: '09:00:00.125',
      timeZone: 'UTC',
      weekdays: [1, 2, 3, 4, 5, 6, 7],
    })
    expect(formatScheduleFrequency(milliseconds, makeTranslate(en))).toBe(
      'Weekly on Mon, Tue, Wed, Thu, Fri, Sat, Sun at 09:00 (UTC+00:00)',
    )
    expect(formatScheduleFrequency(milliseconds, makeTranslate(zh))).toBe(
      '每周一、二、三、四、五、六、日 09:00（UTC+00:00）',
    )
  })
  it('labels a cron rule with its described sentence and zone', () => {
    const item = record('cron-clock', 'cron', START + 3600000, {
      expression: '0 9 * * 1-5',
      timeZone: 'America/New_York',
    })
    expect(formatScheduleFrequency(item, makeTranslate(en))).toBe(
      `Mon–Fri at 09:00 (${zoneLabel('America/New_York', makeTranslate(managerEn))})`,
    )
    expect(formatScheduleFrequency(item, makeTranslate(zh))).toBe(
      `周一至周五 09:00（${zoneLabel('America/New_York', makeTranslate(managerZh))}）`,
    )
  })
  it('omits a cron rule zone equal to the host zone and names another zone', () => {
    const item = record('cron-zone', 'cron', START + 3600000, {
      expression: '*/15 * * * *',
      timeZone: 'Asia/Shanghai',
    })
    const t = makeTranslate(en)
    const named = makeTranslate(managerEn)
    expect(
      formatScheduleFrequency(item, t, {
        system: 'Asia/Shanghai',
        label: zone => zoneLabel(zone, named),
      }),
    ).toBe('Every 15 minutes')
    expect(
      formatScheduleFrequency(item, t, { system: 'UTC', label: zone => zoneLabel(zone, named) }),
    ).toBe(`Every 15 minutes (${zoneLabel('Asia/Shanghai', named)})`)
    expect(
      formatScheduleFrequency(item, makeTranslate(zh), {
        system: 'UTC',
        label: zone => zoneLabel(zone, makeTranslate(managerZh)),
      }),
    ).toBe(`每 15 分钟（${zoneLabel('Asia/Shanghai', makeTranslate(managerZh))}）`)
  })
  it('labels a rule this parser cannot describe as Custom', () => {
    const item = record('cron-raw', 'cron', START + 3600000, {
      expression: '0 9 * * MON',
      timeZone: 'Asia/Shanghai',
    })
    const t = makeTranslate(en)
    const named = makeTranslate(managerEn)
    expect(formatScheduleFrequency(item, t)).toBe(`Custom (${zoneLabel('Asia/Shanghai', named)})`)
    expect(
      formatScheduleFrequency(item, t, {
        system: 'Asia/Shanghai',
        label: zone => zoneLabel(zone, named),
      }),
    ).toBe('Custom')
    expect(
      formatScheduleFrequency(item, t, { system: 'UTC', label: zone => zoneLabel(zone, named) }),
    ).toBe(`Custom (${zoneLabel('Asia/Shanghai', named)})`)
  })
  it('shows daily recurrence in the Session catalog rather than a one-shot label', async () => {
    const item = entry('daily-clock', START + 10800000, {
      rrule:
        'DTSTART;TZID=Asia/Shanghai:20260825T230000\nRRULE:FREQ=DAILY;INTERVAL=1;BYHOUR=23;BYMINUTE=0',
    })
    const other = entry('daily-other', START + 9000000, {
      rrule: 'DTSTART;TZID=UTC:20260825T143000\nRRULE:FREQ=DAILY;INTERVAL=1;BYHOUR=14;BYMINUTE=30',
    })
    render(vueH(ScheduleCatalogAction, { ...props([item, other]) }))
    await fireEvent.click(screen.getByRole('button', { name: '2 automation tasks' }))
    const list = screen.getByRole('list', { name: en['list.aria'] })
    expect(
      within(list).getByText(
        `Daily at 23:00 (${zoneLabel('Asia/Shanghai', makeTranslate(managerEn))})`,
        { exact: true },
      ),
    ).toBeDefined()
    expect(within(list).queryByText(en['frequency.once'], { exact: true })).toBeNull()
  })
  it('renders the time until the next run in the injected locale and updates when it changes', async () => {
    document.documentElement.lang = 'de-DE'
    const item = entry('localized', START + 3600000)
    const other = entry('localized-other', START + 7200000)
    const expected = formatScheduleRelative(item.scheduledAt, START, makeTranslate(en))
    expect(expected).toBe('in 1 hour')
    const view = render(vueH(ScheduleCatalogAction, { ...props([item, other]) }))
    await fireEvent.click(screen.getByRole('button', { name: '2 automation tasks' }))
    expect(screen.getAllByRole('listitem')[0]!.textContent).toContain(expected)
    await view.rerender(vueH(ScheduleCatalogAction, { ...props([item, other], 'open', zh) }))
    expect(screen.getAllByRole('listitem')[0]!.textContent).toContain('1小时后')
    expect(document.documentElement.lang).toBe('de-DE')
  })
  it('derives relative seconds, minutes, hours, days, and the exact due boundary', () => {
    const t = makeTranslate(en)
    expect(formatScheduleRelative(new Date(START).toISOString(), START, t)).toBe('Due now')
    expect(formatScheduleRelative(new Date(START + 500).toISOString(), START, t)).toBe(
      'in 1 second',
    )
    expect(formatScheduleRelative(new Date(START + 61000).toISOString(), START, t)).toBe(
      'in 2 minutes',
    )
    expect(formatScheduleRelative(new Date(START - 3600000).toISOString(), START, t)).toBe(
      '1 hour overdue',
    )
    expect(formatScheduleRelative(new Date(START - 172800000).toISOString(), START, t)).toBe(
      '2 days overdue',
    )
  })
  it('keeps equal targets stable and updates overdue status as the browser clock advances', async () => {
    const first = entry('first', START + 500)
    const second = entry('second', START + 500)
    expect(orderScheduleRecords([first, second], START).map(item => item.id)).toEqual([
      'first',
      'second',
    ])
    expect(
      orderScheduleRecords(
        [entry('future', START + 1000), entry('overdue', START - 1000)],
        START,
      ).map(item => item.id),
    ).toEqual(['overdue', 'future'])
    render(vueH(ScheduleCatalogAction, { ...props([first, second]) }))
    await fireEvent.click(screen.getByRole('button'))
    expect(metadataLines().every(line => !line.className.includes('metadataOverdue'))).toBe(true)
    await act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(metadataLines().every(line => line.className.includes('metadataOverdue'))).toBe(true)
  })
})
describe('ScheduleCatalogAction dismissal', () => {
  const active = [entry('active', START + 60000), entry('next', START + 120000)]
  it('closes on Escape inside the catalog and restores trigger focus', async () => {
    render(vueH(ScheduleCatalogAction, { ...props(active) }))
    const trigger = screen.getByRole('button', { name: '2 automation tasks' })
    await fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    await fireEvent.keyDown(screen.getByRole('list', { name: en['list.aria'] }), { key: 'Escape' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger)
  })
  it('leaves the catalog open when Escape belongs to a sibling control', async () => {
    render(
      vueH(Fragment, {}, [
        vueH(ScheduleCatalogAction, { ...props(active) }),
        vueH('button', { type: 'button' }, ['Sibling']),
      ]),
    )
    const trigger = screen.getByRole('button', { name: '2 automation tasks' })
    const sibling = screen.getByRole('button', { name: 'Sibling' })
    await fireEvent.click(trigger)
    sibling.focus()
    await fireEvent.keyDown(sibling, { key: 'Escape' })
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(sibling)
  })
  it('keeps a pointer press inside the portaled catalog open and dismisses outside', async () => {
    render(vueH(ScheduleCatalogAction, { ...props(active) }))
    const trigger = screen.getByRole('button')
    await fireEvent.click(trigger)
    const catalog = screen.getByRole('list', { name: en['list.aria'] })
    expect(catalog.parentElement).toBe(document.body)
    await fireEvent.pointerDown(catalog)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    await fireEvent.pointerDown(document.body)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    await fireEvent.click(trigger)
    await fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })
  it('uses native Tab navigation and Enter or Space activation', async () => {
    render(
      vueH(Fragment, {}, [
        vueH('button', { type: 'button' }, ['Before']),
        vueH(ScheduleCatalogAction, { ...props(active) }),
        vueH('button', { type: 'button' }, ['After']),
      ]),
    )
    const trigger = screen.getByRole('button', { name: '2 automation tasks' })
    const before = screen.getByRole('button', { name: 'Before' })
    const after = screen.getByRole('button', { name: 'After' })
    trigger.focus()
    expect(trigger.tabIndex).toBe(0)
    expect(await fireEvent.keyDown(trigger, { key: 'Tab' })).toBe(true)
    after.focus()
    expect(document.activeElement).toBe(after)
    trigger.focus()
    expect(await fireEvent.keyDown(trigger, { key: 'Tab', shiftKey: true })).toBe(true)
    before.focus()
    expect(document.activeElement).toBe(before)
    trigger.focus()
    expect(await fireEvent.keyDown(trigger, { key: 'Enter' })).toBe(true)
    await fireEvent.click(trigger, { detail: 0 })
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(await fireEvent.keyDown(trigger, { key: ' ', code: 'Space' })).toBe(true)
    await fireEvent.click(trigger, { detail: 0 })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })
  it('stops the clock while closed or unmounted and restarts it when reopened', async () => {
    const intervals = vi.spyOn(globalThis, 'setInterval')
    const clearInterval = vi.spyOn(globalThis, 'clearInterval')
    const view = render(vueH(ScheduleCatalogAction, { ...props(active) }))
    const trigger = screen.getByRole('button')
    expect(intervals).not.toHaveBeenCalled()
    await fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(intervals).toHaveBeenCalledExactlyOnceWith(expect.any(Function), 1000)
    await fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(clearInterval).toHaveBeenCalledExactlyOnceWith(intervals.mock.results[0]!.value)
    await fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(intervals).toHaveBeenCalledTimes(2)
    view.unmount()
    expect(clearInterval).toHaveBeenCalledTimes(2)
    expect(clearInterval).toHaveBeenLastCalledWith(intervals.mock.results[1]!.value)
  })
})

const ScheduleCatalogAction = defineComponent(
  (props: InstanceType<typeof NativeScheduleCatalogAction>['$props']) => {
    const read = liveFixtureProps(props)
    return () => vueH(NativeScheduleCatalogAction, read())
  },
  {
    props: [
      'children',
      'useSession',
      'sessionId',
      'useProjection',
      'useAccess',
      'useConversation',
      'useInput',
      'inputActions',
      'useChat',
      'useRemoteAccess',
      'useSessions',
      'useSessionRetainInfo',
      'useSessionAccess',
      'usePanelInfo',
      'useContextMenu',
      'useSessionStatus',
      'useWorkspaces',
      'useResource',
      'useWorkspaceAccess',
      'onDelete',
      'onRetry',
      'openTaskDetail',
      'useCatalog',
      't',
    ],
  },
)
