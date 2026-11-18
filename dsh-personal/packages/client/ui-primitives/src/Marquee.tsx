/** Hover-driven overflow text; CSS owns travel and reduced-motion presentation. */
import { defineComponent, h, watch, type ComponentPublicInstance, type HTMLAttributes, type PropType, type Ref } from 'vue'
import clsx from 'clsx'
import css from './Marquee.module.css'
const MIN_REVEAL_PX = 8
const PX_PER_MS = 0.03
/** Pointer handlers for the row containing one marquee. */
export interface HoverMarquee {
  readonly onPointerEnter: (event: PointerEvent) => void
  readonly onPointerLeave: () => void
}
/** A reactive hold keeps the text revealed while its row's menu is open. */
export interface HoverMarqueeOptions {
  readonly hold?: boolean | Readonly<Ref<boolean>> | (() => boolean) | undefined
}
function travel(text: HTMLElement): void {
  if (text.dataset.marquee !== undefined) return
  const range = text.scrollWidth - text.clientWidth
  if (range <= MIN_REVEAL_PX) return
  text.style.setProperty('--dsh-marquee-range', range + 'px')
  text.style.setProperty('--dsh-marquee-duration', Math.round(range / PX_PER_MS) + 'ms')
  text.dataset.marquee = ''
}
function rest(text: HTMLElement): void {
  delete text.dataset.marquee
  text.style.removeProperty('--dsh-marquee-range')
  text.style.removeProperty('--dsh-marquee-duration')
}
/**
 * Reveal overflow above 8px at 30px/s while hovered or held; touch does not start it.
 * @param text - clipping element populated through MarqueeText's elementRef callback.
 * @param options - reactive hold state.
 * @returns stable row pointer handlers.
 */
export function useHoverMarquee(text: Readonly<Ref<HTMLElement | null>>, options: HoverMarqueeOptions = {}): HoverMarquee {
  let hovered = false
  const held = (): boolean => typeof options.hold === 'function' ? options.hold() : typeof options.hold === 'object' ? options.hold.value : options.hold ?? false
  const sync = (): void => {
    const element = text.value
    if (element === null) return
    if (hovered || held()) travel(element)
    else rest(element)
  }
  watch([held, () => text.value], sync, { immediate: true, flush: 'post' })
  return {
    onPointerEnter: (event): void => {
      if (event.pointerType === 'touch') return
      hovered = true
      sync()
    },
    onPointerLeave: (): void => { hovered = false; sync() },
  }
}
/** Native span attributes with an element callback; text belongs in the default slot. */
export type MarqueeTextProps = HTMLAttributes & { readonly elementRef?: ((element: HTMLSpanElement | null) => void) | undefined; readonly className?: string | undefined }
/** A clipping span with a travelling default slot and native attributes. */
export const MarqueeText = defineComponent({
  name: 'MarqueeText', inheritAttrs: false,
  props: { className: String, elementRef: Function as PropType<(element: HTMLSpanElement | null) => void> },
  setup(props, { attrs, slots }) {
    return () => h('span', { ...attrs, class: clsx(css.text, props.className, attrs.class), ref: (element: Element | ComponentPublicInstance | null) => props.elementRef?.(element instanceof HTMLSpanElement ? element : null) }, [h('span', { class: css.travel }, slots.default?.())])
  },
})
