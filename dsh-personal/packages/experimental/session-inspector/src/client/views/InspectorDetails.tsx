import { defineComponent, h, Comment, shallowRef, useId } from 'vue'
/** Locally resizable raw-data panel; pointer capture owns the drag lifetime. */
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './inspector.module.css'
/** Raw text and owner callbacks for one Inspector's detail panel. */
export type InspectorDetailsProps = PropsLocale<'session-inspector'> & {
  readonly text: string
  readonly failed?: boolean
  readonly close: () => void
}
interface DetailDrag {
  readonly pointerId: number
  readonly y: number
  readonly height: number
  readonly available: number
}
function clampPercent(value: number): number {
  return Math.max(15, Math.min(80, value))
}
/**
 * Resize the raw-data area from its upper edge while keeping the table visible.
 * @param props - Complete raw text, localized labels, and close callback.
 * @returns Detail text with a pointer- and keyboard-operated horizontal separator.
 */
export const InspectorDetails = defineComponent(
  (props: InspectorDetailsProps, { slots }) => {
    const id = useId()
    const panel = shallowRef<HTMLDivElement | null>(null)
    const drag = shallowRef<DetailDrag | null>(null)
    const percent = shallowRef(40)
    const setPercent = (
      next: typeof percent.value | ((previous: typeof percent.value) => typeof percent.value),
    ) => {
      percent.value = typeof next === 'function' ? next(percent.value) : next
    }
    const resize = (event: PointerEvent): void => {
      const current = drag.value
      if (current === null || current.pointerId !== event.pointerId) return
      setPercent(
        clampPercent(((current.height + current.y - event.clientY) / current.available) * 100),
      )
    }
    const stop = (event: PointerEvent): void => {
      if (drag.value?.pointerId !== event.pointerId) return
      drag.value = null
      if ((event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId))
        (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
    }
    return () => {
      const children = slots.default?.()
      const hasChildren = children?.some(child => child.type !== Comment)
      return h(
        'div',
        { ref: panel, id: id, class: css.details, style: { flexBasis: `${percent.value}%` } },
        [
          h('div', {
            role: 'separator',
            tabindex: 0,
            'aria-orientation': 'horizontal',
            'aria-controls': id,
            'aria-label': props.t('table.resizeDetails'),
            'aria-valuemin': 15,
            'aria-valuemax': 80,
            'aria-valuenow': Math.round(percent.value),
            class: css.detailsResize,
            onPointerdown: (event) => {
              if (event.button !== 0 || drag.value !== null) return
              const element = panel.value
              const available = element?.parentElement?.getBoundingClientRect().height ?? 0
              if (element === null || available === 0) return
              event.preventDefault()
              drag.value = {
                pointerId: event.pointerId,
                y: event.clientY,
                height: element.getBoundingClientRect().height,
                available,
              };
              (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
            },
            onPointermove: resize,
            onPointerup: (event) => {
              resize(event)
              stop(event)
            },
            onPointercancel: stop,
            onLostpointercapture: () => {
              drag.value = null
            },
            onKeydown: (event) => {
              switch (event.key) {
                case 'ArrowUp':
                  setPercent(value => clampPercent(value + 5))
                  break
                case 'ArrowDown':
                  setPercent(value => clampPercent(value - 5))
                  break
                case 'Home':
                  setPercent(15)
                  break
                case 'End':
                  setPercent(80)
                  break
                default:
                  return
              }
              event.preventDefault()
            },
          }),
          h('div', { class: css.toolbar }, [
            h('span', null, [props.t('table.raw')]),
            h('button', { type: 'button', onClick: props.close }, [props.t('table.close')]),
          ]),
          !hasChildren
            ? h('pre', { role: props.failed ? 'alert' : undefined }, [props.text])
            : h('div', { class: css.objectDetails }, children),
        ],
      )
    }
  },
  { props: ['text', 'failed', 'close', 't'] },
)
