import {
  h,
  normalizeClass,
  Fragment,
  defineComponent,
  computed,
  shallowRef,
  watch,
  type Ref,
  type VNodeChild,
} from 'vue'
/**
 * Workspace pick/add flow. WorkspacePickFlow is the reusable core (menu +
 * path error dialog) consumed directly by WorkspaceBrowser (same package) and
 * wrapped by WorkspacePicker for the conversation empty-state slot
 * registration and by WorkspacePickerFactory for the `workspace.picker`
 * Factory. Directory picking itself lives in the composed flow package's
 * slot occupant (see the contract module doc): this core only opens the flow,
 * adopts the picked path, and owns the error surface. Adding a workspace has
 * exactly one route — pick a host directory, new or existing — because the
 * occupant's own create-folder affordance already covers creating one.
 */
import {
  Button,
  IconFolderCloseRegular,
  IconPlusOutlineRegular,
  Menu,
  Modal,
  type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkspaceId, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { workspaceDisplayTitle } from '@deepseek-ai/dsh-api-workspace-controller/default-workspace'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  DirectoryFlowOwnerProps,
  WorkspacePickerFactoryProps,
  WorkspacePickerProps,
} from './contract/slots.ts'
import { distinguishingPathSuffixes } from './path-suffix.ts'
import css from './WorkspacePicker.module.css'
const ADD_WORKSPACE = '::add-workspace'
/** Core flow props: the owner supplies popover control and pick semantics. */
export interface WorkspacePickFlowProps {
  /** The standard locale seat, forwarded by whichever slot entry hosts the flow. */
  t: WorkspacePickerProps['t']
  /** Popover visibility (anchor button toggle state, owner-local). */
  open: boolean
  /** The anchor button element — the popover's placement anchor. */
  anchorRef?: Ref<HTMLElement | null> | undefined
  /** Selector hook over the workspace list (framework standard hook). */
  useWorkspaces: WorkspacePickerProps['useWorkspaces']
  /** Adopt a picked host directory as a real Workspace. */
  createWorkspace: (input: { path: string }) => Promise<WorkspaceView>
  /** Bound occupancy selector hook for this surface's directory-flow hole (empty leaves the surface with no add action). */
  useDirectoryFlow: SnapshotSelectorHook<boolean>
  /** Render this surface's directory-flow hole with the owner conversation (the entry's narrowed renderSlot). */
  renderDirectoryFlow: (owner: DirectoryFlowOwnerProps) => VNodeChild
  /** A real Workspace was picked or created. */
  onPick: (workspaceId: WorkspaceId) => void
  /** Close the popover (outside click / Escape / post-pick). */
  onClose: () => void
  /** Report the picking interaction and adoption occupancy. */
  onBusyChange?: (busy: boolean) => void
  /** Only offer the add action, hide existing workspaces. */
  addOnly?: boolean
  /** Menu opening direction relative to the anchor. */
  side?: 'bottom' | 'top' | 'right'
  /** Currently active workspace (trailing check in the picker list). */
  selectedId?: WorkspaceId | undefined
}
/**
 * Render the pick menu plus the adoption error dialog.
 * @param props - owner-controlled flow props.
 * @returns menu + dialog elements.
 */
export const WorkspacePickFlow = defineComponent(
  (props: WorkspacePickFlowProps) => {
    const absentAnchor = shallowRef<HTMLElement | null>(null)
    const workspaceSnapshot = props.useWorkspaces(state => state)
    const workspaces = computed(() => workspaceSnapshot.value.items)
    const errorOpen = shallowRef(false)
    const modalError = shallowRef<string | null>(null)
    const flowOpen = shallowRef(false)
    const pickingFolder = shallowRef(false)
    const flowBusy = computed(() => flowOpen.value || pickingFolder.value)
    watch(
      [() => flowBusy.value, () => props.onBusyChange],
      () => {
        props.onBusyChange?.(flowBusy.value)
      },
      { immediate: true, flush: 'post' },
    )
    const flowAvailable = props.useDirectoryFlow(occupied => occupied)
    // An occupant that unloads mid-interaction leaves nobody to cancel: an
    // open flow over an empty hole withdraws so the menu actions come back.
    // flowOpen is a dependency because the flow can also OPEN over an already
    // empty hole (Choose again after the occupant unloaded with the error
    // dialog up) — that transition must snap back too, not just occupancy loss.
    // An occupant that unloads mid-interaction leaves nobody to cancel: an
    // open flow over an empty hole withdraws so the menu actions come back.
    // flowOpen is a dependency because the flow can also OPEN over an already
    // empty hole (Choose again after the occupant unloaded with the error
    // dialog up) — that transition must snap back too, not just occupancy loss.
    watch(
      [() => flowOpen.value, () => flowAvailable.value],
      () => {
        if (flowOpen.value && !flowAvailable.value) flowOpen.value = false
      },
      { immediate: true, flush: 'post' },
    )
    const addEntries = computed<MenuEntry[]>(() =>
      flowAvailable.value
        ? [
          {
            id: ADD_WORKSPACE,
            label: props.t('menu.addWorkspace'),
            icon: h(IconPlusOutlineRegular, { size: 16 }),
            disabled: flowBusy.value,
          },
        ]
        : [],
    )
    // With workspaces listed, the add action pins below the scroll region
    // (divider + always visible); otherwise it IS the menu.
    const pinAdd = computed(() => !(props.addOnly ?? false) && workspaces.value.length > 0)
    // The resolved name, not `t`, is the memo dependency: the bound seat keeps
    // its identity across a language switch.
    const defaultWorkspaceName = computed(() => props.t('workspace.defaultName'))
    const listed = computed(() => {
      if (!pinAdd.value) return []
      const rows = workspaces.value.map(workspace => ({
        id: workspace.workspaceId,
        title: workspaceDisplayTitle(workspace.title, defaultWorkspaceName.value),
        path: workspace.path,
      }))
      const suffixes = distinguishingPathSuffixes(rows)
      return rows.map(row => ({ ...row, suffix: suffixes.get(row.id) }))
    })
    const items = computed<MenuEntry[]>(() =>
      pinAdd.value
        ? listed.value.map(({ id, title, path, suffix }) => ({
          id,
          // The title gives way first, so the suffix that tells the rows apart
          // stays visible; the native tooltip carries the full path.
          label:
              suffix === undefined
                ? title
                : h('span', { class: css.disambiguated, title: path }, [
                  h('span', { class: css.title }, [title]),
                  ' ',
                  h('span', { class: css.pathSuffix }, [suffix]),
                ]),
          icon: h(IconFolderCloseRegular, { size: 16 }),
          disabled: flowBusy.value,
        }))
        : addEntries.value,
    )
    // Nothing listed and nothing to add with (a composition that mounts this
    // package without any directory-picker): an empty popover would claim a
    // choice that does not exist, so the anchor gesture shows nothing at all.
    const menuIsEmpty = computed(() => items.value.length === 0)
    const closeModal = (): void => {
      errorOpen.value = false
      modalError.value = null
    }
    /** Adopt a picked directory; failures land in the folder-error dialog (Choose again reopens the flow). */
    const adoptDirectory = (path: string): Promise<void> =>
      props
        .createWorkspace({ path })
        .then((workspace) => {
          flowOpen.value = false
          props.onPick(workspace.workspaceId)
        })
        .catch((reason: unknown) => {
          modalError.value = reason instanceof Error ? reason.message : String(reason)
          flowOpen.value = false
          errorOpen.value = true
        })
    const openDirectoryFlow = (): void => {
      props.onClose()
      errorOpen.value = false
      modalError.value = null
      flowOpen.value = true
    }
    // A menu exists to disambiguate between targets. With no workspaces listed
    // and the add action the only entry left, the anchor gesture IS that action:
    // a one-row popover would cost a click and offer nothing to choose between.
    // The owner's open request is consumed the same way selecting the entry
    // would consume it (close the popover, raise the flow). An empty list is
    // only final once the baseline lands — until then the menu stays up with its
    // loading status instead of jumping into a flow the arriving list would have
    // made unnecessary; the add-only surface lists nothing and never waits.
    const listSettled = computed(
      () => (props.addOnly ?? false) || workspaceSnapshot.value.phase === 'ready',
    )
    const addIsTheOnlyEntry = computed(
      () => !pinAdd.value && listSettled.value && addEntries.value.length === 1,
    )
    // `flowBusy` gates this exactly as it disables the equivalent menu entry: a
    // pick still being adopted owns the surface until it settles.
    // `flowBusy` gates this exactly as it disables the equivalent menu entry: a
    // pick still being adopted owns the surface until it settles.
    watch(
      [
        () => props.open,
        () => addIsTheOnlyEntry.value,
        () => flowBusy.value,
        () => openDirectoryFlow,
      ],
      () => {
        if (props.open && addIsTheOnlyEntry.value && !flowBusy.value) openDirectoryFlow()
      },
      { immediate: true, flush: 'post' },
    )
    const flowOwner = computed<DirectoryFlowOwnerProps>(() => ({
      open: flowOpen.value,
      busy: pickingFolder.value,
      onPicked: (path) => {
        pickingFolder.value = true
        void adoptDirectory(path).finally(() => {
          pickingFolder.value = false
        })
      },
      onCancel: () => {
        flowOpen.value = false
      },
      onError: (message) => {
        flowOpen.value = false
        modalError.value = message
        errorOpen.value = true
      },
    }))
    const handleSelect = (id: string): void => {
      if (id === ADD_WORKSPACE) {
        openDirectoryFlow()
        return
      }
      props.onPick(id as WorkspaceId)
    }
    return () => {
      return h(Fragment, {}, [
        h(Menu, {
          open: props.open && !addIsTheOnlyEntry.value && !menuIsEmpty.value,
          items: items.value,
          ...(pinAdd.value ? { footer: addEntries.value } : {}),
          ...(props.selectedId === undefined ? {} : { selectedId: props.selectedId }),
          onSelect: handleSelect,
          onClose: props.onClose,
          side: props.side ?? 'bottom',
          portal: true,
          anchorRef: props.anchorRef ?? absentAnchor,
        }),
        props.open &&
          !addIsTheOnlyEntry.value &&
          !menuIsEmpty.value &&
          workspaceSnapshot.value.phase === 'pending' &&
          h('div', { class: css.menuStatus, role: 'status' }, [props.t('picker.loading')]),
        props.renderDirectoryFlow(flowOwner.value),
        h(
          Modal,
          {
            open: errorOpen.value,
            onClose: closeModal,
            closeLabel: props.t('close'),
            title: props.t('folderError.title'),
          },
          {
            footer: () =>
              h(Fragment, {}, [
                h(
                  Button,
                  { variant: 'outline', className: normalizeClass(css.modalAction), onClick: closeModal },
                  { default: () => [props.t('cancel')] },
                ),
                h(
                  Button,
                  {
                    variant: 'primary',
                    className: normalizeClass(css.modalAction),
                    disabled: !flowAvailable.value,
                    onClick: openDirectoryFlow,
                  },
                  { default: () => [props.t('folderError.retry')] },
                ),
              ]),
            default: () => [h('div', { class: css.modalError, role: 'alert' }, [modalError.value])],
          },
        ),
      ])
    }
  },
  {
    props: [
      't',
      'open',
      'anchorRef',
      'useWorkspaces',
      'createWorkspace',
      'useDirectoryFlow',
      'renderDirectoryFlow',
      'onPick',
      'onClose',
      'onBusyChange',
      'addOnly',
      'side',
      'selectedId',
    ],
  },
)
/**
 * The flow inputs both picker surfaces forward unchanged; each surface
 * supplies only the render function of its own directory-flow hole.
 */
type PickerSurfaceProps = Pick<
  WorkspacePickFlowProps,
  | 't'
  | 'open'
  | 'anchorRef'
  | 'useWorkspaces'
  | 'createWorkspace'
  | 'useDirectoryFlow'
  | 'selectedId'
  | 'onPick'
  | 'onClose'
>
function surfaceFlow(
  {
    t,
    open,
    anchorRef,
    useWorkspaces,
    createWorkspace,
    useDirectoryFlow,
    selectedId,
    onPick,
    onClose,
  }: PickerSurfaceProps,
  renderDirectoryFlow: WorkspacePickFlowProps['renderDirectoryFlow'],
): VNodeChild {
  return h(WorkspacePickFlow, {
    t: t,
    open: open,
    anchorRef: anchorRef,
    useWorkspaces: useWorkspaces,
    createWorkspace: createWorkspace,
    useDirectoryFlow: useDirectoryFlow,
    renderDirectoryFlow: renderDirectoryFlow,
    selectedId: selectedId,
    onPick: onPick,
    onClose: onClose,
  })
}
/**
 * The conversation empty-state registration: adapts the owner share to the
 * core flow (all state and semantics live in the flow / the owner).
 * @param props - empty-state slot props (owner share + injected creation callback).
 * @returns the flow element.
 */
export const WorkspacePicker = defineComponent(
  (props: WorkspacePickerProps) => {
    const { renderSlot } = props
    return () => {
      return surfaceFlow(props, owner =>
        renderSlot('conversation.hero.workspace.directoryFlow', owner),
      )
    }
  },
  {
    props: [
      't',
      'open',
      'anchorRef',
      'selectedId',
      'onPick',
      'onClose',
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
      'createWorkspace',
      'useDirectoryFlow',
    ],
  },
)
/**
 * The `workspace.picker` Factory definition: the same flow for another
 * plugin's surface, under the Factory's own directory-flow hole.
 * @param props - caller input, injected creation share, and the locale seat.
 * @returns the flow element.
 */
export const WorkspacePickerFactory = defineComponent(
  (props: WorkspacePickerFactoryProps) => {
    const { renderSlot } = props
    return () => {
      return surfaceFlow(props, owner => renderSlot('workspace.picker.directoryFlow', owner))
    }
  },
  {
    props: [
      'renderSlot',
      't',
      'open',
      'anchorRef',
      'useWorkspaces',
      'createWorkspace',
      'useDirectoryFlow',
      'selectedId',
      'onPick',
      'onClose',
    ],
  },
)
