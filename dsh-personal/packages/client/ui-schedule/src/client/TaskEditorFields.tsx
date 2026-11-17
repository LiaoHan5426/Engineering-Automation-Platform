import { h, useId, defineComponent, computed, shallowRef } from 'vue'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  ScheduleCatalogEntry,
  SchedulePatch,
  ScheduleTargetRequest,
} from '@deepseek-ai/dsh-schedule/client'
import { Cron, RRule } from '@deepseek-ai/dsh-util-time'
import clsx from 'clsx'
import {
  DEFAULT_WORKSPACE_DIRECTORY,
  workspaceDisplayTitle,
} from '@deepseek-ai/dsh-api-workspace-controller/default-workspace'
import { IconClockOutlineRegular, Input, PathLabel } from '@deepseek-ai/dsh-client-ui-primitives'
import { ClockPicker } from './ClockPicker.tsx'
import { DatePicker } from './DatePicker.tsx'
import {
  defaultTiming,
  rruleFromDraft,
  timingFromDraft,
  timingFromRecord,
} from './editor-timing.ts'
import type { FrequencyPreset, TimingDraft } from './editor-timing.ts'
import { RuleSelectRow, RuleZoneRow } from './RuleSelectRow.tsx'
import { formatScheduleFrequency, zoneLabel } from './schedule-format.ts'
import type { FrequencyZone } from './schedule-format.ts'
import { RuleStepper, RuleWeekdayRow } from './TaskRuleControls.tsx'
import { IconCalendarOutlineRegular } from './CalendarIcon.tsx'
import type { TaskManagerKey } from './task-manager-locales.ts'
import css from './TaskManagerPage.module.css'
/** Local form values; only Save writes a task. */
export interface TaskEditorDraft extends TimingDraft {
  readonly title: string
  readonly prompt: string
  readonly target: 'session' | 'new_once' | 'new'
  readonly sessionId: string
  readonly cwd: string
}
/** Registered Workspaces offered as the directory of a created Session. */
interface ProjectChoices {
  readonly items: readonly {
    readonly value: string
    readonly label: string
  }[]
  /** Directory a new destination starts with: the default Workspace, else the first listed one, else empty. */
  readonly defaultCwd: string
}
/** Label Workspaces as the Workspace list does and select the directory a new destination starts with. */
export function projectChoices(
  workspaces: WorkspaceSnapshot['items'],
  defaultName: string,
): ProjectChoices {
  return {
    items: workspaces.map(workspace => ({
      value: workspace.path,
      label: workspaceDisplayTitle(workspace.title, defaultName),
    })),
    defaultCwd:
      (
        workspaces.find(workspace => workspace.title === DEFAULT_WORKSPACE_DIRECTORY) ??
        workspaces[0]
      )?.path ?? '',
  }
}
/** Initialize a new task without creating or activating a Session. */
export function newTaskDraft(): TaskEditorDraft {
  return { ...defaultTiming(), title: '', prompt: '', target: 'new_once', sessionId: '', cwd: '' }
}
/** Seed an edit without normalizing unsupported stored rules. */
export function taskDraft(task: ScheduleCatalogEntry): TaskEditorDraft {
  return {
    ...timingFromRecord(task),
    title: task.title,
    prompt: task.prompt,
    target: task.target.kind,
    sessionId: task.target.kind === 'session' ? task.target.sessionId : '',
    cwd: task.target.kind === 'session' ? '' : (task.target.create.cwd ?? ''),
  }
}
/**
 * Validate the form while retaining untouched stored timing.
 * @param draft - Current form values.
 * @param changes - Existing task patch; omitted validates a new timing as well.
 * @returns First correction key, `incomplete` for missing required fields, or undefined when valid.
 */
export function taskDraftIssue(
  draft: TaskEditorDraft,
  changes?: SchedulePatch,
): TaskManagerKey | 'incomplete' | undefined {
  if (
    draft.title.trim() === '' ||
    draft.prompt.trim() === '' ||
    (draft.target === 'session' && draft.sessionId === '')
  )
    return 'incomplete'
  if (draft.title.trim().length > 120) return 'rule.invalidTitle'
  if (
    draft.frequency !== 'once' &&
    draft.frequency !== 'advanced' &&
    (!/^[1-9]\d*$/.test(draft.interval) || !Number.isSafeInteger(Number(draft.interval)))
  )
    return 'rule.invalidInterval'
  if (draft.frequency === 'weekly' && draft.weekdays.length === 0) return 'rule.requiredWeekday'
  if (
    draft.frequency === 'monthly' &&
    (!Number.isInteger(draft.monthDay) || draft.monthDay < 1 || draft.monthDay > 31)
  )
    return 'rule.invalidMonthDay'
  if (draft.frequency === 'daily' && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(draft.dailyTime))
    return 'rule.invalidTime'
  // An untouched stored rule remains authoritative for a content-only edit.
  if (changes !== undefined && changes.timing === undefined) return undefined
  const timing = timingFromDraft(draft, true)
  const parsed =
    timing.kind === 'cron'
      ? Cron.parse(timing.cron.expression, timing.cron.time_zone)
      : timing.kind === 'rrule'
        ? RRule.parse(timing.rrule, { rejectIneffectiveSetPositions: true })
        : undefined
  if (parsed?.kind !== 'rejected') return undefined
  if (parsed.reason === 'time_zone') return 'rule.invalidZone'
  if (parsed.reason === 'density') return 'rule.tooComplex'
  return draft.frequency === 'advanced' ? 'rule.invalid' : 'rule.invalidTime'
}
/** Only meaningful field changes enter the CAS edit; untouched timing is never rewritten. */
export function taskDraftPatch(
  draft: TaskEditorDraft,
  original: ScheduleCatalogEntry,
  intervalFromNow = false,
): SchedulePatch {
  const seeded = taskDraft(original)
  const timingChanged =
    JSON.stringify(timingFromDraft(draft)) !== JSON.stringify(timingFromDraft(seeded))
  const targetChanged =
    draft.target !== seeded.target ||
    draft.sessionId !== seeded.sessionId ||
    draft.cwd !== seeded.cwd
  return {
    ...(draft.title.trim() === seeded.title.trim() ? {} : { title: draft.title.trim() }),
    ...(draft.prompt.trim() === seeded.prompt.trim() ? {} : { prompt: draft.prompt.trim() }),
    ...(timingChanged ? { timing: timingFromDraft(draft, intervalFromNow) } : {}),
    ...(targetChanged ? { target: draftTarget(draft, original) } : {}),
  }
}
/** Reapply changed field groups only after the user chooses to review a newer revision. */
export function reapplyTaskDraft(
  draft: TaskEditorDraft,
  latest: ScheduleCatalogEntry,
  changes: SchedulePatch,
): TaskEditorDraft {
  const { title, prompt, target, sessionId, cwd, ...timing } = draft
  const {
    title: latestTitle,
    prompt: latestPrompt,
    target: latestTarget,
    sessionId: latestSessionId,
    cwd: latestCwd,
    ...latestTiming
  } = taskDraft(latest)
  return {
    ...(changes.timing === undefined ? latestTiming : timing),
    title: changes.title === undefined ? latestTitle : title,
    prompt: changes.prompt === undefined ? latestPrompt : prompt,
    ...(changes.target === undefined
      ? { target: latestTarget, sessionId: latestSessionId, cwd: latestCwd }
      : { target, sessionId, cwd }),
  }
}
/** Resolve the explicit destination, preserving an existing preset when the project is unchanged. */
export function draftTarget(
  draft: TaskEditorDraft,
  original?: ScheduleCatalogEntry,
): ScheduleTargetRequest {
  if (draft.target === 'session')
    return { kind: 'session', sessionId: draft.sessionId as SessionId }
  const previous = original?.target.kind === 'session' ? undefined : original?.target.create
  const create = {
    ...(draft.cwd === '' ? {} : { cwd: draft.cwd }),
    ...((previous?.cwd ?? '') === draft.cwd && previous?.agentPreset !== undefined
      ? { agentPreset: previous.agentPreset }
      : {}),
  }
  return { kind: draft.target, create }
}
/**
 * Render manual creation and inline edits with the existing task rule controls.
 * @param props.disabled - whether the fields reject input.
 * @param props.held - whether a disabled state keeps the enabled look because it lasts only one brief request.
 */
export const TaskEditorFields = defineComponent(
  (props: {
    readonly draft: TaskEditorDraft
    readonly onChange: (draft: TaskEditorDraft) => void
    readonly projects: ProjectChoices
    readonly disabled: boolean
    readonly held: boolean
    readonly original?: ScheduleCatalogEntry | undefined
    readonly t: PropsLocale<'schedule.manager'>['t']
  }) => {
    const dateOpen = shallowRef(false)
    const clockOpen = shallowRef(false)
    const dateAnchor = shallowRef<HTMLButtonElement | null>(null)
    const clockAnchor = shallowRef<HTMLButtonElement | null>(null)
    const id = useId()
    const dateAnchorName = computed(() => `--dsh-schedule-date-${id.replaceAll(':', '')}`)
    const clockAnchorName = computed(() => `--dsh-schedule-clock-${id.replaceAll(':', '')}`)
    const rowId = (name: string): string => `${id}-${name}`
    const change = (patch: Partial<TaskEditorDraft>): void => {
      props.onChange({ ...props.draft, ...patch })
    }
    const clock = computed(() =>
      props.draft.frequency === 'daily'
        ? `${props.draft.dailyTime}:00`
        : props.draft.start.slice(11),
    )
    const frequencyZone = computed<FrequencyZone>(() => ({
      system: Intl.DateTimeFormat().resolvedOptions().timeZone,
      label: zone => zoneLabel(zone, props.t),
    }))
    const targetLabel = (target: TaskEditorDraft['target']): string =>
      props.t(
        target === 'session'
          ? 'host.currentConversation'
          : target === 'new_once'
            ? 'host.targetNewOnce'
            : 'host.targetNew',
      )
    const currentSessionId = computed(() =>
      props.original?.target.kind === 'session' ? props.original.target.sessionId : '',
    )
    const weekdays = computed(
      () =>
        props.draft.frequency === 'weekly' &&
        props.draft.weekdays.length === 5 &&
        [1, 2, 3, 4, 5].every(day => props.draft.weekdays.includes(day)),
    )
    const frequencyItems = computed(() => [
      { id: 'weekly', label: props.t('rule.weekly') },
      { id: 'weekdays', label: props.t('rule.weekdays') },
      { id: 'daily', label: props.t('rule.daily') },
      { id: 'hourly', label: props.t('rule.everyHours') },
      { id: 'minutely', label: props.t('rule.everyMinutes') },
      { id: 'monthly', label: props.t('host.frequency.monthly') },
      { id: 'once', label: props.t('rule.once') },
      { id: 'advanced', label: props.t('host.frequency.advanced') },
    ])
    const frequencyValue = computed(() => (weekdays.value ? 'weekdays' : props.draft.frequency))
    const workspaceItems = computed(() =>
      props.projects.items.map(choice => ({
        id: choice.value,
        label: h('span', { class: css.workspaceMenuItem }, [
          h('span', {}, [choice.label]),
          h(PathLabel, { path: choice.value, className: clsx(css.workspaceMenuPath) }),
        ]),
      })),
    )
    return () => {
      return h(
        'fieldset',
        {
          disabled: props.disabled,
          class: props.held ? `${css.taskEditor} ${css.editorHeld}` : css.taskEditor,
          onKeydownCapture: (event: KeyboardEvent) => {
            if (
              event.key !== 'Escape' ||
              event.defaultPrevented ||
              (!dateOpen.value && !clockOpen.value)
            )
              return
            event.preventDefault()
            event.stopPropagation()
            if (dateOpen.value) {
              dateOpen.value = false
              dateAnchor.value?.focus()
            } else {
              clockOpen.value = false
              clockAnchor.value?.focus()
            }
          },
        },
        [
          h('label', { class: css.editorField }, [
            props.t('detail.name'),
            h(Input, {
              value: props.draft.title,
              maxLength: 120,
              'aria-required': true,
              placeholder: props.t('detail.namePlaceholder'),
              onInput: (event: Event) => {
                change({ title: (event.currentTarget as HTMLInputElement).value })
              },
            }),
          ]),
          h('label', { class: css.editorField }, [
            props.t('detail.instruction'),
            h('textarea', {
              class: css.instruction,
              'aria-required': true,
              placeholder: props.t('detail.instructionPlaceholder'),
              value: props.draft.prompt,
              onInput: (event: Event) => {
                change({ prompt: (event.currentTarget as HTMLInputElement).value })
              },
            }),
          ]),
          h('div', { class: css.ruleRows }, [
            h(RuleSelectRow, {
              label: props.t('host.target'),
              value: props.draft.target,
              current: targetLabel(props.draft.target),
              disabled: props.disabled,
              listClassName: css.targetMenu,
              items: [
                ...(currentSessionId.value === ''
                  ? []
                  : [{ id: 'session', label: targetLabel('session') }]),
                ...(['new_once', 'new'] as const).map(value => ({
                  id: value,
                  label: h('span', { class: css.targetMenuItem }, [
                    h('span', {}, [targetLabel(value)]),
                    h('span', { class: css.targetMenuDescription }, [
                      props.t(
                        value === 'new_once' ? 'host.targetNewOnceHelp' : 'host.targetNewHelp',
                      ),
                    ]),
                  ]),
                })),
              ],
              onChange: (value) => {
                change({
                  target: value as TaskEditorDraft['target'],
                  sessionId: value === 'session' ? currentSessionId.value : props.draft.sessionId,
                  cwd:
                    value === 'session'
                      ? ''
                      : props.draft.target === 'session'
                        ? props.projects.defaultCwd
                        : props.draft.cwd,
                })
              },
            }),
            props.draft.target !== 'session' &&
              h(RuleSelectRow, {
                label: props.t('host.project'),
                value: props.draft.cwd,
                disabled: props.disabled,
                current:
                  props.projects.items.find(choice => choice.value === props.draft.cwd)?.label ??
                  (props.draft.cwd || props.t('host.ungrouped')),
                listClassName: css.workspaceMenu,
                items:
                  workspaceItems.value.length === 0
                    ? [{ id: '', label: props.t('host.ungrouped'), disabled: true }]
                    : workspaceItems.value,
                onChange: (cwd) => {
                  change({ cwd })
                },
              }),
          ]),
          h('section', { class: css.editorField, 'aria-label': props.t('rule.title') }, [
            h('h3', {}, [props.t('rule.title')]),
            h('div', { class: css.ruleRows }, [
              h(RuleSelectRow, {
                label: props.t('rule.repeat'),
                value: frequencyValue.value,
                disabled: props.disabled,
                items: frequencyItems.value,
                current: (
                  frequencyItems.value.find(item => item.id === frequencyValue.value) as {
                    label: string
                  }
                ).label,
                onChange: (value) => {
                  const frequency = value === 'weekdays' ? 'weekly' : (value as FrequencyPreset)
                  change({
                    frequency,
                    ...(value === 'weekdays' ? { weekdays: [1, 2, 3, 4, 5] } : {}),
                    ...(frequency === 'advanced'
                      ? { rrule: rruleFromDraft(props.draft, props.original === undefined) }
                      : {}),
                  })
                },
              }),
              props.draft.frequency !== 'once' &&
                props.draft.frequency !== 'advanced' &&
                h('div', { class: css.ruleRow }, [
                  h('label', { class: css.ruleLabel, htmlFor: rowId('interval') }, [
                    props.t('host.interval'),
                  ]),
                  h(RuleStepper, {
                    id: rowId('interval'),
                    min: 1,
                    max: Number.MAX_SAFE_INTEGER,
                    value: Number(props.draft.interval),
                    disabled: props.disabled,
                    increaseLabel: props.t('timing.intervalIncrease'),
                    decreaseLabel: props.t('timing.intervalDecrease'),
                    onChange: (value) => {
                      change({ interval: String(value) })
                    },
                  }),
                ]),
              props.draft.frequency === 'weekly' &&
                h(RuleWeekdayRow, {
                  weekdays: props.draft.weekdays,
                  disabled: props.disabled,
                  t: props.t,
                  rowId: rowId,
                  onToggle: (day) => {
                    change({
                      weekdays: props.draft.weekdays.includes(day)
                        ? props.draft.weekdays.filter(value => value !== day)
                        : [...props.draft.weekdays, day].sort(),
                    })
                  },
                }),
              props.draft.frequency === 'monthly' &&
                h('div', { class: css.ruleRow }, [
                  h('label', { class: css.ruleLabel, htmlFor: rowId('monthDay') }, [
                    props.t('host.monthDay'),
                  ]),
                  h(RuleStepper, {
                    id: rowId('monthDay'),
                    min: 1,
                    max: 31,
                    value: props.draft.monthDay,
                    disabled: props.disabled,
                    increaseLabel: props.t('timing.intervalIncrease'),
                    decreaseLabel: props.t('timing.intervalDecrease'),
                    onChange: (value) => {
                      change({ monthDay: value })
                    },
                  }),
                ]),
              props.draft.frequency === 'once' &&
                h('div', { class: css.ruleRow }, [
                  h('label', { class: css.ruleLabel, htmlFor: rowId('date') }, [
                    props.t('timing.date'),
                  ]),
                  h(
                    'button',
                    {
                      ref: dateAnchor,
                      style: { anchorName: dateAnchorName.value },
                      id: rowId('date'),
                      type: 'button',
                      disabled: props.disabled,
                      class: clsx(css.ruleInput, css.ruleControl, css.pickerTrigger),
                      'aria-label': props.t('timing.date'),
                      'aria-haspopup': 'dialog',
                      'aria-expanded': dateOpen.value,
                      onClick: () => {
                        dateOpen.value = true
                      },
                    },
                    [
                      h('span', {}, [props.draft.start.slice(0, 10).replaceAll('-', '/')]),
                      h(IconCalendarOutlineRegular, { className: clsx(css.pickerIcon) }),
                    ],
                  ),
                  h(DatePicker, {
                    open: dateOpen.value && !props.disabled,
                    anchorRef: dateAnchor,
                    anchorName: dateAnchorName.value,
                    value: props.draft.start.slice(0, 10),
                    onPick: (date) => {
                      change({ start: `${date}T${clock.value}` })
                      dateOpen.value = false
                    },
                    onClose: () => {
                      dateOpen.value = false
                    },
                    t: props.t,
                  }),
                ]),
              props.draft.frequency !== 'advanced' &&
                props.draft.frequency !== 'minutely' &&
                props.draft.frequency !== 'hourly' &&
                h('div', { class: css.ruleRow }, [
                  h('label', { class: css.ruleLabel, htmlFor: rowId('time') }, [
                    props.t('timing.time'),
                  ]),
                  h(
                    'button',
                    {
                      ref: clockAnchor,
                      style: { anchorName: clockAnchorName.value },
                      id: rowId('time'),
                      type: 'button',
                      disabled: props.disabled,
                      class: clsx(css.ruleInput, css.ruleControl, css.pickerTrigger),
                      'aria-label': props.t('timing.time'),
                      'aria-haspopup': 'dialog',
                      'aria-expanded': clockOpen.value,
                      onClick: () => {
                        clockOpen.value = true
                      },
                    },
                    [
                      h('span', {}, [clock.value]),
                      h(IconClockOutlineRegular, { className: clsx(css.pickerIcon) }),
                    ],
                  ),
                  h(ClockPicker, {
                    open: clockOpen.value && !props.disabled,
                    anchorRef: clockAnchor,
                    anchorName: clockAnchorName.value,
                    value: clock.value,
                    seconds: props.draft.frequency !== 'daily',
                    onPick: (time) => {
                      change(
                        props.draft.frequency === 'daily'
                          ? { dailyTime: time.slice(0, 5) }
                          : { start: `${props.draft.start.slice(0, 10)}T${time}` },
                      )
                    },
                    onClose: () => {
                      clockOpen.value = false
                    },
                    t: props.t,
                  }),
                ]),
              (props.draft.frequency !== 'advanced' ||
                (props.draft.rrule.trim() !== '' &&
                  !props.draft.rrule.trimStart().startsWith('DTSTART'))) &&
                h(RuleZoneRow, {
                  value: props.draft.timeZone,
                  disabled: props.disabled,
                  t: props.t,
                  onChange: (timeZone) => {
                    change({ timeZone })
                  },
                }),
            ]),
          ]),
          props.draft.frequency === 'advanced' &&
            h('div', { class: css.editorField }, [
              props.original !== undefined &&
                props.original.kind !== 'rrule' &&
                props.original.kind !== 'cron' &&
                props.draft.rrule === '' &&
                h('p', {}, [formatScheduleFrequency(props.original, props.t, frequencyZone.value)]),
              h('label', { class: css.editorField }, [
                props.t('host.customRule'),
                h('textarea', {
                  class: css.instruction,
                  value: props.draft.rrule,
                  onInput: (event: Event) => {
                    change({ rrule: (event.currentTarget as HTMLInputElement).value })
                  },
                }),
              ]),
            ]),
        ],
      )
    }
  },
  { props: ['draft', 'onChange', 'projects', 'disabled', 'held', 'original', 't'] },
)
