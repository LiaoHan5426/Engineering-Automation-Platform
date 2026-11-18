import { computed, defineComponent, h, ref, shallowRef, useId, watch, watchEffect } from 'vue'
import type { JobsSnapshot, JobView, ObservedJob } from '@deepseek-ai/dsh-api-job-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  HoverCard, HoverCardGroup, IconChevronDownOutlineRegular, IconStopFillRegular, MarqueeText,
  StateDot, type StateDotState, TerminalBlock, type TerminalBlockLabels, Tooltip, useHoverMarquee,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRenderFactories, PropsRuntime, PropsStore, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { createJobsSectionStore, JobGroup } from './jobs-store.ts'
import { NS } from './locales.ts'
import type {} from '@deepseek-ai/dsh-client-ui-session-panel/client'
import css from './JobsSection.module.css'

/** Registration-side business face for the background-jobs section. */
export interface JobsSectionInjected {
  hooks: {
    /** Client jobs snapshot (rosters and observations) bound by the renderer as useJobs. */
    jobs: {
      getSnapshot(): JobsSnapshot
      subscribe(listener: () => void): () => void
    }
  }
  /**
   * Keep one session's roster current while the list is mounted; returns the
   * stop function. Reference-counted by the client service.
   */
  watchRows: (sessionId: SessionId) => () => void
  /**
   * Start observing one job's live output; returns the stop function.
   * Reference-counted by the client service, so panels can overlap safely.
   */
  observe: (sessionId: SessionId | undefined, id: JobView['id']) => () => void
  /**
   * Kill one background job on the human's behalf. Resolves `true` when the
   * registry admitted the request (`requested` or `already-finished`); row
   * state itself converges through the jobs control frames.
   */
  killJob: (sessionId: SessionId, jobId: string) => Promise<boolean>
}

/** Full props for the Session panel's background-jobs section. */
export type JobsSectionProps =
  PropsRuntime<'conversation.session.panel.section'>
  & PropsRenderFactories
  & PropsLocale<typeof NS>
  & InjectFace<JobsSectionInjected>
  & PropsStore<ReturnType<typeof createJobsSectionStore>>

/** Business face of the running dot on the Session panel toggle. */
export type JobsRunningIndicatorInjected = Pick<JobsSectionInjected, 'hooks' | 'watchRows'>

/** Full props of the running dot on the Session panel toggle. */
export type JobsRunningIndicatorProps =
  PropsRuntime<'conversation.session.panel.indicator'>
  & PropsLocale<typeof NS>
  & InjectFace<JobsRunningIndicatorInjected>

/** Stable empty list so a session with no jobs keeps one array identity. */
const NO_JOBS: readonly JobView[] = []

/** Rows a group shows before its fold control holds the rest back. */
const FOLD_LIMIT = 5

/** How long an armed kill waits for its confirming press before disarming. */
const KILL_ARM_MS = 3_000

/** How long a failed kill keeps its hint before the button resets. */
const KILL_FAILED_MS = 4_000


function isLive(job: JobView): boolean {
  return job.status === 'running' || job.status === 'stopping'
}

/**
 * Whether the row offers an output panel: every live job (its output may
 * still arrive) and a settled one that left retained output behind.
 */
function isObservable(job: JobView): boolean {
  return isLive(job) || job.output.total > 0
}

/** The one-line qualifier beside the status: live progress while running, the terminal reason once settled. */
function jobDetail(job: JobView): string | undefined {
  return job.progress ?? job.detail
}

/** Closed-union exhaustiveness fence for the wire status set. */
/* v8 ignore next 3 -- closed-union backstop; only reached if a status is forged */
function assertNever(value: never): never {
  throw new Error(`unhandled job status: ${JSON.stringify(value)}`)
}

/**
 * Status marker semantics. `stopping` and `killed` share the attention color:
 * both mean the work ended (or is ending) on request rather than on its own.
 * So does a job that finished with a nonzero exit code: the command reported a
 * failure, while `failed` means the job itself broke.
 */
function dotState(job: JobView): StateDotState {
  switch (job.status) {
    case 'running': return 'ongoing'
    case 'stopping': return 'warning'
    case 'completed': return job.exitCode === undefined || job.exitCode === 0 ? 'done' : 'warning'
    case 'killed': return 'warning'
    case 'failed': return 'error'
    /* v8 ignore next -- closed wire status union */
    default: return assertNever(job.status)
  }
}

function statusLabel(status: JobView['status'], t: TranslateNS<typeof NS>): string {
  switch (status) {
    case 'running': return t('status.running')
    case 'stopping': return t('status.stopping')
    case 'completed': return t('status.completed')
    case 'killed': return t('status.killed')
    case 'failed': return t('status.failed')
    /* v8 ignore next -- closed wire status union */
    default: return assertNever(status)
  }
}

/**
 * Elapsed time in at most two adjacent units. A job that outlives an hour is
 * already exceptional, so hours is the widest unit — beyond that the figure
 * stays in hours rather than growing a day/month vocabulary no producer
 * currently reaches.
 */
function formatDuration(elapsedMs: number, t: TranslateNS<typeof NS>): string {
  const total = Math.max(0, Math.floor(elapsedMs / 1_000))
  const seconds = total % 60
  const minutes = Math.floor(total / 60) % 60
  const hours = Math.floor(total / 3_600)
  if (hours > 0) return t('duration.hours', { hours, minutes })
  if (minutes > 0) return t('duration.minutes', { minutes, seconds })
  return t('duration.seconds', { seconds })
}

/** Localized display copy for the embedded terminal panel. */
function terminalLabels(t: TranslateNS<typeof NS>): TerminalBlockLabels {
  return {
    commandLine: line => t('terminal.commandLine', { n: line }),
    // The labels contract requires exit-fact formatters, but this panel never
    // passes exit facts, so TerminalBlock never invokes them.
    /* v8 ignore next */
    signal: signal => t('terminal.signal', { signal }),
    /* v8 ignore next */
    exitCode: code => t('terminal.exitCode', { code }),
    noExitCode: t('terminal.noExitCode'),
    running: t('terminal.running'),
    failed: t('terminal.failed'),
    done: t('terminal.done'),
    copy: t('terminal.copy'),
    copied: t('terminal.copied'),
    noOutput: t('terminal.noOutput'),
    collapseAria: t('terminal.collapseAria'),
    collapse: t('terminal.collapse'),
    // The panel never caps lines (it scrolls), so the fold controls that
    // would invoke these stay unrendered.
    /* v8 ignore next */
    expandAria: hidden => t('terminal.expandAria', { n: hidden }),
    /* v8 ignore next */
    expand: hidden => t('terminal.expand', { n: hidden }),
  }
}

/**
 * Live rows first, the most recently started first, then settled rows
 * newest-first, so the rows a group holds back past its limit are its oldest.
 * Two rows that settled in the same millisecond fall back to start order, so
 * the sort never depends on the host's map iteration.
 */
function ordered(jobs: readonly JobView[]): JobView[] {
  return [...jobs].sort((left, right) => {
    const liveLeft = isLive(left)
    if (liveLeft !== isLive(right)) return liveLeft ? -1 : 1
    if (liveLeft) return right.startedAt - left.startedAt
    const finished = (right.finishedAt ?? right.startedAt) - (left.finishedAt ?? left.startedAt)
    return finished !== 0 ? finished : left.startedAt - right.startedAt
  })
}

/**
 * Two-press kill affordance state: `armed` waits for the confirming second
 * press (and disarms on a timer), `pending` covers the in-flight RPC until the
 * row's own status flip removes the button, `failed` shows briefly after a
 * rejected kill.
 */
type KillState = 'idle' | 'armed' | 'pending' | 'failed'


/** One output-capable job row and its hover detail. */
const JobItem = defineComponent((props: {
  job: JobView; view: ObservedJob | undefined; expanded: boolean; now: number; onToggle: () => void;
  kill: { state: KillState; onPress: () => void } | undefined; renderFactorySlot: JobsSectionProps['renderFactorySlot']; t: JobsSectionProps['t']
}) => {
  const onStop = ref(false)
  const labelRef = ref<HTMLElement | null>(null)
  const marquee = useHoverMarquee(labelRef)
  const summaryId = useId()
  return () => {
    const { job, t, expanded, kill } = props
    const live = isLive(job), observable = isObservable(job)
    const status = statusLabel(job.status, t), detail = jobDetail(job)
    const state = detail ?? status
    const duration = formatDuration(live ? props.now - job.startedAt : (job.finishedAt ?? job.startedAt) - job.startedAt, t)
    const body = [h('span', { class: css.glyph }, [h(StateDot, { state: dotState(job) })]), h(MarqueeText, { class: css.label, 'data-job-label': '', elementRef: (element: HTMLSpanElement | null) => { labelRef.value = element } }, { default: () => job.label }), h('span', { class: css.duration }, duration)]
    const killTitle = kill?.state === 'armed' ? t('kill.confirm') : kill?.state === 'failed' ? t('kill.failed') : t('kill.stop')
    const stop = kill ? h(Tooltip, { label: killTitle, side: 'top', portal: true }, { default: () => h('button', {
      type: 'button', class: [css.stop, kill.state === 'armed' && css.stopArmed, kill.state === 'failed' && css.stopFailed],
      disabled: kill.state === 'pending', 'aria-label': kill?.state === 'armed' || kill?.state === 'failed' ? killTitle : t('kill.stopAria', { label: job.label }), onClick: kill.onPress,
      onMouseenter: () => { onStop.value = true }, onMouseleave: () => { onStop.value = false },
    }, [h(IconStopFillRegular, { size: 12 }), kill.state === 'armed' ? h('span', { class: css.stopLabel }, t('kill.confirmAction')) : null]) }) : null
    return h('li', { class: css.item }, [
      h('span', { id: summaryId, class: css.visuallyHidden }, job.kind + ' · ' + state),
      h(HoverCard, { grouped: true, disabled: onStop.value && kill !== undefined }, { default: () => props.renderFactorySlot('conversation.session.panel.details', { lines: [job.kind], status: { state: dotState(job), label: state }, facts: [{ kind: 'duration', label: duration }] }),
        anchor: () => h('div', { class: css.rowLine, 'data-job-row': '', onPointerenter: marquee.onPointerEnter, onPointerleave: marquee.onPointerLeave }, [
          observable ? h('button', { type: 'button', class: css.row, 'aria-expanded': expanded, 'aria-label': t(expanded ? 'row.collapseAria' : 'row.expandAria', { label: job.label }), 'aria-describedby': summaryId, onClick: props.onToggle }, body) : h('span', { class: css.row }, body),
          stop,
          h('span', { class: css.chevron, 'aria-hidden': true }, observable ? [h(IconChevronDownOutlineRegular, { size: 14, class: expanded ? css.chevronOpen : undefined })] : []),
        ]),
      }),
      expanded && props.view !== undefined ? h('div', { class: css.panel }, [props.view.gapBefore ? h('div', { class: css.notice }, t('output.gap')) : null, props.view.error !== undefined ? h('div', { class: [css.notice, css.noticeError] }, t('output.error', { error: props.view.error })) : null, h(TerminalBlock, { command: job.label, output: props.view.text, running: live, copyText: job.label, runStateDot: false, maxLines: Number.POSITIVE_INFINITY, labels: terminalLabels(t) })]) : null,
    ])
  }
}, { props: ['job', 'view', 'expanded', 'now', 'onToggle', 'kill', 'renderFactorySlot', 't'], inheritAttrs: false })

/** Background jobs in the Session panel; observation exists only for a visible expanded row. */
export const JobsSection = defineComponent((props: JobsSectionProps) => {
  const mayKill = props.useAccess('job/kill')
  const jobs = props.useJobs(state => state.rows[props.sessionId])
  const observed = props.useJobs(state => state.observed)
  const store = props.useStore(state => state)
  const expandedKey = ref<string>()
  const now = ref(Date.now())
  const killPhase = shallowRef<{ key: string; state: Exclude<KillState, 'idle'> }>()
  const rows = computed(() => ordered((jobs.value ?? NO_JOBS).filter(job => !store.value.cleared[String(job.id)])))
  const liveRows = computed(() => rows.value.filter(isLive))
  const settledRows = computed(() => rows.value.filter(job => !isLive(job)))
  const settledExpanded = computed(() => store.value.settledOpen ?? liveRows.value.length === 0)
  const shownLive = computed(() => liveRows.value.length > FOLD_LIMIT + 1 && !store.value.unfolded.live ? liveRows.value.slice(0, FOLD_LIMIT) : liveRows.value)
  const shownSettled = computed(() => !settledExpanded.value ? [] : settledRows.value.length > FOLD_LIMIT + 1 && !store.value.unfolded.settled ? settledRows.value.slice(0, FOLD_LIMIT) : settledRows.value)
  watch(() => props.sessionId, (id, _old, cleanup) => { cleanup(props.watchRows(id)) }, { immediate: true })
  watch(() => liveRows.value.length, (count, _previous, cleanup) => {
    if (count === 0) return
    now.value = Date.now()
    const timer = setInterval(() => { now.value = Date.now() }, 1000)
    cleanup(() => { clearInterval(timer) })
  }, { immediate: true })
  const activeJob = computed(() => [...shownLive.value, ...shownSettled.value].find(row => String(row.id) === expandedKey.value && isObservable(row))?.id)
  watch([() => props.sessionId, activeJob, () => props.observe], ([sessionId, jobId, observe], _previous, cleanup) => {
    if (jobId !== undefined) cleanup(observe(sessionId, jobId))
  }, { immediate: true })
  watch(killPhase, (phase, _old, cleanup) => {
    if (phase === undefined || phase.state === 'pending') return
    const timer = setTimeout(() => { killPhase.value = undefined }, phase.state === 'armed' ? KILL_ARM_MS : KILL_FAILED_MS)
    cleanup(() => { clearTimeout(timer) })
  })
  watchEffect(() => { if (killPhase.value && !rows.value.some(job => String(job.id) === killPhase.value?.key && job.status === 'running')) killPhase.value = undefined })
  const pressKill = (job: JobView) => {
    const key = String(job.id)
    if (killPhase.value?.key !== key || killPhase.value.state !== 'armed') { killPhase.value = { key, state: 'armed' }; return }
    killPhase.value = { key, state: 'pending' }
    void props.killJob(props.sessionId, key).then(ok => { if (killPhase.value?.key === key && !ok) killPhase.value = { key, state: 'failed' } })
  }
  return () => {
    if (rows.value.length === 0) return null
    const item = (job: JobView) => h(JobItem, { key: String(job.id), job, view: isObservable(job) ? observed.value[String(job.id)] : undefined, expanded: expandedKey.value === String(job.id), now: now.value, onToggle: () => { expandedKey.value = expandedKey.value === String(job.id) ? undefined : String(job.id) }, renderFactorySlot: props.renderFactorySlot, t: props.t, kill: job.status === 'running' && mayKill.value ? { state: killPhase.value?.key === String(job.id) ? killPhase.value.state : 'idle', onPress: () => { pressKill(job) } } : undefined })
    const fold = (group: JobGroup, count: number) => {
      const expanded = store.value.unfolded[group]
      const label = expanded ? props.t('fold.less') : props.t(group === 'live' ? 'live.more' : 'settled.more', { count })
      return h('li', { key: 'fold-' + group, class: css.item }, [props.renderFactorySlot('conversation.session.panel.fold', { expanded, label, name: props.t(group === 'live' ? 'live.foldName' : 'settled.foldName', { label }), onToggle: () => { props.actions.unfoldedSet(group, !expanded) } })])
    }
    return h(HoverCardGroup, null, { default: () => h('ul', { class: css.list, 'data-jobs-section': '' }, [
      ...shownLive.value.map(item), liveRows.value.length > FOLD_LIMIT + 1 ? fold('live', liveRows.value.length - FOLD_LIMIT) : null,
      settledRows.value.length > 0 ? h('li', { class: css.sectionHeader }, [h('button', { type: 'button', class: css.sectionToggle, 'aria-expanded': settledExpanded.value, onClick: () => { props.actions.settledOpened(!settledExpanded.value) } }, [props.t('section.settledCount', { count: settledRows.value.length }), h(IconChevronDownOutlineRegular, { size: 14, class: [css.sectionChevron, settledExpanded.value && css.sectionChevronOpen] })]), h('button', { type: 'button', class: css.sectionClear, onClick: () => { props.actions.cleared(settledRows.value.map(job => String(job.id))); if (settledRows.value.some(job => String(job.id) === expandedKey.value)) expandedKey.value = undefined } }, props.t('section.clear'))]) : null,
      ...shownSettled.value.map(item), settledExpanded.value && settledRows.value.length > FOLD_LIMIT + 1 ? fold('settled', settledRows.value.length - FOLD_LIMIT) : null,
    ]) })
  }
}, { props: ['sessionId', 'useJobs', 'watchRows', 'observe', 'killJob', 'useStore', 'actions', 'renderFactorySlot', 't', 'useAccess'], inheritAttrs: false })
/** Running marker keeps its own roster subscription while the panel is closed. */
export const JobsRunningIndicator = defineComponent((props: JobsRunningIndicatorProps) => {
  const running = props.useJobs(state => (state.rows[props.sessionId] ?? NO_JOBS).filter(isLive).length)
  watch(() => props.sessionId, (id, _old, cleanup) => { cleanup(props.watchRows(id)) }, { immediate: true })
  return () => props.panelShown || running.value === 0 ? null : h('span', { class: css.runningIndicator, 'data-jobs-running': '' }, [h('span', { class: css.visuallyHidden }, props.t('indicator.running', { count: running.value }))])
}, { props: ['sessionId', 'panelShown', 'useJobs', 'watchRows', 't'], inheritAttrs: false })
