import { computed, nextTick, ref, watch, type Ref } from 'vue'
import type { ChatTurn } from './chatSession'
import { readFeedScroll, saveFeedScroll } from './feedScroll'

const FEED_BOTTOM_SLACK = 64
const TURN_PAGE = 40

function feedKey(id: string | null | undefined) {
  return id || 'scratch'
}

/**
 * Transcript scroll behaviour: follow the newest turn, restore the reader's offset per
 * conversation, and page older turns in from the top without shifting the viewport.
 */
export function useChatFeed(options: {
  feedPort: Ref<{ getEl: () => HTMLElement | null } | null>
  active: () => boolean
  conversationId: Ref<string | null>
  turns: Ref<ChatTurn[]>
}) {
  const { feedPort, active, conversationId, turns } = options
  const shownTurns = ref(TURN_PAGE)
  const loadingOlder = ref(false)
  const holdingFeed = ref(false)
  /** True while the reader is parked at the newest turn; scrolling up releases it. */
  const followBottom = ref(true)
  let restoringFeed = false
  let lastFeedTop = 0

  function feed() {
    return feedPort.value?.getEl() ?? null
  }

  function saveCurrent(id: string | null | undefined = conversationId.value) {
    saveFeedScroll(feedKey(id), feed()?.scrollTop ?? 0)
  }

  /**
   * Follow is inferred from the reader's own direction, not from the current offset:
   * while an answer streams, the feed grows under a stationary scrollTop, which would
   * otherwise look like "the reader scrolled away".
   */
  function onFeedScroll(event: Event) {
    if (restoringFeed || !active()) return
    const feedNode = event.currentTarget
    if (!(feedNode instanceof HTMLElement)) return
    saveFeedScroll(feedKey(conversationId.value), feedNode.scrollTop)
    const movedUp = feedNode.scrollTop < lastFeedTop - 4
    lastFeedTop = feedNode.scrollTop
    if (movedUp) followBottom.value = false
    else if (
      feedNode.scrollHeight - feedNode.scrollTop - feedNode.clientHeight <=
      FEED_BOTTOM_SLACK
    )
      followBottom.value = true
  }

  function scrollFeedToBottom(behavior: ScrollBehavior = 'auto') {
    const node = feed()
    // A box without layout metrics cannot be scrolled; skip instead of collapsing a
    // restored position to zero.
    if (!node || !node.clientHeight) return
    node.scrollTo({ top: node.scrollHeight, behavior })
    lastFeedTop = node.scrollTop
    followBottom.value = true
  }

  function jumpToLatest() {
    scrollFeedToBottom('smooth')
  }

  function restoreFeed(id: string | null | undefined) {
    restoringFeed = true
    holdingFeed.value = true
    const apply = () => {
      const node = feed()
      if (node) {
        node.scrollTop = readFeedScroll(feedKey(id))
        lastFeedTop = node.scrollTop
      }
    }
    const raf =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : (cb: FrameRequestCallback) => setTimeout(cb, 0) as unknown as number
    void nextTick(() => {
      apply()
      raf(() => {
        apply()
        raf(() => {
          // A restored offset may be clamped by the browser (e.g. the new
          // conversation is shorter than the saved scrollTop). Re-derive the
          // follow state from the *actual* landing position, otherwise the
          // "back to latest" button lingers while we are already at the bottom.
          const node = feed()
          if (node && node.clientHeight) {
            lastFeedTop = node.scrollTop
            followBottom.value =
              node.scrollHeight - node.scrollTop - node.clientHeight <= FEED_BOTTOM_SLACK
          }
          restoringFeed = false
          holdingFeed.value = false
        })
      })
    })
  }

  const showJumpToLatest = computed(() => !followBottom.value && turns.value.length > 0)
  // Streaming appends grow the feed from the top edge; only follow while the reader
  // has not scrolled away. `turns.value.length` alone misses token-level growth.
  watch(
    () => {
      const all = turns.value
      const last = all[all.length - 1]
      return `${all.length}:${last?.text?.length ?? 0}`
    },
    () => {
      if (!followBottom.value) return
      void nextTick(() => scrollFeedToBottom())
    },
  )

  const visibleTurns = computed(() => {
    const all = turns.value
    const start = Math.max(0, all.length - shownTurns.value)
    return all.slice(start).map((turn, offset) => ({ turn, key: start + offset }))
  })
  const hasOlderTurns = computed(() => shownTurns.value < turns.value.length)
  watch(
    () => turns.value.length,
    (length, previous) => {
      if (previous != null && length > previous && shownTurns.value > TURN_PAGE)
        shownTurns.value += length - previous
    },
  )

  function showOlderTurns() {
    if (loadingOlder.value || !hasOlderTurns.value) return
    const node = feed()
    const before = node?.scrollHeight ?? 0
    const top = node?.scrollTop ?? 0
    loadingOlder.value = true
    shownTurns.value = Math.min(turns.value.length, shownTurns.value + TURN_PAGE)
    void nextTick(() => {
      if (node) node.scrollTop = top + node.scrollHeight - before
      loadingOlder.value = false
    })
  }

  /** Call when the active conversation changes; `previous` is undefined on first run. */
  function switchConversation(id: string | null, previous: string | null | undefined) {
    if (previous !== undefined) saveCurrent(previous)
    shownTurns.value = TURN_PAGE
    void nextTick(() => restoreFeed(id))
  }

  return {
    holdingFeed,
    loadingOlder,
    visibleTurns,
    hasOlderTurns,
    showJumpToLatest,
    onFeedScroll,
    jumpToLatest,
    showOlderTurns,
    restoreFeed,
    saveCurrent,
    switchConversation,
  }
}
