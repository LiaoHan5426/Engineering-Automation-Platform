/** Composes viewport operations, reading policy, and history navigation for Chat. */
import {
  computed,
  shallowRef,
  shallowReadonly,
  toValue,
  watch,
  onMounted,
  onScopeDispose,
  type Ref,
  type MaybeRefOrGetter,
} from 'vue'
import type { TranscriptViewMode } from '../../chat-settings.ts'
import type { ChatSnapshot } from '../contract/snapshot.ts'
import type { ChatViewSlotProps } from '../contract/slots.ts'
import {
  useChatNavigation,
  type ChatNavigation,
  type ChatNavigationInput,
} from './use-chat-navigation.ts'
import { useChatReading } from './use-chat-reading.ts'
import { useChatViewport } from './use-chat-viewport.ts'
import type { FlowMotionRows } from './flow-motion.ts'
import { presentationPolicyFor } from '../presentation-policy.ts'

/** Committed content and Session operations used to reconcile scroll ownership. */
export interface ChatScrollInput extends ChatNavigationInput {
  readonly chatScroll: ChatViewSlotProps['chatScroll']
  readonly order: readonly string[]
  readonly lastKey: string | null
  readonly lastIsUser: boolean
  readonly steeringId: string | null
  readonly submissionId: string | null
  /** The latest visible submission steers the running Turn instead of opening a new one. */
  readonly submissionSteers: boolean
  readonly running: boolean
  /** Enable the browser-local delayed-fold experiment and its input reveal animation. */
  readonly deferCompletedTurns: boolean
  /** A changed work-details preference resets fold reservations after the layout settles. */
  readonly transcriptView: TranscriptViewMode
  readonly loadedTurns: ReturnType<ChatSnapshot['navigation']['items']>
}

interface ChatScrollState {
  readonly initialized: Readonly<Ref<boolean>>
  readonly followingTail: Readonly<Ref<boolean>>
  readonly activeTurn: Readonly<Ref<number | null>>
  readonly listRef: Ref<HTMLDivElement | null>
  readonly columnRef: Ref<HTMLDivElement | null>
  readonly busyTurn: Readonly<Ref<number | null>>
  readonly navigateToTurn: ChatNavigation['navigateToTurn']
  readonly loadEarlier: ChatNavigation['loadEarlier']
  readonly historyInputHeld: Readonly<Ref<boolean>>
  readonly historyProcessing: Readonly<Ref<boolean>>
  readonly historyPending: Readonly<Ref<boolean>>
  readonly historyEdgeRef: (element: HTMLDivElement | null) => void
  readonly returnToBottom: () => void
  readonly motion: FlowMotionRows
}

/**
 * Coordinate scroll policy after Chat content commits. Initial history must be available
 * before automatic scroll or resize handling can initialize reading state and fold motion.
 * New submitted input supersedes pending reader sampling.
 * @param input - current Chat content, scroll memory, and history operations.
 * @returns element refs, visible reading state, and navigation callbacks.
 */
export function useChatScroll(input: MaybeRefOrGetter<ChatScrollInput>): ChatScrollState {
  const initial = toValue(input)
  const { viewport, listRef, columnRef } = useChatViewport()
  const historyInputHeld = shallowRef(false)
  const { reading, state } = useChatReading(
    viewport,
    () => toValue(input).chatScroll,
    initial.loadedTurns.at(-1)?.turn ?? null,
  )
  const navigationInput = computed(() => {
    const {
      firstSeq,
      loadingOlder,
      hasMore,
      historyLoadStatus,
      isOpen,
      loadOlder,
      consumeOlder,
      loadThrough,
    } = toValue(input)
    return {
      firstSeq,
      loadingOlder,
      hasMore,
      historyLoadStatus,
      isOpen,
      loadOlder,
      consumeOlder,
      loadThrough,
    }
  })
  const { navigation, busyTurn, historyPending, historyProcessing } = useChatNavigation(
    viewport,
    reading,
    navigationInput,
  )
  const content: { input: ChatScrollInput; applied: ChatScrollInput | null; opened: boolean } = {
    input: initial,
    applied: null,
    opened: false,
  }
  // A fold batch owns layout and scrolling until it lands: at the tail for own input or a following
  // reader, otherwise with the reader's content still. Growth consumes any room the landing installed.
  const cancelPendingFollow = (): void => {
    viewport.motion.cancelInput()
  }

  const processContent = (): void => {
    const current = content.input
    if (!current.isOpen && !content.opened) return
    const previous = content.applied
    const steeringInput =
      current.steeringId !== null &&
      current.steeringId !== previous?.steeringId &&
      current.steeringId !== previous?.submissionId
    const submissionInput =
      current.submissionId !== null &&
      current.submissionId !== previous?.submissionId &&
      current.submissionId !== previous?.steeringId
    const ownInput =
      (current.lastIsUser && current.lastKey !== previous?.lastKey) ||
      steeringInput ||
      submissionInput
    if (reading.pending && !ownInput) return
    content.applied = current
    if (current.isOpen && !content.opened) {
      content.opened = true
      navigation.reset()
      reading.restore()
      return
    }
    if (ownInput) {
      navigation.cancel()
      if (current.deferCompletedTurns && reading.followInputFold(true)) return
      // Steering lands at once: the running Turn keeps streaming above its echo, and that growth would push
      // the echo down under a native animation.
      const steering = steeringInput || (submissionInput && current.submissionSteers)
      reading.followTail(current.deferCompletedTurns && !steering ? 'smooth' : 'instant')
      return
    }
    if (navigation.contentCommitted()) {
      navigation.reconcile()
      return
    }
    const tipChanged =
      previous === null ||
      current.isOpen !== previous.isOpen ||
      current.firstSeq !== previous.firstSeq ||
      current.lastKey !== previous.lastKey ||
      current.order.length !== previous.order.length ||
      current.running !== previous.running ||
      current.steeringId !== previous.steeringId ||
      current.submissionId !== previous.submissionId
    if (tipChanged && reading.followingTail) {
      navigation.cancel()
      if (current.deferCompletedTurns && reading.followInputFold(false)) return
      reading.followTail()
    } else navigation.reconcile()
  }

  let disconnect: (() => void) | undefined
  onMounted(() => {
    const disconnectViewport = viewport.connect({
      scroll: (event) => {
        if (!content.opened) return
        if (!event.movedByReader && viewport.motion.foldActive()) return
        reading.onScroll(event)
      },
      scrollEnd: (outer) => {
        const foldOwnsScrollEnd =
          outer && viewport.motion.foldActive() && viewport.readScroll()?.movedByReader === false
        if (!foldOwnsScrollEnd) reading.onScrollEnd(outer)
        navigation.requestHistoryCheck()
      },
      interact: () => {
        navigation.readerInteracted()
      },
      history: () => {
        historyInputHeld.value = viewport.historyInputHeld
        if (content.opened) navigation.requestHistoryCheck()
      },
      intent: () => {
        cancelPendingFollow()
        reading.interruptFollow()
      },
      resize: () => {
        if (!content.opened) return
        navigation.requestHistoryCheck()
        if (navigation.contentCommitted()) {
          navigation.reconcile()
          return
        }
        if (!content.input.deferCompletedTurns || !viewport.motion.foldActive()) reading.onResize()
        navigation.reconcile()
      },
    })
    const disconnectReading = reading.connect((sample) => {
      navigation.readerSampled(sample)
      processContent()
      navigation.requestHistoryCheck()
    })
    disconnect = () => {
      disconnectViewport()
      disconnectReading()
      content.opened = false
      content.applied = null
    }
  })
  let active = true
  let commit = 0
  onScopeDispose(() => {
    active = false
    disconnect?.()
  })

  watch(
    [() => toValue(input), listRef, columnRef],
    ([current]) => {
      const { order, isOpen, loadedTurns, deferCompletedTurns, historyLoadStatus } = current
      const previous = content.input
      content.input = { ...current }
      if (!deferCompletedTurns) {
        cancelPendingFollow()
        reading.interruptFollow()
      }
      viewport.updateTurns(loadedTurns)
      const layoutChanged = previous.order !== order || previous.isOpen !== isOpen
      const historyConsumed =
        previous.historyLoadStatus === 'pendingConsumption' && historyLoadStatus === 'idle'
      if (!isOpen || historyLoadStatus === 'error') viewport.cancelHistoryPrepend()
      else if (layoutChanged || historyConsumed) {
        const landing = viewport.finishHistoryPrepend()
        if (landing !== null) reading.preservePosition(landing)
      }
      if (layoutChanged) viewport.invalidate()
      const currentCommit = ++commit
      // Descendant visibility hooks register their fold boxes later in this post-flush commit.
      const settle = (): void => {
        if (!active || currentCommit !== commit) return
        viewport.reclaimBelow()
        processContent()
        if (layoutChanged && content.opened) reading.refreshActiveTurn()
        if (content.opened) navigation.requestHistoryCheck()
      }
      if (content.opened) queueMicrotask(settle)
      else settle()
    },
    { flush: 'post' },
  )

  watch(
    () => toValue(input).transcriptView,
    (_, __, onCleanup) => {
      cancelPendingFollow()
      reading.interruptFollow()
      let cancelled = false
      let release: (() => void) | undefined
      const reset = (): void => {
        if (!active || cancelled) return
        viewport.resetBelow()
        if (content.opened) reading.onResize()
      }
      onCleanup(() => {
        cancelled = true
        release?.()
      })
      if (!presentationPolicyFor(toValue(input).transcriptView).foldCompletedTurns) {
        // Expanding every row cancels the old fold before resize following can resume.
        release = viewport.motion.onFoldIdle(reset)
      } else {
        queueMicrotask(() => {
          if (!active || cancelled) return
          release = viewport.motion.onFoldIdle(reset)
        })
      }
    },
    { flush: 'post' },
  )

  const returnToBottom = (): void => {
    ++commit
    content.applied = content.input
    cancelPendingFollow()
    navigation.cancel()
    reading.followTail()
  }

  return {
    listRef,
    columnRef,
    initialized: computed(() => state.value.initialized),
    followingTail: computed(() => state.value.followingTail),
    activeTurn: computed(() => state.value.activeTurn),
    busyTurn,
    motion: viewport.motion,
    navigateToTurn: navigation.navigateToTurn,
    loadEarlier: navigation.loadEarlier,
    historyPending,
    historyProcessing,
    historyInputHeld: shallowReadonly(historyInputHeld),
    historyEdgeRef: viewport.setHistoryEdge,
    returnToBottom,
  }
}
