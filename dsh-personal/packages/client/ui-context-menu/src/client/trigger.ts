/** DOM gesture bindings owned by one menu plugin instance. */
import type { ContextMenuTriggerProps, MenuPoint, ContextMenuTarget } from './types.ts'

/**
 * Create stable bindings for the plugin's injected hook.
 * @param open - Open against the supplied captured target and viewport position.
 * @param active - Whether the plugin still owns its service.
 * @returns Ordinary native DOM trigger bindings, without a component subscription.
 */
export function createContextMenuBindings<Target extends object = ContextMenuTarget>(
  open: (target: Target, point: MenuPoint) => void, active: () => boolean,
): { getTriggerProps: (target: Target | (() => Target) | undefined, handlers?: ContextMenuTriggerProps) => ContextMenuTriggerProps } {
  return {
    getTriggerProps(target, handlers = {}) {
      if (target === undefined) return handlers
      const show = (event: Event, element: HTMLElement, x: number, y: number): void => {
        if (event.defaultPrevented || !active()) return
        const captured = typeof target === 'function' ? target() : target
        event.preventDefault()
        event.stopPropagation()
        element.focus({ preventScroll: true })
        open(captured, { x, y })
      }
      return {
        ...handlers,
        tabindex: handlers.tabindex ?? 0,
        onContextmenu(event) {
          handlers.onContextmenu?.(event)
          const element = event.currentTarget
          if (!(element instanceof HTMLElement)) return
          const rect = event.clientX === 0 && event.clientY === 0 ? element.getBoundingClientRect() : undefined
          show(event, element, rect?.left ?? event.clientX, rect?.bottom ?? event.clientY)
        },
        onKeydown(event) {
          handlers.onKeydown?.(event)
          if (event.defaultPrevented || event.repeat || event.isComposing || event.ctrlKey || event.altKey || event.metaKey
            || !(event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey)) return
          const element = event.currentTarget
          if (!(element instanceof HTMLElement)) return
          const rect = element.getBoundingClientRect()
          show(event, element, rect.left, rect.bottom)
        },
      }
    },
  }
}
