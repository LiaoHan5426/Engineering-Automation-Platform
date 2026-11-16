import { defineComponent, h, type PropType } from 'vue'
import clsx from 'clsx'
import css from './StateDot.module.css'
import { IconCheckOutlineRegular } from './icons/index.tsx'

/**
 * State semantic: green done / amber user-attention / tertiary-grey loading /
 * red error / neutral-grey idle for a tracked subject with nothing in progress.
 */
export type StateDotState = 'done' | 'warning' | 'ongoing' | 'error' | 'idle'

/**
 * Pin the loader's CSS animations to document time zero. A CSS animation starts
 * when its element is inserted and restarts when the element is moved or shown
 * again, so loaders started at different moments rotate out of phase; one shared
 * start time keeps every visible loader in step. Mount pins the first start; the
 * element's own `animationstart` listener pins each restart.
 * @param element - the mounted loader, or null on unmount.
 */
function syncSpinner(element: SVGSVGElement | null): void {
  if (element === null) return
  pinSpinner(element)
  element.addEventListener('animationstart', () => { pinSpinner(element) })
}

/**
 * Set every CSS animation in the loader's subtree to start at document time zero.
 * @param element - the mounted loader.
 */
function pinSpinner(element: SVGSVGElement): void {
  // jsdom (the unit lane) implements no Web Animations despite lib.dom's
  // non-optional typing; the optional call leaves that lane unsynced.
  const spinner = element as { getAnimations?: SVGSVGElement['getAnimations'] }
  for (const animation of spinner.getAnimations?.({ subtree: true }) ?? []) animation.startTime = 0
}

/** Decorative state indicator; pair it with caller-localized text for accessibility. */
export const StateDot = defineComponent({
  name: 'StateDot',
  inheritAttrs: false,
  props: {
    state: { type: String as PropType<StateDotState>, required: true },
    size: Number,
    className: String,
    appearance: { type: String as PropType<'dot' | 'step'>, default: 'dot' },
  },
  setup(props) {
    return () => {
      const edge = props.size ?? (props.state === 'ongoing' ? 14 : 10)
      if (props.state === 'ongoing') return h('svg', {
        onVnodeMounted: (vnode) => { if (vnode.el instanceof SVGSVGElement) syncSpinner(vnode.el) },
        class: clsx(css.spinner, props.className), 'data-state': 'ongoing',
        width: edge, height: edge, viewBox: '0 0 24 24', 'aria-hidden': 'true',
      }, [h('g', { class: css.spinnerMotion }, [
        h('circle', { class: css.spinnerTrack, cx: 12, cy: 12, r: 9.5 }),
        h('circle', { class: css.spinnerArc, cx: 12, cy: 12, r: 9.5 }),
      ])])
      return h('span', {
        class: clsx(props.appearance === 'step' ? css.step : css.dot, props.className),
        'data-state': props.state, style: { width: `${edge}px`, height: `${edge}px` }, 'aria-hidden': 'true',
      }, props.appearance === 'step' && props.state === 'done' ? [h(IconCheckOutlineRegular, { size: edge - 2 })] : [])
    }
  },
})
