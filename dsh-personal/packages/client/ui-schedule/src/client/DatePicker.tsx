import { watchPostEffect, h, defineComponent, computed, shallowRef, watch, type Ref } from 'vue'
import clsx from 'clsx'
import {
  IconChevronLeftOutlineRegular,
  IconChevronRightOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { PickerPopover } from './PickerPopover.tsx'
import type { TaskManagerKey } from './task-manager-locales.ts'
import css from './DatePicker.module.css'
/** Row copy of the task manager namespace, as the pickers receive it. */
type Translate = PropsLocale<'schedule.manager'>['t']
/** ISO calendar date, the only text this row stores. */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
/** Weekday column headings, Monday first as the weekly choice orders them. */
const WEEKDAY_KEYS = [
  'frequency.weekday.1',
  'frequency.weekday.2',
  'frequency.weekday.3',
  'frequency.weekday.4',
  'frequency.weekday.5',
  'frequency.weekday.6',
  'frequency.weekday.7',
] as const satisfies readonly TaskManagerKey[]
/** Arrow key to the number of days it moves the focused cell. */
const STEP_BY_KEY: Readonly<Record<string, number>> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -7,
  ArrowDown: 7,
}
/** One month and the day the keyboard is on, as the panel shows them. */
interface MonthView {
  /** Four-digit year. */
  readonly year: number
  /** Zero-based month. */
  readonly month: number
  /** Day of that month, 1 through its last day. */
  readonly day: number
}
/**
 * The month and day one stored date opens on.
 * @param date - staged ISO date text.
 * @returns its own year, month, and day, or today when it is not an ISO calendar date.
 */
function viewOf(date: string): MonthView {
  const match = ISO_DATE.exec(date)
  if (match === null) {
    const today = new Date()
    return { year: today.getFullYear(), month: today.getMonth(), day: today.getDate() }
  }
  return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) }
}
/** Zero-padded two-digit field. */
function pad(value: number): string {
  return String(value).padStart(2, '0')
}
/**
 * Last day of one month.
 * @param view - year and zero-based month.
 * @returns that month's length in days.
 */
function daysIn(view: Pick<MonthView, 'year' | 'month'>): number {
  return new Date(Date.UTC(view.year, view.month + 1, 0)).getUTCDate()
}
/**
 * The same day in another month, clamped to that month's length.
 * @param view - current month and day.
 * @param step - months to move, negative for earlier.
 * @returns the moved view.
 */
function shiftMonth(view: MonthView, step: number): MonthView {
  const months = view.year * 12 + view.month + step
  const moved = { year: Math.floor(months / 12), month: months % 12 }
  return { ...moved, day: Math.min(view.day, daysIn(moved)) }
}
/**
 * ISO text of one day in a shown month.
 * @param view - shown year and month.
 * @param day - day of that month.
 * @returns `YYYY-MM-DD`.
 */
function isoOf(view: Pick<MonthView, 'year' | 'month'>, day: number): string {
  return `${view.year}-${pad(view.month + 1)}-${pad(day)}`
}
/** Inputs of the date picker. */
export interface DatePickerProps {
  /** Whether the panel is showing. */
  readonly open: boolean
  /** The row's trigger button, which anchors the panel. */
  readonly anchorRef: Ref<HTMLButtonElement | null>
  /** CSS anchor name assigned to the row trigger. */
  readonly anchorName: string
  /** The staged ISO date. */
  readonly value: string
  /** Stage one picked ISO date. */
  readonly onPick: (date: string) => void
  /** Dismiss the panel. */
  readonly onClose: () => void
  /** Row copy. */
  readonly t: Translate
}
/**
 * Render the month panel: one localized heading row over weeks of day cells.
 * @param props - open state, the trigger, the staged date, the pick and close callbacks, and row copy.
 * @returns the anchored panel while open, and nothing while closed.
 */
export const DatePicker = defineComponent(
  (props: DatePickerProps) => {
    const refs = shallowRef(new Map<string, HTMLDivElement>())
    const view = shallowRef<MonthView>((() => viewOf(props.value))())
    const today = computed(() => new Date())
    const todayIso = computed(() =>
      isoOf(
        { year: today.value.getFullYear(), month: today.value.getMonth() },
        today.value.getDate(),
      ),
    )
    // Opening returns to the stored day, so the grid starts where the row does.
    watch(
      [() => props.open],
      (_value, _previous) => {
        (() => {
          if (!props.open) return
          view.value = viewOf(props.value)
        })()

      },
      { immediate: true, flush: 'post' },
    )
    // The focused day owns the keyboard, and a pick leaves it on that day.
    watchPostEffect(() => {
      if (props.open) refs.value.get(String(view.value.day))?.focus()
    })
    const pick = (day: number): void => {
      view.value = (current => ({ ...current, day }))(view.value)
      props.onPick(isoOf(view.value, day))
    }
    const onCellKeyDown = (event: KeyboardEvent, day: number): void => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        pick(day)
        return
      }
      const step = STEP_BY_KEY[event.key] ?? 0
      if (step === 0) return
      event.preventDefault()
      const last = daysIn(view.value)
      view.value = (current => ({ ...current, day: Math.min(Math.max(day + step, 1), last) }))(
        view.value,
      )
    }
    const first = computed(() =>
      new Date(Date.UTC(view.value.year, view.value.month, 1)).getUTCDay(),
    )
    const offset = computed(() => (first.value + 6) % 7)
    const total = computed(() => daysIn(view.value))
    const cellCount = computed(() => Math.ceil((offset.value + total.value) / 7) * 7)
    const weeks = computed(() =>
      Array.from({ length: cellCount.value / 7 }, (_value, week) => week),
    )
    const monthTitle = computed(() =>
      new Intl.DateTimeFormat(props.t('time.locale'), {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(Date.UTC(view.value.year, view.value.month, 1)),
    )
    return () => {
      return h(
        PickerPopover,
        {
          open: props.open,
          anchorRef: props.anchorRef,
          anchorName: props.anchorName,
          label: props.t('timing.date'),
          className: clsx(css.calendar),
          onClose: props.onClose,
        },
        {
          default: () => [
            h('div', { class: css.head }, [
              h(
                'button',
                {
                  type: 'button',
                  class: css.nav,
                  'aria-label': props.t('timing.prevMonth'),
                  onClick: () => {
                    view.value = (current => shiftMonth(current, -1))(view.value)
                  },
                },
                [h(IconChevronLeftOutlineRegular, {})],
              ),
              h('span', { class: css.title, 'aria-live': 'polite' }, [monthTitle.value]),
              h(
                'button',
                {
                  type: 'button',
                  class: css.nav,
                  'aria-label': props.t('timing.nextMonth'),
                  onClick: () => {
                    view.value = (current => shiftMonth(current, 1))(view.value)
                  },
                },
                [h(IconChevronRightOutlineRegular, {})],
              ),
            ]),
            h('div', { class: css.grid, role: 'grid', 'aria-label': monthTitle.value }, [
              h('div', { role: 'row', class: css.week }, [
                WEEKDAY_KEYS.map(key =>
                  h('div', { key: key, role: 'columnheader', class: css.weekday }, [props.t(key)]),
                ),
              ]),
              weeks.value.map(week =>
                h('div', { key: week, role: 'row', class: css.week }, [
                  Array.from(
                    { length: 7 },
                    (_value, column) => week * 7 + column - offset.value + 1,
                  ).map(day =>
                    day < 1 || day > total.value
                      ? h('div', {
                        key: day,
                        role: 'gridcell',
                        'aria-hidden': 'true',
                        class: css.blank,
                      })
                      : h(
                        'div',
                        {
                          key: day,
                          ref: (element) => {
                            if (element === null) refs.value.delete(String(day))
                            else if (element instanceof HTMLDivElement)
                              refs.value.set(String(day), element)
                          },
                          role: 'gridcell',
                          'aria-selected': isoOf(view.value, day) === props.value,
                          'aria-current':
                              isoOf(view.value, day) === todayIso.value ? 'date' : undefined,
                          tabindex: day === view.value.day ? 0 : -1,
                          class: clsx(
                            css.cell,
                            isoOf(view.value, day) === props.value && css.selected,
                          ),
                          onClick: () => {
                            pick(day)
                          },
                          onKeydown: (event) => {
                            onCellKeyDown(event, day)
                          },
                        },
                        [day],
                      ),
                  ),
                ]),
              ),
            ]),
          ],
        },
      )
    }
  },
  { props: ['open', 'anchorRef', 'anchorName', 'value', 'onPick', 'onClose', 't'] },
)
