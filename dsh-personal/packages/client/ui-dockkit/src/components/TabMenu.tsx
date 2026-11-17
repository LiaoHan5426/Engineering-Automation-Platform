import type { DockPointerEvent } from './pointer.ts'
/**
 * The per-tab context menu, opened by a secondary press on the chip. It carries
 * the close gesture and whatever the embedder appends; the copy and float
 * gestures have no menu item — copying is an embedder API, floating is a drag
 * released clear of the surface. A menu that would hold no item at all renders
 * no popup, so a secondary press on a chip with nothing to offer shows nothing.
 * Presentational — it renders what its props supply and dismisses itself on
 * outside presses or an unmodified Escape, returning menu focus to its tab.
 *
 * Vue Teleport places the popup above the strip's clipping ancestors. Native
 * menu presses stop at the popup so its actions do not start tab gestures.
 */
import { MenuSurface } from '@deepseek-ai/dsh-client-ui-primitives'
import { defineComponent, h, Teleport, shallowRef, computed, watchPostEffect } from 'vue'
import type { CSSProperties, VNodeChild } from 'vue'
import {
  focusWithoutRing,
  modalSelector,
  observeComposition,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { DockLabels } from '../contract/adapter.ts'
import css from './dockkit.module.css'
/** Gap between the opening control and the menu, and the viewport margin kept clear. */
const MENU_GAP = 4
/** What the menu offers, where it anchors, and how it closes. */
export interface TabMenuProps {
  readonly labels: DockLabels
  /** The control that opened the menu; the menu hangs below its left edge. */
  readonly anchor: HTMLElement
  /** Close the tab; `undefined` removes the kit's item, leaving the extras only. */
  readonly onClose: (() => void) | undefined
  /** Dismiss without acting. */
  readonly onDismiss: () => void
  /** Embedder items, rendered after the kit's own; absent means none. */
  readonly extras: VNodeChild
}
/** Where the menu sits, or `undefined` before the first measurement. */
function placeMenu(anchor: HTMLElement, menu: HTMLElement): CSSProperties {
  const rect = anchor.getBoundingClientRect()
  const width = menu.offsetWidth
  // Below the control, aligned to its left edge; flipped to its right edge when
  // that would run off the viewport, as it does for the last tab in a column
  // against the window's right side.
  const left =
    rect.left + width + MENU_GAP > window.innerWidth
      ? Math.max(MENU_GAP, rect.right - width)
      : rect.left
  return { top: `${rect.bottom + MENU_GAP}px`, left: `${left}px` }
}
/** The actions menu body, anchored to the control that opened it. */
export const TabMenu = defineComponent(
  (props: TabMenuProps) => {
    const self = shallowRef<HTMLDivElement | null>(null)
    const position = shallowRef<CSSProperties>()
    const hasItems = computed(
      () =>
        props.onClose !== undefined ||
        (Array.isArray(props.extras)
          ? props.extras.some(item => item !== '' && item != null && item !== false)
          : props.extras != null && props.extras !== false && props.extras !== ''),
    )
    watchPostEffect(() => {
      if (self.value) position.value = placeMenu(props.anchor, self.value)
    })
    watchPostEffect((cleanup) => {
      const { anchor, onDismiss } = props
      const menu = self.value
      /* v8 ignore next -- the ref is attached by effect time: the menu renders unconditionally. */
      if (menu === null) return undefined
      const document = menu.ownerDocument
      const composition = observeComposition(document)
      const onKeyDown = (event: KeyboardEvent): void => {
        if (
          composition.guards(event) ||
          event.defaultPrevented ||
          event.key !== 'Escape' ||
          event.ctrlKey ||
          event.altKey ||
          event.metaKey ||
          event.shiftKey
        )
          return
        const top = [...document.querySelectorAll(modalSelector)].at(-1)
        if (top !== menu) return
        event.preventDefault()
        if (event.repeat) return
        const restoreFocus = menu.contains(document.activeElement)
        onDismiss()
        if (restoreFocus) focusWithoutRing(anchor)
      }
      document.addEventListener('keydown', onKeyDown, true)
      // A press anywhere but inside the menu dismisses it; one with no element
      // target (dispatched to the window itself) counts as outside.
      const onPointerDown = (event: PointerEvent): void => {
        if (event.target instanceof Node && menu.contains(event.target)) return
        onDismiss()
      }
      // Capture phase: a press on a tab chip starts a drag on its own handler,
      // so the menu must be gone before that handler runs.
      window.addEventListener('pointerdown', onPointerDown, true)
      cleanup(() => {
        composition.dispose()
        document.removeEventListener('keydown', onKeyDown, true)
        window.removeEventListener('pointerdown', onPointerDown, true)
      })
    })
    return () => {
      const { labels, onClose, extras } = props
      if (!hasItems.value) return null
      return h(Teleport, { to: document.body }, [
        h(
          MenuSurface,
          {
            class: css.menu,
            elementRef: (element: HTMLDivElement | null) => {
              self.value = element
            },
            role: 'menu',
            'data-dockkit-tab-menu': '',
            style: position.value ?? { visibility: 'hidden', top: 0, left: 0 },
            onPointerdown: (event: DockPointerEvent) => {
              event.stopPropagation()
            },
            onClick: (event: MouseEvent) => {
              event.stopPropagation()
            },
            onAuxclick: (event: MouseEvent) => {
              event.stopPropagation()
            },
          },
          {
            default: () => [
              onClose !== undefined &&
                h(
                  'button',
                  {
                    type: 'button',
                    role: 'menuitem',
                    class: css.menuItem,
                    'data-dockkit-menu-close': '',
                    onClick: onClose,
                  },
                  [labels.closeTab],
                ),
              extras,
            ],
          },
        ),
      ])
    }
  },
  { props: ['labels', 'anchor', 'onClose', 'onDismiss', 'extras'] },
)
