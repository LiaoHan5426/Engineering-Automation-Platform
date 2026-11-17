import { h, defineComponent, computed } from 'vue'
/** One presentation Factory and the adapters for keyed Workspace notices. */
import { IconWarningOutlineRegular, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  ArchiveToastEntryProps,
  ToastEntryProps,
  WorkspaceToastProps,
} from '../contract/toast.ts'
/**
 * Render one notice using the shared Factory.
 * @param props - Keyed payload, injected display mapping, locale, and Factory renderer.
 * @returns The shared Toast occurrence.
 */
export function createToastEntry<P extends PropsRuntime<'workspace.toast'>>() {
  return defineComponent(
    (props: ToastEntryProps<P>, { attrs }) =>
      () => {
        const payload = { ...attrs, ...props } as ToastEntryProps<P>
        return props.renderFactorySlot('workspace.toast.content', {
          ...props.display(payload, props.t, props.dismissToast),
          seq: props.seq,
          onDone: props.dismissToast,
        })
      },
    {
      inheritAttrs: false,
      props: [
        'dismissToast',
        'kind',
        'seq',
        't',
        'renderFactorySlot',
        'display',
      ] as (keyof ToastEntryProps<P> & string)[],
    },
  )
}
/**
 * Keep the archive filter action reactive without subscribing unrelated notices.
 * @param props - Archive notice, display mapping, and the existing viewing store.
 * @returns The shared Toast occurrence with its current actions.
 */
export const ArchiveToastEntry = defineComponent(
  (props: ArchiveToastEntryProps) => {
    const { useStore } = props
    const archivedVisible = useStore(state => (state.archivedFilter ?? 'default') !== 'default')
    const fields = computed(() => props.display(props, props.t, props.dismissToast))
    return () => {
      return props.renderFactorySlot('workspace.toast.content', {
        ...fields.value,
        actions: [
          ...(fields.value.actions ?? []),
          ...(archivedVisible.value ? [] : [props.filterAction(props.t, props.dismissToast)]),
        ],
        seq: props.seq,
        onDone: props.dismissToast,
      })
    }
  },
  {
    props: [
      'dismissToast',
      'kind',
      'sessionId',
      'message',
      'tone',
      'seq',
      'useRemoteAccess',
      'useSessions',
      'useSessionRetainInfo',
      'useSessionAccess',
      'usePanelInfo',
      'useContextMenu',
      'useSessionStatus',
      'useWorkspaces',
      'renderFactorySlot',
      'useStore',
      'actions',
      'filterAction',
      'display',
      't',
    ],
  },
)
/**
 * Present plain display data with the shared primitive's timing and portal.
 * @param props - Localized display fields, display identity, and dismissal.
 * @returns One Toast, remounted only for a new display identity.
 */
export const WorkspaceToast = defineComponent(
  (props: WorkspaceToastProps) => {
    return () => {
      return h(Toast, {
        key: props.seq,
        text: props.text,
        onDone: props.onDone,
        ...(props.tone === 'success' ? { tone: 'success' as const } : {}),
        ...(props.tone === 'warning' ? { icon: h(IconWarningOutlineRegular, {}) } : {}),
        ...(props.holdMs === undefined ? {} : { holdMs: props.holdMs }),
        ...(props.actions === undefined ? {} : { actions: props.actions }),
      })
    }
  },
  {
    props: [
      'seq',
      'onDone',
      'text',
      'tone',
      'holdMs',
      'actions',
      'renderFactorySlot',
      'useRemoteAccess',
      'useSessions',
      'useSessionRetainInfo',
      'useSessionAccess',
      'usePanelInfo',
      'useContextMenu',
      'useSessionStatus',
      'useWorkspaces',
      'useFactorySlot',
    ],
  },
)
