/** Shared ellipsis control for explicit context-menu targets. */
import { defineComponent, h, useId } from 'vue'
import { Button, IconEllipsisOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { FactoryComponentPropsOf } from '@deepseek-ai/dsh-client-ui-slots'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ContextMenus, ContextMenuTarget, MenuPoint } from './types.ts'

/** Menu facts and the per-button toggle, bound by the factory registration. */
export interface ContextMenuButtonInjected {
  hooks: {
    /** Instance id of the shared button that opened the current popup; null for gestures and after dismissal. */
    opener: ObservableSnapshot<string | null>
    registeredKinds: ContextMenus['registeredKinds']
  }
  /** Close this button's popup, or open a new one for its captured target. */
  toggle: (button: string, target: ContextMenuTarget, point: MenuPoint) => void
}
type Props = FactoryComponentPropsOf<'contextMenu.button'>

/** Native trigger subscribed to the opening instance and registered target kinds. */
export const ContextMenuButton = defineComponent((props: Props) => {
  const id = useId()
  const opener = props.useOpener(value => value)
  const kinds = props.useRegisteredKinds(value => value)
  return () => {
    if (!kinds.value.includes(props.target.kind)) return null
    const attributes = {
      'data-context-menu-trigger': '', 'aria-label': props.label,
      'aria-haspopup': 'menu' as const, 'aria-expanded': opener.value === id,
      onPointerdown: (event: PointerEvent) => { event.stopPropagation() },
      onClick: (event: MouseEvent) => {
        event.stopPropagation()
        const element = event.currentTarget
        if (!(element instanceof HTMLElement)) return
        element.focus({ preventScroll: true })
        const rect = element.getBoundingClientRect()
        props.toggle(id, props.target, { x: rect.left, y: rect.bottom })
      },
    }
    if (props.size !== 'sm') return h('button', { ...attributes, class: props.className, type: 'button' }, [h(IconEllipsisOutlineRegular)])
    return h(Tooltip, { label: props.label, side: 'bottom', align: 'end', portal: true }, {
      default: () => h(Button, { ...attributes, ...(props.className === undefined ? {} : { className: props.className }), size: 'sm' }, { icon: () => h(IconEllipsisOutlineRegular) }),
    })
  }
}, { props: ['target', 'label', 'className', 'size', 'useOpener', 'useRegisteredKinds', 'toggle'] })
