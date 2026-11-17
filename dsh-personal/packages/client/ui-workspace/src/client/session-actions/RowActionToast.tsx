import { defineComponent } from 'vue'
/** The existing overlay dispatches the latest Workspace notice to its keyed presentation. */
import type { RowToastProps } from '../contract/slots.ts'
import type {} from '../contract/toast.ts'
/**
 * Dispatch the current notice without interpreting its business payload.
 * @param props - Current notice, dismissal, and the declared keyed renderer.
 * @returns The selected notice presentation, or nothing.
 */
export const RowActionToast = defineComponent(
  (props: RowToastProps) => {
    const notice = props.useToast(current => current)
    return () => {
      if (notice.value === null) return null
      return props.renderSlot(
        'workspace.toast',
        { ...notice.value, dismissToast: props.dismissToast },
        { entryKey: notice.value.kind },
      )
    }
  },
  {
    props: [
      'useRemoteAccess',
      'useSessions',
      'useSessionRetainInfo',
      'useSessionAccess',
      'usePanelInfo',
      'useContextMenu',
      'useSessionStatus',
      'useWorkspaces',
      'renderSlot',
      '__renders',
      'dismissToast',
      'useToast',
    ],
  },
)
