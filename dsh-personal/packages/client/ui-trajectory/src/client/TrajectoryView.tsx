import { onMounted, computed, defineComponent, h, watchEffect, watch, shallowRef } from 'vue'
/** Trajectory view: compact summary over a turn-aware event ledger. */
import type { AssistantBlock, AssistantMessageNode, ConvViewProps, MessageImageLoader, ToolCallBlock } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InjectFace, PropsLocale, PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { JsonTreeProps } from '@deepseek-ai/dsh-client-ui-primitives'
import { TrajectoryTable, type TrajectoryRequestNumber, type TrajectoryUsage } from './TrajectoryTable.tsx'
import type { WatchToolResult } from './watch-tool-result.ts'
import { TrajectoryToolbar } from './TrajectoryToolbar.tsx'
import { TrajectoryTimeline } from './TrajectoryTimeline.tsx'
import { appendTrajectoryPartialLayout, deriveTrajectoryLayout, type TrajectoryTurnModel } from './layout.ts'
import { trajectoryTimelineFocusIndexes, type TrajectoryTimelineMode, type TrajectoryTimeRange } from './timeline.ts'
import { trajectoryRecordId } from './trajectory-record.ts'
import { TrajectorySearchIndex } from './trajectory-search-index.ts'
import type { TrajectorySnapshot } from './trajectory-contract.ts'
import css from './views.module.css'
const EMPTY_TURN_IDS: ReadonlySet<number> = new Set()
const EMPTY_RECORD_IDS: ReadonlySet<string> = new Set()
const SEARCH_INDEX_THROTTLE_MS = 3000
const HISTORY_PAGE_NODES = 50
function containsCall(calls: readonly ToolCallBlock[], callId: string): boolean {
  for (const call of calls) {
    if (call.callId === callId || containsCall(call.subCalls, callId))
      return true
  }
  return false
}
function lastCellIndex(turns: readonly TrajectoryTurnModel[]): number {
  let last = 0
  for (const turn of turns) {
    for (const group of turn.groups) {
      for (const cell of group.cells)
        last = Math.max(last, cell.index)
    }
  }
  return last
}
function timelineBlock(block: AssistantBlock): AssistantBlock {
  switch (block.kind) {
    case 'text': return { kind: 'text', text: '' }
    case 'reasoning': return { kind: 'reasoning', text: '' }
    case 'image': return block
    case 'tool-call': return {
      kind: 'tool-call',
      callId: block.callId,
      name: block.name,
      argsRaw: '',
    }
    case 'other': return { kind: 'other', block: null }
  }
}
/** Session-bound controls not already supplied by the conversation view slot. */
export interface TrajectoryViewInjected {
  /** Shared wrapping preference read by expansion handlers. */
  jsonStringWrapping?: Omit<NonNullable<JsonTreeProps['stringWrapping']>, 'label'>
  hooks: {
    duration: SnapshotStore<boolean>
  }
  loadOlder: () => Promise<boolean>
  loadImage: MessageImageLoader
  setActualDuration: (actualDuration: boolean) => void
  watchToolResult?: WatchToolResult
}
interface UsageLike {
  inputTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  outputTokens?: number
  reasoningTokens?: number
}
function requestUsage(value: unknown): TrajectoryUsage | undefined {
  const usage = value as UsageLike | undefined
  if (usage === undefined)
    return undefined
  return {
    ...(usage.inputTokens === undefined ? {} : { input: usage.inputTokens }),
    ...(usage.cacheReadTokens === undefined ? {} : { cacheRead: usage.cacheReadTokens }),
    ...(usage.cacheWriteTokens === undefined ? {} : { cacheWrite: usage.cacheWriteTokens }),
    ...(usage.outputTokens === undefined ? {} : { output: usage.outputTokens }),
    ...(usage.reasoningTokens === undefined ? {} : { reasoning: usage.reasoningTokens }),
  }
}
function addUsage(total: TrajectoryUsage | undefined, usage: TrajectoryUsage | undefined): TrajectoryUsage | undefined {
  if (usage === undefined)
    return total
  return {
    ...(total?.input === undefined && usage.input === undefined
      ? {}
      : { input: (total?.input ?? 0) + (usage.input ?? 0) }),
    ...(total?.cacheRead === undefined && usage.cacheRead === undefined
      ? {}
      : { cacheRead: (total?.cacheRead ?? 0) + (usage.cacheRead ?? 0) }),
    ...(total?.cacheWrite === undefined && usage.cacheWrite === undefined
      ? {}
      : { cacheWrite: (total?.cacheWrite ?? 0) + (usage.cacheWrite ?? 0) }),
    ...(total?.output === undefined && usage.output === undefined
      ? {}
      : { output: (total?.output ?? 0) + (usage.output ?? 0) }),
    ...(total?.reasoning === undefined && usage.reasoning === undefined
      ? {}
      : { reasoning: (total?.reasoning ?? 0) + (usage.reasoning ?? 0) }),
  }
}
export const TrajectoryView = defineComponent((props: ConvViewProps & Pick<PropsRenderSlots<'conversation.trajectory.images'>, 'renderSlot'> & InjectFace<TrajectoryViewInjected> & PropsLocale<'trajectory'>) => {
  const collapsedTurns = shallowRef<ReadonlySet<number>>(EMPTY_TURN_IDS)
  const collapsedAssistants = shallowRef<ReadonlySet<string>>(EMPTY_RECORD_IDS)
  const collapsedTools = shallowRef<ReadonlySet<string>>(EMPTY_RECORD_IDS)
  const timelineSelection = shallowRef<TrajectoryTimeRange | null>(null)
  const actualDuration = props.useDuration(value => value)
  const actualTime = shallowRef(false)
  const searchQuery = shallowRef('')
  const searchIndex = shallowRef((() => new TrajectorySearchIndex())())
  const searchIndexRevision = shallowRef(0)
  const searchIndexTimer = shallowRef<ReturnType<typeof setTimeout> | null>(null)
  const searchIndexInitialized = shallowRef(false)
  const selectedTimelineIndex = shallowRef<number | null>(null)
  const timelineRecordSelection = shallowRef<{
    readonly index: number
  } | null>(null)
  const timelineRecordFocus = shallowRef<{
    readonly index: number
  } | null>(null)
  const completeInspection = props.useTrajectory(snapshot => snapshot)
  const latestNodeSeq = computed(() => completeInspection.value.eventNodes.at(-1)?.seq)
  const historyTailSeq = shallowRef(latestNodeSeq.value)
  const historyNodeLimit = shallowRef(HISTORY_PAGE_NODES)
  const fixedTailSeq = computed(() => historyTailSeq.value ?? latestNodeSeq.value)
  const historyTailIndex = computed(() => {
    const fixedTailSeqSnapshot = fixedTailSeq.value
    return fixedTailSeqSnapshot === undefined
      ? -1
      : completeInspection.value.eventNodes.findLastIndex(node => node.seq <= fixedTailSeqSnapshot)
  })
  const historyEndIndex = computed(() => historyTailIndex.value < 0 && latestNodeSeq.value !== undefined
    ? completeInspection.value.eventNodes.length
    : historyTailIndex.value + 1)
  const historyStartIndex = computed(() => Math.max(0, historyEndIndex.value - historyNodeLimit.value))
  onMounted(() => {
    watch(() => [historyTailIndex.value, historyTailSeq.value, latestNodeSeq.value], () => {
      if (latestNodeSeq.value !== undefined && (historyTailSeq.value === undefined || historyTailIndex.value < 0)) {
        historyTailSeq.value = latestNodeSeq.value
      }
    }, { immediate: true, flush: 'post' })
  })
  const inspection = computed<TrajectorySnapshot>(() => {
    if (historyStartIndex.value === 0)
      return completeInspection.value
    const eventNodes = completeInspection.value.eventNodes.slice(historyStartIndex.value)
    const firstSeq = eventNodes[0]?.seq ?? 0
    return {
      ...completeInspection.value,
      eventNodes,
      requests: completeInspection.value.requests.filter(request => request.startSeq >= firstSeq || (request.resultSeq ?? -1) >= firstSeq),
    }
  })
  const historyLoading = props.useSession(snapshot => snapshot.openState === 'loading')
  const olderHistoryLoading = props.useSession(snapshot => snapshot.loadingOlder)
  const sessionHasOlderHistory = props.useSession(snapshot => snapshot.hasMore)
  const hasResidentOlderHistory = computed(() => historyStartIndex.value > 0)
  const hasOlderHistory = computed(() => hasResidentOlderHistory.value || sessionHasOlderHistory.value)
  const nodes = computed(() => inspection.value.eventNodes)
  const eventLocations = computed(() => inspection.value.eventLocations)
  const historyBaseSeq = computed(() => nodes.value[0]?.seq ?? 0)
  const partial = computed(() => inspection.value.partial)
  const runningCalls = computed(() => inspection.value.runningCalls)
  const requests = computed(() => inspection.value.requests)
  const callSchemas = computed(() => inspection.value.callSchemas)
  const inspectCallId = computed(() => props.viewRequest?.view === 'trajectory' ? props.viewRequest.focus : null)
  const inspectNodeIndex = computed(() => {
    const inspectCallIdInput = inspectCallId.value
    return inspectCallIdInput === null
      ? -1
      : completeInspection.value.eventNodes.findIndex(node => node.kind === 'assistant'
        ? node.blocks.some(block => block.kind === 'tool-call' && block.callId === inspectCallIdInput)
        : node.kind === 'tool-result' && containsCall([node], inspectCallIdInput))
  })
  onMounted(() => {
    watch(() => [historyStartIndex.value, inspectNodeIndex.value], () => {
      if (inspectNodeIndex.value < 0 || inspectNodeIndex.value >= historyStartIndex.value)
        return
      historyNodeLimit.value = (limit => limit + historyStartIndex.value - inspectNodeIndex.value)(historyNodeLimit.value)
    }, { immediate: true, flush: 'post' })
  })
  const requestNumbers = computed<readonly TrajectoryRequestNumber[]>(() => {
    const assistantsByStep = new Map<string, AssistantMessageNode>()
    for (const node of completeInspection.value.eventNodes) {
      if (node.kind !== 'assistant' || node.step <= 0)
        continue
      assistantsByStep.set(`${node.turn}\u0000${node.step}`, node)
    }
    const requestsByStep = new Map(completeInspection.value.requests
      .filter(request => request.purpose === 'assistant')
      .map(request => [
        `${request.turn}\u0000${request.step}`,
        request,
      ]))
    const orderedRequests = [
      ...completeInspection.value.requests.map(request => ({
        seq: request.startSeq,
        request,
        node: request.purpose === 'assistant'
          ? assistantsByStep.get(`${request.turn}\u0000${request.step}`)
          : undefined,
      })),
      ...[...assistantsByStep.entries()].flatMap(([key, node]) => requestsByStep.has(key)
        ? []
        : [{
          seq: node.seq,
          request: undefined,
          node,
        }]),
    ].sort((left, right) => left.seq - right.seq)
    const numbered: TrajectoryRequestNumber[] = []
    let cumulativeUsage: TrajectoryUsage | undefined
    for (const [index, entry] of orderedRequests.entries()) {
      const usage = requestUsage(entry.request?.usage ?? entry.node?.usage)
      cumulativeUsage = addUsage(cumulativeUsage, usage)
      if (entry.request?.purpose !== 'compaction') {
        const request = entry.request
        const node = entry.node
        const turn = request?.turn ?? node?.turn
        const step = request?.step ?? node?.step
        if (turn === undefined || step === undefined)
          continue
        const provider = request?.providerMetadata?.provider ?? node?.providerMetadata?.provider
        const model = request?.providerMetadata?.model ?? node?.providerMetadata?.model
        const requestConfig = request?.requestConfig ?? node?.requestConfig
        const startedAt = request?.startedAt
        const completedAt = request === undefined ? node?.time : request.completedAt
        const resultSeq = request?.resultSeq ?? node?.seq
        numbered.push({
          seq: entry.seq,
          turn,
          step,
          group: props.t('group.step', { step }),
          number: index + 1,
          status: request?.status ?? (node?.interrupted === true ? 'error' : 'complete'),
          ...(startedAt === undefined ? {} : { startedAt }),
          ...(completedAt === undefined ? {} : { completedAt }),
          ...(request?.error === undefined ? {} : { error: request.error }),
          ...(request?.errorCode === undefined ? {} : { errorCode: request.errorCode }),
          ...(resultSeq === undefined ? {} : { resultSeq }),
          ...(request?.retry === undefined ? {} : { retry: request.retry }),
          ...(request?.maxRetries === undefined ? {} : { maxRetries: request.maxRetries }),
          ...(request?.retryDelayMs === undefined
            ? {}
            : { retryDelayMs: request.retryDelayMs }),
          ...(provider === undefined ? {} : { provider }),
          ...(model === undefined ? {} : { model }),
          ...(requestConfig === undefined ? {} : { requestConfig }),
          ...(usage === undefined ? {} : { usage }),
          ...(cumulativeUsage === undefined ? {} : { cumulativeUsage }),
        })
        continue
      }
      const request = entry.request
      numbered.push({
        seq: request.startSeq,
        turn: request.turn,
        step: 0,
        group: props.t('group.compaction', { seq: request.startSeq }),
        number: index + 1,
        purpose: 'compaction',
        status: request.status,
        startedAt: request.startedAt,
        completedAt: request.completedAt,
        ...(request.error === undefined ? {} : { error: request.error }),
        ...(request.errorCode === undefined ? {} : { errorCode: request.errorCode }),
        ...(request.status === 'running' ? {} : { resultSeq: request.startSeq }),
        ...(request.providerMetadata?.provider === undefined
          ? {}
          : { provider: request.providerMetadata.provider }),
        ...(request.providerMetadata?.model === undefined
          ? {}
          : { model: request.providerMetadata.model }),
        ...(request.requestConfig === undefined ? {} : { requestConfig: request.requestConfig }),
        ...(usage === undefined ? {} : { usage }),
        ...(cumulativeUsage === undefined ? {} : { cumulativeUsage }),
      })
    }
    return numbered
  })
  const partialTurn = computed(() => partial.value?.turn ?? null)
  const partialStep = computed(() => partial.value?.step ?? null)
  const finalized = computed(() => {
    const turns = deriveTrajectoryLayout({
      nodes: nodes.value,
      eventLocations: eventLocations.value,
      partial: partialTurn.value === null || partialStep.value === null
        ? null
        : { turn: partialTurn.value, step: partialStep.value, blocks: [] },
      runningCalls: runningCalls.value,
      requests: requests.value,
      systemPrompts: inspection.value.systemPrompts,
      callSchemas: callSchemas.value,
    }, props.t)
    return { turns, lastIndex: lastCellIndex(turns) }
  })
  const timelinePartial = computed<TrajectorySnapshot['partial']>(() => partial.value === null
    ? null
    : {
      turn: partial.value.turn,
      step: partial.value.step,
      blocks: partial.value.blocks.map(block => timelineBlock(block)),
      ...(partial.value.timing === undefined ? {} : { timing: partial.value.timing }),
    })
  const timelineTurns = computed(() => appendTrajectoryPartialLayout(finalized.value.turns, timelinePartial.value,
    finalized.value.lastIndex, props.t))
  const timelineMode = computed<TrajectoryTimelineMode>(() => actualDuration.value ? actualTime.value ? 'actual' : 'duration'
    : actualTime.value ? 'time' : 'sequence')
  const partialSearchTurns = computed(() => appendTrajectoryPartialLayout([], partial.value, finalized.value.lastIndex, props.t))
  const searchLayouts = computed(() => [finalized.value.turns, partialSearchTurns.value] as const)
  const latestSearchLayouts = shallowRef(searchLayouts.value)
  onMounted(() => {
    watchEffect(() => {
      latestSearchLayouts.value = searchLayouts.value
    })
  })
  onMounted(() => {
    watch(() => [searchIndex.value, searchLayouts.value], () => {
      if (!searchIndexInitialized.value) {
        searchIndexInitialized.value = true
        if (searchIndex.value.update(searchLayouts.value)) {
          searchIndexRevision.value = (revision => revision + 1)(searchIndexRevision.value)
        }
        return
      }
      if (searchIndexTimer.value !== null)
        return
      searchIndexTimer.value = setTimeout(() => {
        searchIndexTimer.value = null
        if (searchIndex.value.update(latestSearchLayouts.value)) {
          searchIndexRevision.value = (revision => revision + 1)(searchIndexRevision.value)
        }
      }, SEARCH_INDEX_THROTTLE_MS)
    }, { immediate: true, flush: 'post' })
  })
  onMounted(() => {
    watch(() => [], (_next, _previous, cleanup) => {
      const dispose3 = (() => () => {
        if (searchIndexTimer.value !== null)
          clearTimeout(searchIndexTimer.value)
      })()
      if (typeof dispose3 === 'function')
        cleanup(dispose3)
    }, { immediate: true, flush: 'post' })
  })
  const streamingCells = computed(() => partialSearchTurns.value.flatMap(turn => turn.groups.flatMap(group => group.cells)))
  const searchMatchRecordIds = computed(() => searchIndex.value.search(searchQuery.value))
  const searchMatchIndexes = computed(() => {
    if (searchMatchRecordIds.value === null)
      return null
    const indexes = new Set<number>()
    for (const turns of searchLayouts.value) {
      for (const turn of turns) {
        for (const group of turn.groups) {
          for (const cell of group.cells) {
            if (searchMatchRecordIds.value.has(trajectoryRecordId(cell)))
              indexes.add(cell.index)
          }
        }
      }
    }
    return indexes
  })
  const timelineRange = computed(() => timelineSelection.value)
  const timelineFocusIndexes = computed(() => timelineRange.value === null
    ? null
    : trajectoryTimelineFocusIndexes(timelineTurns.value, timelineRange.value, timelineMode.value))
  const handleRecordSelect = (index: number) => {
    if (timelineFocusIndexes.value !== null
            && !timelineFocusIndexes.value.has(index)) {
      timelineSelection.value = null
    }
  }
  const handleTimelineRangeChange = (range: TrajectoryTimeRange | null) => {
    timelineSelection.value = range
  }
  const handleTimelineRecordSelect = (index: number) => {
    timelineSelection.value = null
    timelineRecordSelection.value = { index }
    selectedTimelineIndex.value = index
  }
  const handleTimelineRecordFocus = (index: number) => {
    timelineRecordFocus.value = { index }
  }
  const collapsibleTurnIds = computed(() => timelineTurns.value.filter(turn => turn.turn !== null
        &&
            turn.groups.reduce((count, group) => count + group.cells.filter(cell => cell.requestOnly !== true && cell.kind !== 'system').length, 0) > 1)
    .flatMap(turn => turn.turn === null ? [] : [turn.turn]))
  const allTurnsCollapsed = computed(() => collapsibleTurnIds.value.length > 0
        && collapsibleTurnIds.value.every(turn => collapsedTurns.value.has(turn)))
  const collapsibleAssistantIds = computed(() => {
    const ids: string[] = []
    for (const turn of timelineTurns.value) {
      const cells = turn.groups.flatMap(group => group.cells)
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i]
        if (cell?.kind !== 'message')
          continue
        const next = cells[i + 1]
        if (next?.kind === 'tool' || next?.kind === 'subtool') {
          ids.push(trajectoryRecordId(cell))
        }
      }
    }
    return ids
  })
  const allAssistantsCollapsed = computed(() => collapsibleAssistantIds.value.length > 0
        && collapsibleAssistantIds.value.every(index => collapsedAssistants.value.has(index)))
  const collapsibleToolIds = computed(() => timelineTurns.value.flatMap(turn => turn.groups.flatMap(group => group.cells.flatMap((cell, index) => cell.kind === 'tool' && group.cells[index + 1]?.kind === 'subtool'
    ? [trajectoryRecordId(cell)]
    : []))))
  const allSubCallsCollapsed = computed(() => collapsibleToolIds.value.length > 0
        && collapsibleToolIds.value.every(id => collapsedTools.value.has(id)))
  const toggleTurn = computed(() => (turn: number) => {
    collapsedTurns.value = ((current) => {
      const collapsed = new Set(current)
      if (collapsed.has(turn))
        collapsed.delete(turn)
      else
        collapsed.add(turn)
      return collapsed
    })(collapsedTurns.value)
  })
  const toggleAllTurns = computed(() => () => {
    collapsedTurns.value = ((current) => {
      const collapsed = new Set(current)
      if (allTurnsCollapsed.value) {
        for (const turn of collapsibleTurnIds.value)
          collapsed.delete(turn)
      }
      else {
        for (const turn of collapsibleTurnIds.value)
          collapsed.add(turn)
      }
      return collapsed
    })(collapsedTurns.value)
  })
  const toggleAssistant = computed(() => (id: string) => {
    collapsedAssistants.value = ((current) => {
      const collapsed = new Set(current)
      if (collapsed.has(id))
        collapsed.delete(id)
      else
        collapsed.add(id)
      return collapsed
    })(collapsedAssistants.value)
  })
  const toggleAllAssistants = computed(() => () => {
    collapsedAssistants.value = ((current) => {
      const collapsed = new Set(current)
      if (allAssistantsCollapsed.value) {
        for (const index of collapsibleAssistantIds.value)
          collapsed.delete(index)
      }
      else {
        for (const index of collapsibleAssistantIds.value)
          collapsed.add(index)
      }
      return collapsed
    })(collapsedAssistants.value)
  })
  const toggleTool = computed(() => (id: string) => {
    collapsedTools.value = ((current) => {
      const collapsed = new Set(current)
      if (collapsed.has(id))
        collapsed.delete(id)
      else
        collapsed.add(id)
      return collapsed
    })(collapsedTools.value)
  })
  const toggleAllSubCalls = computed(() => () => {
    collapsedTools.value = ((current) => {
      const collapsed = new Set(current)
      if (allSubCallsCollapsed.value) {
        for (const id of collapsibleToolIds.value)
          collapsed.delete(id)
      }
      else {
        for (const id of collapsibleToolIds.value)
          collapsed.add(id)
      }
      return collapsed
    })(collapsedTools.value)
  })
  const loadEarlierHistory = async () => {
    if (!hasResidentOlderHistory.value && !await props.loadOlder())
      return false
    historyNodeLimit.value = (limit => limit + HISTORY_PAGE_NODES)(historyNodeLimit.value)
    return true
  }
  return () => {
    const selectedTimelineIndexSnapshot = selectedTimelineIndex.value
    return (h('div', { 'class': css.root, 'data-conversation-composer-overlay': '' }, [
      h(TrajectoryToolbar, { 'actualDuration': actualDuration.value, 'onActualDurationChange': (nextActualDuration) => {
        props.setActualDuration(nextActualDuration)
        timelineSelection.value = null
      }, 'actualTime': actualTime.value, 'onActualTimeChange': (nextActualTime) => {
        actualTime.value = nextActualTime
        timelineSelection.value = null
      }, 'allTurnsCollapsed': allTurnsCollapsed.value, 'onToggleAllTurns': toggleAllTurns.value, 'allAssistantsCollapsed': allAssistantsCollapsed.value, 'onToggleAllAssistants': toggleAllAssistants.value, 'allSubCallsCollapsed': allSubCallsCollapsed.value, 'onToggleAllSubCalls': toggleAllSubCalls.value, 'searchQuery': searchQuery.value, 'onSearchQueryChange': (next: string) => { searchQuery.value = next }, 't': props.t }),
      h(TrajectoryTimeline, { 't': props.t, 'turns': timelineTurns.value, 'mode': timelineMode.value, 'range': timelineRange.value, 'hasEarlierRecords': hasOlderHistory.value, 'onLoadEarlier': loadEarlierHistory, 'selectedIndex': selectedTimelineIndexSnapshot, 'searchMatchIndexes': searchMatchIndexes.value, 'onRangeChange': handleTimelineRangeChange, 'onRecordSelect': handleTimelineRecordSelect, 'onRecordFocus': handleTimelineRecordFocus }),
      h('div', { 'class': css.ledger }, [
        h(TrajectoryTable, { 't': props.t, 'watchToolResult': props.watchToolResult, 'stringWrapping': props.jsonStringWrapping === undefined ? undefined : {
          ...props.jsonStringWrapping,
          label: props.t('record.wrapLines'),
        }, 'renderSlot': props.renderSlot, 'loadImage': props.loadImage, 'requestNumbers': requestNumbers.value, 'turns': timelineTurns.value, 'streamingCells': streamingCells.value, 'timelineFocusIndexes': timelineFocusIndexes.value, 'searchMatchIndexes': searchMatchIndexes.value, 'onSelectedIndexChange': (next: number | null) => { selectedTimelineIndex.value = next }, 'onRecordSelect': handleRecordSelect, 'recordSelection': timelineRecordSelection.value, 'recordFocus': timelineRecordFocus.value, 'historyLoading': historyLoading.value, 'olderHistoryLoading': olderHistoryLoading.value, 'historyStartSeq': historyBaseSeq.value, 'hasOlderRecords': hasOlderHistory.value, 'onLoadOlder': loadEarlierHistory, 'onClearSelection': () => { timelineSelection.value = null }, 'collapsedTurns': collapsedTurns.value, 'onToggleTurn': toggleTurn.value, 'collapsedAssistants': collapsedAssistants.value, 'onToggleAssistant': toggleAssistant.value, 'collapsedTools': collapsedTools.value, 'onToggleTool': toggleTool.value, 'inspectCallId': inspectCallId.value, 'onInspectApplied': props.completeViewRequest }),
      ]),
    ]))
  }
}, { name: 'TrajectoryView', inheritAttrs: false, props: ['useSession', 'useTrajectory', 'useDuration', 'watchToolResult', 'loadOlder', 'loadImage', 'setActualDuration', 'viewRequest', 'completeViewRequest', 'renderSlot', 't', 'jsonStringWrapping'] })
