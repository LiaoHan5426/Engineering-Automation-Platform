import { h, Teleport, defineComponent, shallowRef, type Ref } from 'vue'
import clsx from 'clsx'
import { useDismissOnOutsidePointer } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './PickerPopover.module.css'
/** Inputs of the picker shell. */
export interface PickerPopoverProps {
  /** Whether the panel is mounted. */
  readonly open: boolean
  /** The row's trigger button, which anchors the panel and counts as inside for dismissal. */
  readonly anchorRef: Ref<HTMLElement | null>
  /** CSS anchor name assigned to the trigger. */
  readonly anchorName: string
  /** Accessible name of the panel. */
  readonly label: string
  /** Layout class of this picker's contents.
   * (`| undefined` for exactOptionalPropertyTypes: the CSS module types every class as optional.) */
  readonly className: string | undefined
  /** Dismiss the panel. */
  readonly onClose: () => void
}
/**
 * Render one picker panel into `document.body`, fixed below its trigger.
 *
 * The panel is a portal, so an ancestor's `overflow` cannot crop it, and a
 * pointerdown outside both the trigger and the panel dismisses it.
 * @param props - open state, the trigger, the panel name and layout class, the dismissal callback, and the contents.
 * @returns the panel while open, and nothing while closed.
 */
export const PickerPopover = defineComponent(
  (props: PickerPopoverProps, { slots }) => {
    const panelRef = shallowRef<HTMLDivElement | null>(null)
    useDismissOnOutsidePointer(props.anchorRef, () => props.open, props.onClose, panelRef)
    return () => {
      if (!props.open) return null
      return h(Teleport, { to: document.body }, [
        h(
          'div',
          {
            ref: panelRef,
            class: clsx(css.panel, props.className),
            style: { positionAnchor: props.anchorName },
            role: 'dialog',
            'aria-label': props.label,
            onKeydown: (event: KeyboardEvent) => {
              if (event.key !== 'Escape' || event.defaultPrevented) return
              event.preventDefault()
              event.stopPropagation()
              props.onClose()
              props.anchorRef.value?.focus()
            },
            onClick: (event) => {
              event.stopPropagation()
            },
          },
          slots.default?.(),
        ),
      ])
    }
  },
  { props: ['open', 'anchorRef', 'anchorName', 'label', 'className', 'onClose'] },
)
