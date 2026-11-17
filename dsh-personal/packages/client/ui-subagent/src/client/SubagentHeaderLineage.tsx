import { computed, defineComponent, Fragment, h, ref, useId, watchEffect, shallowRef, watch, Teleport, type VNodeChild } from 'vue'
import { type SessionProjectionMap, type SessionSummary, type SessionProjectionSnapshot } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SubagentAddress } from '@deepseek-ai/dsh-subagent/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { IconChevronRightOutlineRegular, IconRefreshOutlineRegular, IconUsersOutlineRegular, IconCheckOutlineRegular, MenuSurface, StateDot, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './locales.ts'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-token-meter/client'
import type {} from '@deepseek-ai/dsh-agent-team/client'
import type {} from './slots.ts'
import css from './SubagentHeaderLineage.module.css'
type SubagentCatalogSnapshot = Omit<SessionProjectionSnapshot, 'values' | 'state'> & {
  state: 'idle' | 'loading' | 'ready' | 'migration-required' | 'error'
  entries: (SessionProjectionMap['subagentCatalog'][number] & {
    activity: 'running' | 'inactive'
  })[]
}
type Catalogs = Readonly<Record<SessionId, SubagentCatalogSnapshot>>
/** Business actions supplied by the slot registration. */
export type SubagentCatalogInjected = {
  openChild: (address: SubagentAddress) => void
  openChildAside: (address: SubagentAddress) => void
  refreshProjection: (parentSessionId: SessionId) => void
  /** Read this catalog and its direct children after explicit activation or retry. */
  prepareCatalog: (parentSessionId: SessionId) => Promise<void>
}
/** Root catalog actions and availability of its optional footer. */
export type SubagentCatalogActionInjected = SubagentCatalogInjected & {
  hooks: {
    /** Whether the catalog footer currently has a registered contributor. */
    footerAvailable: HostObservable<boolean>
  }
}
/** Full props for the session-header lineage renderer. */
export type SubagentHeaderLineageProps = PropsRuntime<'conversation.session.header.lineage'> & InjectFace<SubagentCatalogInjected> & PropsLocale<typeof NS>
interface CatalogRowsProps {
  parentSessionId: SessionId
  currentSessionId: SessionId | undefined
  catalog: SubagentCatalogSnapshot
  catalogs: Catalogs
  summaries: Readonly<Record<SessionId, SessionSummary>>
  expanded: ReadonlySet<SessionId>
  level: number
  openChild: (address: SubagentAddress) => void
  openChildAside: (address: SubagentAddress) => void
  refreshProjection: (parentSessionId: SessionId) => void
  toggleBranch: (childSessionId: SessionId) => void
  closeCatalog: () => void
}
function treeItems(root: HTMLDivElement | null): HTMLElement[] {
  return root === null
    ? []
    : Array.from(root.querySelectorAll<HTMLElement>('[role="treeitem"]:not([aria-disabled="true"])'))
}
/** Compact token count shared in shape with the conversation stats strip. */
function formatTokens(value: number, t: TranslateNS<typeof NS>): string {
  const scaled = (next: number): string => next >= 100
    ? String(Math.round(next))
    : String(Math.round(next * 10) / 10)
  if (value < 1000)
    return String(value)
  if (value < 1000000)
    return t('tokens.thousand', { value: scaled(value / 1000) })
  return t('tokens.million', { value: scaled(value / 1000000) })
}
/** Sum the four disjoint durable provider-usage buckets. */
function tokenTotal(usage: SessionProjectionMap['tokenUsage'] | undefined): number | undefined {
  return usage === undefined
    ? undefined
    : usage.uncachedInputTokens + usage.outputTokens
            + usage.cacheReadTokens + usage.cacheWriteTokens
}
/** Exact whole-second active-turn duration for one catalog row. */
function activityDuration(summary: SessionSummary | undefined, activity: 'running' | 'inactive', now: number): number | undefined {
  if (summary === undefined)
    return undefined
  const timing: SessionProjectionMap['subagentTiming'] | undefined = summary.projectionValues?.subagentTiming
  if (timing === undefined)
    return undefined
  if (timing.active === undefined)
    return timing.settledMs
  const end = activity === 'running'
    ? now
    : timing.active.through
  return timing.settledMs + Math.max(0, end - timing.active.since)
}
interface DurationParts {
  seconds: number
  minutes: number
  hours: number
  days: number
  totalMinutes: number
  totalHours: number
}
function splitDuration(ms: number): DurationParts {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000)
  const totalMinutes = Math.floor(totalSeconds / 60)
  const totalHours = Math.floor(totalMinutes / 60)
  return {
    seconds: totalSeconds % 60,
    minutes: totalMinutes % 60,
    hours: totalHours % 24,
    days: Math.floor(totalHours / 24),
    totalMinutes,
    totalHours,
  }
}
/** Format a duration with decreasing visual precision at larger scales. */
function formatDuration(ms: number, t: TranslateNS<typeof NS>): string {
  const { seconds, minutes, hours, days, totalMinutes, totalHours } = splitDuration(ms)
  if (days >= 365) {
    const years = Math.floor(days / 365)
    const months = Math.floor((days % 365) / 30)
    return months === 0
      ? t('duration.years', { years })
      : t('duration.yearsMonths', { years, months })
  }
  if (days >= 30) {
    const months = Math.floor(days / 30)
    const remainingDays = days % 30
    return remainingDays === 0
      ? t('duration.months', { months })
      : t('duration.monthsDays', { months, days: remainingDays })
  }
  if (days > 0) {
    return hours === 0
      ? t('duration.days', { days })
      : t('duration.daysHours', { days, hours })
  }
  if (totalHours > 0) {
    return t('duration.hours', {
      hours: totalHours,
      minutes: String(minutes).padStart(2, '0'),
      seconds: String(seconds).padStart(2, '0'),
    })
  }
  if (totalMinutes > 0) {
    return t('duration.minutes', {
      minutes: totalMinutes,
      seconds: String(seconds).padStart(2, '0'),
    })
  }
  return t('duration.seconds', { seconds })
}
/** Preserve exact whole seconds for hover and accessible naming. */
function formatExactDuration(ms: number, t: TranslateNS<typeof NS>): string {
  const { seconds, minutes, hours, days } = splitDuration(ms)
  return days === 0
    ? formatDuration(ms, t)
    : t('duration.exactDays', {
      days,
      hours: String(hours).padStart(2, '0'),
      minutes: String(minutes).padStart(2, '0'),
      seconds: String(seconds).padStart(2, '0'),
    })
}
const SubagentSwitcherIcon = defineComponent(() => {
  return () => {
    return (h('svg', { 'width': '16', 'height': '16', 'viewBox': '0 0 20 20', 'fill': 'none', 'aria-hidden': 'true' }, [
      h('path', { 'd': 'M5.99951 12.7L8.95546 14.9478C9.40011 15.2859 9.62244 15.455 9.87526 15.488C9.95774 15.4988 10.0413 15.4988 10.1238 15.488C10.3766 15.455 10.5989 15.2859 11.0436 14.9478L13.9995 12.7', 'stroke': 'currentColor', 'stroke-width': '1.5' }),
      h('path', { 'd': 'M13.9995 7.7417L11.0436 5.49387C10.5989 5.15574 10.3766 4.98668 10.1238 4.95362C10.0413 4.94283 9.95775 4.94283 9.87527 4.95362C9.62245 4.98668 9.40012 5.15574 8.95547 5.49387L5.99952 7.7417', 'stroke': 'currentColor', 'stroke-width': '1.5' }),
    ]))
  }
}, { name: 'SubagentSwitcherIcon', inheritAttrs: false, props: [] })
const CatalogLoadingRows = defineComponent((props: {
  t: TranslateNS<typeof NS>
}) => {
  return () => {
    const { t } = props
    return h('div', { 'class': css.notice }, [
      t('loading.label'),
    ])
  }
}, { name: 'CatalogLoadingRows', inheritAttrs: false, props: ['t'] })
/** Only confirmed child membership exposes a branch disclosure. */
function canExpandCatalog(entry: SubagentCatalogSnapshot['entries'][number], catalogs: Catalogs, summaries: CatalogRowsProps['summaries']): boolean {
  return entry.mode !== 'external' && (catalogs[entry.id]?.entries.length ?? 0) > 0
        && summaries[entry.id]?.formatStatus !== 'migration-required'
        && catalogs[entry.id]?.state !== 'migration-required'
}
/** The agent name unique among the row's siblings, or the Session ID for entries recorded without one. */
function entryName(entry: SubagentCatalogSnapshot['entries'][number]): string {
  return entry.mode === 'continuable' || entry.mode === 'external' ? entry.name ?? entry.id : entry.id
}
/** Only a local child's last closed, normally completed turn receives the completed marker. */
function completedEntry(entry: SubagentCatalogSnapshot['entries'][number], summary: SessionSummary | undefined): boolean {
  return entry.mode !== 'external' && entry.activity === 'inactive'
        && summary?.projectionValues?.subagentTiming?.lastTurnCompleted === true
}
/** Count direct catalog members without treating external or other inactive entries as completed. */
function catalogProgress(entries: SubagentCatalogSnapshot['entries'], summaries: CatalogRowsProps['summaries'], t: TranslateNS<typeof NS>): string {
  let completed = 0
  let active = 0
  let inactive = 0
  let external = 0
  for (const entry of entries) {
    if (entry.mode === 'external')
      external++
    else if (entry.activity === 'running')
      active++
    else if (completedEntry(entry, summaries[entry.id]))
      completed++
    else
      inactive++
  }
  return [
    ...completed > 0 ? [t('progress.completed', { count: completed })] : [],
    ...active > 0 ? [t('progress.active', { count: active })] : [],
    ...inactive > 0 ? [t('progress.inactive', { count: inactive })] : [],
    ...external > 0 ? [t('progress.external', { count: external })] : [],
  ].join('\u2002·\u2002')
}
const CatalogRows = defineComponent((props: CatalogRowsProps & {
  t: TranslateNS<typeof NS>
}) => {
  const now = ref((() => Date.now())())
  const running = computed(() => props.catalog.entries.some(entry => entry.activity === 'running'))
  watchEffect((cleanup) => {
    if (!running.value)
      return
    const timer = setInterval(() => { now.value = Date.now() }, 1000)
    cleanup(() => { clearInterval(timer) })
  })
  return (): VNodeChild => {
    const { parentSessionId, currentSessionId, catalog, catalogs, summaries, expanded, level, openChild,
      openChildAside, refreshProjection, toggleBranch, closeCatalog, t } = props
    const emptyLoading = catalog.state === 'loading' && catalog.entries.length === 0
    const reserveDisclosure = catalog.entries.some(entry => canExpandCatalog(entry, catalogs, summaries))
    return (h(Fragment, null, [
      catalog.state === 'idle' && catalog.entries.length === 0 && (h('div', { 'class': css.notice }, [
        t('load.idle'),
      ])),
      emptyLoading && (h(CatalogLoadingRows, { 't': t })),
      catalog.state === 'error' && (h('div', { 'class': css.error }, [
        h('span', null, [
          catalog.error?.message ?? t('load.error'),
        ]),
        h('button', { 'type': 'button', 'class': css.refresh, 'onClick': () => { refreshProjection(parentSessionId) } }, [
          h(IconRefreshOutlineRegular, { 'size': 14 }),
          t('retry'),
        ]),
      ])),
      catalog.entries.map((entry) => {
        const external = entry.mode === 'external'
        const childCatalog = catalogs[entry.id]
        const isCurrent = entry.id === currentSessionId
        const requiresOpening = summaries[entry.id]?.formatStatus === 'migration-required'
                    || childCatalog?.state === 'migration-required'
        const canExpand = canExpandCatalog(entry, catalogs, summaries)
        const isExpanded = canExpand && expanded.has(entry.id)
        const summary = summaries[entry.id]
        const description = entry.label || summary?.title
        const name = entryName(entry)
        const primaryLabel = description || name
        const secondaryLabel = description ? name : undefined
        const mode = external ? t('mode.external') : entry.mode === 'unknown' ? t('mode.unknown')
          : entry.mode === 'one-shot' ? t('mode.oneShot') : t('mode.continuable')
        const completed = completedEntry(entry, summary)
        const activity = external ? undefined : entry.activity === 'running'
          ? t('activity.running')
          : completed
            ? t('activity.completed')
            : t('activity.inactive')
        const secondary = [secondaryLabel, mode, activity]
          .filter(value => value !== undefined)
          .join(' · ')
        const totalTokens = tokenTotal(summary?.projectionValues?.tokenUsage)
        const durationMs = activityDuration(summary, entry.activity, now.value)
        const tokenMetric = totalTokens === undefined
          ? undefined
          : t('tokens.total', { value: formatTokens(totalTokens, t) })
        const durationMetric = durationMs === undefined
          ? undefined
          : {
            compact: formatDuration(durationMs, t),
            exact: formatExactDuration(durationMs, t),
          }
        const metrics = [tokenMetric, durationMetric?.exact]
          .filter(value => value !== undefined)
          .join(' · ')
        const open = (): void => {
          if (external)
            return
          openChild({
            parentSessionId,
            childSessionId: entry.id,
            mode: entry.mode,
          })
          closeCatalog()
        }
        const handleKey = (event: KeyboardEvent): void => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            event.stopPropagation()
            open()
          }
          else if ((event.key === 'ArrowRight' && canExpand && !isExpanded)
                        || (event.key === 'ArrowLeft' && isExpanded)) {
            event.preventDefault()
            event.stopPropagation()
            toggleBranch(entry.id)
          }
        }
        const toggle = (event: MouseEvent): void => {
          event.preventDefault()
          event.stopPropagation()
          toggleBranch(entry.id)
        }
        return (h('div', { 'key': entry.id, 'class': css.node }, [
          h('div', { 'role': 'treeitem', 'tabIndex': external ? -1 : 0, 'aria-disabled': external || undefined, 'aria-level': level, 'aria-current': isCurrent || undefined, 'aria-label': [primaryLabel, secondary, metrics].filter(value => value !== '').join(' '), ...canExpand ? { 'aria-expanded': isExpanded } : {}, 'class': css.row, 'onClick': open, 'onKeydown': handleKey }, [
            !canExpand
              ? reserveDisclosure && h('span', { 'class': css.disclosureSpace })
              : (h('button', { 'type': 'button', 'tabIndex': -1, 'class': `${css.disclosure} ${isExpanded ? css.disclosureOpen : ''}`, 'aria-label': t(isExpanded ? 'branch.collapse' : 'branch.expand', { label: primaryLabel }), 'onClick': toggle }, [
                h(IconChevronRightOutlineRegular, null),
              ])),
            h('div', { 'class': css.clickarea }, [
              h('span', { 'class': css.rowActivitySlot }, [
                h(StateDot, { 'state': entry.activity === 'running' ? 'ongoing' : completed ? 'done' : 'idle' }),
              ]),
              h('span', { 'class': css.content }, [
                h('span', { 'class': `${css.label} ${isCurrent ? css.currentLabel : ''}` }, [
                  primaryLabel,
                ]),
                secondaryLabel !== undefined && (h('span', { 'class': css.secondaryLabel }, [
                  secondaryLabel,
                ])),
              ]),
              metrics !== '' && (h('span', { 'class': css.metrics }, [
                tokenMetric !== undefined && h('span', { 'class': css.metricToken }, [
                  tokenMetric,
                ]),
                durationMetric !== undefined && (h('span', { 'class': css.metricDuration, 'title': t('duration.exactTitle', { duration: durationMetric.exact }) }, [
                  durationMetric.compact,
                ])),
              ])),
              isCurrent
                ? (h('span', { 'class': `${css.sidebarSpace} ${css.currentCheck}`, 'aria-hidden': true, 'data-subagent-current': true }, [
                  h(IconCheckOutlineRegular, { 'size': 16 }),
                ]))
                : external ? h('span', { 'class': css.sidebarSpace }) : (h(Tooltip, { 'label': t('open.sidebar'), 'delayMs': 500, 'side': 'bottom', 'align': 'end' }, { default: () => [
                  h('button', { 'type': 'button', 'class': css.sidebarButton, 'aria-label': t('open.sidebar.aria', { label: primaryLabel }), 'onClick': (event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    openChildAside({ parentSessionId, childSessionId: entry.id, mode: entry.mode })
                    closeCatalog()
                  }, 'onKeydown': (event) => { event.stopPropagation() } }, [
                    h(IconChevronRightOutlineRegular, null),
                  ]),
                ] })),
            ]),
          ]),
          !isExpanded && !external && !requiresOpening && childCatalog?.state === 'error' && (h('div', { 'class': css.error, 'role': 'alert' }, [
            h('span', null, [
              t('load.error'),
            ]),
            h('button', { 'type': 'button', 'class': css.refresh, 'onClick': () => { refreshProjection(entry.id) } }, [
              h(IconRefreshOutlineRegular, { 'size': 14 }),
              t('retry'),
            ]),
          ])),
          childCatalog !== undefined && isExpanded && (h('div', { 'role': 'group', 'class': css.children }, [
            h(CatalogRows, { 'parentSessionId': entry.id, 'currentSessionId': currentSessionId, 'catalog': childCatalog, 'catalogs': catalogs, 'summaries': summaries, 'expanded': expanded, 'level': level + 1, 'openChild': openChild, 'openChildAside': openChildAside, 'refreshProjection': refreshProjection, 'toggleBranch': toggleBranch, 'closeCatalog': closeCatalog, 't': t }),
          ])),
        ]))
      }),
    ]))
  }
}, { name: 'CatalogRows', inheritAttrs: false, props: ['parentSessionId', 'currentSessionId', 'catalog', 'catalogs', 'summaries', 'expanded', 'level', 'openChild', 'openChildAside', 'refreshProjection', 'toggleBranch', 'closeCatalog', 't'] })
interface CatalogDropdownSharedProps extends InjectFace<SubagentCatalogInjected> {
  /** Session whose direct catalog roots the tree. */
  rootSessionId: SessionId
  useSessions: SubagentHeaderLineageProps['useSessions']
  useSessionStatus: SubagentHeaderLineageProps['useSessionStatus']
  t: TranslateNS<typeof NS>
  /** Section labels are useful only beside a visible shared-task list. */
  hasSharedTasks?: boolean
  /** Retain an empty catalog's entry for shared tasks or a task-board error. */
  hasBoardContent?: boolean
  renderFooter?: () => VNodeChild
}
type CatalogDropdownProps = CatalogDropdownSharedProps & ({
  /** Descendant-count control. */
  variant: 'count'
  currentSessionId?: never
  displayTitle?: never
  openTitle?: never
} | {
  /** Current-title sibling switcher. */
  variant: 'switcher'
  /** Selected descendant highlighted in the catalog. */
  currentSessionId: SessionId
  /** Visible title included in the switcher's hover target. */
  displayTitle: string
  /** Optional ancestor navigation when the combined title is clicked. */
  openTitle?: () => void
})
const CatalogDropdown = defineComponent((props: CatalogDropdownProps) => {
  const projections = props.useSessions(state => state.projectionsBySession)
  const summaries = props.useSessions(state => state.byId)
  const statuses = props.useSessionStatus(value => value)
  const open = ref(false)
  const expanded = ref<ReadonlySet<SessionId>>((() => new Set())())
  const rootRef = shallowRef<HTMLDivElement | null>(null)
  const triggerRef = shallowRef<HTMLButtonElement | null>(null)
  const countRef = shallowRef<HTMLSpanElement | null>(null)
  const activityId = useId()
  const menuRef = shallowRef<HTMLDivElement | null>(null)
  const hoverOpenTimer = shallowRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const hoverCloseTimer = shallowRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // A click-opened (pinned) menu ignores hover-out; only explicit dismissal closes it.
  const pinnedRef = shallowRef(false)
  const rootSessionId = computed(() => props.rootSessionId)
  const currentSessionId = computed(() => props.currentSessionId)
  const displayTitle = computed(() => props.displayTitle)
  const openTitle = computed(() => props.openTitle)
  const variant = computed(() => props.variant)
  const openChild = computed(() => props.openChild)
  const openChildAside = computed(() => props.openChildAside)
  const prepareCatalog = computed(() => props.prepareCatalog)
  const t = computed(() => props.t)
  const hasSharedTasks = computed(() => props.hasSharedTasks)
  const ancestorSwitcher = computed(() => variant.value === 'switcher' && openTitle.value !== undefined)
  const catalogs = computed(() => {
    return Object.fromEntries(Object.entries(projections.value).map(([id, snapshot]) => {
      const projected = snapshot.values.subagentCatalog
      const state = snapshot.state === 'idle'
        ? projected === undefined ? 'idle' : 'ready'
        : snapshot.state === 'migration-required' && projected !== undefined ? 'ready' : snapshot.state
      return [id, {
        state,
        error: snapshot.error,
        entries: (projected ?? []).map(entry => ({
          ...entry,
          activity: (statuses.value.get(entry.id)?.running ?? summaries.value[entry.id]?.running) === true
            ? 'running' as const : 'inactive' as const,
        })),
      } satisfies SubagentCatalogSnapshot]
    }))
  })
  const catalog = computed(() => catalogs.value[rootSessionId.value])
  const prepareLevel = (sessionId: SessionId): void => {
    void prepareCatalog.value(sessionId).catch((error: unknown) => {
      console.error('[ui-subagent] catalog discovery failed:', error)
    })
  }
  const anchorName = computed(() => `--dsh-subagents-${activityId.replaceAll(':', '')}`)
  const currentEntry = computed(() => currentSessionId.value === undefined
    ? undefined
    : catalog.value?.entries.find(entry => entry.id === currentSessionId.value))
  const switcherDisplayTitle = computed(() => currentEntry.value !== undefined
    ? currentEntry.value.label || entryName(currentEntry.value)
    : displayTitle.value)
  const directChildren = computed(() => catalog.value?.entries ?? [])
  const directCount = computed(() => directChildren.value.length)
  const runningCount = computed(() => directChildren.value.filter(entry => entry.activity === 'running').length)
  const progress = computed(() => catalogProgress(directChildren.value, summaries.value, t.value))
  const totalCountKey = computed(() => directCount.value === 1 ? 'count.total.one' : 'count.total.other')
  const runningCountKey = computed(() => runningCount.value === 1 ? 'count.running.one' : 'count.running.other')
  const presentedCatalog = computed<SubagentCatalogSnapshot | undefined>(() => catalog.value ?? (variant.value === 'switcher' || props.hasBoardContent
    ? { entries: [], state: 'idle', error: null }
    : undefined))
  const cancelHoverClose = (): void => {
    if (hoverCloseTimer.value === undefined)
      return
    clearTimeout(hoverCloseTimer.value)
    hoverCloseTimer.value = undefined
  }
  const cancelHoverOpen = (): void => {
    if (hoverOpenTimer.value === undefined)
      return
    clearTimeout(hoverOpenTimer.value)
    hoverOpenTimer.value = undefined
  }
  const changeOpen = (next: boolean, restoreFocus = false): void => {
    cancelHoverOpen()
    cancelHoverClose()
    if (next) {
      const trigger = triggerRef.value
      /* v8 ignore next -- a queued callback can outlive the trigger */
      if (trigger === null)
        return
      open.value = true
    }
    else {
      pinnedRef.value = false
      open.value = false
      expanded.value = new Set()
    }
    if (restoreFocus)
      queueMicrotask(() => { triggerRef.value?.focus() })
  }
  // CSS owns the header-width breakpoint; interaction reads its result only when scheduling hover.
  const allowsHoverOpen = (): boolean => variant.value === 'switcher'
        || (countRef.value !== null && getComputedStyle(countRef.value).display !== 'none')
  const scheduleHoverOpen = (): void => {
    cancelHoverOpen()
    cancelHoverClose()
    if (open.value || !allowsHoverOpen())
      return
    hoverOpenTimer.value = setTimeout(() => {
      hoverOpenTimer.value = undefined
      if (allowsHoverOpen())
        changeOpen(true)
    }, 150)
  }
  const scheduleHoverClose = (): void => {
    cancelHoverOpen()
    cancelHoverClose()
    if (pinnedRef.value)
      return
    hoverCloseTimer.value = setTimeout(() => {
      hoverCloseTimer.value = undefined
      changeOpen(false)
    }, 120)
  }
  const closeBranch = (root: SessionId): void => {
    const closing = new Set<SessionId>()
    const visit = (parentSessionId: SessionId): void => {
      if (closing.has(parentSessionId) || !expanded.value.has(parentSessionId))
        return
      closing.add(parentSessionId)
      const branch = catalogs.value[parentSessionId]
      for (const entry of branch?.entries ?? []) {
        visit(entry.id)
      }
    }
    visit(root)
    expanded.value = (current => new Set([...current].filter(id => !closing.has(id))))(expanded.value)
  }
  const toggleBranch = (childSessionId: SessionId): void => {
    if (expanded.value.has(childSessionId)) {
      closeBranch(childSessionId)
      return
    }
    expanded.value = (current => new Set(current).add(childSessionId))(expanded.value)
    prepareLevel(childSessionId)
  }
  watch(() => [open.value], (_next, _old, cleanup) => {
    if (!open.value)
      return
    const closeOutside = (event: PointerEvent): void => {
      if (event.target instanceof Node
                && !rootRef.value?.contains(event.target)
                && !menuRef.value?.contains(event.target)) {
        changeOpen(false)
      }
    }
    document.addEventListener('pointerdown', closeOutside)
    const dismiss = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Escape')
        return
      event.preventDefault()
      changeOpen(false, menuRef.value?.contains(document.activeElement) === true)
    }
    document.addEventListener('keydown', dismiss)
    cleanup(() => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', dismiss)
    })
  }, { immediate: true })
  watch(() => [], (_next, _old, cleanup) => {
    cleanup(() => {
      cancelHoverOpen()
      cancelHoverClose()
    })
  }, { immediate: true })
  const visible = computed(() => presentedCatalog.value !== undefined
        && (variant.value === 'switcher'
            || props.hasBoardContent || presentedCatalog.value.state === 'error'
            || presentedCatalog.value.entries.length > 0))
  watch(() => [visible.value, open.value], (_next, _old) => {
    if (visible.value)
      return
    cancelHoverOpen()
    cancelHoverClose()
    if (!open.value)
      return
    pinnedRef.value = false
    open.value = false
    expanded.value = new Set()
  }, { immediate: true })
  const focusAt = (index: number): void => {
    const items = treeItems(menuRef.value)
    if (items.length === 0)
      return
    items[(index + items.length) % items.length]?.focus()
  }
  const navigate = (event: KeyboardEvent): void => {
    if (event.target instanceof Element
            && event.target !== triggerRef.value && event.target !== menuRef.value
            && event.target.closest('[role="tree"]') === null)
      return
    const items = treeItems(menuRef.value)
    const index = items.indexOf(document.activeElement as HTMLElement)
    if (event.key === 'Home') {
      event.preventDefault()
      focusAt(0)
    }
    else if (event.key === 'End') {
      event.preventDefault()
      focusAt(items.length - 1)
    }
    else if (event.key === 'ArrowDown') {
      event.preventDefault()
      focusAt(index + 1)
    }
    else if (event.key === 'ArrowUp') {
      event.preventDefault()
      focusAt(index < 0 ? items.length - 1 : index - 1)
    }
  }
  return () => {
    const catalog = presentedCatalog.value
    if (!visible.value || catalog === undefined) return null
    return (h('div', { 'class': `${css.root} ${variant.value === 'switcher' ? css.switcherRoot : ''}`, 'ref': rootRef, 'data-subagent-action': true, 'onKeydown': navigate, 'onPointerleave': scheduleHoverClose }, [
      h(Tooltip, { 'label': t.value(totalCountKey.value, { count: directCount.value }), 'disabled': open.value || variant.value === 'switcher', 'delayMs': 500, 'portal': true, 'side': 'bottom' }, { default: () => [
        h('button', { 'ref': triggerRef, 'style': { anchorName: anchorName.value }, 'onPointerenter': (event) => {
          if (event.pointerType !== 'touch')
            scheduleHoverOpen()
        }, 'type': 'button', 'class': variant.value === 'switcher'
          ? `${css.switcherTrigger} ${ancestorSwitcher.value ? css.ancestorSwitcherTrigger : ''}`
          : css.trigger, 'aria-haspopup': 'dialog', 'aria-expanded': open.value, 'aria-label': variant.value === 'switcher'
          ? t.value('switcher.aria', { title: switcherDisplayTitle.value })
          : t.value(totalCountKey.value, { count: directCount.value }), 'aria-describedby': variant.value === 'count' && runningCount.value > 0 ? activityId : undefined, 'onClick': openTitle.value === undefined
          ? () => {
            cancelHoverOpen()
            cancelHoverClose()
            if (variant.value === 'count' && open.value && (pinnedRef.value || !allowsHoverOpen())) {
              changeOpen(false, true)
              return
            }
            pinnedRef.value = true
            if (!open.value)
              changeOpen(true)
            prepareLevel(rootSessionId.value)
            queueMicrotask(() => { menuRef.value?.focus() })
          }
          : () => {
            cancelHoverOpen()
            if (open.value)
              changeOpen(false)
            openTitle.value?.()
          }, 'onKeydown': (event) => {
          if (event.key !== 'ArrowDown')
            return
          event.preventDefault()
          if (variant.value === 'count' && !allowsHoverOpen())
            pinnedRef.value = true
          if (!open.value)
            changeOpen(true)
          prepareLevel(rootSessionId.value)
          queueMicrotask(() => { focusAt(0) })
        } }, [
          variant.value === 'switcher'
            ? h('span', { 'class': css.switcherTitle }, [
              switcherDisplayTitle.value,
            ]) : (h(Fragment, null, [
              h('span', { 'class': css.activitySlot, 'aria-hidden': true }, [
                h(IconUsersOutlineRegular, { 'size': 14, 'className': (runningCount.value > 0 ? css.compactIcon : undefined) ?? '' }),
                runningCount.value > 0 && h(StateDot, { 'state': 'ongoing', 'className': css.textModeActivity ?? '' }),
              ]),
              h('span', { 'ref': countRef, 'class': css.count, 'data-subagent-count': true }, [
                t.value(totalCountKey.value, { count: directCount.value }),
              ]),
            ])),
          variant.value === 'switcher' && h(SubagentSwitcherIcon, null),
        ]),
      ] }),
      variant.value === 'count' && runningCount.value > 0 && (h('span', { 'id': activityId, 'hidden': true }, [
        t.value(runningCountKey.value, { count: runningCount.value }),
      ])),
      open.value && portal((h(MenuSurface, { 'elementRef': (element: HTMLDivElement | null) => { menuRef.value = element }, 'className': css.menu ?? '', 'style': { positionAnchor: anchorName.value }, 'role': 'dialog', 'tabIndex': -1, 'aria-label': t.value('tree.aria'), 'data-subagent-panel': true, 'onPointerenter': (event: PointerEvent) => {
        if (event.pointerType !== 'touch')
          cancelHoverClose()
      }, 'onPointerleave': scheduleHoverClose, 'onKeydown': navigate }, { default: () => [
        h('div', { 'class': css.menuBody }, [
          hasSharedTasks.value && (h('div', { 'class': css.sectionHeader, 'data-subagent-section-header': true }, [
            h('span', { 'class': css.sectionIcon, 'aria-hidden': true }, [
              h(IconUsersOutlineRegular, { 'size': 14 }),
            ]),
            h('h3', { 'class': css.sectionTitle }, [
              t.value('section.title'),
            ]),
            progress.value && h('span', { 'class': css.sectionProgress }, [
              progress.value,
            ]),
          ])),
          hasSharedTasks.value && presentedCatalog.value?.state === 'ready' && directCount.value === 0 && (h('p', { 'class': css.sectionEmpty }, [
            t.value('section.empty'),
          ])),
          h('div', { 'role': 'tree', 'aria-label': t.value('tree.aria') }, [
            h(CatalogRows, { 'parentSessionId': rootSessionId.value, 'currentSessionId': currentSessionId.value, 'catalog': catalog, 'catalogs': catalogs.value, 'summaries': summaries.value, 'expanded': expanded.value, 'level': 1, 'openChild': openChild.value, 'openChildAside': openChildAside.value, 'refreshProjection': prepareLevel, 'toggleBranch': toggleBranch, 'closeCatalog': () => { changeOpen(false) }, 't': t.value }),
          ]),
          props.renderFooter?.(),
        ]),
      ] })), document.body),
    ]))
  }
}, { name: 'CatalogDropdown', inheritAttrs: false, props: ['rootSessionId', 'currentSessionId', 'displayTitle', 'openTitle', 'variant', 'useSessions', 'useSessionStatus', 'openChild', 'openChildAside', 'prepareCatalog', 't', 'hasSharedTasks', 'hasBoardContent', 'renderFooter'] })
/** Full props for the root-session catalog entry in the header actions band. */
export type SubagentCatalogActionProps = PropsRuntime<'conversation.session.header.actions'> & InjectFace<SubagentCatalogActionInjected> & PropsLocale<typeof NS> & Omit<PropsRenderSlots<'conversation.session.header.actions.subagent.footer'>, 'SessionProvider'>
/**
 * Session-header catalog action for root sessions: the descendant count and
 * its dropdown after the preset label in the header actions band. Child sessions render nothing
 * here — their breadcrumb switcher in the lineage slot owns the same
 * navigation.
 * @param props - Session standard props plus the catalog actions and translator.
 * @returns The count dropdown, or null on a child session.
 */
export const SubagentCatalogAction = defineComponent((props: SubagentCatalogActionProps) => {
  const addressedChild = props.useSession(snapshot => snapshot.subagent !== null)
  const listedChild = props.useSessions(state => state.byId[props.sessionId]?.origin === 'subagent')
  return () => {
    if (addressedChild.value || listedChild.value)
      return null
    return h(RootCatalogAction, { ...props })
  }
}, { name: 'SubagentCatalogAction', inheritAttrs: false, props: ['useSession', 'useSessions', 'sessionId', 'useProjection', 'useSessionStatus', 'useFooterAvailable', 'openChild', 'openChildAside', 'refreshProjection', 'prepareCatalog', 't', 'renderSlot'] })
const RootCatalogAction = defineComponent((props: SubagentCatalogActionProps) => {
  const hasSharedTasks = props.useProjection('agentTeam', team => team?.enabled === true
        && team.tasks.some(task => task.status !== 'deleted'))
  const hasTaskFailure = props.useProjection('agentTeam', team => team?.enabled === true && team.failure !== undefined)
  const footerAvailable = props.useFooterAvailable(value => value)
  return () => {
    const { sessionId, useSessions, useSessionStatus, openChild, openChildAside, refreshProjection, prepareCatalog, t, renderSlot } = props
    return (h(CatalogDropdown, { 'key': sessionId, 'rootSessionId': sessionId, 'variant': 'count', 'hasSharedTasks': footerAvailable.value && hasSharedTasks.value === true, 'hasBoardContent': footerAvailable.value && (hasSharedTasks.value === true || hasTaskFailure.value === true), 'renderFooter': () => renderSlot('conversation.session.header.actions.subagent.footer', {}), 'useSessions': useSessions, 'useSessionStatus': useSessionStatus, 'openChild': openChild, 'openChildAside': openChildAside, 'refreshProjection': refreshProjection, 'prepareCatalog': prepareCatalog, 't': t }))
  }
}, { name: 'RootCatalogAction', inheritAttrs: false, props: ['sessionId', 'useProjection', 'useSessions', 'useSessionStatus', 'useFooterAvailable', 'openChild', 'openChildAside', 'refreshProjection', 'prepareCatalog', 't', 'renderSlot'] })
/**
 * Render one breadcrumb title together with its subagent navigation.
 * @param props - Breadcrumb title, session standard props, and catalog actions.
 * @returns A title-and-chevron sibling switcher, or nothing on a root session.
 */
export const SubagentHeaderLineage = defineComponent((props: SubagentHeaderLineageProps) => {
  const address = props.useSession(session => session.subagent?.address)
  const parentId = props.useSessions((state) => {
    if (address.value?.childSessionId === props.lineageSessionId)
      return address.value.parentSessionId
    for (const [parentId, snapshot] of Object.entries(state.projectionsBySession)) {
      if (snapshot.values.subagentCatalog?.some(entry => entry.id === props.lineageSessionId))
        return parentId as SessionId
    }
    const summary = state.byId[props.lineageSessionId]
    return summary?.origin === 'subagent' ? summary.parentId : undefined
  })
  return () => {
    const { lineageSessionId, displayTitle, openTitle, useSessions, useSessionStatus, openChild, openChildAside,
      refreshProjection, prepareCatalog, t } = props
    const shared = { useSessions, useSessionStatus, openChild, openChildAside, refreshProjection, prepareCatalog, t }
    // Root sessions carry no breadcrumb; their descendant count lives in the
    // header actions band (SubagentCatalogAction).
    if (parentId.value === undefined)
      return null
    return (h(Fragment, null, [
      h(CatalogDropdown, { 'key': `switcher:${lineageSessionId}`, 'rootSessionId': parentId.value, 'currentSessionId': lineageSessionId, 'variant': 'switcher', 'displayTitle': displayTitle, ...openTitle === undefined ? {} : { openTitle }, ...shared }),
      openTitle === undefined && (h(CatalogDropdown, { 'key': `children:${lineageSessionId}`, 'rootSessionId': lineageSessionId, 'variant': 'count', ...shared })),
    ]))
  }
}, { name: 'SubagentHeaderLineage', inheritAttrs: false, props: ['lineageSessionId', 'displayTitle', 'openTitle', 'useSessions', 'useSession', 'useSessionStatus', 'openChild', 'openChildAside', 'refreshProjection', 'prepareCatalog', 't'] })
function portal(content: VNodeChild, target: Element): VNodeChild { return h(Teleport, { to: target }, [content]) }
