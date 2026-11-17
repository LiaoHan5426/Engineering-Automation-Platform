import { onUpdated, onMounted, computed, defineComponent, Fragment, h, useId, watchEffect, watch, shallowRef, type VNodeChild, type CSSProperties } from 'vue'
/** Turn-aware trajectory event ledger with a local record inspector. */
import { assertNever, type JsonValue } from '@deepseek-ai/dsh-util-values'
import type { WatchToolResult } from './watch-tool-result.ts'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { CodeBlock, FileTypeIcon, fileExtension, fileSizeText, IconCheckOutlineRegular, IconChevronRightOutlineRegular, IconCodeOutlineRegular, IconWrapLinesOutlineRegular, IconCopyOutlineRegular, IconSettingsOutlineRegular, IconSparkleRegular, IconUserOutlineRegular, JsonTree, MarkdownText, StateDot, Tooltip, writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import type { JsonTreeLabels, JsonTreeProps, MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import { structuredPatch } from 'diff'
import type { AssistantRequestConfig, ConversationPromptSnapshot, MessageImageLoader } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { AssistantMetricDetail, TrajectoryCellKind, TrajectoryCellProps, TrajectorySourceBlock } from './trajectory-record.ts'
import { formatElapsedSeconds, trajectoryRecordId } from './trajectory-record.ts'
import { groupTrajectoryVirtualRows, trajectoryVirtualRecordKey } from './trajectory-virtual-rows.ts'
import type { TrajectoryVirtualRow } from './trajectory-virtual-rows.ts'
import type { TrajectoryTurnModel } from './layout.ts'
import { trajectoryPreviewText } from './trajectory-preview.ts'
import type { TrajectoryKey, TrajectoryTranslate } from './locales.ts'
import { COMPACTION_INTERRUPTED_ERROR } from './copy-codes.ts'
import { codeProgram, isProgramTool, type CodeProgram } from './code-program.ts'
import css from './TrajectoryTable.module.css'
const BOTTOM_FOLLOW_THRESHOLD_PX = 2
const OLDER_LOAD_THRESHOLD_PX = 48
const HISTORY_LOAD_ROW_HEIGHT_PX = 30
const VIRTUALIZATION_THRESHOLD = 100
const VIRTUAL_OVERSCAN_ROWS = 12
const VIRTUAL_INITIAL_VIEWPORT_HEIGHT_PX = 600
const KIND_LABEL_KEY: Record<TrajectoryCellKind, TrajectoryKey> = {
  system: 'kind.system',
  user: 'kind.user',
  context: 'kind.context',
  compacted: 'kind.compacted',
  message: 'kind.assistant',
  tool: 'kind.tool',
  subtool: 'kind.subtool',
}
const ToolWrenchIcon = defineComponent(() => {
  return () => {
    return (h('svg', { 'width': '13', 'height': '13', 'viewBox': '0 0 16 16', 'fill': 'none', 'stroke': 'currentColor', 'stroke-width': '1.5', 'strokeLinecap': 'round', 'strokeLinejoin': 'round', 'data-role-icon': 'wrench', 'aria-hidden': 'true' }, [
      h('path', { 'd': 'M14 3.3a3.8 3.8 0 0 1-4.8 4.8l-5.1 5.1a1.6 1.6 0 1 1-2.3-2.3l5.1-5.1A3.8 3.8 0 0 1 11.7 1l-2.3 2.3 2.3 2.3L14 3.3Z' }),
    ]))
  }
}, { name: 'ToolWrenchIcon', inheritAttrs: false, props: [] })
const InformationIcon = defineComponent(() => {
  return () => {
    return (h('svg', { 'width': '14', 'height': '14', 'viewBox': '0 0 16 16', 'fill': 'none', 'stroke': 'currentColor', 'stroke-width': '1.4', 'strokeLinecap': 'round', 'data-role-icon': 'information', 'aria-hidden': 'true' }, [
      h('circle', { 'cx': '8', 'cy': '8', 'r': '6.7' }),
      h('circle', { 'cx': '8', 'cy': '5.5', 'r': '.85', 'fill': 'currentColor', 'stroke': 'none' }),
      h('path', { 'd': 'M8 7.75v3.4', 'stroke-width': '1.8' }),
    ]))
  }
}, { name: 'InformationIcon', inheritAttrs: false, props: [] })
const CompactedIcon = defineComponent(() => {
  return () => {
    return (h('svg', { 'width': '13', 'height': '13', 'viewBox': '0 0 16 16', 'fill': 'none', 'stroke': 'currentColor', 'stroke-width': '1.5', 'strokeLinecap': 'round', 'strokeLinejoin': 'round', 'data-role-icon': 'compacted', 'aria-hidden': 'true' }, [
      h('path', { 'd': 'm2.5 2.5 3.75 3.75M3 6.25h3.25V3' }),
      h('path', { 'd': 'm13.5 2.5-3.75 3.75M13 6.25H9.75V3' }),
      h('path', { 'd': 'm2.5 13.5 3.75-3.75M3 9.75h3.25V13' }),
      h('path', { 'd': 'm13.5 13.5-3.75-3.75M13 9.75H9.75V13' }),
    ]))
  }
}, { name: 'CompactedIcon', inheritAttrs: false, props: [] })
const KIND_ICON: Record<TrajectoryCellKind, VNodeChild> = {
  system: h(IconSettingsOutlineRegular, { 'size': 13 }),
  user: h(IconUserOutlineRegular, { 'size': 13 }),
  context: h(InformationIcon, null),
  compacted: h(CompactedIcon, null),
  message: h(IconSparkleRegular, { 'size': 13 }),
  tool: h(ToolWrenchIcon, null),
  subtool: h(ToolWrenchIcon, null),
}
interface TableRecord {
  turn: number | null
  section: number
  group: string
  groupStart: boolean
  turnStart: boolean
  cell: TrajectoryCellProps
  turnEnd: boolean
  collapsedSummary?: string
  collapsedSummaryKind?: 'turn' | 'assistant' | 'tool'
}
const COLLAPSED_SUMMARY_LABEL_KEY: Record<NonNullable<TableRecord['collapsedSummaryKind']>, TrajectoryKey> = {
  turn: 'request.collapsedTurn',
  assistant: 'request.collapsedAssistant',
  tool: 'request.collapsedTool',
}
interface VirtualRowStructure {
  height: number
  key: string
}
function useStableVirtualRowStructure(rows: Readonly<import('vue').Ref<readonly TrajectoryVirtualRow<TableRecord>[]>>): import('vue').ComputedRef<readonly VirtualRowStructure[]> {
  let cache: {
    rows: readonly TrajectoryVirtualRow<TableRecord>[]
    structure: readonly VirtualRowStructure[]
  } = { rows: [], structure: [] }
  return computed(() => {
    const current = rows.value
    if (cache.rows === current)
      return cache.structure
    const structure = cache.structure.length === current.length && current.every((row, index) => {
      const previous = cache.structure[index]; return previous?.key === row.key &&
      previous.height === row.height }) ? cache.structure : current.map(row => ({ key: row.key, height: row.height }))
    cache = { rows: current, structure }
    return structure
  })
}
type DetailTab = 'system-prompt' | 'tools' | 'overview' | 'rendered' | 'raw' | 'source' | 'input' | 'output' | 'schema' | 'options' | 'usage' | 'timing' | 'diff'
type RecordState = 'complete' | 'running' | 'error'
interface DetailTabItem {
  id: DetailTab
  labelKey: TrajectoryKey
}
interface ParentRecords {
  message?: TableRecord
  tool?: TableRecord
}
interface ToolCallTextParts {
  program: boolean
  name: string
  args?: string
}
interface SelectedRequest {
  identity: string
}
interface DetailsResizeDrag {
  pointerId: number
  startX: number
  startWidth: number
  splitWidth: number
  startToolRequestOffset: number
}
const DETAILS_MIN_WIDTH = 320
const DETAILS_MAX_WIDTH = 720
const TABLE_MIN_WIDTH = 280
const DETAILS_RESIZE_STEP = 16
const TOOL_REQUEST_SHARE = 0.58
const TOOL_REQUEST_MIN_WIDTH = 180
const TOOL_REQUEST_MAX_WIDTH = 480
const DEFAULT_TOOL_REQUEST_SHARE = 0.36
const DEFAULT_TOOL_REQUEST_OFFSET = 56
const SYSTEM_PROMPT_TABS: readonly DetailTabItem[] = [
  { id: 'system-prompt', labelKey: 'tab.systemPrompt' },
  { id: 'tools', labelKey: 'tab.tools' },
]
const SYSTEM_UPDATE_TABS: readonly DetailTabItem[] = [
  { id: 'diff', labelKey: 'tab.diff' },
  ...SYSTEM_PROMPT_TABS,
]
const REQUEST_TABS: readonly DetailTabItem[] = [
  { id: 'overview', labelKey: 'tab.summary' },
  { id: 'options', labelKey: 'tab.options' },
  { id: 'usage', labelKey: 'tab.usage' },
  { id: 'timing', labelKey: 'tab.timing' },
]
function jsonTreeLabels(t: TrajectoryTranslate): JsonTreeLabels {
  return {
    copyValue: t('copy.value'),
    copyJson: t('copy.json'),
    copyPath: t('copy.path'),
    copyPrettyJson: t('copy.prettyJson'),
    copyCompactJson: t('copy.compactJson'),
    copied: t('copied'),
    copyFailed: t('copy.failed'),
    collapseNode: t('collapse'),
    expandNode: t('expand'),
    copyButtonTitle: action => t('copy.optionsHint', { action }),
  }
}
function markdownLabels(t: TrajectoryTranslate): MarkdownLabels {
  return {
    code: { copyLabel: t('copy'), copiedLabel: t('copied') },
    footnotes: t('markdown.footnotes'),
  }
}
type TrajectorySplitStyle = CSSProperties & {
  '--trajectory-tool-request-width': string
}
type RequestBoundaryStyle = CSSProperties & {
  '--request-boundary-offset': string
}
type VirtualSpacerStyle = CSSProperties & {
  '--trajectory-virtual-spacer-height': string
}
interface OlderLoadAnchor {
  readonly historyStartSeq: number | undefined
  readonly scrollHeight: number
  readonly scrollTop: number
}
function clampDetailsWidth(width: number, splitWidth: number): number {
  const maxWidth = Math.max(DETAILS_MIN_WIDTH, Math.min(DETAILS_MAX_WIDTH, splitWidth - TABLE_MIN_WIDTH))
  return Math.round(Math.min(Math.max(width, DETAILS_MIN_WIDTH), maxWidth))
}
function defaultToolRequestWidth(splitWidth: number): number {
  return Math.min(Math.max(splitWidth * DEFAULT_TOOL_REQUEST_SHARE - DEFAULT_TOOL_REQUEST_OFFSET,
    TOOL_REQUEST_MIN_WIDTH), TOOL_REQUEST_MAX_WIDTH)
}
function formatDurationMs(milliseconds: number, t: TrajectoryTranslate): string {
  if (milliseconds < 1000)
    return t('unit.milliseconds', { value: Math.round(milliseconds) })
  return t('unit.seconds', {
    value: (milliseconds / 1000).toFixed(milliseconds < 10000 ? 2 : 1),
  })
}
function formatStartedAt(timestamp: number | null, t: TrajectoryTranslate): string {
  if (timestamp === null || !Number.isFinite(timestamp))
    return t('timing.notAvailable')
  const date = new Date(timestamp)
  const two = (value: number) => String(value).padStart(2, '0')
  const three = (value: number) => String(value).padStart(3, '0')
  const time = `${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}.${three(date.getMilliseconds())}`
  const day = `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`
  return `${day} ${time}`
}
/** Whether a click lands on an active text selection and should keep it. */
function clickSelectsText(target: Node): boolean {
  const selection = window.getSelection()
  return selection !== null
        && !selection.isCollapsed
        && selection.rangeCount > 0
        && selection.getRangeAt(0).intersectsNode(target)
}
const StartedAtValue = defineComponent((props: {
  timestamp: number | null
  t: TrajectoryTranslate
}) => {
  const showUnix = shallowRef(false)
  return () => {
    if (props.timestamp === null || !Number.isFinite(props.timestamp))
      return h('dd', null, [
        props.t('timing.notAvailable'),
      ])
    return (h('dd', null, [
      h('button', { 'type': 'button', 'class': css.timestampToggle, 'title': showUnix.value ? props.t('timing.showLocalTime') : props.t('timing.showUnixTimestamp'), 'onClick': (event: MouseEvent & {
        currentTarget: HTMLElement
      }) => {
        if (clickSelectsText(event.currentTarget))
          return
        showUnix.value = (current => !current)(showUnix.value)
      } }, [
        showUnix.value ? (props.timestamp / 1000).toFixed(3) : formatStartedAt(props.timestamp, props.t),
      ]),
    ]))
  }
}, { name: 'StartedAtValue', inheritAttrs: false, props: ['timestamp', 't'] })
function totalTime(metrics: AssistantMetricDetail, t: TrajectoryTranslate): string {
  if (!metrics.timingRecorded)
    return t('timing.notRecorded')
  if (metrics.stepStartTime === null)
    return t('timing.stepStartUnavailable')
  if (metrics.completedTime === null)
    return t('status.pending')
  return formatDurationMs(Math.max(0, metrics.completedTime - metrics.stepStartTime), t)
}
function ttft(metrics: AssistantMetricDetail, t: TrajectoryTranslate): string {
  if (!metrics.timingRecorded)
    return t('timing.notRecorded')
  if (metrics.stepStartTime === null)
    return t('timing.stepStartUnavailable')
  if (metrics.firstTokenTime === null)
    return t('timing.firstTokenUnavailable')
  return formatDurationMs(Math.max(0, metrics.firstTokenTime - metrics.stepStartTime), t)
}
function generationTime(metrics: AssistantMetricDetail, t: TrajectoryTranslate): string {
  if (!metrics.timingRecorded || metrics.firstTokenTime === null)
    return t('timing.firstTokenUnavailable')
  if (metrics.completedTime === null)
    return t('status.pending')
  return formatDurationMs(Math.max(0, metrics.completedTime - metrics.firstTokenTime), t)
}
function throughput(metrics: AssistantMetricDetail, t: TrajectoryTranslate): string {
  if (!metrics.usageProvided)
    return t('timing.usageUnavailable')
  if (metrics.outputTokens === null)
    return t('timing.outputTokensUnavailable')
  if (!metrics.timingRecorded || metrics.firstTokenTime === null)
    return t('timing.firstTokenUnavailable')
  if (metrics.completedTime === null)
    return t('status.pending')
  const generationSeconds = (metrics.completedTime - metrics.firstTokenTime) / 1000
  if (generationSeconds <= 0)
    return t('timing.durationTooShort')
  return t('unit.tokensPerSecond', {
    value: (metrics.outputTokens / generationSeconds).toFixed(1),
  })
}
const AssistantTimingPanel = defineComponent((props: {
  metrics: AssistantMetricDetail
  t: TrajectoryTranslate
}) => {
  return () => {
    return (h('dl', { 'class': css.overview }, [
      h('div', null, [
        h('dt', null, [
          props.t('timing.started'),
        ]),
        h(StartedAtValue, { 'timestamp': props.metrics.stepStartTime, 't': props.t }),
      ]),
      h('div', null, [
        h('dt', null, [
          props.t('timing.totalDuration'),
        ]),
        h('dd', null, [
          totalTime(props.metrics, props.t),
        ]),
      ]),
      h('div', null, [
        h('dt', null, [
          props.t('timing.ttft'),
        ]),
        h('dd', null, [
          ttft(props.metrics, props.t),
        ]),
      ]),
      h('div', null, [
        h('dt', null, [
          props.t('timing.generation'),
        ]),
        h('dd', null, [
          generationTime(props.metrics, props.t),
        ]),
      ]),
      h('div', null, [
        h('dt', null, [
          props.t('timing.throughput'),
        ]),
        h('dd', null, [
          throughput(props.metrics, props.t),
        ]),
      ]),
    ]))
  }
}, { name: 'AssistantTimingPanel', inheritAttrs: false, props: ['metrics', 't'] })
/** Props for the trajectory ledger. */
export interface TrajectoryTableProps {
  /** Observe the selected result while the Result tab is open. */
  watchToolResult?: WatchToolResult | undefined
  /** Wrapping control shared by all JSON inspectors. */
  stringWrapping?: JsonTreeProps['stringWrapping']
  /** Trajectory locale seat. */
  t: TrajectoryTranslate
  /** Slot-backed durable image renderer shared with the Chat gallery. */
  renderSlot: PropsRenderSlots<'conversation.trajectory.images'>['renderSlot']
  /** Session-bound loader for durable message image attachments. */
  loadImage: MessageImageLoader
  /** Session-global request numbers for the request groups visible in this context. */
  requestNumbers?: readonly TrajectoryRequestNumber[]
  /** Grouped records in display order. */
  turns: readonly TrajectoryTurnModel[]
  /** In-flight cells whose content replaces the matching structural record index. */
  streamingCells?: readonly TrajectoryCellProps[]
  /** Record indexes emphasized by the active timeline focus. */
  timelineFocusIndexes?: ReadonlySet<number> | null
  /** Record indexes retained by the active live search, or null without a query. */
  searchMatchIndexes?: ReadonlySet<number> | null
  /** Report the record currently selected in the local inspector. */
  onSelectedIndexChange?: (index: number | null) => void
  /** Report a direct user selection from a ledger row. */
  onRecordSelect?: (index: number) => void
  /** One externally requested record selection; a new object repeats the request. */
  recordSelection?: {
    readonly index: number
  } | null
  /** One externally requested record focus without changing inspector selection. */
  recordFocus?: {
    readonly index: number
  } | null
  /** Whether the initial history tail is still loading. */
  historyLoading?: boolean
  /** Whether one older history page request is pending anywhere. */
  olderHistoryLoading?: boolean
  /** First loaded raw event, used to preserve scroll position after prepending a page. */
  historyStartSeq?: number | undefined
  /** Whether one older history page can be requested. */
  hasOlderRecords?: boolean
  /** Load one older history page. */
  onLoadOlder?: () => Promise<boolean>
  /** Clear selection state owned by the ledger host. */
  onClearSelection?: () => void
  /** Turn ids whose rows after the first are folded into a summary. */
  collapsedTurns: ReadonlySet<number>
  /** Toggle one turn between folded and expanded. */
  onToggleTurn: (turn: number) => void
  /** Stable Assistant record ids whose tool calls are folded. */
  collapsedAssistants: ReadonlySet<string>
  /** Toggle tool calls under one assistant record. */
  onToggleAssistant: (id: string) => void
  /** Stable tool record ids whose nested calls are folded. */
  collapsedTools: ReadonlySet<string>
  /** Toggle nested calls under one tool record. */
  onToggleTool: (id: string) => void
  /** One-shot cross-view inspect: open and scroll to this call's record. */
  inspectCallId?: string | null
  /** Acknowledge a consumed (or unresolvable) inspect request. */
  onInspectApplied?: (() => void) | undefined
}
/** Request-inspector fields shared by ordinary generation and compaction. */
interface TrajectoryRequestNumberBase {
  group: string
  number: number
  status?: 'complete' | 'running' | 'error'
  startedAt?: number
  completedAt?: number | null
  error?: string
  errorCode?: string
  retry?: number
  maxRetries?: number
  retryDelayMs?: number
  resultSeq?: number
  provider?: string
  model?: string
  requestConfig?: AssistantRequestConfig
  usage?: TrajectoryUsage
  cumulativeUsage?: TrajectoryUsage
}
/** One purpose-discriminated request identity paired with its session-global number. */
export type TrajectoryRequestNumber = TrajectoryRequestNumberBase & ({
  purpose?: 'assistant'
  /** Request anchor event sequence; absent for the currently streaming request. */
  seq?: number
  turn: number
  step: number
} | {
  purpose: 'compaction'
  /** Request anchor event sequence and stable compaction identity. */
  seq: number
  turn: number | null
  step: 0
})
/** Disjoint provider token buckets for one request or a session prefix. */
export interface TrajectoryUsage {
  input?: number
  cacheRead?: number
  cacheWrite?: number
  output?: number
  reasoning?: number
}
function flattenRecords(turns: readonly TrajectoryTurnModel[]): TableRecord[] {
  return turns.flatMap((turn, section) => {
    let firstInSection = true
    const records = turn.groups.flatMap((group) => {
      return group.cells.map((cell, index) => {
        const turnStart = firstInSection
                    && cell.requestOnly !== true
                    && cell.kind !== 'system'
                    && (cell.kind !== 'compacted' || turn.turn === null)
        if (turnStart)
          firstInSection = false
        return {
          turn: turn.turn,
          section,
          group: group.title,
          groupStart: index === 0,
          turnStart,
          cell,
          turnEnd: false,
        }
      })
    })
    const last = records.at(-1)
    if (last !== undefined)
      last.turnEnd = true
    return records
  })
}
function filterRecords(records: readonly TableRecord[], matches: ReadonlySet<number>): TableRecord[] {
  const filtered = records
    .filter(record => record.cell.requestOnly !== true && matches.has(record.cell.index))
    .map(record => ({ ...record, groupStart: false, turnStart: false, turnEnd: false }))
  const startedSections = new Set<number>()
  for (const [index, record] of filtered.entries()) {
    const previous = filtered[index - 1]
    const next = filtered[index + 1]
    record.groupStart = previous === undefined
            || previous.section !== record.section
            || previous.group !== record.group
    record.turnStart = !startedSections.has(record.section)
            && record.cell.kind !== 'system'
            && (record.cell.kind !== 'compacted' || record.turn === null)
    if (record.turnStart)
      startedSections.add(record.section)
    record.turnEnd = next === undefined || next.section !== record.section
  }
  return filtered
}
function requestKey(turn: number | null, group: string): string {
  return `${turn}\u0000${group}`
}
function requestIdentity(request: TrajectoryRequestNumber): string {
  return request.purpose === 'compaction'
    ? `compaction\u0000${request.seq}`
    : `assistant\u0000${request.turn}\u0000${request.step}`
}
function indexRequestBoundaries(records: readonly TableRecord[], requestGroups: ReadonlySet<string>): ReadonlyMap<string, number> {
  const boundaries = new Map<string, number>()
  for (const record of records) {
    const key = requestKey(record.turn, record.group)
    if (!requestGroups.has(key))
      continue
    if (boundaries.has(key))
      continue
    if (record.cell.kind === 'user' || record.cell.kind === 'context' || record.cell.kind === 'system')
      continue
    boundaries.set(key, record.cell.index)
  }
  return boundaries
}
function sectionLabel(turn: number | null, t: TrajectoryTranslate): string {
  return turn === null ? t('section.betweenTurns') : t('turn.label', { turn })
}
function indexRequestNumbers(sessionNumbers: readonly TrajectoryRequestNumber[] | undefined): ReadonlyMap<string, number> {
  const numbers = new Map<string, number>()
  for (const request of sessionNumbers ?? []) {
    numbers.set(requestKey(request.turn, request.group), request.number)
  }
  return numbers
}
function indexRequestBoundaryRuns(records: readonly TableRecord[], requestGroups: ReadonlySet<string>): ReadonlyMap<number, number> {
  const indexes = new Map<number, number>()
  let runLength = 0
  for (const record of records) {
    if (record.cell.requestOnly === true) {
      indexes.set(record.cell.index, runLength++)
      continue
    }
    if (runLength > 0
            && record.groupStart
            && requestGroups.has(requestKey(record.turn, record.group))) {
      indexes.set(record.cell.index, runLength)
    }
    runLength = 0
  }
  return indexes
}
function summarizeTurn(records: readonly TableRecord[], requestGroups: ReadonlySet<string>, t: TrajectoryTranslate): string {
  const steps = new Set(records
    .map(record => requestKey(record.turn, record.group))
    .filter(key => requestGroups.has(key))).size
  const toolCalls = records.filter(record => record.cell.kind === 'tool' || record.cell.kind === 'subtool').length
  return [
    t(steps === 1 ? 'summary.steps.one' : 'summary.steps.other', { count: steps }),
    t(toolCalls === 1 ? 'summary.toolCalls.one' : 'summary.toolCalls.other', {
      count: toolCalls,
    }),
  ].join(' · ')
}
function collapseTurnRecords(records: readonly TableRecord[], collapsedTurns: ReadonlySet<number>,
  requestGroups: ReadonlySet<string>, t: TrajectoryTranslate): TableRecord[] {
  const recordsByTurn = new Map<number, TableRecord[]>()
  for (const record of records) {
    if (record.turn === null)
      continue
    const turnRecords = recordsByTurn.get(record.turn) ?? []
    turnRecords.push(record)
    recordsByTurn.set(record.turn, turnRecords)
  }
  return records.flatMap((record) => {
    if (record.turn === null || !collapsedTurns.has(record.turn))
      return [record]
    const turnRecords = recordsByTurn.get(record.turn) ?? [record]
    if (record.cell.requestOnly === true || record.cell.kind === 'system')
      return [record]
    const contentRecords = turnRecords.filter(candidate => candidate.cell.requestOnly !== true && candidate.cell.kind !== 'system')
    if (contentRecords.length <= 1)
      return [record]
    if (record.cell.index !== contentRecords[0]?.cell.index)
      return []
    return [
      { ...record, turnEnd: false },
      {
        ...record,
        groupStart: false,
        turnStart: false,
        turnEnd: true,
        collapsedSummary: summarizeTurn(contentRecords.slice(1), requestGroups, t),
        collapsedSummaryKind: 'turn',
      },
    ]
  })
}
function assistantToolCalls(records: readonly TableRecord[], assistantIndex: number): readonly TableRecord[] {
  const at = records.findIndex(record => record.cell.index === assistantIndex)
  if (at === -1 || records[at]?.cell.kind !== 'message')
    return []
  const calls: TableRecord[] = []
  for (let i = at + 1; i < records.length; i++) {
    const record = records[i]
    if (record === undefined)
      break
    if (record.cell.kind !== 'tool' && record.cell.kind !== 'subtool')
      break
    calls.push(record)
  }
  return calls
}
function summarizeCalls(records: readonly TableRecord[], t: TrajectoryTranslate): string {
  const names = [...new Set(records.map((record) => {
    const separator = record.cell.text.indexOf(' · ')
    return separator === -1 ? record.cell.text : record.cell.text.slice(0, separator)
  }).filter(name => name !== ''))]
  const count = records.length
  const summary = t(count === 1 ? 'summary.toolCalls.one' : 'summary.toolCalls.other', { count })
  return names.length > 0 ? `${summary} · ${names.join(', ')}` : summary
}
function collapseCallRecords(records: readonly TableRecord[], collapsedIds: ReadonlySet<string>, kind: 'assistant' | 'tool', t: TrajectoryTranslate): TableRecord[] {
  const out: TableRecord[] = []
  for (let i = 0; i < records.length; i++) {
    const record = records[i]
    if (record === undefined)
      continue
    out.push(record)
    if (record.collapsedSummary !== undefined
            || record.cell.kind !== (kind === 'assistant' ? 'message' : 'tool')
            || !collapsedIds.has(trajectoryRecordId(record.cell)))
      continue
    const calls: TableRecord[] = []
    for (let j = i + 1; j < records.length; j++) {
      const candidate = records[j]
      if (candidate === undefined
                || candidate.collapsedSummary !== undefined
                || (candidate.cell.kind !== 'tool' && candidate.cell.kind !== 'subtool')
                || (kind === 'tool' && candidate.cell.kind !== 'subtool'))
        break
      calls.push(candidate)
    }
    if (calls.length === 0)
      continue
    const last = calls.at(-1)
    out[out.length - 1] = { ...record, turnEnd: false }
    out.push({
      ...record,
      groupStart: false,
      turnStart: false,
      turnEnd: last?.turnEnd ?? false,
      collapsedSummary: summarizeCalls(calls, t),
      collapsedSummaryKind: kind,
    })
    i += calls.length
  }
  return out
}
function stateOf(record: TableRecord): RecordState {
  if (record.cell.isError)
    return 'error'
  if (record.cell.kind === 'compacted' && record.cell.timeSeconds === null)
    return 'running'
  if (record.cell.assistantMetrics?.completedTime === null)
    return 'running'
  if ((record.cell.kind === 'tool' || record.cell.kind === 'subtool')
        && record.cell.outputDetail === undefined)
    return 'running'
  return 'complete'
}
function statusLabel(state: RecordState, t: TrajectoryTranslate): string {
  if (state === 'error')
    return t('status.failed')
  if (state === 'running')
    return t('status.pending')
  return t('status.completed')
}
function requestErrorMessage(request: Pick<TrajectoryRequestNumber, 'error' | 'errorCode'>, t: TrajectoryTranslate): string | undefined {
  if (request.errorCode === 'AUTH')
    return t('details.failure.auth')
  if (request.error === COMPACTION_INTERRUPTED_ERROR)
    return t('layout.compactionInterrupted')
  return request.error
}
const TokenRows = defineComponent((props: {
  cell: TrajectoryCellProps
  t: TrajectoryTranslate
}) => {
  const content = computed(() => props.cell.output !== undefined && props.cell.think !== undefined
    ? Math.max(0, props.cell.output - props.cell.think)
    : undefined)
  return () => {
    return (h(Fragment, null, [
      h('div', null, [
        h('dt', null, [
          props.t('usage.tokens'),
        ]),
        h('dd', null, [
          props.cell.output === undefined ? '—' : props.t('unit.tokens', { value: props.cell.output }),
        ]),
      ]),
      props.cell.think !== undefined && (h('div', { 'class': css.requestTokenDetail }, [
        h('dt', null, [
          props.t('usage.reasoning'),
        ]),
        h('dd', null, [
          props.t('unit.tokens', { value: props.cell.think }),
        ]),
      ])),
      content.value !== undefined && (h('div', { 'class': css.requestTokenDetail }, [
        h('dt', null, [
          props.t('usage.content'),
        ]),
        h('dd', null, [
          props.t('unit.tokens', { value: content.value }),
        ]),
      ])),
    ]))
  }
}, { name: 'TokenRows', inheritAttrs: false, props: ['cell', 't'] })
function inputTotal(usage: TrajectoryUsage): number | undefined {
  if (usage.input === undefined
        && usage.cacheRead === undefined
        && usage.cacheWrite === undefined)
    return undefined
  return (usage.input ?? 0) + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0)
}
const UsageRows = defineComponent((props: {
  usage: TrajectoryUsage | undefined
  t: TrajectoryTranslate
}) => {
  const totalInput = computed(() => {
    const usageSnapshot = props.usage
    return usageSnapshot === undefined ? undefined : inputTotal(usageSnapshot)
  })
  const otherOutput = computed(() => {
    const usageSnapshot = props.usage
    return usageSnapshot?.output !== undefined && usageSnapshot.reasoning !== undefined
      ? usageSnapshot.output - usageSnapshot.reasoning
      : undefined
  })
  return () => {
    const usageSnapshot = props.usage
    if (usageSnapshot === undefined)
      return h('p', { 'class': css.noPayload }, [
        props.t('usage.notReported'),
      ])
    return (h('dl', { 'class': css.overview }, [
      totalInput.value !== undefined && (h('div', null, [
        h('dt', null, [
          props.t('usage.input'),
        ]),
        h('dd', null, [
          props.t('unit.tokens', { value: totalInput.value }),
        ]),
      ])),
      usageSnapshot.cacheRead !== undefined && (h('div', { 'class': css.requestTokenDetail }, [
        h('dt', null, [
          props.t('usage.cached'),
        ]),
        h('dd', null, [
          props.t('unit.tokens', { value: usageSnapshot.cacheRead }),
        ]),
      ])),
      usageSnapshot.cacheWrite !== undefined && (h('div', { 'class': css.requestTokenDetail }, [
        h('dt', null, [
          props.t('usage.cacheCreated'),
        ]),
        h('dd', null, [
          props.t('unit.tokens', { value: usageSnapshot.cacheWrite }),
        ]),
      ])),
      usageSnapshot.input !== undefined && (h('div', { 'class': css.requestTokenDetail }, [
        h('dt', null, [
          props.t('usage.other'),
        ]),
        h('dd', null, [
          props.t('unit.tokens', { value: usageSnapshot.input }),
        ]),
      ])),
      usageSnapshot.output !== undefined && (h('div', null, [
        h('dt', null, [
          props.t('usage.output'),
        ]),
        h('dd', null, [
          props.t('unit.tokens', { value: usageSnapshot.output }),
        ]),
      ])),
      usageSnapshot.reasoning !== undefined && (h('div', { 'class': css.requestTokenDetail }, [
        h('dt', null, [
          props.t('usage.reasoning'),
        ]),
        h('dd', null, [
          props.t('unit.tokens', { value: usageSnapshot.reasoning }),
        ]),
      ])),
      otherOutput.value !== undefined && (h('div', { 'class': css.requestTokenDetail }, [
        h('dt', null, [
          props.t('usage.content'),
        ]),
        h('dd', null, [
          props.t('unit.tokens', { value: otherOutput.value }),
        ]),
      ])),
    ]))
  }
}, { name: 'UsageRows', inheritAttrs: false, props: ['usage', 't'] })
const RequestUsagePanel = defineComponent((props: {
  usage: TrajectoryUsage | undefined
  cumulative: TrajectoryUsage | undefined
  t: TrajectoryTranslate
}) => {
  return () => {
    const usageSnapshot = props.usage
    return (h('div', { 'class': css.usagePanel }, [
      h('section', { 'class': css.usageGroup }, [
        h('h4', { 'class': css.usageHeading }, [
          props.t('usage.thisRequest'),
        ]),
        h(UsageRows, { 'usage': usageSnapshot, 't': props.t }),
      ]),
      h('section', { 'class': css.usageGroup }, [
        h('h4', { 'class': css.usageHeading }, [
          props.t('usage.sessionCumulative'),
        ]),
        h(UsageRows, { 'usage': props.cumulative, 't': props.t }),
      ]),
    ]))
  }
}, { name: 'RequestUsagePanel', inheritAttrs: false, props: ['usage', 'cumulative', 't'] })
const RequestOptions = defineComponent((props: {
  options: AssistantRequestConfig | undefined
  preview?: boolean
  stringWrapping: JsonTreeProps['stringWrapping']
  t: TrajectoryTranslate
}) => {
  return () => {
    if (props.options === undefined) {
      return h('p', { 'class': css.noPayload }, [
        props.t('options.notRecorded'),
      ])
    }
    return (h(JsonTree, { 'data': props.options, 'stringWrapping': props.stringWrapping, 'collapsedStringLines': (props.preview ?? false) ? 3 : 12, 'label': props.t('options.json'), 'labels': jsonTreeLabels(props.t), 'className': (props.preview ?? false) ? css.jsonPreview : css.jsonPayload }))
  }
}, { name: 'RequestOptions', inheritAttrs: false, props: ['options', 'preview', 'stringWrapping', 't'] })
function messageSourceLabel(source: unknown, t: TrajectoryTranslate): string {
  if (typeof source !== 'object' || source === null || Array.isArray(source)) {
    return t('source.unknown')
  }
  const properties = source as Record<string, unknown>
  const kind = properties.kind
  if (kind === 'user')
    return t('source.user')
  if (kind === 'goal') {
    const round = properties.round
    return typeof round === 'number' && round > 0
      ? t('source.goalRound', { round })
      : t('source.goal')
  }
  if (typeof kind !== 'string' || kind === '')
    return t('source.unknown')
  return `${kind[0]?.toUpperCase() ?? ''}${kind.slice(1)}`
}
const MessageSource = defineComponent((props: {
  record: TableRecord
  stringWrapping: JsonTreeProps['stringWrapping']
  t: TrajectoryTranslate
}) => {
  const source = computed(() => props.record.cell.messageSource)
  const data = computed(() => typeof source.value === 'object' && source.value !== null
    ? source.value : { value: source.value })
  return () => {
    if (source.value === undefined)
      return h('p', { 'class': css.noPayload }, [
        props.t('source.notRecorded'),
      ])
    return (h(JsonTree, { 'data': data.value, 'stringWrapping': props.stringWrapping, 'collapsedStringLines': 12, 'label': props.t('source.messageJson'), 'labels': jsonTreeLabels(props.t), 'className': css.jsonPayload ?? '' }))
  }
}, { name: 'MessageSource', inheritAttrs: false, props: ['record', 'stringWrapping', 't'] })
function isMarkdownRecord(record: TableRecord): boolean {
  return record.cell.kind === 'user'
        || record.cell.kind === 'context'
        || record.cell.kind === 'message'
}
function parentRecords(records: readonly TableRecord[], record: TableRecord): ParentRecords {
  if (record.cell.kind !== 'tool' && record.cell.kind !== 'subtool')
    return {}
  const at = records.findIndex(candidate => candidate.cell.index === record.cell.index)
  if (at === -1)
    return {}
  let tool: TableRecord | undefined
  if (record.cell.kind === 'subtool') {
    for (let i = at - 1; i >= 0; i--) {
      const candidate = records[i]
      if (candidate === undefined
                || candidate.turn !== record.turn
                || candidate.group !== record.group)
        break
      if (candidate.cell.kind === 'tool') {
        tool = candidate
        break
      }
    }
  }
  const parentCallId = tool?.cell.callId ?? record.cell.callId
  let message: TableRecord | undefined
  if (parentCallId !== undefined) {
    message = records.find(candidate => candidate.turn === record.turn
            && candidate.cell.kind === 'message'
            && candidate.cell.sourceBlocks?.some(block => block.callId === parentCallId) === true)
  }
  return { ...(message === undefined ? {} : { message }), ...(tool === undefined ? {} : { tool }) }
}
function markdownSource(record: TableRecord): string | undefined {
  if (record.cell.kind === 'user' || record.cell.kind === 'context') {
    return record.cell.inputDetail
  }
  if (record.cell.kind === 'message' || record.cell.kind === 'compacted') {
    return record.cell.outputDetail
  }
  return undefined
}
function detailTabs(record: TableRecord): readonly DetailTabItem[] {
  if (record.cell.kind === 'system') {
    if (record.cell.promptDetail === undefined && record.cell.systemPromptDetail !== undefined) {
      return SYSTEM_PROMPT_TABS.filter(tab => tab.id === 'system-prompt')
    }
    return record.cell.previousPromptDetail === undefined
      ? SYSTEM_PROMPT_TABS
      : SYSTEM_UPDATE_TABS
  }
  if (record.cell.kind === 'compacted') {
    return [
      { id: 'overview', labelKey: 'tab.summary' },
      { id: 'raw', labelKey: 'tab.rawOutput' },
    ]
  }
  if (isMarkdownRecord(record)) {
    return [
      { id: 'overview', labelKey: 'tab.summary' },
      { id: 'rendered', labelKey: 'tab.preview' },
      { id: 'raw', labelKey: 'tab.raw' },
      ...(record.cell.messageSource === undefined
        ? []
        : [{ id: 'source', labelKey: 'tab.source' } as const]),
    ]
  }
  return [
    { id: 'overview', labelKey: 'tab.summary' },
    ...(record.cell.inputDetail ? [{
      id: 'input', labelKey: codeProgram(record.cell) === undefined ? 'tab.payload' : 'code.source',
    } as const] : []),
    ...(record.cell.outputDetail || codeProgram(record.cell) !== undefined
      ? [{ id: 'output', labelKey: 'tab.result' } as const] : []),
    { id: 'schema', labelKey: 'tab.schema' },
    { id: 'timing', labelKey: 'tab.timing' },
  ]
}
function recordDisplayText(cell: TrajectoryCellProps, t: TrajectoryTranslate): string {
  if (isToolCallOnly(cell, t))
    return ''
  const program = codeProgram(cell)
  if (program !== undefined)
    return `${cell.toolName} · ${program.description.replace(/\s+/g, ' ')}`
  if (cell.previewMarkdown !== undefined) {
    const preview = trajectoryPreviewText(cell.previewMarkdown)
    if (cell.text === '')
      return preview
    return preview === '' ? cell.text : `${cell.text} · ${preview}`
  }
  if (cell.text !== '')
    return cell.text
  const markdown = cell.kind === 'user' || cell.kind === 'context'
    ? cell.inputDetail
    : cell.kind === 'message'
      ? cell.outputDetail ?? cell.thinkingDetail
      : undefined
  return markdown === undefined ? '' : trajectoryPreviewText(markdown)
}
function recordResultText(cell: TrajectoryCellProps): string | undefined {
  return cell.resultPreviewMarkdown === undefined
    ? cell.result
    : trajectoryPreviewText(cell.resultPreviewMarkdown)
}
function toolCallTextParts(cell: TrajectoryCellProps, text: string): ToolCallTextParts | undefined {
  if (cell.kind !== 'tool' && cell.kind !== 'subtool')
    return undefined
  const program = isProgramTool(cell.toolName)
  const separator = text.indexOf(' · ')
  if (separator === -1)
    return { name: text, program }
  return {
    program,
    name: text.slice(0, separator),
    args: text.slice(separator + 3),
  }
}
function isToolCallOnly(cell: TrajectoryCellProps, t: TrajectoryTranslate): boolean {
  return cell.kind === 'message'
        && !cell.outputDetail
        && !cell.thinkingDetail
        && cell.text === t('layout.toolCallOnly')
}
interface RecordPresentationValue {
  displayText: string
  listDisplayText: string
  resultText: string | undefined
  toolCallOnly: boolean
  toolCallText: ToolCallTextParts | undefined
}
const RecordPresentation = defineComponent((props: {
  cell: TrajectoryCellProps
  t: TrajectoryTranslate
}, { slots }) => {
  const displayText = computed(() => recordDisplayText(props.cell, props.t))
  const resultText = computed(() => recordResultText(props.cell))
  const toolCallOnly = computed(() => isToolCallOnly(props.cell, props.t))
  const toolCallText = computed(() => toolCallTextParts(props.cell, displayText.value))
  const listDisplayText = computed(() => toolCallOnly.value ? props.t('record.toolCallOnly')
    : toolCallText.value === undefined
      ? displayText.value : [toolCallText.value.name, toolCallText.value.args].filter(Boolean).join(' '))
  return () => {
    return slots.default?.({
      displayText: displayText.value,
      listDisplayText: listDisplayText.value,
      resultText: resultText.value,
      toolCallOnly: toolCallOnly.value,
      toolCallText: toolCallText.value,
    })
  }
}, { name: 'RecordPresentation', inheritAttrs: false, props: ['cell', 't'] })
const RecordListText = defineComponent((props: Pick<RecordPresentationValue, 'displayText' | 'toolCallOnly' | 'toolCallText'> & {
  t: TrajectoryTranslate
}) => {
  return () => {
    if (props.toolCallOnly) {
      return h('span', { 'class': css.toolCallOnly }, [
        props.t('record.toolCallOnly'),
      ])
    }
    if (props.toolCallText === undefined)
      return props.displayText || '—'
    return (h(Fragment, null, [
      h('span', { 'class': css.toolCallNameTypeface }, [
        props.toolCallText.program && h(IconCodeOutlineRegular, { 'className': css.programIcon ?? '', 'size': 12 }),
        props.toolCallText.name || '—',
      ]),
      props.toolCallText.args !== undefined && (h('span', { 'class': props.toolCallText.program ? css.programSummary : css.toolCallPayload }, [
        props.toolCallText.args,
      ])),
    ]))
  }
}, { name: 'RecordListText', inheritAttrs: false, props: ['displayText', 'toolCallOnly', 'toolCallText', 't'] })
const MarkdownFragment = defineComponent((props: {
  text: string
  rendered: boolean
  preview: boolean
  variant?: 'body' | 'compact'
  t: TrajectoryTranslate
}) => {
  const labels = computed(() => markdownLabels(props.t))
  return () => {
    if (props.rendered) {
      return (h('div', { 'class': props.preview ? css.markdownPreview : css.markdownPayload }, [
        h(MarkdownText, { 'text': props.text, 'labels': labels.value, 'variant': (props.variant ?? 'body') }),
      ]))
    }
    return (h('pre', { 'class': `${css.payload} ${props.preview ? css.payloadPreview : ''}` }, [
      props.text,
    ]))
  }
}, { name: 'MarkdownFragment', inheritAttrs: false, props: ['text', 'rendered', 'preview', 'variant', 't'] })
const SourceBlocks = defineComponent((props: {
  blocks: readonly TrajectorySourceBlock[]
  onOpenCall: (callId: string) => void
  t: TrajectoryTranslate
}) => {
  const attachments = computed(() => new Map(recordAttachments(props.blocks, props.t).map(entry => [entry.index, entry])))
  return () => {
    return (h('div', { 'class': css.sourceBlocks }, [
      props.blocks.map((block, index) => {
        const attachment = attachments.value.get(index)
        return attachment !== undefined ? (h('details', { 'class': css.attachmentDisclosure, 'key': index }, [
          h('summary', null, [
            h('span', { 'class': css.sourceBlockLabel }, [
              props.t('block.label', { index: index + 1, type: block.type }),
            ]),
            h('span', { 'class': css.attachmentName, 'title': attachment.name }, [
              attachment.name,
            ]),
          ]),
          h('pre', { 'class': css.sourceBlockContent }, [
            block.content,
          ]),
        ]))
          : (h('section', { 'class': css.sourceBlock, 'key': index }, [
            block.callId !== undefined
              ? (h('button', { 'type': 'button', 'class': css.sourceBlockJumpTarget, 'aria-label': props.t('block.openSummary', { index: index + 1 }), 'title': props.t('block.openSummaryTitle'), 'onClick': () => {
                if (block.callId !== undefined)
                  props.onOpenCall(block.callId)
              } }, [
                h('span', { 'class': css.sourceBlockLabel }, [
                  props.t('block.label', { index: index + 1, type: block.type }),
                ]),
                h(IconChevronRightOutlineRegular, { 'className': css.sourceBlockJumpIcon ?? '', 'size': 12 }),
              ]))
              : (h('div', { 'class': css.sourceBlockHeader }, [
                h('span', { 'class': css.sourceBlockLabel }, [
                  props.t('block.label', { index: index + 1, type: block.type }),
                ]),
              ])),
            h('pre', { 'class': css.sourceBlockContent }, [
              block.content,
            ]),
          ]))
      }),
    ]))
  }
}, { name: 'SourceBlocks', inheritAttrs: false, props: ['blocks', 'onOpenCall', 't'] })
function recordAttachments(blocks: readonly TrajectorySourceBlock[] | undefined, t: TrajectoryTranslate) {
  let imageIndex = 0
  return (blocks ?? []).flatMap((block, index) => {
    const ref = block.attachment ?? block.file
    if (ref === undefined)
      return []
    if (block.attachment !== undefined)
      imageIndex += 1
    return [{
      block,
      index,
      name: ref.name ?? t('attachment.imageName', { index: imageIndex }),
      metadata: [
        block.attachment?.mediaType ?? fileExtension(ref.name ?? '').toUpperCase(),
        fileSizeText(ref.bytes),
        ...(block.attachment === undefined ? [] : [`${block.attachment.width} × ${block.attachment.height}`]),
      ].filter(Boolean).join(' · '),
    }]
  })
}
const RecordAttachments = defineComponent((props: {
  blocks: readonly TrajectorySourceBlock[] | undefined
  preview: boolean
  renderSlot: PropsRenderSlots<'conversation.trajectory.images'>['renderSlot']
  loadImage: MessageImageLoader
  t: TrajectoryTranslate
}) => {
  const attachments = computed(() => recordAttachments(props.blocks, props.t))
  return () => {
    if (attachments.value.length === 0)
      return null
    return (h('ul', { 'class': props.preview ? `${css.attachments} ${css.attachmentsPreview}` : css.attachments, 'aria-label': props.t('attachment.list') }, [
      attachments.value.map(({ block, index, name, metadata }) => (h('li', { 'class': css.attachmentRow, 'key': index }, [
        block.attachment !== undefined
          ? props.renderSlot('conversation.trajectory.images', {
            images: [{ attachment: block.attachment, label: name }],
            align: 'start',
            thumbnail: true,
            loadImage: props.loadImage,
          })
          : h('span', { 'class': css.attachmentIcon }, [
            h(FileTypeIcon, { 'path': name }),
          ]),
        h('div', { 'class': css.attachmentInfo }, [
          h('span', { 'class': css.attachmentName, 'title': name }, [
            name,
          ]),
          h('span', { 'class': css.attachmentMetadata }, [
            metadata,
          ]),
        ]),
      ]))),
    ]))
  }
}, { name: 'RecordAttachments', inheritAttrs: false, props: ['blocks', 'preview', 'renderSlot', 'loadImage', 't'] })
const AssistantToolCalls = defineComponent((props: {
  blocks: readonly TrajectorySourceBlock[] | undefined
  preview: boolean
  onOpenCall: (callId: string) => void
  t: TrajectoryTranslate
}) => {
  const calls = computed(() => props.blocks?.filter(block => block.type === 'tool-call') ?? [])
  return () => {
    if (calls.value.length === 0)
      return null
    return (h('ul', { 'class': props.preview ? `${css.assistantToolCalls} ${css.assistantToolCallsPreview}`
      : css.assistantToolCalls }, [
      calls.value.map((call, index) => (h('li', { 'key': call.callId ?? index }, [
        h('button', { 'type': 'button', 'class': css.assistantToolCallButton, 'title': props.t('block.openSummaryTitle'), 'onClick': () => {
          if (call.callId !== undefined)
            props.onOpenCall(call.callId)
        } }, [
          h('svg', { 'class': css.assistantToolCallIcon, 'width': '12', 'height': '12', 'viewBox': '0 0 24 24', 'fill': 'none', 'aria-hidden': 'true' }, [
            h('path', { 'd': 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z', 'stroke': 'currentColor', 'stroke-width': '1.8', 'strokeLinecap': 'round', 'strokeLinejoin': 'round' }),
          ]),
          h('span', { 'class': css.assistantToolCallText }, [
            h('span', { 'class': css.assistantToolCallName }, [
              call.toolName ?? props.t('details.toolCall'),
            ]),
            call.content !== '' && (h('span', { 'class': css.assistantToolCallArgs }, [
              call.content,
            ])),
          ]),
        ]),
      ]))),
    ]))
  }
}, { name: 'AssistantToolCalls', inheritAttrs: false, props: ['blocks', 'preview', 'onOpenCall', 't'] })
const ToolGlyph = defineComponent(() => {
  return () => {
    return (h('svg', { 'class': css.toolCatalogIcon, 'width': '12', 'height': '12', 'viewBox': '0 0 24 24', 'fill': 'none', 'aria-hidden': 'true' }, [
      h('path', { 'd': 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z', 'stroke': 'currentColor', 'stroke-width': '1.8', 'strokeLinecap': 'round', 'strokeLinejoin': 'round' }),
    ]))
  }
}, { name: 'ToolGlyph', inheritAttrs: false, props: [] })
const ToolCatalog = defineComponent((props: {
  tools: ConversationPromptSnapshot['tools']
  stringWrapping: JsonTreeProps['stringWrapping']
  t: TrajectoryTranslate
}) => {
  return () => {
    if (props.tools.length === 0)
      return h('p', { 'class': css.noPayload }, [
        props.t('record.toolsMissing'),
      ])
    return (h('div', { 'class': css.toolCatalog }, [
      props.tools.map((tool, index) => (h('details', { 'class': css.toolCatalogItem, 'key': `${tool.name}:${index}` }, [
        h('summary', { 'class': css.toolCatalogSummary }, [
          h(IconChevronRightOutlineRegular, { 'className': css.toolCatalogChevron ?? '', 'size': 12 }),
          h(ToolGlyph, null),
          h('span', { 'class': css.toolCatalogName }, [
            tool.name,
          ]),
          h('span', { 'class': css.toolCatalogDescription }, [
            tool.description,
          ]),
        ]),
        h('div', { 'class': css.toolCatalogDefinition }, [
          tool.description !== '' && (h('p', { 'class': css.toolCatalogFullDescription }, [
            tool.description,
          ])),
          h(JsonTree, { 'data': tool.parameters, 'stringWrapping': props.stringWrapping, 'label': props.t('record.namedParametersJson', { name: tool.name }), 'labels': jsonTreeLabels(props.t), 'className': css.toolCatalogTree ?? '' }),
        ]),
      ]))),
    ]))
  }
}, { name: 'ToolCatalog', inheritAttrs: false, props: ['tools', 'stringWrapping', 't'] })
interface PromptDiffLine {
  kind: 'meta' | 'context' | 'added' | 'removed'
  text: string
}
function promptDiffLines(before: string, after: string): readonly PromptDiffLine[] {
  const patch = structuredPatch('', '', before, after, undefined, undefined, { context: 3 })
  return patch.hunks.flatMap((hunk, hunkIndex) => [
    ...(hunkIndex === 0 ? [] : [{ kind: 'meta' as const, text: '' }]),
    {
      kind: 'meta' as const,
      text: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
    },
    ...hunk.lines.flatMap((line): PromptDiffLine[] => {
      if (line.startsWith('\\'))
        return []
      if (line.startsWith('+'))
        return [{ kind: 'added', text: line }]
      if (line.startsWith('-'))
        return [{ kind: 'removed', text: line }]
      return [{ kind: 'context', text: line }]
    }),
  ])
}
const PromptDiffSection = defineComponent((props: {
  title: string
  before: string
  after: string
}) => {
  const lines = computed(() => promptDiffLines(props.before, props.after))
  return () => {
    if (lines.value.length === 0)
      return null
    return (h('section', { 'class': css.promptDiffSection }, [
      h('h3', { 'class': css.promptDiffTitle }, [
        props.title,
      ]),
      h('pre', { 'class': css.promptDiff }, [
        lines.value.map((line, index) => (h('span', { 'class': css[`promptDiffLine${line.kind}`], 'key': index }, [
          line.text || ' ',
          '\n',
        ]))),
      ]),
    ]))
  }
}, { name: 'PromptDiffSection', inheritAttrs: false, props: ['title', 'before', 'after'] })
const SystemPromptDiff = defineComponent((props: {
  before: ConversationPromptSnapshot
  after: ConversationPromptSnapshot
  t: TrajectoryTranslate
}) => {
  const toolsBefore = computed(() => JSON.stringify(props.before.tools, null, 2))
  const toolsAfter = computed(() => JSON.stringify(props.after.tools, null, 2))
  return () => {
    return (h('div', { 'class': css.promptDiffSections }, [
      props.before.system !== props.after.system && (h(PromptDiffSection, { 'title': props.t('record.systemPrompt'), 'before': props.before.system, 'after': props.after.system })),
      toolsBefore.value !== toolsAfter.value && (h(PromptDiffSection, { 'title': props.t('record.tools'), 'before': toolsBefore.value, 'after': toolsAfter.value })),
    ]))
  }
}, { name: 'SystemPromptDiff', inheritAttrs: false, props: ['before', 'after', 't'] })
const ToolOutputBlocks = defineComponent((props: {
  blocks: readonly TrajectorySourceBlock[]
  error: boolean
  /** Failure name and code shown only when no recorded text block is non-empty. */
  errorDetail?: string | undefined
  preview: boolean
  renderSlot: PropsRenderSlots<'conversation.trajectory.images'>['renderSlot']
  loadImage: MessageImageLoader
}) => {
  return () => {
    return (h('div', { 'class': [
      css.resultBlocks,
      props.preview ? css.resultBlocksPreview : undefined,
      props.error ? css.errorPayload : undefined,
    ].filter((value): value is string => value !== undefined).join(' ') }, [
      props.error && props.errorDetail !== undefined && props.errorDetail !== ''
                && !props.blocks.some(block => block.type === 'text' && block.content !== '')
                && h('pre', { 'class': css.resultBlockText }, [
                  props.errorDetail,
                ]),
      props.blocks.map((block, index) => (block.attachment !== undefined
        ? (h('div', { 'class': css.messageImages, 'key': index }, [
          props.renderSlot('conversation.trajectory.images', { images: [{ attachment: block.attachment }], align: 'start', loadImage: props.loadImage }),
        ]))
        : block.content !== ''
          ? h('pre', { 'class': css.resultBlockText, 'key': index }, [
            block.content,
          ]) : null)),
    ]))
  }
}, { name: 'ToolOutputBlocks', inheritAttrs: false, props: ['blocks', 'error', 'errorDetail', 'preview', 'renderSlot', 'loadImage'] })
const MarkdownRecordContent = defineComponent((props: {
  record: TableRecord
  rendered: boolean
  preview?: boolean
  thinkingExpanded: boolean
  onThinkingExpandedChange: (expanded: boolean) => void
  onOpenCall: (callId: string) => void
  renderSlot: PropsRenderSlots<'conversation.trajectory.images'>['renderSlot']
  loadImage: MessageImageLoader
  t: TrajectoryTranslate
}) => {
  const source = computed(() => markdownSource(props.record))
  const hasAttachments = computed(() => props.record.cell.sourceBlocks?.some(block =>
    block.attachment !== undefined || block.file !== undefined) === true)
  const hasToolCalls = computed(() => props.record.cell.kind === 'message'
        && props.record.cell.sourceBlocks?.some(block => block.type === 'tool-call') === true)
  return () => {
    if (props.record.cell.sourceBlocks?.length && props.record.cell.sourceBlocks.every(block => block.type === 'tool-addition' || block.type === 'tool-removal')) {
      return h('pre', { 'class': `${css.payload} ${css.toolUpdatePayload}` }, [
        props.record.cell.inputDetail,
      ])
    }
    if (!props.rendered && props.record.cell.sourceBlocks && props.record.cell.sourceBlocks.length > 0) {
      return (h(SourceBlocks, { 'blocks': props.record.cell.sourceBlocks, 'onOpenCall': props.onOpenCall, 't': props.t }))
    }
    if (props.record.cell.thinkingDetail) {
      if (!props.rendered) {
        const source = [
          props.record.cell.thinkingDetail,
          props.record.cell.outputDetail,
        ].filter((value): value is string => value !== undefined && value !== '').join('\n\n')
        return h(MarkdownFragment, { 'text': source, 'rendered': false, 'preview': (props.preview ?? false), 't': props.t })
      }
      return (h('div', { 'class': `${css.assistantContent} ${css.assistantContentRendered}` }, [
        h('div', { 'class': (props.preview ?? false) && !props.record.cell.outputDetail
          ? `${css.thinkingQuote} ${css.thinkingQuoteOnlyPreview}`
          : css.thinkingQuote }, [
          h('button', { 'type': 'button', 'class': css.thinkingToggle, 'aria-expanded': props.thinkingExpanded, 'onClick': () => { props.onThinkingExpandedChange(!props.thinkingExpanded) } }, [
            props.t('record.thinking'),
            h(IconChevronRightOutlineRegular, { 'className': css.thinkingChevron ?? '', 'size': 12 }),
          ]),
          props.thinkingExpanded && (h(MarkdownFragment, { 'text': props.record.cell.thinkingDetail, 'rendered': props.rendered, 'preview': (props.preview ?? false), 'variant': 'compact', 't': props.t })),
        ]),
        props.record.cell.outputDetail && (h('div', { 'class': css.assistantOutput }, [
          h(MarkdownFragment, { 'text': props.record.cell.outputDetail, 'rendered': props.rendered, 'preview': (props.preview ?? false), 't': props.t }),
        ])),
        h(AssistantToolCalls, { 'blocks': props.record.cell.sourceBlocks, 'preview': (props.preview ?? false), 'onOpenCall': props.onOpenCall, 't': props.t }),
        h(RecordAttachments, { 'blocks': props.record.cell.sourceBlocks, 'preview': (props.preview ?? false), 'renderSlot': props.renderSlot, 'loadImage': props.loadImage, 't': props.t }),
      ]))
    }
    if (!source.value && !hasAttachments.value && !hasToolCalls.value) {
      const emptyLabel = isToolCallOnly(props.record.cell, props.t)
        ? props.t('record.toolCallOnly')
        : props.record.cell.text || props.t('record.noContent')
      return h('p', { 'class': css.noPayload }, [
        emptyLabel,
      ])
    }
    if (!props.rendered || (!hasAttachments.value && !hasToolCalls.value)) {
      return h(MarkdownFragment, { 'text': source.value ?? '', 'rendered': props.rendered, 'preview': (props.preview ?? false), 't': props.t })
    }
    return (h('div', null, [
      source.value && h(MarkdownFragment, { 'text': source.value, 'rendered': true, 'preview': (props.preview ?? false), 't': props.t }),
      props.record.cell.kind === 'message' && (h(AssistantToolCalls, { 'blocks': props.record.cell.sourceBlocks, 'preview': (props.preview ?? false), 'onOpenCall': props.onOpenCall, 't': props.t })),
      h(RecordAttachments, { 'blocks': props.record.cell.sourceBlocks, 'preview': (props.preview ?? false), 'renderSlot': props.renderSlot, 'loadImage': props.loadImage, 't': props.t }),
    ]))
  }
}, { name: 'MarkdownRecordContent', inheritAttrs: false, props: ['record', 'rendered', 'preview', 'thinkingExpanded', 'onThinkingExpandedChange', 'onOpenCall', 'renderSlot', 'loadImage', 't'] })
const RecordTiming = defineComponent((props: {
  record: TableRecord
  preview?: boolean
  t: TrajectoryTranslate
}) => {
  return () => {
    return props.record.cell.kind === 'message' && props.record.cell.assistantMetrics !== undefined
      ? h(AssistantTimingPanel, { 'metrics': props.record.cell.assistantMetrics, 't': props.t }) : (h('dl', { 'class': css.overview }, [
        h('div', null, [
          h('dt', null, [
            props.t('timing.started'),
          ]),
          h(StartedAtValue, { 'timestamp': props.record.cell.startedAt ?? null, 't': props.t }),
        ]),
        h('div', null, [
          h('dt', null, [
            props.t('timing.duration'),
          ]),
          h('dd', null, [
            formatElapsedSeconds(props.record.cell.timeSeconds, props.t),
          ]),
        ]),
        !(props.preview ?? false) && (h('div', null, [
          h('dt', null, [
            props.t('timing.source'),
          ]),
          h('dd', null, [
            props.record.cell.timeSeconds === null ? props.t('timing.notAvailable') : props.t('timing.sessionTimestamps'),
          ]),
        ])),
      ]))
  }
}, { name: 'RecordTiming', inheritAttrs: false, props: ['record', 'preview', 't'] })
const RequestTiming = defineComponent((props: {
  assistant: TableRecord | undefined
  anchor: TableRecord | undefined
  request: TrajectoryRequestNumber | undefined
  preview?: boolean
  t: TrajectoryTranslate
}) => {
  return () => {
    if (props.assistant !== undefined)
      return h(RecordTiming, { 'record': props.assistant, 'preview': (props.preview ?? false), 't': props.t })
    if (props.request?.startedAt !== undefined) {
      const duration = props.request.completedAt === null || props.request.completedAt === undefined
        ? null
        : Math.max(0, (props.request.completedAt - props.request.startedAt) / 1000)
      return (h('dl', { 'class': css.overview }, [
        h('div', null, [
          h('dt', null, [
            props.t('timing.started'),
          ]),
          h(StartedAtValue, { 'timestamp': props.request.startedAt, 't': props.t }),
        ]),
        h('div', null, [
          h('dt', null, [
            props.t('timing.duration'),
          ]),
          h('dd', null, [
            formatElapsedSeconds(duration, props.t),
          ]),
        ]),
        !(props.preview ?? false) && (h('div', null, [
          h('dt', null, [
            props.t('timing.source'),
          ]),
          h('dd', null, [
            duration === null ? props.t('timing.sessionTimestampsRunning') : props.t('timing.sessionTimestamps'),
          ]),
        ])),
      ]))
    }
    return (h('dl', { 'class': css.overview }, [
      h('div', null, [
        h('dt', null, [
          props.t('timing.started'),
        ]),
        h(StartedAtValue, { 'timestamp': props.anchor?.cell.startedAt ?? null, 't': props.t }),
      ]),
      h('div', null, [
        h('dt', null, [
          props.t('timing.duration'),
        ]),
        h('dd', null, [
          formatElapsedSeconds(null, props.t),
        ]),
      ]),
    ]))
  }
}, { name: 'RequestTiming', inheritAttrs: false, props: ['assistant', 'anchor', 'request', 'preview', 't'] })
const RecordPayload = defineComponent((props: {
  record: TableRecord
  direction: 'input' | 'output'
  preview?: boolean
  renderSlot: PropsRenderSlots<'conversation.trajectory.images'>['renderSlot']
  loadImage: MessageImageLoader
  stringWrapping: JsonTreeProps['stringWrapping']
  t: TrajectoryTranslate
}) => {
  const value = computed(() => props.direction === 'input' ? props.record.cell.inputDetail : props.record.cell.outputDetail)
  const missing = computed(() => props.direction === 'input'
    ? props.t('record.noPayload')
    : props.t('record.noResult'))
  const error = computed(() => props.direction === 'output' && props.record.cell.isError === true)
  const payloadClass = computed(() => (props.preview ?? false) ? css.jsonPreview : css.jsonPayload)
  const payloadClassName = computed(() => error.value ? `${payloadClass.value} ${css.errorPayload}` : payloadClass.value)
  const json = computed(() => error.value ? undefined : value.value === undefined ? undefined : parseJsonContainer(value.value))
  const singleTextResult = computed(() => props.direction === 'output'
        && props.record.cell.outputBlocks?.length === 1
        && props.record.cell.outputBlocks[0]?.type === 'text')
  const markdown = computed(() => (props.direction === 'input'
        && (props.record.cell.kind === 'user' || props.record.cell.kind === 'context')) || (props.direction === 'output' && props.record.cell.kind === 'message'))
  return () => {
    if (!value.value)
      return h('p', { 'class': css.noPayload }, [
        missing.value,
      ])
    if (singleTextResult.value && json.value !== undefined) {
      return (h(JsonTree, { 'data': json.value, 'stringWrapping': props.stringWrapping, 'collapsedStringLines': (props.preview ?? false) ? 3 : 12, 'label': props.t('record.resultJson'), 'labels': jsonTreeLabels(props.t), 'className': payloadClassName.value }))
    }
    if (props.direction === 'output'
            && props.record.cell.outputBlocks?.some(block => block.attachment !== undefined || block.content !== '') === true) {
      return (h(ToolOutputBlocks, { 'blocks': props.record.cell.outputBlocks, 'error': error.value, 'errorDetail': error.value ? value.value : undefined, 'preview': (props.preview ?? false), 'renderSlot': props.renderSlot, 'loadImage': props.loadImage }))
    }
    if (markdown.value) {
      return (h('div', { 'class': [
        (props.preview ?? false) ? css.markdownPreview : css.markdownPayload,
        error.value ? css.errorPayload : undefined,
      ].filter((className): className is string => className !== undefined).join(' ') }, [
        h(MarkdownText, { 'text': value.value, 'labels': markdownLabels(props.t) }),
      ]))
    }
    if (json.value !== undefined) {
      return (h(JsonTree, { 'data': json.value, 'stringWrapping': props.stringWrapping, 'collapsedStringLines': (props.preview ?? false) ? 3 : 12, 'label': props.t(props.direction === 'input' ? 'record.payloadJson' : 'record.outputJson'), 'labels': jsonTreeLabels(props.t), 'className': payloadClassName.value }))
    }
    return (h('pre', { 'class': [
      css.payload,
      (props.preview ?? false) ? css.payloadPreview : undefined,
      error.value ? css.errorPayload : undefined,
      value.value === props.t('record.noOutput') ? css.noOutputText : undefined,
    ].filter((value): value is string => value !== undefined).join(' ') }, [
      value.value,
    ]))
  }
}, { name: 'RecordPayload', inheritAttrs: false, props: ['record', 'direction', 'preview', 'renderSlot', 'loadImage', 'stringWrapping', 't'] })
const RecordSchema = defineComponent((props: {
  record: TableRecord
  preview?: boolean
  stringWrapping: JsonTreeProps['stringWrapping']
  t: TrajectoryTranslate
}) => {
  const schema = computed(() => props.record.cell.schemaDetail === undefined ? undefined : parseToolSchema(props.record.cell.schemaDetail))
  return () => {
    if (!props.record.cell.schemaDetail) {
      return h('p', { 'class': css.noPayload }, [
        props.t('record.schemaUnavailable'),
      ])
    }
    if (schema.value !== undefined) {
      return (h('div', { 'class': (props.preview ?? false) ? `${css.schema} ${css.schemaPreview}` : css.schema }, [
        h('header', { 'class': css.schemaIntro }, [
          h('h3', { 'class': css.schemaName }, [
            schema.value.name,
          ]),
          h('p', { 'class': css.schemaDescription }, [
            schema.value.description,
          ]),
        ]),
        h('section', { 'class': css.schemaParameters }, [
          h('h4', { 'class': css.schemaParametersTitle }, [
            props.t('record.parameters'),
          ]),
          h(JsonTree, { 'data': schema.value.parameters, 'stringWrapping': props.stringWrapping, 'collapsedStringLines': (props.preview ?? false) ? 3 : 12, 'label': props.t('record.namedParametersJson', { name: schema.value.name }), 'labels': jsonTreeLabels(props.t), 'className': css.schemaTree ?? '' }),
        ]),
      ]))
    }
    return (h('pre', { 'class': `${css.payload} ${(props.preview ?? false) ? css.payloadPreview : ''}` }, [
      props.record.cell.schemaDetail,
    ]))
  }
}, { name: 'RecordSchema', inheritAttrs: false, props: ['record', 'preview', 'stringWrapping', 't'] })
interface ParsedToolSchema {
  name: string
  description: string
  parameters: object
}
function parseToolSchema(value: string): ParsedToolSchema | undefined {
  try {
    const parsed: unknown = JSON.parse(value)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
      return undefined
    const schema = parsed as Record<string, unknown>
    if (typeof schema.name !== 'string'
            || typeof schema.description !== 'string'
            || typeof schema.parameters !== 'object'
            || schema.parameters === null
            || Array.isArray(schema.parameters))
      return undefined
    return {
      name: schema.name,
      description: schema.description,
      parameters: schema.parameters,
    }
  }
  catch {
    return undefined
  }
}
function parseJsonContainer(value: string): object | undefined {
  try {
    const parsed: unknown = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null ? parsed : undefined
  }
  catch {
    return undefined
  }
}
const InspectorCopyButton = defineComponent((props: {
  text: string
  label: string
  t: TrajectoryTranslate
}) => {
  const state = shallowRef<'idle' | 'copied' | 'failed'>('idle')
  onMounted(() => {
    watch(() => [state.value], (_next, _previous, cleanup) => {
      const dispose0 = (() => {
        if (state.value === 'idle')
          return
        const timer = setTimeout(() => { state.value = 'idle' }, 1500)
        return () => { clearTimeout(timer) }
      })()
      if (typeof dispose0 === 'function')
        cleanup(dispose0)
    }, { immediate: true, flush: 'post' })
  })
  const title = computed(() => state.value === 'idle' ? props.label : props.t(state.value === 'copied' ? 'copied' : 'copy.failed'))
  return () => {
    return (h('button', { 'type': 'button', 'class': css.programAction, 'data-state': state.value, 'aria-label': title.value, 'title': title.value, 'onClick': () => { void writeClipboard(props.text).then((ok) => { state.value = ok ? 'copied' : 'failed' }) } }, [
      state.value === 'copied' ? h(IconCheckOutlineRegular, { 'size': 12 }) : h(IconCopyOutlineRegular, { 'size': 12 }),
    ]))
  }
}, { name: 'InspectorCopyButton', inheritAttrs: false, props: ['text', 'label', 't'] })
const ProgramInput = defineComponent((props: {
  program: CodeProgram
  initialWrapped: boolean
  stringWrapping: JsonTreeProps['stringWrapping']
  onOpen?: () => void
  t: TrajectoryTranslate
}) => {
  const contentsId = useId()
  const wrapped = shallowRef(props.initialWrapped)
  const showJson = shallowRef(false)
  const actions = computed(() => (h('span', { 'class': css.programActions }, [
    !showJson.value && props.program.language !== undefined && (h('span', { 'class': css.programLanguage }, [
      props.program.language,
    ])),
    !showJson.value && (h('button', { 'type': 'button', 'class': css.programAction, 'aria-label': props.t('record.wrapLines'), 'title': props.t('record.wrapLines'), 'aria-pressed': wrapped.value, 'aria-controls': contentsId, 'onClick': () => {
      const next = !wrapped.value
      wrapped.value = next
      props.stringWrapping?.setDefault(next)
    } }, [
      h(IconWrapLinesOutlineRegular, { 'size': 12 }),
    ])),
    props.onOpen === undefined && (h('button', { 'type': 'button', 'class': css.programAction, 'aria-label': props.t('code.originalJson'), 'title': props.t('code.originalJson'), 'aria-pressed': showJson.value, 'aria-controls': contentsId, 'onClick': () => { showJson.value = (value => !value)(showJson.value) } }, [
      h('svg', { 'width': '12', 'height': '12', 'viewBox': '0 0 16 16', 'fill': 'none', 'stroke': 'currentColor', 'stroke-width': '1.5', 'strokeLinecap': 'round', 'strokeLinejoin': 'round', 'aria-hidden': 'true' }, [
        h('path', { 'd': 'M6 2H5a2 2 0 0 0-2 2v2a2 2 0 0 1-2 2 2 2 0 0 1 2 2v2a2 2 0 0 0 2 2h1' }),
        h('path', { 'd': 'M10 2h1a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2 2 2 0 0 0-2 2v2a2 2 0 0 1-2 2h-1' }),
      ]),
    ])),
    h(InspectorCopyButton, { 'text': showJson.value ? props.program.rawInput : props.program.source, 'label': props.t(showJson.value ? 'copy.json' : 'code.copySource'), 't': props.t }),
  ])))
  const body = computed(() => (h('div', { 'id': contentsId, 'class': css.programContent, 'data-wrap': wrapped.value }, [
    showJson.value ? h(JsonTree, { 'data': props.program.arguments, 'label': props.t('record.parametersJson'), 'labels': jsonTreeLabels(props.t), 'stringWrapping': props.stringWrapping }) : h(CodeBlock, { 'code': props.program.source, 'lang': props.program.language, 'lineNumbers': true, 'showHeader': false, 'className': css.programSource ?? '', 'copyLabel': props.t('code.copySource'), 'copiedLabel': props.t('copied') }),
  ])))
  return () => {
    return props.onOpen === undefined
      ? (h('section', { 'class': css.programPanel }, [
        h('header', { 'class': css.overviewHeading }, [
          h('span', null, [
            props.t('code.source'),
          ]),
          actions.value,
        ]),
        body.value,
      ]))
      : h(OverviewSection, { 'label': props.t('code.source'), 'onOpen': props.onOpen, 'actions': actions.value }, { default: () => [
        body.value,
      ] })
  }
}, { name: 'ProgramInput', inheritAttrs: false, props: ['program', 'initialWrapped', 'stringWrapping', 'onOpen', 't'] })
const ProgramOutput = defineComponent((props: {
  record: TableRecord
  stringWrapping: JsonTreeProps['stringWrapping']
  onOpen?: () => void
  t: TrajectoryTranslate
}) => {
  const output = computed(() => props.record.cell.outputDetail)
  const json = computed(() => output.value === undefined ||
    props.record.cell.isError === true ? undefined : parseJsonContainer(output.value))
  const actions = computed(() => output.value === undefined ? undefined : (h('span', { 'class': css.programActions }, [
    h(InspectorCopyButton, { 'text': output.value, 'label': props.t('code.copyOutput'), 't': props.t }),
  ])))
  const body = computed(() => (h('div', { 'class': css.programContent }, [
    output.value === undefined || output.value === ''
      ? h('p', { 'class': css.noPayload }, [
        props.t(stateOf(props.record) === 'running' ? 'code.running' : 'record.noOutput'),
      ]) : json.value !== undefined
        ? h(JsonTree, { 'data': json.value, 'label': props.t('record.outputJson'), 'labels': jsonTreeLabels(props.t), 'stringWrapping': props.stringWrapping, 'collapsedStringLines': props.onOpen === undefined ? 12 : 3 }) : h('pre', { 'class': `${css.programOutput} ${props.record.cell.isError === true ? css.programError : ''}` }, [
          output.value,
        ]),
  ])))
  return () => {
    return props.onOpen === undefined
      ? body.value : h(OverviewSection, { 'label': props.t('code.output'), 'onOpen': props.onOpen, 'actions': actions.value }, { default: () => [
        body.value,
      ] })
  }
}, { name: 'ProgramOutput', inheritAttrs: false, props: ['record', 'stringWrapping', 'onOpen', 't'] })
const OverviewSection = defineComponent((props: {
  label: string
  onOpen: () => void
  actions?: VNodeChild
}, { slots }) => {
  const previewRef = shallowRef<HTMLDivElement | null>(null)
  const hasMore = shallowRef(false)
  const measureOverflow = (preview: HTMLElement) => {
    hasMore.value = preview.scrollHeight - preview.clientHeight - preview.scrollTop > 1
  }
  onMounted(() => {
    watch(() => [props.label, measureOverflow], (_next, _previous, cleanup) => {
      const dispose1 = (() => {
        const preview = previewRef.value as HTMLDivElement
        const measure = () => { measureOverflow(preview) }
        measure()
        if (typeof ResizeObserver === 'undefined')
          return
        const observer = new ResizeObserver(measure)
        observer.observe(preview)
        for (const child of preview.children)
          observer.observe(child)
        return () => { observer.disconnect() }
      })()
      if (typeof dispose1 === 'function')
        cleanup(dispose1)
    }, { immediate: true, flush: 'post' })
  })
  onUpdated(() => {
    if (previewRef.value !== null)
      measureOverflow(previewRef.value)
  })
  return () => {
    return (h('section', { 'class': css.overviewSection }, [
      h('h3', { 'class': css.overviewHeading }, [
        h('button', { 'type': 'button', 'class': css.overviewTitle, 'onClick': props.onOpen }, [
          h('span', null, [
            props.label,
          ]),
          h(IconChevronRightOutlineRegular, { 'className': css.overviewTitleIcon ?? '', 'size': 12 }),
        ]),
        props.actions,
      ]),
      h('div', { 'ref': previewRef, 'class': `${css.overviewPreview} ${css.summaryScrollRegion}`, 'data-summary-scroll-region': '', 'data-scroll-more': hasMore.value || undefined, 'onScroll': (event: Event & {
        currentTarget: HTMLDivElement
      }) => { measureOverflow(event.currentTarget) } }, [
        slots.default?.(),
      ]),
    ]))
  }
}, { name: 'OverviewSection', inheritAttrs: false, props: ['label', 'onOpen', 'actions'] })
/**
 * Render trajectory events as a dense ledger with turn and step separators.
 * Clicking ledger whitespace clears the active record or request selection.
 * @param props - Grouped trajectory data and whole-ledger fold state.
 * @returns The ledger and an optional local record inspector.
 */
export const TrajectoryTable = defineComponent((props: TrajectoryTableProps) => {
  const selectedRecordId = shallowRef<string | null>(null)
  const selectedRequest = shallowRef<SelectedRequest | null>(null)
  const activeTab = shallowRef<DetailTab>('overview')
  const codeWrappingOnOpen = shallowRef(false)
  const thinkingDisclosure = shallowRef<{
    recordId: string
    expanded: boolean
  }>()
  const detailsWidth = shallowRef<number | null>(null)
  const toolRequestOffset = shallowRef<number | null>(null)
  const detailsResizeDrag = shallowRef<DetailsResizeDrag | null>(null)
  const appliedRecordSelection = shallowRef<TrajectoryTableProps['recordSelection']>(null)
  const appliedRecordFocus = shallowRef<TrajectoryTableProps['recordFocus']>(null)
  const tabHistory = shallowRef<Set<DetailTab>>(new Set(['overview']))
  const rootRef = shallowRef<HTMLDivElement | null>(null)
  const tablePaneRef = shallowRef<HTMLDivElement | null>(null)
  const followsTableTail = shallowRef(false)
  const tableScrollInitialized = shallowRef(false)
  const tableScrollReady = shallowRef(false)
  const pendingScrollRecordId = shallowRef<string | null>(null)
  const loadingOlder = shallowRef(false)
  const olderLoading = shallowRef(false)
  const olderLoadAnchor = shallowRef<OlderLoadAnchor | null>(null)
  const allRecords = computed(() => flattenRecords(props.turns))
  const streamingCellsByIndex = computed(() => new Map((props.streamingCells ?? []).map(cell => [cell.index, cell])))
  const currentRecord = (record: TableRecord): TableRecord => {
    const cell = streamingCellsByIndex.value.get(record.cell.index)
    return cell === undefined ? record : { ...record, cell }
  }
  const selectedTemplate = computed(() => {
    const selectedRecordIdSnapshot = selectedRecordId.value
    return selectedRecordIdSnapshot === null
      ? undefined
      : allRecords.value.find(record => trajectoryRecordId(record.cell) === selectedRecordIdSnapshot)
  })
  const selected = computed(() => {
    const selectedTemplateSnapshot = selectedTemplate.value
    return selectedTemplateSnapshot === undefined
      ? undefined
      : currentRecord(selectedTemplateSnapshot)
  })
  const resultSeq = computed(() => {
    const selectedSnapshot = selected.value
    return activeTab.value === 'output' ? selectedSnapshot?.cell.resultSeq : undefined
  })
  const liveResult = shallowRef<{
    seq: number
    owner: WatchToolResult
    value: JsonValue | undefined
  }>()
  onMounted(() => {
    watch(() => [resultSeq.value, props.watchToolResult], (_next, _previous, cleanup) => {
      const dispose2 = (() => {
        const resultSeqInput = resultSeq.value
        const watchToolResultInput = props.watchToolResult
        liveResult.value = undefined
        if (resultSeqInput === undefined || watchToolResultInput === undefined)
          return
        let active = true
        const dispose = watchToolResultInput(resultSeqInput, (value) => {
          if (active)
            liveResult.value = { seq: resultSeqInput, owner: watchToolResultInput, value }
        })
        return () => { active = false; dispose() }
      })()
      if (typeof dispose2 === 'function')
        cleanup(dispose2)
    }, { immediate: true, flush: 'post' })
  })
  const resultValue = computed(() => {
    const resultSeqInput = resultSeq.value
    const watchToolResultInput = props.watchToolResult
    return liveResult.value?.seq === resultSeqInput &&
      liveResult.value?.owner === watchToolResultInput ? liveResult.value?.value : undefined
  })
  const selectedProgram = computed(() => {
    const selectedSnapshot = selected.value
    return selectedSnapshot === undefined ? undefined : codeProgram(selectedSnapshot.cell)
  })
  const thinkingExpanded = computed(() => {
    const selectedRecordIdSnapshot = selectedRecordId.value
    const selectedSnapshot = selected.value
    return thinkingDisclosure.value?.recordId === selectedRecordIdSnapshot
      ? thinkingDisclosure.value.expanded
      : selectedSnapshot?.cell.kind === 'message'
                && Boolean(selectedSnapshot.cell.thinkingDetail?.trim())
  })
  const setThinkingExpanded = computed(() => {
    const selectedRecordIdSnapshot = selectedRecordId.value
    return (expanded: boolean) => {
      if (selectedRecordIdSnapshot !== null) {
        thinkingDisclosure.value = { recordId: selectedRecordIdSnapshot, expanded }
      }
    }
  })
  const selectedIndex = computed(() => {
    const selectedSnapshot = selected.value
    return selectedSnapshot?.cell.index ?? null
  })
  onMounted(() => {
    watch(() => [props.onSelectedIndexChange, selectedIndex.value], () => {
      props.onSelectedIndexChange?.(selectedIndex.value)
    }, { immediate: true, flush: 'post' })
  })
  const requestGroups = computed(() => new Set((props.requestNumbers ?? []).map(request => requestKey(request.turn, request.group))))
  const requestBoundaries = computed(() => indexRequestBoundaries(allRecords.value, requestGroups.value))
  const requestNumbers = computed(() => indexRequestNumbers(props.requestNumbers))
  const records = computed(() => {
    const searchMatchIndexesInput = props.searchMatchIndexes ?? null
    const searchMatchIndexesSnapshot = searchMatchIndexesInput
    if (searchMatchIndexesSnapshot !== null)
      return filterRecords(allRecords.value, searchMatchIndexesSnapshot)
    const turnRecords = props.collapsedTurns.size === 0
      ? allRecords.value : collapseTurnRecords(allRecords.value, props.collapsedTurns, requestGroups.value, props.t)
    const assistantRecords = props.collapsedAssistants.size === 0
      ? turnRecords
      : collapseCallRecords(turnRecords, props.collapsedAssistants, 'assistant', props.t)
    return props.collapsedTools.size === 0
      ? assistantRecords
      : collapseCallRecords(assistantRecords, props.collapsedTools, 'tool', props.t)
  })
  const projectedVirtualRows = computed(() => groupTrajectoryVirtualRows(records.value))
  const virtualRowStructure = useStableVirtualRowStructure(projectedVirtualRows)
  const virtualizationEnabled = computed(() => (props.hasOlderRecords ?? false) || records.value.length > VIRTUALIZATION_THRESHOLD)
  const virtualScrollMargin = computed(() => (props.hasOlderRecords ?? false) ? HISTORY_LOAD_ROW_HEIGHT_PX : 0)
  const estimateVirtualRowSize = (index: number) => virtualRowStructure.value[index]?.height ?? 30
  const getVirtualRowKey = (index: number) => virtualRowStructure.value[index]?.key ?? index
  const getTableScrollElement = () => tablePaneRef.value
  const rowVirtualizer = useVirtualizer<HTMLDivElement, HTMLTableRowElement>(computed(() => ({
    count: virtualizationEnabled.value ? virtualRowStructure.value.length : 0,
    enabled: virtualizationEnabled.value,
    estimateSize: estimateVirtualRowSize,
    getItemKey: getVirtualRowKey,
    getScrollElement: getTableScrollElement,
    initialRect: { width: 0, height: VIRTUAL_INITIAL_VIEWPORT_HEIGHT_PX },
    anchorTo: 'end',
    overscan: VIRTUAL_OVERSCAN_ROWS,
    scrollMargin: virtualScrollMargin.value,
    scrollEndThreshold: BOTTOM_FOLLOW_THRESHOLD_PX,
    followOnAppend: 'auto',
  })))
  const virtualIndexByRecordId = computed(() => {
    const indexes = new Map<string, number>()
    for (const [virtualIndex, row] of projectedVirtualRows.value.entries()) {
      for (const entry of row.entries) {
        if (entry.record.collapsedSummary === undefined) {
          indexes.set(trajectoryRecordId(entry.record.cell), virtualIndex)
        }
      }
    }
    return indexes
  })
  const virtualItems = computed(() => virtualizationEnabled.value ? rowVirtualizer.value.getVirtualItems() : [])
  const virtualTop = computed(() => Math.max(0, (virtualItems.value[0]?.start ?? 0) - virtualScrollMargin.value))
  const virtualBottom = computed(() => virtualItems.value.length === 0
    ? 0
    : Math.max(0, rowVirtualizer.value.getTotalSize()
            + virtualScrollMargin.value
            - (virtualItems.value.at(-1)?.end ?? 0)))
  const renderedRecords = computed(() => virtualizationEnabled.value ? virtualItems.value.flatMap((item) => {
    const row = projectedVirtualRows.value[item.index]
    if (row === undefined)
      return []
    return row.entries.map((entry, entryIndex) => ({
      record: currentRecord(entry.record),
      position: entry.logicalIndex,
      terminalRequestBoundary: entry.record.cell.requestOnly === true
                && row.entries.at(-1)?.record.cell.requestOnly === true
                && entryIndex === row.entries.length - 1,
    }))
  })
    : records.value.map((record, position) => ({
      record: currentRecord(record),
      position,
      terminalRequestBoundary: record.cell.requestOnly === true && position === records.value.length - 1,
    })))
  const requestBoundaryRuns = computed(() => indexRequestBoundaryRuns(records.value, requestGroups.value))
  const selectedPrompt = computed(() => {
    const selectedSnapshot = selected.value
    return selectedSnapshot?.cell.kind === 'system'
      ? selectedSnapshot.cell.promptDetail
      : undefined
  })
  const selectedPreviousPrompt = computed(() => {
    const selectedSnapshot = selected.value
    return selectedSnapshot?.cell.kind === 'system'
      ? selectedSnapshot.cell.previousPromptDetail
      : undefined
  })
  const selectedSystemPrompt = computed(() => {
    const selectedPromptSnapshot = selectedPrompt.value
    const selectedSnapshot = selected.value
    return selectedPromptSnapshot?.system ?? selectedSnapshot?.cell.systemPromptDetail
  })
  const promptSelected = computed(() => {
    const selectedSystemPromptSnapshot = selectedSystemPrompt.value
    return selectedSystemPromptSnapshot !== undefined
  })
  const selectedState = computed(() => {
    const selectedSnapshot = selected.value
    return selectedSnapshot === undefined ? undefined : stateOf(selectedSnapshot)
  })
  const selectedRequestInfo = computed(() => {
    const selectedRequestSnapshot = selectedRequest.value
    return selectedRequestSnapshot === null
      ? undefined
      : props.requestNumbers?.find(request => requestIdentity(request) === selectedRequestSnapshot.identity)
  })
  const selectedRequestRecordTemplates = computed(() => {
    const selectedRequestInfoSnapshot = selectedRequestInfo.value
    return selectedRequestInfoSnapshot === undefined
      ? []
      : allRecords.value.filter(record => record.turn === selectedRequestInfoSnapshot.turn
                && record.group === selectedRequestInfoSnapshot.group)
  })
  const selectedRequestRecords = computed(() => {
    const selectedRequestRecordTemplatesSnapshot = selectedRequestRecordTemplates.value
    return selectedRequestRecordTemplatesSnapshot.map(currentRecord)
  })
  const selectedRequestAssistant = computed(() => {
    const selectedRequestRecordsSnapshot = selectedRequestRecords.value
    return selectedRequestRecordsSnapshot.find(record => record.cell.kind === 'message' && record.cell.requestOnly !== true)
  })
  const selectedRequestAnchor = computed(() => {
    const selectedRequestAssistantSnapshot = selectedRequestAssistant.value
    const selectedRequestRecordsSnapshot = selectedRequestRecords.value
    return selectedRequestAssistantSnapshot ?? selectedRequestRecordsSnapshot[0]
  })
  const selectedRequestNumber = computed(() => {
    const selectedRequestInfoSnapshot = selectedRequestInfo.value
    return selectedRequestInfoSnapshot?.number
  })
  const selectedRequestState = computed<RecordState | undefined>(() => {
    const selectedRequestInfoSnapshot = selectedRequestInfo.value
    const selectedRequestAssistantSnapshot = selectedRequestAssistant.value
    const selectedRequestRecordsSnapshot = selectedRequestRecords.value
    return selectedRequestInfoSnapshot === undefined
      ? undefined
      : selectedRequestInfoSnapshot.status
                ?? (selectedRequestAssistantSnapshot?.cell.assistantMetrics?.completedTime === null
                  ? 'running'
                  : selectedRequestAssistantSnapshot === undefined
                        && selectedRequestRecordsSnapshot.some(record => stateOf(record) === 'running')
                    ? 'running'
                    : 'complete')
  })
  const selectedRequestToolCalls = computed(() => {
    const selectedRequestRecordsSnapshot = selectedRequestRecords.value
    return selectedRequestRecordsSnapshot.filter(record => record.cell.kind === 'tool').length
  })
  const selectedRequestSubtoolCalls = computed(() => {
    const selectedRequestRecordsSnapshot = selectedRequestRecords.value
    return selectedRequestRecordsSnapshot.filter(record => record.cell.kind === 'subtool').length
  })
  const selectedRequestResultTemplate = computed(() => {
    const selectedRequestInfoSnapshot = selectedRequestInfo.value
    const selectedRequestAssistantSnapshot = selectedRequestAssistant.value
    return selectedRequestInfoSnapshot?.resultSeq === undefined
      ? selectedRequestAssistantSnapshot : allRecords.value.find(record => record.cell.sourceSeq === selectedRequestInfoSnapshot.resultSeq)
  })
  const selectedRequestResult = computed(() => {
    const selectedRequestResultTemplateSnapshot = selectedRequestResultTemplate.value
    return selectedRequestResultTemplateSnapshot === undefined
      ? undefined
      : currentRecord(selectedRequestResultTemplateSnapshot)
  })
  const selectedRequestUsage = computed(() => {
    const selectedRequestInfoSnapshot = selectedRequestInfo.value
    const selectedRequestAssistantSnapshot = selectedRequestAssistant.value
    return selectedRequestInfoSnapshot?.usage ?? (selectedRequestAssistantSnapshot === undefined
      ? undefined
      : {
        ...(selectedRequestAssistantSnapshot.cell.input === undefined
          ? {}
          : { input: selectedRequestAssistantSnapshot.cell.input }),
        ...(selectedRequestAssistantSnapshot.cell.cacheRead === undefined
          ? {}
          : { cacheRead: selectedRequestAssistantSnapshot.cell.cacheRead }),
        ...(selectedRequestAssistantSnapshot.cell.cacheWrite === undefined
          ? {}
          : { cacheWrite: selectedRequestAssistantSnapshot.cell.cacheWrite }),
        ...(selectedRequestAssistantSnapshot.cell.output === undefined
          ? {}
          : { output: selectedRequestAssistantSnapshot.cell.output }),
        ...(selectedRequestAssistantSnapshot.cell.think === undefined
          ? {}
          : { reasoning: selectedRequestAssistantSnapshot.cell.think }),
      })
  })
  const selectedRequestCumulativeUsage = computed(() => {
    const selectedRequestInfoSnapshot = selectedRequestInfo.value
    const selectedRequestUsageSnapshot = selectedRequestUsage.value
    return selectedRequestInfoSnapshot?.cumulativeUsage ?? selectedRequestUsageSnapshot
  })
  const selectedRequestOptions = computed(() => {
    const selectedRequestInfoSnapshot = selectedRequestInfo.value
    return selectedRequestInfoSnapshot?.requestConfig
  })
  const activeTurn = computed(() => {
    const selectedRequestInfoSnapshot = selectedRequestInfo.value
    const selectedSnapshot = selected.value
    return selectedRequestInfoSnapshot === undefined ? selectedSnapshot?.turn : selectedRequestInfoSnapshot.turn
  })
  const activeSection = computed(() => {
    const selectedRequestInfoSnapshot = selectedRequestInfo.value
    const selectedSnapshot = selected.value
    const selectedRequestRecordsSnapshot = selectedRequestRecords.value
    return selectedRequestInfoSnapshot === undefined
      ? selectedSnapshot?.section
      : selectedRequestRecordsSnapshot[0]?.section
  })
  const selectedTabs = computed(() => {
    const selectedRequestInfoSnapshot = selectedRequestInfo.value
    const selectedRequestOptionsSnapshot = selectedRequestOptions.value
    const selectedSnapshot = selected.value
    return selectedRequestInfoSnapshot !== undefined
      ? REQUEST_TABS.filter(tab => tab.id !== 'options' || selectedRequestOptionsSnapshot !== undefined)
      : selectedSnapshot === undefined ? [] : detailTabs(selectedSnapshot)
  })
  const selectedParents = computed<ParentRecords>(() => {
    const selectedSnapshot = selected.value
    return selectedSnapshot === undefined
      ? {}
      : parentRecords(allRecords.value, selectedSnapshot)
  })
  const selectedParentMessage = computed(() => {
    const selectedParentsSnapshot = selectedParents.value
    return selectedParentsSnapshot.message
  })
  const selectedParentTool = computed(() => {
    const selectedParentsSnapshot = selectedParents.value
    return selectedParentsSnapshot.tool
  })
  const selectedAssistantRequest = computed(() => {
    const selectedSnapshot = selected.value
    return selectedSnapshot?.cell.kind === 'message'
      ? requestNumbers.value.get(requestKey(selectedSnapshot.turn, selectedSnapshot.group))
      : undefined
  })
  const selectedAssistantRequestInfo = computed(() => {
    const selectedAssistantRequestSnapshot = selectedAssistantRequest.value
    return selectedAssistantRequestSnapshot === undefined
      ? undefined
      : props.requestNumbers?.find(request => request.number === selectedAssistantRequestSnapshot)
  })
  const selectedAssistantRequestTarget = computed<SelectedRequest | undefined>(() => {
    const selectedAssistantRequestInfoSnapshot = selectedAssistantRequestInfo.value
    return selectedAssistantRequestInfoSnapshot === undefined
      ? undefined
      : { identity: requestIdentity(selectedAssistantRequestInfoSnapshot) }
  })
  const hasSelectedHierarchy = computed(() => {
    const selectedAssistantRequestTargetSnapshot = selectedAssistantRequestTarget.value
    const selectedParentsSnapshot = selectedParents.value
    return selectedAssistantRequestTargetSnapshot !== undefined
            || selectedParentsSnapshot.message !== undefined
            || selectedParentsSnapshot.tool !== undefined
  })
  const splitStyle = computed<TrajectorySplitStyle | undefined>(() => toolRequestOffset.value === null
    ? undefined
    : {
      '--trajectory-tool-request-width': `calc(58cqw - ${toolRequestOffset.value}px)`,
    })
  const activateTab = computed(() => (tab: DetailTab) => {
    codeWrappingOnOpen.value = props.stringWrapping?.getDefault() ?? false
    tabHistory.value.delete(tab)
    tabHistory.value.add(tab)
    activeTab.value = tab
  })
  const clearInspectorSelection = computed(() => () => {
    selectedRecordId.value = null
    selectedRequest.value = null
  })
  const clearAllSelections = computed(() => () => {
    clearInspectorSelection.value()
    props.onClearSelection?.()
  })
  const selectRecord = (index: number) => {
    codeWrappingOnOpen.value = props.stringWrapping?.getDefault() ?? false
    const record = allRecords.value.find(candidate => candidate.cell.index === index)
    props.onRecordSelect?.(index)
    selectedRequest.value = null
    selectedRecordId.value = record === undefined ? null : trajectoryRecordId(record.cell)
    if (record === undefined)
      return
    const tabs = detailTabs(record)
    const available = new Set(tabs.map(tab => tab.id))
    const recent = [...tabHistory.value].reverse().find(tab => available.has(tab))
    activeTab.value = recent ?? tabs[0]?.id ?? 'overview'
  }
  onMounted(() => {
    watch(() => [allRecords.value, (props.recordSelection ?? null), selectRecord], () => {
      const recordSelectionInput = props.recordSelection ?? null
      if (recordSelectionInput === null
                  || appliedRecordSelection.value === recordSelectionInput)
        return
      appliedRecordSelection.value = recordSelectionInput
      selectRecord(recordSelectionInput.index)
      const record = allRecords.value.find(candidate => candidate.cell.index === recordSelectionInput.index)
      pendingScrollRecordId.value = record === undefined
        ? null
        : trajectoryRecordId(record.cell)
    }, { immediate: true, flush: 'post' })
  })
  onMounted(() => {
    watch(() => [allRecords.value, (props.recordFocus ?? null)], () => {
      const recordFocusInput = props.recordFocus ?? null
      if (recordFocusInput === null || appliedRecordFocus.value === recordFocusInput)
        return
      appliedRecordFocus.value = recordFocusInput
      const record = allRecords.value.find(candidate => candidate.cell.index === recordFocusInput.index)
      pendingScrollRecordId.value = record === undefined
        ? null
        : trajectoryRecordId(record.cell)
    }, { immediate: true, flush: 'post' })
  })
  const selectRequest = computed(() => (request: SelectedRequest, tab: 'overview' | 'timing' = 'overview') => {
    selectedRecordId.value = null
    selectedRequest.value = request
    activateTab.value(tab)
  })
  const openRecordSummary = computed(() => (target: TableRecord) => {
    const targetAt = allRecords.value.findIndex(record => record.cell.index === target.cell.index)
    if (target.turn !== null && props.collapsedTurns.has(target.turn))
      props.onToggleTurn(target.turn)
    if (target.cell.kind === 'subtool') {
      for (let i = targetAt - 1; i >= 0; i--) {
        const candidate = allRecords.value[i]
        if (candidate === undefined || candidate.cell.kind === 'subtool')
          continue
        if (candidate.cell.kind === 'tool') {
          const toolId = trajectoryRecordId(candidate.cell)
          if (props.collapsedTools.has(toolId))
            props.onToggleTool(toolId)
        }
        break
      }
    }
    if (target.cell.kind === 'tool' || target.cell.kind === 'subtool') {
      for (let i = targetAt - 1; i >= 0; i--) {
        const candidate = allRecords.value[i]
        if (candidate === undefined || candidate.turn !== target.turn)
          break
        if (candidate.cell.kind !== 'message')
          continue
        const assistantId = trajectoryRecordId(candidate.cell)
        if (props.collapsedAssistants.has(assistantId))
          props.onToggleAssistant(assistantId)
        break
      }
    }
    selectedRequest.value = null
    selectedRecordId.value = trajectoryRecordId(target.cell)
    activateTab.value('overview')
  })
  const openCallSummary = computed(() => (callId: string) => {
    const target = allRecords.value.find(record => record.cell.callId === callId)
    if (target !== undefined)
      openRecordSummary.value(target)
  })
  const expandSummary = computed(() => (record: TableRecord, kind: NonNullable<TableRecord['collapsedSummaryKind']>) => {
    switch (kind) {
      case 'turn':
        if (record.turn !== null)
          props.onToggleTurn(record.turn)
        return
      case 'tool':
        props.onToggleTool(trajectoryRecordId(record.cell))
        return
      case 'assistant':
        props.onToggleAssistant(trajectoryRecordId(record.cell))
        return
      default:
        assertNever(kind)
    }
  })
  const openRecordSummaryRef = shallowRef(openRecordSummary.value)
  onMounted(() => {
    watchEffect(() => {
      openRecordSummaryRef.value = openRecordSummary.value
    })
  })
  onMounted(() => {
    watch(() => [(props.inspectCallId ?? null), props.turns, props.onInspectApplied], () => {
      if ((props.inspectCallId ?? null) === null)
        return
      const target = flattenRecords(props.turns).find(record => record.cell.callId === (props.inspectCallId ?? null))
      if (target === undefined)
        return
      openRecordSummaryRef.value(target)
      pendingScrollRecordId.value = trajectoryRecordId(target.cell)
      props.onInspectApplied?.()
    }, { immediate: true, flush: 'post' })
  })
  onMounted(() => {
    watch(() => [records.value, rowVirtualizer.value, virtualIndexByRecordId.value, virtualizationEnabled.value],
      () => {
        const id = pendingScrollRecordId.value
        if (id === null)
          return
        const position = records.value.findIndex(record =>
          trajectoryRecordId(record.cell) === id && record.collapsedSummary === undefined)
        if (position === -1)
          return
        if (virtualizationEnabled.value) {
          const virtualIndex = virtualIndexByRecordId.value.get(id)
          if (virtualIndex === undefined)
            return
          pendingScrollRecordId.value = null
          followsTableTail.value = false
          rowVirtualizer.value.scrollToIndex(virtualIndex, { behavior: 'smooth', align: 'center' })
          return
        }
        pendingScrollRecordId.value = null
        followsTableTail.value = false
        const recordIndex = records.value[position]?.cell.index
        const row = recordIndex === undefined
          ? null
          : rootRef.value?.querySelector<HTMLElement>(`tr[data-record-index="${recordIndex}"]`)
        /* v8 ignore next -- jsdom lacks scrollIntoView; browsers always have it. */
        if (row !== undefined && row !== null && typeof row.scrollIntoView === 'function') {
          row.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, { immediate: true, flush: 'post' })
  })
  onMounted(() => {
    watch(() => [
      projectedVirtualRows.value,
      records.value,
      rowVirtualizer.value,
      (props.timelineFocusIndexes ?? null),
      virtualIndexByRecordId.value,
      virtualizationEnabled.value,
    ], () => {
      const timelineFocusIndexesInput = props.timelineFocusIndexes ?? null
      if (timelineFocusIndexesInput === null || timelineFocusIndexesInput.size === 0)
        return
      const focusedPositions = records.value.flatMap((record, position) => record.collapsedSummary === undefined
                  && record.cell.requestOnly !== true
                  && timelineFocusIndexesInput.has(record.cell.index)
        ? [position]
        : [])
      const first = focusedPositions.at(0)
      const last = focusedPositions.at(-1)
      if (first === undefined || last === undefined)
        return
      if (!virtualizationEnabled.value) {
        const ledger = rootRef.value
        if (ledger === null)
          return
        const focusedRows = [
          ...ledger.querySelectorAll<HTMLElement>('tr[data-timeline-focus="inside"]'),
        ]
        const firstRow = focusedRows.at(0)
        const lastRow = focusedRows.at(-1)
        if (firstRow === undefined || lastRow === undefined)
          return
        const focusHeight = lastRow.getBoundingClientRect().bottom - firstRow.getBoundingClientRect().top
        const target = focusHeight > ledger.clientHeight
          ? firstRow
          : focusedRows[Math.floor((focusedRows.length - 1) / 2)]
        /* v8 ignore next -- jsdom lacks scrollIntoView; browsers always have it. */
        if (target !== undefined && typeof target.scrollIntoView === 'function') {
          followsTableTail.value = false
          target.scrollIntoView({
            behavior: 'smooth',
            block: focusHeight > ledger.clientHeight ? 'start' : 'center',
          })
        }
        return
      }
      const focusedVirtualIndexes = [...new Set(focusedPositions.flatMap((position) => {
        const record = records.value[position]
        if (record === undefined)
          return []
        const virtualIndex = virtualIndexByRecordId.value.get(trajectoryRecordId(record.cell))
        return virtualIndex === undefined ? [] : [virtualIndex]
      }))].sort((left, right) => left - right)
      const firstVirtual = focusedVirtualIndexes.at(0)
      const lastVirtual = focusedVirtualIndexes.at(-1)
      if (firstVirtual === undefined || lastVirtual === undefined)
        return
      const paneHeight = tablePaneRef.value?.clientHeight ?? 0
      const focusHeight = projectedVirtualRows.value.slice(firstVirtual, lastVirtual + 1)
        .reduce((height, row) => height + row.height, 0)
      followsTableTail.value = false
      rowVirtualizer.value.scrollToIndex(focusHeight > paneHeight
        ? firstVirtual
        : focusedVirtualIndexes[Math.floor((focusedVirtualIndexes.length - 1) / 2)]
                      ?? firstVirtual, {
        behavior: 'smooth',
        align: focusHeight > paneHeight ? 'start' : 'center',
      })
    }, { immediate: true, flush: 'post' })
  })
  const requestOlder = (pane: HTMLDivElement, requireTop: boolean) => {
    if (!(props.hasOlderRecords ?? false)
            || props.onLoadOlder === undefined
            || loadingOlder.value
            || (props.olderHistoryLoading ?? false)
            || (requireTop && pane.scrollTop > OLDER_LOAD_THRESHOLD_PX))
      return
    loadingOlder.value = true
    olderLoading.value = true
    olderLoadAnchor.value = {
      historyStartSeq: props.historyStartSeq,
      scrollHeight: pane.scrollHeight,
      scrollTop: pane.scrollTop,
    }
    void props.onLoadOlder().then((advanced) => {
      if (!advanced)
        olderLoadAnchor.value = null
    }).finally(() => {
      loadingOlder.value = false
      olderLoading.value = false
    })
  }
  onMounted(() => {
    watch(() => [
      (props.historyLoading ?? false),
      props.historyStartSeq,
      rowVirtualizer.value,
      virtualRowStructure.value,
      virtualizationEnabled.value,
    ], () => {
      const pane = tablePaneRef.value
      if (pane === null)
        return
      const anchor = olderLoadAnchor.value
      if (anchor !== null && anchor.historyStartSeq !== props.historyStartSeq) {
        if (!virtualizationEnabled.value) {
          pane.scrollTop = anchor.scrollTop + pane.scrollHeight - anchor.scrollHeight
        }
        olderLoadAnchor.value = null
        followsTableTail.value = false
        return
      }
      if (!tableScrollInitialized.value) {
        if ((props.historyLoading ?? false))
          return
        tableScrollInitialized.value = true
        followsTableTail.value = true
        if (virtualizationEnabled.value)
          rowVirtualizer.value.scrollToEnd({ behavior: 'auto' })
        else
          pane.scrollTop = pane.scrollHeight
        tableScrollReady.value = true
        return
      }
      if (!followsTableTail.value)
        return
      if (!virtualizationEnabled.value)
        pane.scrollTop = pane.scrollHeight
    }, { immediate: true, flush: 'post' })
  })
  const olderBusy = computed(() => (props.olderHistoryLoading ?? false) || olderLoading.value)
  const showInitialLoading = computed(() => (props.historyLoading ?? false) || !tableScrollReady.value)
  const historyRowOffset = computed(() => (props.hasOlderRecords ?? false) ? 1 : 0)
  return () => {
    const selectedRequestSnapshot = selectedRequest.value
    const selectedIndexSnapshot = selectedIndex.value
    const timelineFocusIndexesSnapshot = props.timelineFocusIndexes ?? null
    const selectedRequestInfoSnapshot = selectedRequestInfo.value
    const selectedSnapshot = selected.value
    const selectedStateSnapshot = selectedState.value
    const selectedRequestNumberSnapshot = selectedRequestNumber.value
    const selectedTabsSnapshot = selectedTabs.value
    const selectedProgramSnapshot = selectedProgram.value
    const selectedRequestStateSnapshot = selectedRequestState.value
    const selectedRequestToolCallsSnapshot = selectedRequestToolCalls.value
    const selectedRequestSubtoolCallsSnapshot = selectedRequestSubtoolCalls.value
    const selectedRequestResultSnapshot = selectedRequestResult.value
    const selectedRequestOptionsSnapshot = selectedRequestOptions.value
    const selectedRequestUsageSnapshot = selectedRequestUsage.value
    const selectedRequestAssistantSnapshot = selectedRequestAssistant.value
    const selectedRequestAnchorSnapshot = selectedRequestAnchor.value
    const selectedRequestCumulativeUsageSnapshot = selectedRequestCumulativeUsage.value
    const selectedPromptSnapshot = selectedPrompt.value
    const selectedPreviousPromptSnapshot = selectedPreviousPrompt.value
    const selectedSystemPromptSnapshot = selectedSystemPrompt.value
    const selectedAssistantRequestTargetSnapshot = selectedAssistantRequestTarget.value
    const selectedAssistantRequestSnapshot = selectedAssistantRequest.value
    const selectedParentMessageSnapshot = selectedParentMessage.value
    const selectedParentToolSnapshot = selectedParentTool.value
    const selectedRecordIdSnapshot = selectedRecordId.value
    return (h('div', { 'ref': rootRef, 'class': css.split, 'style': splitStyle.value }, [
      h('div', { 'ref': tablePaneRef, 'class': css.tablePane, 'data-trajectory-scroll': '', 'onScroll': (event: Event & {
        currentTarget: HTMLDivElement
      }) => {
        const pane = event.currentTarget
        followsTableTail.value =
          pane.scrollHeight - pane.clientHeight - pane.scrollTop
                            <= BOTTOM_FOLLOW_THRESHOLD_PX
        requestOlder(pane, true)
      }, 'onClick': (event: MouseEvent & {
        currentTarget: HTMLElement
      }) => {
        if (event.target === event.currentTarget)
          clearAllSelections.value()
      } }, [
        showInitialLoading.value && (h('div', { 'class': css.historyLoading, 'role': 'status', 'aria-live': 'polite' }, [
          h('span', { 'class': css.historyLoadingBar }, [
            h(StateDot, { 'state': 'ongoing' }),
            props.t('history.loadingTrajectory'),
          ]),
        ])),
        h('table', { 'class': css.table, 'data-scroll-ready': tableScrollReady.value || undefined, 'aria-rowcount': records.value.length + historyRowOffset.value }, [
          h('colgroup', null, [
            h('col', { 'class': css.eventColumn }),
            h('col', { 'class': css.contentColumn }),
          ]),
          h('tbody', null, [
            (props.hasOlderRecords ?? false) && (h('tr', { 'class': css.historyLoadRow, 'data-history-load': '', 'aria-rowindex': 1 }, [
              h('td', { 'colSpan': 2 }, [
                h('button', { 'type': 'button', 'class': css.historyLoadButton, 'disabled': olderBusy.value || props.onLoadOlder === undefined, 'aria-label': olderBusy.value ? props.t('history.loadingEarlierAria')
                  : props.t('history.loadEarlier'), 'onClick': () => {
                  const pane = tablePaneRef.value
                  if (pane !== null)
                    requestOlder(pane, false)
                } }, [
                  olderBusy.value && (h(StateDot, { 'state': 'ongoing' })),
                  h('span', { 'aria-hidden': 'true' }, [
                    olderBusy.value ? props.t('history.loadingEarlier') : props.t('history.loadEarlier'),
                  ]),
                  h('span', { 'class': css.visuallyHidden, 'role': 'status', 'aria-live': 'polite' }, [
                    olderBusy.value ? props.t('history.loadingEarlier') : '',
                  ]),
                ]),
              ]),
            ])),
            virtualTop.value > 0 && (h('tr', { 'class': css.virtualSpacer, 'data-virtual-spacer': 'top', 'aria-hidden': 'true' }, [
              h('td', { 'colSpan': 2, 'style': {
                '--trajectory-virtual-spacer-height': `${virtualTop.value}px`,
              } satisfies VirtualSpacerStyle }),
            ])),
            renderedRecords.value.map(({ record, position, terminalRequestBoundary }) => (h(RecordPresentation, { 'key': trajectoryVirtualRecordKey(record), 'cell': record.cell, 't': props.t }, { default: ({ displayText, listDisplayText, resultText, toolCallOnly, toolCallText }: RecordPresentationValue) => {
              const summaryKind = record.collapsedSummaryKind
              const isCollapsedSummary = summaryKind !== undefined
              const isRequestOnly = record.cell.requestOnly === true
              const isInitialSystem = record.cell.kind === 'system'
                                    && record.cell.index === allRecords.value[0]?.cell.index
              const key = requestKey(record.turn, record.group)
              const request = requestBoundaries.value.get(key) === record.cell.index
                                    && !isCollapsedSummary
                                    && (record.turn === null || !props.collapsedTurns.has(record.turn))
                ? requestNumbers.value.get(key)
                : undefined
              const requestInfo = request === undefined
                ? undefined
                : props.requestNumbers?.find(candidate => candidate.number === request)
              const requestStatus = requestInfo?.status
                                    ?? (record.cell.isError === true ? 'error' : undefined)
              const requestRunIndex = requestBoundaryRuns.value.get(record.cell.index) ?? 0
              const requestBoundaryStyle: RequestBoundaryStyle = {
                '--request-boundary-offset': `${requestRunIndex * 8}px`,
              }
              const requestLabel = request === undefined
                ? undefined
                : props.t(requestInfo?.purpose === 'compaction'
                  ? 'request.labelCompaction'
                  : 'request.label', { request })
              const requestSelected = requestInfo !== undefined
                                    && selectedRequestSnapshot?.identity === requestIdentity(requestInfo)
              const sectionActive = record.turn === null
                ? activeSection.value === record.section
                : activeTurn.value === record.turn
              const singleToolNotice = record.cell.kind === 'context'
                                    && record.cell.sourceBlocks?.length === 1
                                    && record.cell.sourceBlocks.every(block => block.type === 'tool-addition' || block.type === 'tool-removal')
              return (h('tr', { 'tabIndex': isRequestOnly || singleToolNotice ? -1 : 0, 'aria-rowindex': position + 1 + historyRowOffset.value, 'aria-label': isCollapsedSummary
                ? props.t('request.collapsedSummary', {
                  kind: props.t(COLLAPSED_SUMMARY_LABEL_KEY[summaryKind]),
                  summary: record.collapsedSummary,
                })
                : isRequestOnly
                  ? props.t('request.rowAriaCompaction', { request: request ?? '' })
                  : props.t('request.rowAria', {
                    request: request === undefined ? '' : props.t('request.rowPrefix', { request }),
                    kind: props.t(KIND_LABEL_KEY[record.cell.kind]),
                    content: listDisplayText || props.t('request.noContent'),
                  }), 'aria-selected': !isCollapsedSummary && !isRequestOnly && selectedIndexSnapshot === record.cell.index, 'data-kind': record.cell.kind, 'data-trajectory-row-key': trajectoryVirtualRecordKey(record), 'data-virtual-position': virtualizationEnabled.value ? position : undefined, 'data-record-index': !isCollapsedSummary && !isRequestOnly
                ? record.cell.index
                : undefined, 'data-request-only': isRequestOnly || undefined, 'data-terminal-request-boundary': terminalRequestBoundary || undefined, 'data-group-start': record.groupStart || undefined, 'data-turn-start': record.turnStart || undefined, 'data-error': record.cell.isError || undefined, 'data-running': stateOf(record) === 'running' || undefined, 'data-turn-end': record.turnEnd || undefined, 'data-collapsed-summary': record.collapsedSummaryKind, 'data-selected': !isCollapsedSummary && selectedIndexSnapshot === record.cell.index || undefined, 'data-timeline-focus': isCollapsedSummary || timelineFocusIndexesSnapshot === null
                ? undefined
                : timelineFocusIndexesSnapshot.has(record.cell.index) ? 'inside' : 'outside', 'onClick': isRequestOnly || singleToolNotice
                ? undefined
                : isCollapsedSummary
                  ? () => { expandSummary.value(record, summaryKind) }
                  : () => { selectRecord(record.cell.index) }, 'onDblclick': (event: MouseEvent & {
                    currentTarget: HTMLInputElement
                  }) => {
                if (isCollapsedSummary || isRequestOnly || singleToolNotice)
                  return
                if (record.turn !== null && props.collapsedTurns.has(record.turn)) {
                  event.preventDefault()
                  props.onToggleTurn(record.turn)
                  return
                }
                if (record.cell.kind === 'message'
                                            && assistantToolCalls(allRecords.value, record.cell.index).length > 0) {
                  event.preventDefault()
                  props.onToggleAssistant(trajectoryRecordId(record.cell))
                  return
                }
                if (!record.turnStart)
                  return
                if (record.turn === null)
                  return
                if (allRecords.value.filter(candidate => candidate.turn === record.turn
                                            && candidate.cell.requestOnly !== true
                                            && candidate.cell.kind !== 'system').length <= 1)
                  return
                event.preventDefault()
                props.onToggleTurn(record.turn)
              }, 'onKeydown': (event: KeyboardEvent & {
                currentTarget: HTMLInputElement
              }) => {
                if (isRequestOnly || singleToolNotice)
                  return
                if (event.key !== 'Enter' && event.key !== ' ')
                  return
                event.preventDefault()
                if (isCollapsedSummary) {
                  expandSummary.value(record, summaryKind)
                  return
                }
                selectRecord(record.cell.index)
              } }, [
                h('td', { 'class': css.event }, [
                  request !== undefined && (h('button', { 'type': 'button', 'class': requestSelected
                    ? `${css.requestBoundaryControl} ${css.requestBoundaryControlActive}`
                    : css.requestBoundaryControl, 'aria-label': requestLabel, 'aria-pressed': requestSelected, 'data-label': requestLabel, 'data-request-run-index': requestRunIndex, 'data-request-status': requestStatus, 'style': requestBoundaryStyle, 'onClick': (event: MouseEvent & {
                      currentTarget: HTMLElement
                    }) => {
                    event.stopPropagation()
                    if (requestInfo !== undefined) {
                      selectRequest.value({ identity: requestIdentity(requestInfo) })
                    }
                  }, 'onDblclick': (event: MouseEvent & {
                    currentTarget: HTMLInputElement
                  }) => { event.stopPropagation() } })),
                  record.turn !== null
                                            && activeTurn.value === record.turn
                                            && !isInitialSystem && (h('span', { 'class': css.turnRail, 'aria-hidden': 'true' })),
                  !isCollapsedSummary && selectedIndexSnapshot === record.cell.index && (h('span', { 'class': css.selectionRail, 'aria-hidden': 'true' })),
                  !isCollapsedSummary
                                            && !isRequestOnly
                                            && record.turnStart && (h('span', { 'class': sectionActive
                    ? `${css.turnLabel} ${css.turnLabelActive}`
                    : css.turnLabel, 'aria-label': sectionLabel(record.turn, props.t) }, [
                    record.turn === null
                      ? sectionLabel(record.turn, props.t)
                      : (h(Fragment, null, [
                        h('span', { 'class': css.turnLabelFull, 'aria-hidden': 'true' }, [
                          sectionLabel(record.turn, props.t),
                        ]),
                        h('span', { 'class': css.turnLabelCompact, 'aria-hidden': 'true' }, [
                          '#',
                          record.turn,
                        ]),
                      ])),
                  ])),
                  h('div', { 'class': css.eventInner }, [
                    !isCollapsedSummary && !isRequestOnly && (h('span', { 'class': css.kindSlot }, [
                      h('span', { 'class': `${css.kindTag} ${record.cell.kind === 'system'
                        ? css.systemNeutral
                        : record.cell.kind === 'context'
                          ? css.contextGreen
                          : record.cell.kind === 'compacted'
                            ? css.compacted
                            : record.cell.kind === 'tool'
                              ? css.toolAmber
                              : record.cell.kind === 'message'
                                ? css.assistantVioletBright
                                : record.cell.kind === 'subtool'
                                  ? css.subtoolAmber
                                  : css[record.cell.kind]}`, 'data-role-kind': record.cell.kind }, [
                        h(Tooltip, { 'label': props.t(KIND_LABEL_KEY[record.cell.kind]), 'side': 'right' }, { default: () => [
                          h('span', { 'class': css.kindTagIcon, 'aria-hidden': 'true' }, [
                            KIND_ICON[record.cell.kind],
                          ]),
                        ] }),
                        h('span', { 'class': css.kindTagLabel }, [
                          props.t(KIND_LABEL_KEY[record.cell.kind]),
                        ]),
                      ]),
                    ])),
                  ]),
                ]),
                h('td', { 'class': css.content }, [
                  isRequestOnly
                    ? null
                    : record.collapsedSummary !== undefined
                      ? (h('span', { 'class': css.collapsedTurnContent, 'title': record.collapsedSummary }, [
                        h('span', { 'class': css.collapsedTurnEllipsis }, [
                          '\u2026',
                        ]),
                        h('span', { 'class': css.collapsedTurnText }, [
                          record.collapsedSummary,
                        ]),
                      ]))
                      : (h('span', { 'class': resultText === undefined ? css.contentText : css.resultPreview, 'title': resultText === undefined
                        ? listDisplayText
                        : `${listDisplayText} → ${resultText}` }, [
                        h('span', { 'class': resultText === undefined ? undefined : css.resultRequest }, [
                          h(RecordListText, { 'displayText': displayText, 'toolCallOnly': toolCallOnly, 'toolCallText': toolCallText, 't': props.t }),
                        ]),
                        resultText !== undefined && (h('span', { 'class': record.cell.isError ? `${css.inlineResult} ${css.error}` : css.inlineResult }, [
                          h('span', { 'class': css.arrow }, [
                            '\u2192',
                          ]),
                          h('span', { 'class': resultText === props.t('record.noOutput')
                            ? `${css.inlineResultText} ${css.noOutputText}`
                            : css.inlineResultText }, [
                            resultText,
                          ]),
                        ])),
                      ])),
                ]),
              ]))
            } }))),
            virtualBottom.value > 0 && (h('tr', { 'class': css.virtualSpacer, 'data-virtual-spacer': 'bottom', 'aria-hidden': 'true' }, [
              h('td', { 'colSpan': 2, 'style': {
                '--trajectory-virtual-spacer-height': `${virtualBottom.value}px`,
              } satisfies VirtualSpacerStyle }),
            ])),
          ]),
        ]),
      ]),
      (selectedRequestInfoSnapshot !== undefined
                || promptSelected.value
                || (selectedSnapshot !== undefined && selectedStateSnapshot !== undefined)) && (h('aside', { 'class': css.details, 'aria-label': props.t('details.event'), 'style': detailsWidth.value === null ? undefined : { width: detailsWidth.value } }, [
        h('div', { 'class': css.detailsResizeHandle, 'role': 'separator', 'aria-label': props.t('details.resize'), 'aria-controls': 'trajectory-detail-panel', 'aria-orientation': 'vertical', 'tabIndex': 0, 'title': props.t('details.resizeTitle'), 'onDblclick': () => {
          detailsWidth.value = null
          toolRequestOffset.value = null
        }, 'onPointerdown': (event: PointerEvent & {
          currentTarget: HTMLInputElement
        }) => {
          if (event.button !== 0)
            return
          const details = event.currentTarget.parentElement
          if (details === null)
            return
          const split = details.parentElement
          if (split === null)
            return
          const splitWidth = split.getBoundingClientRect().width
          detailsResizeDrag.value = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startWidth: details.getBoundingClientRect().width,
            splitWidth,
            startToolRequestOffset: toolRequestOffset.value ?? (splitWidth * TOOL_REQUEST_SHARE - defaultToolRequestWidth(splitWidth)),
          }
          event.currentTarget.setPointerCapture(event.pointerId)
          event.preventDefault()
        }, 'onPointermove': (event: PointerEvent & {
          currentTarget: HTMLInputElement
        }) => {
          const drag = detailsResizeDrag.value
          if (drag === null || drag.pointerId !== event.pointerId)
            return
          const nextDetailsWidth = clampDetailsWidth(drag.startWidth + drag.startX - event.clientX, drag.splitWidth)
          detailsWidth.value = nextDetailsWidth
          toolRequestOffset.value = drag.startToolRequestOffset
                            + (nextDetailsWidth - drag.startWidth) * TOOL_REQUEST_SHARE
        }, 'onPointerup': (event: PointerEvent & {
          currentTarget: HTMLInputElement
        }) => {
          if (detailsResizeDrag.value?.pointerId !== event.pointerId)
            return
          detailsResizeDrag.value = null
          event.currentTarget.releasePointerCapture(event.pointerId)
        }, 'onPointercancel': () => {
          detailsResizeDrag.value = null
        }, 'onKeydown': (event: KeyboardEvent & {
          currentTarget: HTMLInputElement
        }) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
            return
          const details = event.currentTarget.parentElement
          if (details === null)
            return
          const split = details.parentElement
          if (split === null)
            return
          const direction = event.key === 'ArrowLeft' ? 1 : -1
          const currentDetailsWidth = details.getBoundingClientRect().width
          const splitWidth = split.getBoundingClientRect().width
          const nextDetailsWidth = clampDetailsWidth(currentDetailsWidth + direction * DETAILS_RESIZE_STEP, splitWidth)
          const currentToolRequestOffset = toolRequestOffset.value ?? (
            splitWidth * TOOL_REQUEST_SHARE - defaultToolRequestWidth(splitWidth))
          detailsWidth.value = nextDetailsWidth
          toolRequestOffset.value = currentToolRequestOffset
                            + (nextDetailsWidth - currentDetailsWidth) * TOOL_REQUEST_SHARE
          event.preventDefault()
        } }),
        h('div', { 'class': css.detailsHeader }, [
          h('div', { 'class': css.detailsTitle }, [
            selectedRequestInfoSnapshot !== undefined
              ? (h(Fragment, null, [
                h('span', { 'class': css.requestDetailsDot, 'aria-hidden': 'true' }),
                h('span', { 'class': css.requestDetailsName }, [
                  props.t('request.label', { request: selectedRequestNumberSnapshot ?? '—' }),
                ]),
                h('span', { 'class': css.detailsLocation }, [
                  selectedRequestInfoSnapshot.purpose === 'compaction'
                    ? props.t('request.compaction', { section: sectionLabel(selectedRequestInfoSnapshot.turn, props.t) })
                    : sectionLabel(selectedRequestInfoSnapshot.turn, props.t),
                ]),
              ]))
              : promptSelected.value ? (h(Fragment, null, [
                h('span', { 'class': `${css.kindTag} ${css.systemNeutral}` }, [
                  props.t('kind.system'),
                ]),
                h('span', { 'class': css.detailsLocation }, [
                  selectedSnapshot?.cell.text,
                ]),
              ]))
                : selectedSnapshot !== undefined && (h(Fragment, null, [
                  h('span', { 'class': `${css.kindTag} ${selectedSnapshot.cell.kind === 'context'
                    ? css.contextGreen
                    : selectedSnapshot.cell.kind === 'compacted'
                      ? css.compacted
                      : selectedSnapshot.cell.kind === 'tool'
                        ? css.toolAmber
                        : selectedSnapshot.cell.kind === 'message'
                          ? css.assistantVioletBright
                          : selectedSnapshot.cell.kind === 'subtool'
                            ? css.subtoolAmber
                            : css[selectedSnapshot.cell.kind]}` }, [
                    props.t(KIND_LABEL_KEY[selectedSnapshot.cell.kind]),
                  ]),
                  h('span', { 'class': css.detailsLocation }, [
                    selectedSnapshot.cell.kind === 'compacted'
                      ? sectionLabel(selectedSnapshot.turn, props.t)
                      : `${sectionLabel(selectedSnapshot.turn, props.t)} · ${selectedSnapshot.group}`,
                  ]),
                ])),
          ]),
          h('button', { 'type': 'button', 'class': css.close, 'aria-label': props.t('details.close'), 'onClick': clearInspectorSelection.value }, [
            h('span', { 'aria-hidden': 'true' }, [
              '\u00D7',
            ]),
          ]),
        ]),
        h('div', { 'class': css.detailTabs, 'role': 'tablist', 'aria-label': props.t('details.event') }, [
          selectedTabsSnapshot.map(tab => (h('button', { 'key': tab.id, 'id': `trajectory-detail-${tab.id}`, 'type': 'button', 'role': 'tab', 'aria-controls': 'trajectory-detail-panel', 'aria-selected': activeTab.value === tab.id, 'class': activeTab.value === tab.id ? `${css.detailTab} ${css.detailTabActive}` : css.detailTab, 'onClick': () => { activateTab.value(tab.id) } }, [
            props.t(tab.labelKey),
          ]))),
        ]),
        h('div', { 'id': 'trajectory-detail-panel', 'class': activeTab.value === 'overview'
          ? `${css.detailBody} ${css.detailBodySummary}`
          : selectedProgramSnapshot !== undefined && activeTab.value === 'input'
            ? `${css.detailBody} ${css.detailBodyProgram}`
            : css.detailBody, 'role': 'tabpanel', 'aria-labelledby': `trajectory-detail-${activeTab.value}` }, [
          selectedRequestInfoSnapshot !== undefined
                        && selectedRequestStateSnapshot !== undefined
                        && activeTab.value === 'overview' && (h(Fragment, null, [
            h('dl', { 'class': `${css.overview} ${css.summaryScrollRegion}`, 'data-summary-scroll-region': '' }, [
              h('div', null, [
                h('dt', null, [
                  props.t('details.status'),
                ]),
                h('dd', { 'class': selectedRequestStateSnapshot === 'error' ? css.error : undefined }, [
                  statusLabel(selectedRequestStateSnapshot, props.t),
                ]),
              ]),
              selectedRequestInfoSnapshot.purpose === 'compaction' && (h('div', null, [
                h('dt', null, [
                  props.t('details.purpose'),
                ]),
                h('dd', null, [
                  props.t('request.compactionPurpose'),
                ]),
              ])),
              (selectedRequestInfoSnapshot.provider
                                ?? selectedRequestInfoSnapshot.requestConfig?.provider) !== undefined && (h('div', null, [
                h('dt', null, [
                  props.t('details.provider'),
                ]),
                h('dd', null, [
                  selectedRequestInfoSnapshot.provider
                                        ?? selectedRequestInfoSnapshot.requestConfig?.provider,
                ]),
              ])),
              (selectedRequestInfoSnapshot.model
                                ?? selectedRequestInfoSnapshot.requestConfig?.model) !== undefined && (h('div', null, [
                h('dt', null, [
                  props.t('details.model'),
                ]),
                h('dd', null, [
                  selectedRequestInfoSnapshot.model
                                        ?? selectedRequestInfoSnapshot.requestConfig?.model,
                ]),
              ])),
              h('div', null, [
                h('dt', null, [
                  props.t('details.toolCalls'),
                ]),
                h('dd', null, [
                  selectedRequestToolCallsSnapshot,
                ]),
              ]),
              selectedRequestSubtoolCallsSnapshot > 0 && (h('div', null, [
                h('dt', null, [
                  props.t('details.subtoolCalls'),
                ]),
                h('dd', null, [
                  selectedRequestSubtoolCallsSnapshot,
                ]),
              ])),
              selectedRequestInfoSnapshot.error !== undefined && (h('div', null, [
                h('dt', null, [
                  props.t(selectedRequestStateSnapshot !== 'error' && selectedRequestInfoSnapshot.retry !== undefined
                    ? 'details.lastAttemptError'
                    : 'details.error'),
                ]),
                h('dd', { 'class': selectedRequestStateSnapshot === 'error' ? css.error : undefined }, [
                  requestErrorMessage(selectedRequestInfoSnapshot, props.t),
                ]),
              ])),
              selectedRequestInfoSnapshot.retry !== undefined && (h('div', null, [
                h('dt', null, [
                  props.t('details.retry'),
                ]),
                h('dd', null, [
                  selectedRequestInfoSnapshot.maxRetries === undefined
                    ? selectedRequestInfoSnapshot.retry
                    : props.t('request.retryProgress', {
                      retry: selectedRequestInfoSnapshot.retry,
                      maximum: selectedRequestInfoSnapshot.maxRetries,
                    }),
                ]),
              ])),
              selectedRequestInfoSnapshot.retryDelayMs !== undefined && (h('div', null, [
                h('dt', null, [
                  props.t('details.retryDelay'),
                ]),
                h('dd', null, [
                  formatDurationMs(selectedRequestInfoSnapshot.retryDelayMs, props.t),
                ]),
              ])),
              selectedRequestResultSnapshot !== undefined && (h('div', null, [
                h('dt', null, [
                  props.t('details.result'),
                ]),
                h('dd', { 'class': css.overviewParentLinks }, [
                  h('button', { 'type': 'button', 'class': css.overviewHierarchyNavLink, 'onClick': () => {
                    openRecordSummary.value(selectedRequestResultSnapshot)
                  } }, [
                    h('span', null, [
                      selectedRequestInfoSnapshot.purpose === 'compaction'
                        ? props.t('details.compacted')
                        : props.t('details.assistantMessage'),
                    ]),
                    h(IconChevronRightOutlineRegular, { 'className': css.overviewHierarchyJumpIconTight ?? '', 'size': 11 }),
                  ]),
                ]),
              ])),
            ]),
            h('div', { 'class': css.overviewSections }, [
              selectedRequestOptionsSnapshot !== undefined && (h(OverviewSection, { 'label': props.t('tab.options'), 'onOpen': () => { activateTab.value('options') } }, { default: () => [
                h(RequestOptions, { 'options': selectedRequestOptionsSnapshot, 'preview': true, 'stringWrapping': props.stringWrapping, 't': props.t }),
              ] })),
              h(OverviewSection, { 'label': props.t('tab.usage'), 'onOpen': () => { activateTab.value('usage') } }, { default: () => [
                h(UsageRows, { 'usage': selectedRequestUsageSnapshot, 't': props.t }),
              ] }),
              h(OverviewSection, { 'label': props.t('tab.timing'), 'onOpen': () => { activateTab.value('timing') } }, { default: () => [
                h(RequestTiming, { 'assistant': selectedRequestAssistantSnapshot, 'anchor': selectedRequestAnchorSnapshot, 'request': selectedRequestInfoSnapshot, 'preview': true, 't': props.t }),
              ] }),
            ]),
          ])),
          selectedRequestInfoSnapshot !== undefined && activeTab.value === 'options' && (h(RequestOptions, { 'options': selectedRequestOptionsSnapshot, 'stringWrapping': props.stringWrapping, 't': props.t })),
          selectedRequestInfoSnapshot !== undefined && activeTab.value === 'usage' && (h(RequestUsagePanel, { 'usage': selectedRequestUsageSnapshot, 'cumulative': selectedRequestCumulativeUsageSnapshot, 't': props.t })),
          selectedRequestInfoSnapshot !== undefined && activeTab.value === 'timing' && (h(RequestTiming, { 'assistant': selectedRequestAssistantSnapshot, 'anchor': selectedRequestAnchorSnapshot, 'request': selectedRequestInfoSnapshot, 't': props.t })),
          selectedPromptSnapshot !== undefined
                        && selectedPreviousPromptSnapshot !== undefined
                        && activeTab.value === 'diff' && (h(SystemPromptDiff, { 'before': selectedPreviousPromptSnapshot, 'after': selectedPromptSnapshot, 't': props.t })),
          promptSelected.value && activeTab.value === 'system-prompt' && (selectedSystemPromptSnapshot === ''
            ? h('p', { 'class': css.noPayload }, [
              props.t('record.systemPromptMissing'),
            ]) : (h('div', { 'class': `${css.markdownPayload} ${css.systemPrompt}` }, [
              selectedSystemPromptSnapshot !== undefined && h(MarkdownText, { 'text': selectedSystemPromptSnapshot, 'labels': markdownLabels(props.t) }),
            ]))),
          selectedPromptSnapshot !== undefined && activeTab.value === 'tools' && (h(ToolCatalog, { 'tools': selectedPromptSnapshot.tools, 'stringWrapping': props.stringWrapping, 't': props.t })),
          !promptSelected.value
                        && selectedSnapshot?.cell.kind === 'compacted'
                        && selectedStateSnapshot !== undefined
                        && activeTab.value === 'overview' && (h(Fragment, null, [
            h('dl', { 'class': `${css.overview} ${css.summaryScrollRegion}`, 'data-summary-scroll-region': '' }, [
              h('div', null, [
                h('dt', null, [
                  props.t('details.status'),
                ]),
                h('dd', { 'class': selectedStateSnapshot === 'error' ? css.error : undefined }, [
                  statusLabel(selectedStateSnapshot, props.t),
                ]),
              ]),
              h('div', null, [
                h('dt', null, [
                  props.t('timing.duration'),
                ]),
                h('dd', null, [
                  formatElapsedSeconds(selectedSnapshot.cell.timeSeconds, props.t),
                ]),
              ]),
              h('div', null, [
                h('dt', null, [
                  props.t('usage.tokens'),
                ]),
                h('dd', null, [
                  '\u2014',
                ]),
              ]),
            ]),
            selectedSnapshot.cell.outputDetail !== undefined && (h('div', { 'class': `${css.compactedSummary} ${css.summaryScrollRegion}`, 'data-summary-scroll-region': '' }, [
              h(MarkdownRecordContent, { 'record': selectedSnapshot, 'renderSlot': props.renderSlot, 'loadImage': props.loadImage, 'rendered': true, 'thinkingExpanded': thinkingExpanded.value, 'onThinkingExpandedChange': setThinkingExpanded.value, 'onOpenCall': openCallSummary.value, 't': props.t }),
            ])),
          ])),
          !promptSelected.value
                        && selectedSnapshot !== undefined
                        && selectedSnapshot.cell.kind !== 'compacted'
                        && selectedStateSnapshot !== undefined
                        && activeTab.value === 'overview' && (h(Fragment, null, [
            selectedProgramSnapshot !== undefined && selectedProgramSnapshot.description !== '' && (h('p', { 'class': css.programDescription }, [
              selectedProgramSnapshot.description,
            ])),
            h('dl', { 'class': `${css.overview} ${css.summaryScrollRegion}`, 'data-summary-scroll-region': '' }, [
              selectedSnapshot.cell.messageSource !== undefined && (h('div', null, [
                h('dt', null, [
                  props.t('details.source'),
                ]),
                h('dd', { 'class': css.overviewParentLinks }, [
                  h('button', { 'type': 'button', 'class': css.overviewHierarchyNavLink, 'onClick': () => { activateTab.value('source') } }, [
                    h('span', null, [
                      messageSourceLabel(selectedSnapshot.cell.messageSource, props.t),
                    ]),
                    h(IconChevronRightOutlineRegular, { 'className': css.overviewHierarchyJumpIconTight ?? '', 'size': 11 }),
                  ]),
                ]),
              ])),
              hasSelectedHierarchy.value && (h('div', null, [
                h('dt', null, [
                  selectedAssistantRequestTargetSnapshot !== undefined
                    ? props.t('details.source')
                    : props.t('details.hierarchy'),
                ]),
                h('dd', { 'class': css.overviewParentLinks }, [
                  selectedAssistantRequestTargetSnapshot !== undefined && (h('button', { 'type': 'button', 'class': css.overviewHierarchyNavLink, 'onClick': () => {
                    selectRequest.value(selectedAssistantRequestTargetSnapshot)
                  } }, [
                    h('span', null, [
                      props.t('request.label', { request: selectedAssistantRequestSnapshot ?? '—' }),
                    ]),
                    h(IconChevronRightOutlineRegular, { 'className': css.overviewHierarchyJumpIconTight ?? '', 'size': 11 }),
                  ])),
                  selectedParentMessageSnapshot !== undefined && (h('button', { 'type': 'button', 'class': css.overviewHierarchyNavLink, 'onClick': () => { openRecordSummary.value(selectedParentMessageSnapshot) } }, [
                    h('span', null, [
                      props.t('details.assistantMessage'),
                    ]),
                    h(IconChevronRightOutlineRegular, { 'className': css.overviewHierarchyJumpIconTight ?? '', 'size': 11 }),
                  ])),
                  selectedParentToolSnapshot !== undefined && (h('button', { 'type': 'button', 'class': css.overviewHierarchyNavLink, 'onClick': () => { openRecordSummary.value(selectedParentToolSnapshot) } }, [
                    h('span', null, [
                      props.t('details.toolCall'),
                    ]),
                    h(IconChevronRightOutlineRegular, { 'className': css.overviewHierarchyJumpIconTight ?? '', 'size': 11 }),
                  ])),
                ]),
              ])),
              h('div', null, [
                h('dt', null, [
                  props.t('details.status'),
                ]),
                h('dd', { 'class': selectedStateSnapshot === 'error' ? css.error : undefined }, [
                  statusLabel(selectedStateSnapshot, props.t),
                ]),
              ]),
              selectedSnapshot.cell.kind === 'message' && (h(TokenRows, { 'cell': selectedSnapshot.cell, 't': props.t })),
              (selectedSnapshot.cell.kind === 'user' || selectedSnapshot.cell.kind === 'context') && (h('div', null, [
                h('dt', null, [
                  props.t('timing.duration'),
                ]),
                h('dd', null, [
                  formatElapsedSeconds(selectedSnapshot.cell.timeSeconds, props.t),
                ]),
              ])),
            ]),
            h('div', { 'class': css.overviewSections }, [
              selectedProgramSnapshot !== undefined
                ? (h(Fragment, null, [
                  h(ProgramInput, { 'key': `preview:${selectedRecordIdSnapshot}`, 'program': selectedProgramSnapshot, 'initialWrapped': codeWrappingOnOpen.value, 'stringWrapping': props.stringWrapping, 'onOpen': () => { activateTab.value('input') }, 't': props.t }),
                  h(ProgramOutput, { 'record': selectedSnapshot, 'stringWrapping': props.stringWrapping, 'onOpen': () => { activateTab.value('output') }, 't': props.t }),
                ]))
                : isMarkdownRecord(selectedSnapshot)
                  ? (h(Fragment, null, [
                    h(OverviewSection, { 'label': props.t('tab.preview'), 'onOpen': () => { activateTab.value('rendered') } }, { default: () => [
                      h(MarkdownRecordContent, { 'record': selectedSnapshot, 'renderSlot': props.renderSlot, 'loadImage': props.loadImage, 'rendered': true, 'preview': true, 'thinkingExpanded': thinkingExpanded.value, 'onThinkingExpandedChange': setThinkingExpanded.value, 'onOpenCall': openCallSummary.value, 't': props.t }),
                    ] }),
                  ]))
                  : (h(Fragment, null, [
                    selectedSnapshot.cell.inputDetail && (h(OverviewSection, { 'label': props.t('tab.payload'), 'onOpen': () => { activateTab.value('input') } }, { default: () => [
                      h(RecordPayload, { 'record': selectedSnapshot, 'direction': 'input', 'preview': true, 'renderSlot': props.renderSlot, 'loadImage': props.loadImage, 'stringWrapping': props.stringWrapping, 't': props.t }),
                    ] })),
                    selectedSnapshot.cell.outputDetail && (h(OverviewSection, { 'label': props.t('tab.result'), 'onOpen': () => { activateTab.value('output') } }, { default: () => [
                      h(RecordPayload, { 'record': selectedSnapshot, 'direction': 'output', 'preview': true, 'renderSlot': props.renderSlot, 'loadImage': props.loadImage, 'stringWrapping': props.stringWrapping, 't': props.t }),
                    ] })),
                    h(OverviewSection, { 'label': props.t('tab.schema'), 'onOpen': () => { activateTab.value('schema') } }, { default: () => [
                      h(RecordSchema, { 'record': selectedSnapshot, 'preview': true, 'stringWrapping': props.stringWrapping, 't': props.t }),
                    ] }),
                  ])),
              selectedAssistantRequestTargetSnapshot !== undefined && (h(OverviewSection, { 'label': props.t('timing.request'), 'onOpen': () => {
                selectRequest.value(selectedAssistantRequestTargetSnapshot, 'timing')
              } }, { default: () => [
                h(RecordTiming, { 'record': selectedSnapshot, 'preview': true, 't': props.t }),
              ] })),
              (selectedSnapshot.cell.kind === 'tool' || selectedSnapshot.cell.kind === 'subtool') && (h(OverviewSection, { 'label': props.t('tab.timing'), 'onOpen': () => { activateTab.value('timing') } }, { default: () => [
                h(RecordTiming, { 'record': selectedSnapshot, 'preview': true, 't': props.t }),
              ] })),
            ]),
          ])),
          !promptSelected.value && selectedSnapshot !== undefined && activeTab.value === 'rendered' && (h(MarkdownRecordContent, { 'record': selectedSnapshot, 'renderSlot': props.renderSlot, 'loadImage': props.loadImage, 'rendered': true, 'thinkingExpanded': thinkingExpanded.value, 'onThinkingExpandedChange': setThinkingExpanded.value, 'onOpenCall': openCallSummary.value, 't': props.t })),
          !promptSelected.value && selectedSnapshot !== undefined && activeTab.value === 'raw' && (h(MarkdownRecordContent, { 'record': selectedSnapshot, 'renderSlot': props.renderSlot, 'loadImage': props.loadImage, 'rendered': false, 'thinkingExpanded': thinkingExpanded.value, 'onThinkingExpandedChange': setThinkingExpanded.value, 'onOpenCall': openCallSummary.value, 't': props.t })),
          !promptSelected.value && selectedSnapshot !== undefined && activeTab.value === 'source' && (h(MessageSource, { 'record': selectedSnapshot, 'stringWrapping': props.stringWrapping, 't': props.t })),
          !promptSelected.value && selectedSnapshot !== undefined && activeTab.value === 'input' && (selectedProgramSnapshot === undefined
            ? h(RecordPayload, { 'record': selectedSnapshot, 'direction': 'input', 'renderSlot': props.renderSlot, 'loadImage': props.loadImage, 'stringWrapping': props.stringWrapping, 't': props.t }) : h(ProgramInput, { 'key': `input:${selectedRecordIdSnapshot}`, 'program': selectedProgramSnapshot, 'initialWrapped': codeWrappingOnOpen.value, 'stringWrapping': props.stringWrapping, 't': props.t })),
          !promptSelected.value && selectedSnapshot !== undefined && activeTab.value === 'output' && (selectedSnapshot.cell.kind === 'tool' || selectedSnapshot.cell.kind === 'subtool'
            ? h('div', { 'class': css.resultSections }, [
              h('section', { 'class': css.resultSection, 'aria-label': props.t('record.rawResult') }, [
                h('header', { 'class': css.overviewHeading }, [
                  h('h3', { 'class': css.resultTitle }, [
                    props.t('record.rawResult'),
                  ]),
                ]),
                resultValue.value === undefined
                  ? h('p', { 'class': css.noPayload }, [
                    props.t(stateOf(selectedSnapshot) === 'running' ? 'code.running' : 'record.rawResultUnavailable'),
                  ]) : resultValue.value !== null && typeof resultValue.value === 'object'
                    ? h(JsonTree, { 'data': resultValue.value, 'label': props.t('record.resultJson'), 'labels': jsonTreeLabels(props.t), 'stringWrapping': props.stringWrapping, 'collapsedStringLines': 12, 'className': css.jsonPayload ?? '' }) : h('pre', { 'class': css.programOutput }, [
                      JSON.stringify(resultValue.value),
                    ]),
              ]),
              h('section', { 'class': css.resultSection, 'aria-label': props.t('record.renderedResult') }, [
                h('header', { 'class': css.overviewHeading }, [
                  h('h3', { 'class': css.resultTitle }, [
                    props.t('record.renderedResult'),
                  ]),
                ]),
                selectedProgramSnapshot === undefined
                  ? h(RecordPayload, { 'record': selectedSnapshot, 'direction': 'output', 'renderSlot': props.renderSlot, 'loadImage': props.loadImage, 'stringWrapping': props.stringWrapping, 't': props.t }) : h(ProgramOutput, { 'record': selectedSnapshot, 'stringWrapping': props.stringWrapping, 't': props.t }),
              ]),
            ]) : h(RecordPayload, { 'record': selectedSnapshot, 'direction': 'output', 'renderSlot': props.renderSlot, 'loadImage': props.loadImage, 'stringWrapping': props.stringWrapping, 't': props.t })),
          !promptSelected.value && selectedSnapshot !== undefined && activeTab.value === 'schema' && (h(RecordSchema, { 'record': selectedSnapshot, 'stringWrapping': props.stringWrapping, 't': props.t })),
          !promptSelected.value && selectedSnapshot !== undefined && activeTab.value === 'timing' && (h(RecordTiming, { 'record': selectedSnapshot, 't': props.t })),
        ]),
      ])),
    ]))
  }
}, { name: 'TrajectoryTable', inheritAttrs: false, props: ['watchToolResult', 't', 'stringWrapping', 'renderSlot', 'loadImage', 'requestNumbers', 'turns', 'streamingCells', 'timelineFocusIndexes', 'searchMatchIndexes', 'onSelectedIndexChange', 'onRecordSelect', 'recordSelection', 'recordFocus', 'historyLoading', 'olderHistoryLoading', 'historyStartSeq', 'hasOlderRecords', 'onLoadOlder', 'onClearSelection', 'collapsedTurns', 'onToggleTurn', 'collapsedAssistants', 'onToggleAssistant', 'collapsedTools', 'onToggleTool', 'inspectCallId', 'onInspectApplied'] })
