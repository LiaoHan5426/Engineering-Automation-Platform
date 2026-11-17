import { onMounted, computed, defineComponent, Fragment, h, watch, shallowRef, type CSSProperties } from 'vue'
/** Chrome-Network-style overview timeline for focusing the trajectory ledger. */
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TrajectoryTurnModel } from './layout.ts'
import type { TrajectoryTranslate } from './locales.ts'
import type { AssistantMetricDetail, TrajectoryCellKind, TrajectoryCellProps } from './trajectory-record.ts'
import { deriveTrajectoryTimeline, formatTimelineOffset, type TrajectoryTimelineMode, type TrajectoryTimeRange } from './timeline.ts'
import css from './TrajectoryTimeline.module.css'
const MINIMUM_DRAG_PX = 3
const MINIMUM_ZOOM_OPERATIONS = 4
const EDGE_PAN_ZONE_FRACTION = 0.08
const EDGE_PAN_STEP_FRACTION = 0.025
const MAXIMUM_EDGE_PAN_PX = 32
const TIMELINE_TOOLTIP_DELAY_MS = 500
interface TimelineRecordDetail {
  decodingMs?: number
  durationMs?: number
  startedAt?: number
  ttftMs?: number
}
interface FractionRange {
  start: number
  end: number
}
interface HoverPoint {
  fraction: number
  recordIndex: number | null
}
interface PanGesture {
  anchorClientX: number
  anchorStart: number
  moved: boolean
  pannable: boolean
  pointerId: number
}
function assistantTimingDetail(metrics: AssistantMetricDetail | undefined): Pick<TimelineRecordDetail, 'ttftMs' | 'decodingMs'> {
  const start = metrics?.stepStartTime
  const first = metrics?.firstTokenTime
  const completed = metrics?.completedTime
  if (metrics?.timingRecorded !== true
        || typeof start !== 'number'
        || typeof first !== 'number'
        || typeof completed !== 'number'
        || !Number.isFinite(start)
        || !Number.isFinite(first)
        || !Number.isFinite(completed)
        || first < start
        || completed < first)
    return {}
  return { ttftMs: first - start, decodingMs: completed - first }
}
function timelineRecordDetail(cell: TrajectoryCellProps): TimelineRecordDetail {
  const durationMs = cell.timeSeconds === null || !Number.isFinite(cell.timeSeconds)
    ? undefined
    : Math.max(0, cell.timeSeconds * 1000)
  const startedAt = cell.startedAt === null || !Number.isFinite(cell.startedAt)
    ? undefined
    : cell.startedAt
  return {
    ...(durationMs === undefined ? {} : { durationMs }),
    ...(startedAt === undefined ? {} : { startedAt }),
    ...assistantTimingDetail(cell.assistantMetrics),
  }
}
function timelineKindLabel(kind: TrajectoryCellKind, t: TrajectoryTranslate): string {
  switch (kind) {
    case 'system': return t('kind.system')
    case 'user': return t('kind.user')
    case 'context': return t('kind.context')
    case 'compacted': return t('kind.compacted')
    case 'message': return t('kind.assistant')
    case 'tool': return t('kind.tool')
    case 'subtool': return t('kind.subtool')
  }
}
function formatRecordedTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  })
}
function timelineTooltipLabel(kind: TrajectoryCellKind, detail: TimelineRecordDetail | undefined, t: TrajectoryTranslate): string {
  const heading = timelineKindLabel(kind, t)
  if (detail === undefined)
    return heading
  const duration = detail.durationMs === undefined
    ? null
    : t('timeline.total', { duration: formatTimelineOffset(detail.durationMs, t) })
  const range = detail.startedAt === undefined
    ? null
    : detail.durationMs === undefined
      ? t('timeline.started', { time: formatRecordedTime(detail.startedAt) })
      : `${formatRecordedTime(detail.startedAt)} → ${formatRecordedTime(detail.startedAt + detail.durationMs)}`
  const segments = detail.ttftMs === undefined || detail.decodingMs === undefined
    ? null
    : t('timeline.ttftDecoding', {
      ttft: formatTimelineOffset(detail.ttftMs, t),
      decoding: formatTimelineOffset(detail.decodingMs, t),
    })
  const timing = [duration, segments].filter(value => value !== null).join(' · ')
  return [heading, range, timing].filter(value => value !== null && value !== '').join('\n')
}
/** Props for the fixed full-domain overview above the trajectory ledger. */
export interface TrajectoryTimelineProps {
  t: TrajectoryTranslate
  turns: readonly TrajectoryTurnModel[]
  mode: TrajectoryTimelineMode
  range: TrajectoryTimeRange | null
  /** Whether the loaded timeline omits an earlier history prefix. */
  hasEarlierRecords?: boolean
  /** Load one earlier history page from the truncation control. */
  onLoadEarlier?: () => Promise<boolean>
  selectedIndex?: number | null
  /** Record indexes matching the active ledger search, or null without a query. */
  searchMatchIndexes?: ReadonlySet<number> | null
  onRangeChange: (range: TrajectoryTimeRange | null) => void
  /** Select a directly clicked timeline block. */
  onRecordSelect?: (index: number) => void
  /** Bring the nearest record into view after clicking timeline whitespace. */
  onRecordFocus?: (index: number) => void
}
function orderedRange(left: number, right: number): FractionRange {
  return left <= right ? { start: left, end: right } : { start: right, end: left }
}
function clampFraction(value: number): number {
  return Math.min(1, Math.max(0, value))
}
function centeredRange(center: number, width: number, minimum: number, maximum: number): FractionRange {
  const clampedWidth = Math.min(maximum - minimum, Math.max(0, width))
  const start = Math.min(Math.max(center - clampedWidth / 2, minimum), maximum - clampedWidth)
  return { start, end: start + clampedWidth }
}
function rangeFraction(range: TrajectoryTimeRange, start: number, duration: number, minimum: number, maximum: number): FractionRange {
  const bounded = orderedRange(Math.min(maximum, Math.max(minimum, range.start)), Math.min(maximum, Math.max(minimum, range.end)))
  return {
    start: (bounded.start - start) / duration,
    end: (bounded.end - start) / duration,
  }
}
const LaneLabels = defineComponent((props: {
  t: TrajectoryTranslate
}) => {
  return () => {
    return (h('div', { 'class': css.labels, 'aria-hidden': 'true' }, [
      h('span', null, [
        props.t('column.input'),
      ]),
      h('span', null, [
        props.t('column.model'),
      ]),
      h('span', null, [
        props.t('column.tools'),
      ]),
    ]))
  }
}, { name: 'LaneLabels', inheritAttrs: false, props: ['t'] })
const EarlierHistoryBoundary = defineComponent((props: {
  loading: boolean
  onHover: () => void
  onLoad: (() => void) | undefined
  t: TrajectoryTranslate
}) => {
  return () => {
    return (h(Tooltip, { 'label': props.loading ? props.t('history.loadingEarlier') : props.t('history.clickToLoadEarlier'), 'side': 'right', 'delayMs': TIMELINE_TOOLTIP_DELAY_MS }, { default: () => [
      h('button', { 'type': 'button', 'class': css.earlierHistory, 'data-earlier-history': true, 'data-loading': props.loading || undefined, 'aria-label': props.loading ? props.t('history.loadingEarlierAria') : props.t('history.loadEarlier'), 'aria-disabled': props.loading || props.onLoad === undefined, 'onClick': props.onLoad, 'onPointerenter': (event: PointerEvent) => {
        event.stopPropagation()
        props.onHover()
      }, 'onPointermove': (event: PointerEvent & {
        currentTarget: HTMLInputElement
      }) => { event.stopPropagation() }, 'onPointerdown': (event: PointerEvent & {
        currentTarget: HTMLInputElement
      }) => { event.stopPropagation() } }, [
        '\u2026',
      ]),
    ] }))
  }
}, { name: 'EarlierHistoryBoundary', inheritAttrs: false, props: ['loading', 'onHover', 'onLoad', 't'] })
/** Overview renderer with drag ranges, click-sized focus, and Escape reset. */
export const TrajectoryTimeline = defineComponent((props: TrajectoryTimelineProps) => {
  const model = computed(() => deriveTrajectoryTimeline(props.turns, props.mode))
  const detailByIndex = computed(() => new Map(props.turns.flatMap(turn => turn.groups.flatMap(group =>
    group.cells.map(cell => [cell.index, timelineRecordDetail(cell)] as const)))))
  const dragRef = shallowRef<{
    pointerId: number
    anchorTime: number
    anchorClientX: number
    recordIndex: number | null
  } | null>(null)
  const panRef = shallowRef<PanGesture | null>(null)
  const rootRef = shallowRef<HTMLElement | null>(null)
  const trackRef = shallowRef<HTMLDivElement | null>(null)
  const draft = shallowRef<TrajectoryTimeRange | null>(null)
  const hover = shallowRef<HoverPoint | null>(null)
  const loadingEarlier = shallowRef(false)
  const panning = shallowRef(false)
  const viewport = shallowRef<TrajectoryTimeRange | null>(null)
  const animateViewport = shallowRef(false)
  onMounted(() => {
    watch(() => [model.value, props.onRangeChange, props.range], () => {
      if (model.value !== null
                  && props.range !== null
                  && (props.range.end < model.value.start || props.range.start > model.value.end)) {
        props.onRangeChange(null)
      }
    }, { immediate: true, flush: 'post' })
  })
  onMounted(() => {
    watch(() => [model.value], () => {
      if (model.value === null)
        return
      animateViewport.value = false
      viewport.value = (current => current !== null && (current.end < model.value.start || current.start > model.value.end)
        ? null
        : current)(viewport.value)
    }, { immediate: true, flush: 'post' })
  })
  onMounted(() => {
    watch(() => [model.value, (props.selectedIndex ?? null)], () => {
      if (model.value === null || (props.selectedIndex ?? null) === null)
        return
      const selectedSpan = model.value.spans.find(span => span.index === (props.selectedIndex ?? null))
      if (selectedSpan === undefined)
        return
      animateViewport.value = true
      viewport.value = ((current) => {
        if (current === null)
          return current
        if (selectedSpan.end > current.start
                      && selectedSpan.start < current.end)
          return current
        const duration = Math.max(1, current.end - current.start)
        const desiredStart = selectedSpan.end <= current.start
          ? selectedSpan.start
          : selectedSpan.end - duration
        const nextStart = Math.min(Math.max(desiredStart, model.value.start), Math.max(model.value.start, model.value.end - duration))
        if (nextStart === current.start)
          return current
        return { start: nextStart, end: nextStart + duration }
      })(viewport.value)
    }, { immediate: true, flush: 'post' })
  })
  const fullDuration = computed(() => {
    const modelSnapshot = model.value
    return Math.max(1, (modelSnapshot?.end ?? 0) - (modelSnapshot?.start ?? 0))
  })
  const viewportDuration = computed(() => Math.min(fullDuration.value, Math.max(1, (viewport.value?.end ?? 0) - (
    viewport.value?.start ?? 0))))
  const viewportStart = computed(() => {
    const modelSnapshot = model.value
    return modelSnapshot === null || viewport.value === null
      ? modelSnapshot?.start ?? 0
      : Math.min(Math.max(viewport.value.start, modelSnapshot.start), modelSnapshot.end - viewportDuration.value)
  })
  const domainDuration = computed(() => viewport.value === null ? fullDuration.value : viewportDuration.value)
  const domainStart = computed(() => {
    const modelSnapshot = model.value
    return viewport.value === null ? modelSnapshot?.start ?? 0 : viewportStart.value
  })
  const showsEarlierBoundary = computed(() => {
    const modelSnapshot = model.value
    return (props.hasEarlierRecords ?? false) && modelSnapshot !== null
            && domainStart.value === modelSnapshot.start
  })
  const loadEarlier = computed(() => props.onLoadEarlier === undefined || loadingEarlier.value
    ? undefined
    : () => {
      loadingEarlier.value = true
      void props.onLoadEarlier?.().finally(() => { loadingEarlier.value = false })
    })
  const projectedDomainStyle = computed(() => {
    const modelSnapshot = model.value
    return modelSnapshot === null
      ? undefined
      : {
        '--trajectory-domain-left': `${-(domainStart.value - modelSnapshot.start) / domainDuration.value * 100}%`,
        '--trajectory-domain-width': `${fullDuration.value / domainDuration.value * 100}%`,
      } satisfies CSSProperties
  })
  const committed = computed(() => {
    const modelSnapshot = model.value
    return modelSnapshot === null || props.range === null
      ? null
      : rangeFraction(props.range, domainStart.value, domainDuration.value, modelSnapshot.start, modelSnapshot.end)
  })
  const draftFraction = computed(() => {
    const modelSnapshot = model.value
    return modelSnapshot === null || draft.value === null
      ? null
      : rangeFraction(draft.value, domainStart.value, domainDuration.value, modelSnapshot.start, modelSnapshot.end)
  })
  const visibleRange = computed(() => draftFraction.value ?? committed.value)
  const activeRange = computed(() => draft.value ?? props.range)
  onMounted(() => {
    watch(() => [domainDuration.value, domainStart.value, fullDuration.value, props.mode, model.value], (_next, _previous, cleanup) => {
      const dispose3 = (() => {
        const root = rootRef.value
        if (root === null)
          return
        const onWheel = (event: globalThis.WheelEvent): void => {
          event.preventDefault()
          const track = trackRef.value
          if (track === null || model.value === null)
            return
          animateViewport.value = false
          const rect = track.getBoundingClientRect()
          const anchorFraction = clampFraction((event.clientX - rect.left) / Math.max(1, rect.width))
          const nextDuration = Math.min(fullDuration.value, Math.max(Math.min(props.mode === 'sequence' ? MINIMUM_ZOOM_OPERATIONS : 20, fullDuration.value), domainDuration.value * Math.exp(event.deltaY * 0.0015)))
          if (nextDuration >= fullDuration.value * 0.999) {
            viewport.value = null
            return
          }
          const anchorTime = domainStart.value + anchorFraction * domainDuration.value
          const nextStart = Math.min(Math.max(anchorTime - anchorFraction * nextDuration, model.value.start),
            model.value.end - nextDuration)
          viewport.value = { start: nextStart, end: nextStart + nextDuration }
        }
        root.addEventListener('wheel', onWheel, { passive: false })
        return () => { root.removeEventListener('wheel', onWheel) }
      })()
      if (typeof dispose3 === 'function')
        cleanup(dispose3)
    }, { immediate: true, flush: 'post' })
  })
  const minimumSelectionDuration = computed(() => {
    const modelSnapshot = model.value
    return Math.min(domainDuration.value, fullDuration.value / (modelSnapshot?.spans.length ?? 1))
  })
  const fractionAt = computed(() => (event: PointerEvent & {
    currentTarget: HTMLDivElement
  }): number => {
    const rect = event.currentTarget.getBoundingClientRect()
    return clampFraction((event.clientX - rect.left) / Math.max(1, rect.width))
  })
  const recordIndexAt = computed(() => (event: PointerEvent & {
    currentTarget: HTMLDivElement
  }): number | null => {
    const target = event.target instanceof HTMLElement ? event.target : null
    const value = target?.closest<HTMLElement>('[data-timeline-record-index]')
      ?.dataset.timelineRecordIndex
    if (value === undefined)
      return null
    const index = Number(value)
    return Number.isFinite(index) ? index : null
  })
  const commit = computed(() => (nextRange: TrajectoryTimeRange) => {
    props.onRangeChange(nextRange)
  })
  const onPointerDown = computed(() => (event: PointerEvent & {
    currentTarget: HTMLDivElement
  }) => {
    if (event.button === 2) {
      panRef.value = {
        anchorClientX: event.clientX,
        anchorStart: domainStart.value,
        moved: false,
        pannable: viewport.value !== null,
        pointerId: event.pointerId,
      }
      if (viewport.value !== null)
        animateViewport.value = false
      panning.value = true
      if (typeof event.currentTarget.setPointerCapture === 'function') {
        event.currentTarget.setPointerCapture(event.pointerId)
      }
      return
    }
    if (event.button !== 0)
      return
    const anchor = fractionAt.value(event)
    const anchorTime = domainStart.value + anchor * domainDuration.value
    const recordIndex = recordIndexAt.value(event)
    hover.value = { fraction: anchor, recordIndex }
    dragRef.value = {
      pointerId: event.pointerId,
      anchorTime,
      anchorClientX: event.clientX,
      recordIndex,
    }
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    draft.value = { start: anchorTime, end: anchorTime }
  })
  const onPointerMove = computed(() => {
    const modelSnapshot = model.value
    return (event: PointerEvent & {
      currentTarget: HTMLDivElement
    }) => {
      if (modelSnapshot === null)
        return
      const rect = event.currentTarget.getBoundingClientRect()
      const fraction = fractionAt.value(event)
      hover.value = { fraction, recordIndex: recordIndexAt.value(event) }
      const pan = panRef.value
      if (pan !== null && pan.pointerId === event.pointerId) {
        if (Math.abs(event.clientX - pan.anchorClientX) >= MINIMUM_DRAG_PX) {
          pan.moved = true
        }
        if (!pan.pannable)
          return
        const delta = (event.clientX - pan.anchorClientX) / Math.max(1, rect.width)
        const nextStart = Math.min(Math.max(pan.anchorStart - delta * domainDuration.value, modelSnapshot.start),
          modelSnapshot.end - domainDuration.value)
        viewport.value = { start: nextStart, end: nextStart + domainDuration.value }
        return
      }
      const drag = dragRef.value
      if (drag === null || drag.pointerId !== event.pointerId)
        return
      let nextDomainStart = domainStart.value
      if (viewport.value !== null) {
        const localX = event.clientX - rect.left
        const edgeWidth = Math.min(MAXIMUM_EDGE_PAN_PX, Math.max(1, rect.width * EDGE_PAN_ZONE_FRACTION))
        const direction = localX < edgeWidth
          ? -1
          : localX > rect.width - edgeWidth ? 1 : 0
        if (direction !== 0) {
          const edgeDistance = direction < 0
            ? edgeWidth - localX
            : localX - (rect.width - edgeWidth)
          const strength = clampFraction(edgeDistance / edgeWidth)
          const desiredStart = domainStart.value + direction * domainDuration.value * EDGE_PAN_STEP_FRACTION
                        * Math.max(0.2, strength)
          nextDomainStart = Math.min(Math.max(desiredStart, modelSnapshot.start), modelSnapshot.end - domainDuration.value)
          if (nextDomainStart !== domainStart.value) {
            animateViewport.value = false
            viewport.value = {
              start: nextDomainStart,
              end: nextDomainStart + domainDuration.value,
            }
          }
        }
      }
      const pointTime = nextDomainStart + fraction * domainDuration.value
      draft.value = orderedRange(drag.anchorTime, pointTime)
    }
  })
  const onPointerEnd = computed(() => {
    const modelSnapshot = model.value
    return (event: PointerEvent & {
      currentTarget: HTMLDivElement
    }) => {
      if (modelSnapshot === null)
        return
      const pan = panRef.value
      if (pan !== null && pan.pointerId === event.pointerId) {
        const moved = pan.moved
                    || Math.abs(event.clientX - pan.anchorClientX) >= MINIMUM_DRAG_PX
        panRef.value = null
        panning.value = false
        if (!moved)
          props.onRangeChange(null)
        return
      }
      const drag = dragRef.value
      if (drag === null || drag.pointerId !== event.pointerId)
        return
      const pointFraction = fractionAt.value(event)
      const pointTime = domainStart.value + pointFraction * domainDuration.value
      const selected = orderedRange(drag.anchorTime, pointTime)
      hover.value = { fraction: pointFraction, recordIndex: recordIndexAt.value(event) }
      dragRef.value = null
      draft.value = null
      const click = Math.abs(event.clientX - drag.anchorClientX) < MINIMUM_DRAG_PX
      const clickedSpan = click && drag.recordIndex !== null
        ? modelSnapshot.spans.find(span => span.index === drag.recordIndex)
        : undefined
      if (clickedSpan !== undefined) {
        props.onRangeChange(null)
        props.onRecordSelect?.(clickedSpan.index)
        return
      }
      const committedRange = selected.end - selected.start < minimumSelectionDuration.value
        ? centeredRange(click ? selected.start : (selected.start + selected.end) / 2,
          minimumSelectionDuration.value, modelSnapshot.start, modelSnapshot.end)
        : selected
      commit.value(committedRange)
      if (click) {
        const timelinePoint = selected.start
        const nearest = modelSnapshot.spans.reduce((candidate, span) => {
          const candidateDistance = timelinePoint < candidate.start
            ? candidate.start - timelinePoint
            : timelinePoint > candidate.end ? timelinePoint - candidate.end : 0
          const spanDistance = timelinePoint < span.start
            ? span.start - timelinePoint
            : timelinePoint > span.end ? timelinePoint - span.end : 0
          return spanDistance < candidateDistance ? span : candidate
        })
        props.onRecordFocus?.(nearest.index)
      }
    }
  })
  const onKeyDown = computed(() => (event: KeyboardEvent & {
    currentTarget: HTMLDivElement
  }) => {
    if (event.key !== 'Escape' || props.range === null)
      return
    event.preventDefault()
    props.onRangeChange(null)
  })
  const onPointerCancel = computed(() => () => {
    dragRef.value = null
    panRef.value = null
    draft.value = null
    hover.value = null
    panning.value = false
  })
  return () => {
    const modelSnapshot = model.value
    const searchMatchIndexesSnapshot = props.searchMatchIndexes ?? null
    if (modelSnapshot === null) {
      return (h('section', { 'ref': rootRef, 'class': css.root, 'aria-label': props.t('timeline.aria') }, [
        h('div', { 'class': css.plot }, [
          h(LaneLabels, { 't': props.t }),
          h('div', { 'class': css.track }, [
            h('span', { 'class': css.empty }, [
              props.t('timeline.noTimingData'),
            ]),
            (props.hasEarlierRecords ?? false) && (h(EarlierHistoryBoundary, { 'loading': loadingEarlier.value, 'onHover': () => { hover.value = null }, 'onLoad': loadEarlier.value, 't': props.t })),
          ]),
        ]),
      ]))
    }
    return (h('section', { 'ref': rootRef, 'class': css.root, 'aria-label': props.t('timeline.aria') }, [
      h('div', { 'class': css.plot }, [
        h(LaneLabels, { 't': props.t }),
        h('div', { 'ref': trackRef, 'class': css.track, 'data-panning': panning.value || undefined, 'aria-label': props.t('timeline.overviewAria'), 'tabIndex': 0, 'onKeydown': onKeyDown.value, 'onPointerdown': onPointerDown.value, 'onPointermove': onPointerMove.value, 'onPointerup': onPointerEnd.value, 'onPointercancel': onPointerCancel.value, 'onPointerleave': () => {
          if (dragRef.value === null && panRef.value === null)
            hover.value = null
        }, 'onDblclick': (event: MouseEvent & {
          currentTarget: HTMLInputElement
        }) => {
          event.preventDefault()
          props.onRangeChange(null)
        }, 'onContextmenu': (event: MouseEvent) => {
          event.preventDefault()
        } }, [
          showsEarlierBoundary.value && (h(EarlierHistoryBoundary, { 'loading': loadingEarlier.value, 'onHover': () => { hover.value = null }, 'onLoad': loadEarlier.value, 't': props.t })),
          hover.value !== null && hover.value.recordIndex === null && draft.value === null && (h('div', { 'class': css.hoverLine, 'data-timeline-hover-line': true, 'aria-hidden': 'true', 'style': {
            '--trajectory-hover-left': `${hover.value.fraction * 100}%`,
          } satisfies CSSProperties })),
          visibleRange.value !== null && (h(Fragment, null, [
            h('div', { 'class': css.selection, 'data-dragging': draft.value === null ? undefined : 'true', 'aria-hidden': 'true', 'style': {
              '--trajectory-selection-left': `${visibleRange.value.start * 100}%`,
              '--trajectory-selection-width': `${(visibleRange.value.end - visibleRange.value.start) * 100}%`,
            } satisfies CSSProperties }),
            h('div', { 'class': css.selectionEdges, 'data-dragging': draft.value === null ? undefined : 'true', 'aria-hidden': 'true', 'style': {
              '--trajectory-selection-left': `${visibleRange.value.start * 100}%`,
              '--trajectory-selection-width': `${(visibleRange.value.end - visibleRange.value.start) * 100}%`,
            } satisfies CSSProperties }),
          ])),
          h('div', { 'class': css.turnBoundaries, 'data-animate-viewport': animateViewport.value || undefined, 'aria-hidden': 'true', 'style': projectedDomainStyle.value }, [
            modelSnapshot.turnBoundaries
              .filter(boundary => boundary.time > modelSnapshot.start
                            && boundary.time >= domainStart.value
                            && boundary.time <= domainStart.value + domainDuration.value)
              .map(boundary => (h('span', { 'class': css.turnBoundary, 'data-turn': boundary.turn, 'key': boundary.turn, 'style': {
                '--trajectory-turn-left': `${(boundary.time - modelSnapshot.start) / fullDuration.value * 100}%`,
              } satisfies CSSProperties }))),
          ]),
          h('div', { 'class': css.lanes, 'data-animate-viewport': animateViewport.value || undefined, 'data-timeline-domain': true, 'style': projectedDomainStyle.value }, [
            modelSnapshot.spans
              .filter(span => span.index === (props.selectedIndex ?? null)
                            || (span.end >= domainStart.value && span.start <= domainStart.value + domainDuration.value))
              .map((span) => {
                const left = (span.start - modelSnapshot.start) / fullDuration.value
                const width = (span.end - span.start) / fullDuration.value
                const widthPercent = width * 100
                const detail = detailByIndex.value.get(span.index)
                const ttftMs = detail?.ttftMs
                const decodingMs = detail?.decodingMs
                const ttftFraction = ttftMs === undefined
                                || decodingMs === undefined
                                || ttftMs + decodingMs <= 0
                  ? null
                  : ttftMs / (ttftMs + decodingMs)
                return (h(Tooltip, { 'key': span.index, 'label': () => timelineTooltipLabel(span.kind, detail, props.t), 'side': 'bottom', 'delayMs': TIMELINE_TOOLTIP_DELAY_MS }, { default: () => [
                  h('span', { 'aria-hidden': 'true', 'class': css.span, 'data-timeline-span': span.kind, 'data-timeline-record-index': span.index, 'data-assistant-timing': ttftFraction === null ? undefined : 'true', 'data-error': span.isError || undefined, 'data-equal-duration': props.mode === 'time' || undefined, 'data-current': span.index === (props.selectedIndex ?? null) || undefined, 'data-hovered': hover.value?.recordIndex === span.index || undefined, 'data-search-match': searchMatchIndexesSnapshot === null
                    ? undefined
                    : searchMatchIndexesSnapshot.has(span.index) ? 'true' : 'false', 'data-selected': activeRange.value === null
                    ? undefined
                    : span.start <= activeRange.value.end && span.end >= activeRange.value.start
                      ? 'true'
                      : 'false', 'style': {
                        '--trajectory-span-left': `${left * 100}%`,
                        '--trajectory-span-width': `${widthPercent}%`,
                        '--trajectory-span-gap': `min(${widthPercent * 0.08}%, 1px)`,
                        '--trajectory-span-lane': span.lane,
                        ...(ttftFraction === null
                          ? {}
                          : { '--trajectory-assistant-ttft': `${ttftFraction * 100}%` }),
                      } satisfies CSSProperties }),
                ] }))
              }),
          ]),
        ]),
      ]),
    ]))
  }
}, { name: 'TrajectoryTimeline', inheritAttrs: false, props: ['t', 'turns', 'mode', 'range', 'hasEarlierRecords', 'onLoadEarlier', 'selectedIndex', 'searchMatchIndexes', 'onRangeChange', 'onRecordSelect', 'onRecordFocus'] })
