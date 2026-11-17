import { h, normalizeClass, Fragment, defineComponent, shallowRef, computed } from 'vue'
/** Archive hover button and confirmation for stopping the Session’s running work. */
import type { SessionActivity } from '@deepseek-ai/dsh-api-workspace-controller/client'
// Type-only: the family keys each provider merges; a key this program did not compile takes the generic line.
import type {} from '@deepseek-ai/dsh-agent/types'
import type {} from '@deepseek-ai/dsh-jobs/view'
import type {} from '@deepseek-ai/dsh-schedule/client'
import type {} from '@deepseek-ai/dsh-subagent/client'
import {
  Button,
  IconArchiveOutlineRegular,
  IconUnarchiveOutlineRegular,
  Modal,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  ArchiveSessionInjected,
  SessionArchiveConfirmInjected,
  SessionArchiveConfirmProps,
  SessionArchiveConfirmRequest,
  SessionRowActionProps,
} from '../contract/slots.ts'
import css from '../rows/Rows.module.css'
import browserCss from '../rows/WorkspaceBrowser.module.css'
/**
 * Hover button (order 100): archive, or restore an archived row. Absent while the Session's access
 * snapshot excludes that toggle.
 * @param props - owner share, the access Hook, and the archive share.
 * @returns the button, or nothing when the caller may not toggle this Session's archival.
 */
export const ArchiveSessionRowButton = defineComponent(
  (props: SessionRowActionProps<ArchiveSessionInjected>) => {
    const archived = props.useArchived(set => set.has(props.sessionId))
    const sessionId = computed(() => props.sessionId)
    const archive = props.useSessionAccess(sessionId, 'workspace/archiveSession')
    const unarchive = props.useSessionAccess(sessionId, 'workspace/unarchiveSession')
    const allowed = computed(() => (archived.value ? unarchive.value : archive.value))
    return () => {
      if (!allowed.value) return null
      return h(
        Tooltip,
        {
          label: props.t(archived.value ? 'actions.unarchive' : 'actions.archive'),
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
                class: css.iconButton,
                'aria-label': props.t(
                  archived.value ? 'menu.unarchiveSession' : 'menu.archiveSession',
                ),
                onClick: () => {
                  (archived.value ? props.unarchiveSession : props.archiveSession)(props.sessionId)
                },
              },
              [
                archived.value
                  ? h(IconUnarchiveOutlineRegular, { size: 14 })
                  : h(IconArchiveOutlineRegular, { size: 14 }),
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
      'unarchiveSession',
      'archiveSession',
      'useArchived',
      't',
    ],
  },
)
/**
 * The `shell.overlay` entry: nothing while no confirmation is pending,
 * otherwise one dialog per request (keyed by the Session). Confirming asks
 * the Host to stop the listed work and archive; cancelling leaves the
 * Session running and visible.
 * @param props - the request hook, its settlement, the stop-and-archive hop, and the locale seat.
 * @returns the open dialog, or null.
 */
export const SessionArchiveConfirmDialog = defineComponent(
  (props: SessionArchiveConfirmProps) => {
    const request = props.useArchiveRequest(pending => pending)
    return () => {
      if (request.value === null) return null
      return h(ArchiveConfirmForm, {
        key: request.value.sessionId,
        request: request.value,
        stopAndArchiveSession: props.stopAndArchiveSession,
        onSettle: props.settleSessionArchive,
        t: props.t,
      })
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
      'settleSessionArchive',
      'stopAndArchiveSession',
      'useArchiveRequest',
      't',
    ],
  },
)
const ArchiveConfirmForm = defineComponent(
  (props: {
    request: SessionArchiveConfirmRequest
    stopAndArchiveSession: SessionArchiveConfirmInjected['stopAndArchiveSession']
    onSettle: () => void
    t: SessionArchiveConfirmProps['t']
  }) => {
    const archiving = shallowRef(false)
    const error = shallowRef<string | null>(null)
    const close = () => {
      if (archiving.value) return
      props.onSettle()
    }
    const confirm = () => {
      archiving.value = true
      error.value = null
      props
        .stopAndArchiveSession(props.request.sessionId)
        .then(() => {
          archiving.value = false
          props.onSettle()
        })
        .catch((reason: unknown) => {
          archiving.value = false
          error.value = reason instanceof Error ? reason.message : String(reason)
        })
    }
    return () => {
      return h(
        Modal,
        {
          open: true,
          onClose: close,
          closeLabel: props.t('close'),
          title: props.t('archive.confirm.title'),
          description: props.t('archive.confirm.desc', { title: props.request.displayTitle }),
        },
        {
          footer: () =>
            h(Fragment, {}, [
              h(
                Button,
                { variant: 'outline', disabled: archiving.value, onClick: close },
                { default: () => [props.t('cancel')] },
              ),
              h(
                Button,
                {
                  variant: 'outline',
                  className: normalizeClass(browserCss.deleteAction),
                  disabled: archiving.value,
                  onClick: confirm,
                },
                { default: () => [props.t('archive.confirm.action')] },
              ),
            ]),
          default: () => [
            h(
              'ul',
              {
                class: browserCss.archiveActivity,
                'aria-label': props.t('archive.confirm.activity'),
              },
              [
                props.request.activity.map((entry, index) =>
                  h('li', { key: `${entry.kind}-${String(index)}` }, [
                    activityLine(entry, props.t),
                  ]),
                ),
              ],
            ),
            archiving.value &&
              h('div', { class: browserCss.deleteStatus, role: 'status' }, [
                props.t('archive.confirm.pending'),
              ]),
            error.value !== null &&
              h('div', { class: browserCss.renameError, role: 'alert' }, [error.value]),
          ],
        },
      )
    }
  },
  { props: ['request', 'stopAndArchiveSession', 'onSettle', 't'] },
)
/**
 * One family's line: its count and the items' labels (ids when a family
 * carries no label). A family this dictionary does not know — a provider
 * merged into the kind map — falls through to the generic line.
 */
function activityLine(entry: SessionActivity, t: SessionArchiveConfirmProps['t']): string {
  const items = entry.items ?? []
  const n = items.length
  const names = items.map(item => item.label ?? item.id).join(t('archive.confirm.listSeparator'))
  const plural = n === 1 ? 'one' : 'other'
  switch (entry.kind) {
    case 'turn':
      return t('archive.confirm.turn')
    case 'subagent':
      return t(`archive.confirm.subagents.${plural}`, { n, names })
    case 'job':
      return t(`archive.confirm.jobs.${plural}`, { n, names })
    case 'schedule':
      return t(`archive.confirm.schedules.${plural}`, { n, names })
    default:
      return t(`archive.confirm.other.${plural}`, { kind: entry.kind, n })
  }
}
