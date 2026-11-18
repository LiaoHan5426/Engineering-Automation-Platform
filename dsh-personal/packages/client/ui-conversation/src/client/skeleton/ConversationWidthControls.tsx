import { defineComponent, computed, shallowRef, watch, h, onScopeDispose, onMounted } from 'vue'
import type { ConversationWidthControlsProps } from '../contract/slots.ts'
import css from './ConversationRoot.module.css'
/** localStorage key for the dragged transcript width preference (px). */
const WIDTH_PREF_KEY = 'dsh.conversation.contentWidth'
/** Floor for a dragged content width; matches the layout center-column minimum. */
const CONTENT_MIN = 640
/** Horizontal room reserved for both handles and their safe edge zones. */
const CONTENT_EDGE_BUDGET = 176
const WHEEL_DELTA_LINE = 1
const WHEEL_DELTA_PAGE = 2
const FALLBACK_WHEEL_LINE_PX = 16
/** Read a valid persisted width preference, or null when absent or corrupt. */
function readWidthPreference(): number | null {
  const raw = localStorage.getItem(WIDTH_PREF_KEY)
  if (raw === null) return null
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : null
}
/** Resolve the width displayed for one measured Conversation column. */
function resolveContentWidth(columnWidth: number, preference: number | null): number {
  const max = Math.max(CONTENT_MIN, columnWidth - CONTENT_EDGE_BUDGET)
  if (preference !== null) return Math.min(Math.max(preference, CONTENT_MIN), max)
  return Math.max(680, Math.min(columnWidth * 0.64, 880))
}
/** Convert a wheel event's vertical delta to scrollport pixels. */
function wheelDeltaY(event: WheelEvent, scrollport: HTMLElement): number {
  if (event.deltaMode === WHEEL_DELTA_LINE) {
    const lineHeight = Number.parseFloat(getComputedStyle(scrollport).lineHeight)
    return event.deltaY * (Number.isFinite(lineHeight) ? lineHeight : FALLBACK_WHEEL_LINE_PX)
  }
  if (event.deltaMode === WHEEL_DELTA_PAGE) return event.deltaY * scrollport.clientHeight
  return event.deltaY
}
const WidthHandle = defineComponent(
  (props: {
    side: 'left' | 'right'
    onStart: () => number
    onDrag: (width: number) => void
    onCommit: (width: number) => void
    onEnd: () => void
  }) => {
    const dragging = shallowRef(false)
    const base = shallowRef(0)
    const origin = shallowRef(0)
    const latest = shallowRef(0)
    const frame = shallowRef<number | null>(null)
    const outwardWidth = () => {
      const dx = latest.value - origin.value
      const outward = props.side === 'right' ? dx : -dx
      return base.value + outward * 2
    }
    const cancelFrame = () => {
      if (frame.value !== null) {
        cancelAnimationFrame(frame.value)
        frame.value = null
      }
    }
    onScopeDispose(() => {
      cancelFrame()
      if (dragging.value) props.onEnd()
    })
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      if (!(event.currentTarget instanceof HTMLElement)) return
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      origin.value = event.clientX
      latest.value = event.clientX
      base.value = props.onStart()
      dragging.value = true
      event.currentTarget.toggleAttribute('data-dragging', true)
    }
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging.value || !(event.currentTarget instanceof HTMLElement)) return
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
      const box = event.currentTarget.getBoundingClientRect()
      event.currentTarget.style.setProperty(
        '--dsh-width-handle-pointer-y',
        `${event.clientY - box.top}px`,
      )
      latest.value = event.clientX
      frame.value ??= requestAnimationFrame(() => {
        frame.value = null
        props.onDrag(outwardWidth())
      })
    }
    const onPointerUp = (event: PointerEvent) => {
      if (!dragging.value || !(event.currentTarget instanceof HTMLElement)) return
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
      dragging.value = false
      event.currentTarget.toggleAttribute('data-dragging', false)
      event.currentTarget.releasePointerCapture(event.pointerId)
      cancelFrame()
      latest.value = event.clientX
      // A press-only gesture must not overwrite a wider preference with its window-clamped display value.
      if (latest.value !== origin.value) props.onCommit(outwardWidth())
      props.onEnd()
    }
    const onPointerCancel = (event: PointerEvent) => {
      if (!dragging.value || !(event.currentTarget instanceof HTMLElement)) return
      dragging.value = false
      event.currentTarget.toggleAttribute('data-dragging', false)
      // Cancellation abandons persistence and restores the saved width through onEnd.
      cancelFrame()
      props.onEnd()
    }
    const onWheel = (event: WheelEvent) => {
      if (!(event.currentTarget instanceof HTMLElement)) return
      const body = event.currentTarget.parentElement
      /* v8 ignore next -- a width handle renders only inside the Conversation body. */
      if (body === null) return
      const scrollport = body.querySelector<HTMLElement>('[data-conversation-scroll]')
      /* v8 ignore next -- the Conversation body always contains its scroll element. */
      if (scrollport === null) return
      if (event.ctrlKey || event.deltaY === 0) return
      scrollport.scrollBy({ top: wheelDeltaY(event, scrollport) })
    }
    return () =>
      h('div', {
        class: css.widthHandle,
        'data-side': props.side,
        'data-width-handle': props.side,
        onPointerdown: onPointerDown,
        onPointermove: onPointerMove,
        onPointerup: onPointerUp,
        onPointercancel: onPointerCancel,
        onLostpointercapture: onPointerCancel,
        onWheel: onWheel,
      })
  },
  {
    props: ['side', 'onStart', 'onDrag', 'onCommit', 'onEnd'],
    inheritAttrs: false,
  },
)
/**
 * Install the main Conversation width axis and render its drag handles.
 * @param props - Mounted Conversation body and current presentation phase.
 * @returns two active-phase width handles, or no controls outside the active phase.
 */
export const ConversationWidthControls = defineComponent(
  (props: ConversationWidthControlsProps) => {
    const container = computed(() => props.container)
    const phase = computed(() => props.phase)
    const publishWidths = (host: HTMLDivElement): void => {
      const target = host.parentElement ?? host
      const column = host.offsetWidth
      target.style.setProperty('--dsh-conversation-column-width', `${column}px`)
      const preference = readWidthPreference()
      if (preference === null) target.style.removeProperty('--dsh-chat-user-width')
      else
        target.style.setProperty(
          '--dsh-chat-user-width',
          `${resolveContentWidth(column, preference)}px`,
        )
    }
    const onStart = (): number => {
      if (container.value === null) return 680
      return resolveContentWidth(container.value.offsetWidth, readWidthPreference())
    }
    const onDrag = (width: number): void => {
      if (container.value === null) return
      const target = container.value.parentElement ?? container.value
      target.style.setProperty(
        '--dsh-chat-user-width',
        `${resolveContentWidth(container.value.offsetWidth, width)}px`,
      )
    }
    const onCommit = (width: number): void => {
      if (container.value === null) return
      localStorage.setItem(
        WIDTH_PREF_KEY,
        `${resolveContentWidth(container.value.offsetWidth, width)}`,
      )
    }
    const onEnd = (): void => {
      if (container.value !== null) publishWidths(container.value)
    }
    onMounted(() =>
      watch(
        [() => container.value, () => publishWidths],
        (_value, _previous, onCleanup) => {
          const cleanup = (() => {
            if (container.value === null) return
            const host = container.value
            const observer = new ResizeObserver(() => {
              publishWidths(host)
            })
            observer.observe(container.value)
            publishWidths(container.value)
            return () => {
              observer.disconnect()
            }
          })()
          if (typeof cleanup === 'function') onCleanup(cleanup)
        },
        { immediate: true, flush: 'post' },
      ),
    )
    return () => {
      if (container.value === null || phase.value !== 'active') return null
      return (['left', 'right'] as const).map(side =>
        h(WidthHandle, {
          key: side,
          side: side,
          onStart: onStart,
          onDrag: onDrag,
          onCommit: onCommit,
          onEnd: onEnd,
        }),
      )
    }
  },
  {
    props: ['container', 'phase'],
    inheritAttrs: false,
  },
)
