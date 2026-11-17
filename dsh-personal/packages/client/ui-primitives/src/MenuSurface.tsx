/** Shared menu material and the macOS backing for transparent windows. */
import { defineComponent, h, onMounted, shallowRef, useId, Teleport, Fragment, type HTMLAttributes, type CSSProperties, type PropType, type ComponentPublicInstance } from 'vue'
import clsx from 'clsx'
import css from './MenuSurface.module.css'

/** Context-menu transition durations in milliseconds, shared with its lifecycle owner. */
export const MENU_TRANSITION_MS = Object.freeze({ enter: 40, dismiss: 80, replace: 10, prepare: 20 })

/** Native div attributes, content slot, and visible menu element callback. */
export interface MenuSurfaceProps extends HTMLAttributes {
  /** Match the shared compact menu's smaller outer radius. */
  compact?: boolean
  /** Fade content, material, and native backing together. */
  phase?: 'enter' | 'dismiss' | 'replace' | undefined
  /** Additional visible-surface classes. */
  className?: string | undefined
  /** Receive the visible menu div, excluding the backing. */
  elementRef?: ((element: HTMLDivElement | null) => void) | undefined
}

/** A translucent menu surface with an aligned backing removed on unmount. */
export const MenuSurface = defineComponent({
  name: 'MenuSurface',
  inheritAttrs: false,
  props: {
    compact: Boolean, phase: String as PropType<'enter' | 'dismiss' | 'replace'>, className: String,
    style: Object as PropType<CSSProperties>,
    elementRef: Function as PropType<(element: HTMLDivElement | null) => void>,
  },
  setup(props, { attrs, slots }) {
    const id = useId()
    const backing = shallowRef<HTMLDivElement | null>(null)
    onMounted(() => { if (backing.value !== null) document.body.appendChild(backing.value) })
    const anchorStyle = {
      '--dsh-menu-anchor': `--dsh-menu-${id.replaceAll(':', '')}`,
      '--dsh-menu-enter': `${MENU_TRANSITION_MS.enter}ms`,
      '--dsh-menu-dismiss': `${MENU_TRANSITION_MS.dismiss}ms`,
      '--dsh-menu-replace': `${MENU_TRANSITION_MS.replace}ms`,
    }
    return () => h(Fragment, [
      h('div', { ...attrs,
        ref: (element: Element | ComponentPublicInstance | null) => props.elementRef?.(element instanceof HTMLDivElement ? element : null),
        'data-menu-material': 'translucent', 'data-menu-phase': props.phase,
        class: clsx(css.surface, props.compact && css.compact, props.className, attrs.class), style: { ...props.style, ...anchorStyle },
      }, [h('div', { 'aria-hidden': 'true', class: css.material }), slots.default?.()]),
      h(Teleport, { to: document.body }, h('div', { ref: backing, 'aria-hidden': 'true', 'data-menu-backing': '',
        'data-menu-phase': props.phase, class: clsx(css.backing, props.compact && css.compact),
        style: { ...anchorStyle, visibility: props.style?.visibility },
      })),
    ])
  },
})
