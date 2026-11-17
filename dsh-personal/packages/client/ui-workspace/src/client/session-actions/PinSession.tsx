import { h, defineComponent, computed } from 'vue'
/** Session pin hover button over the workspace owner’s shared callbacks. */
import {
  IconPinFillRegular,
  IconPinOutlineRegular,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import clsx from 'clsx'
import type { PinSessionInjected, SessionRowActionProps } from '../contract/slots.ts'
import css from '../rows/Rows.module.css'
type PinState = Pick<
  SessionRowActionProps<PinSessionInjected>,
  'sessionId' | 'usePinned' | 'useArchived' | 'useSessionAccess'
>
/** The row's pin and archive membership, one Set lookup each, and whether its access allows the toggle. */
function usePinState(props: PinState) {
  const sessionId = computed(() => props.sessionId)
  const pinned = props.usePinned(set => set.has(props.sessionId))
  const archived = props.useArchived(set => set.has(props.sessionId))
  const pin = props.useSessionAccess(sessionId, 'workspace/pinSession')
  const unpin = props.useSessionAccess(sessionId, 'workspace/unpinSession')
  return { pinned, archived, allowed: computed(() => (pinned.value ? unpin.value : pin.value)) }
}
/**
 * Hover button (order 200), also visible without hover when pinned; absent on
 * archived rows and while the Session's access snapshot excludes that toggle.
 * Tooltip forwards the class to the button. Keep that button directly inside
 * the display-contents slot anchor so hoverless rows can retain the Unpin action.
 * @param props - owner share, the access Hook, and the pin share.
 * @returns the button, or null for an archived or refused Session.
 */
export const PinSessionRowButton = defineComponent(
  (props: SessionRowActionProps<PinSessionInjected>) => {
    const { pinned, archived, allowed } = usePinState(props)
    return () => {
      if (archived.value || !allowed.value) return null
      return h(
        Tooltip,
        {
          label: props.t(pinned.value ? 'actions.unpin' : 'actions.pin'),
          side: 'bottom',
          align: 'end',
          delayMs: 500,
          portal: true,
        },
        {
          default: () => [
            h(
              'button',
              {
                type: 'button',
                class: clsx(css.iconButton, pinned.value && css.pinnedAction),
                'aria-label': props.t(pinned.value ? 'menu.unpinSession' : 'menu.pinSession'),
                onClick: () => {
                  (pinned.value ? props.unpinSession : props.pinSession)(props.sessionId)
                },
              },
              [
                pinned.value
                  ? h(IconPinFillRegular, { size: 14 })
                  : h(IconPinOutlineRegular, { size: 14 }),
              ],
            ),
          ],
        },
      )
    }
  },
  {
    props: [
      'sessionId',
      'displayTitle',
      'useRemoteAccess',
      'useSessions',
      'useSessionRetainInfo',
      'useSessionAccess',
      'usePanelInfo',
      'useContextMenu',
      'useSessionStatus',
      'useWorkspaces',
      'pinSession',
      'unpinSession',
      'useArchived',
      'usePinned',
      't',
    ],
  },
)
