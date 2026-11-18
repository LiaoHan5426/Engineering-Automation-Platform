import { h, Fragment, defineComponent, computed, shallowRef, watch } from 'vue'
/**
 * Workspace browser tree row components (figma Cell set 14:3080): pure presentational —
 * all data and callbacks arrive via props. Hover swaps (folder->chevron,
 * time->ellipsis, action buttons) are CSS-only. Workspace row
 * menus share captured Workspace actions with right-click. Both row types
 * render the shared `contextMenu.button` factory for their menu trigger.
 * Session hover buttons use the browser's `renderSlot` for the
 * `sidebar.workspaces.session.row.action` list. Session and Workspace
 * hover cards are suppressed while their menu is open.
 */
import clsx from 'clsx'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import {
  HoverCard,
  MarqueeText,
  useHoverMarquee,
  IconArchiveOutlineRegular,
  IconFolderCloseRegular,
  IconFolderOpenRegular,
  IconNewChatOutlineRegular,
  IconPinFillRegular,
  IconTriangleRightFillRegular,
  IconUnarchiveOutlineRegular,
  relativeTime,
  StateDot,
  Tooltip,
  useRowDragPreview,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ShortcutCatalogEntry } from '@deepseek-ai/dsh-client-shortcuts/client'
import type { StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import { abbreviateHomePath } from '@deepseek-ai/dsh-util-workspace-path'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { WorkspaceBrowserProps } from '../contract/slots.ts'
import type { GroupNode, SearchResultNode, SessionNode } from '../tree.ts'
import css from './Rows.module.css'
/** Sidebar-owned layout values needed by row copies mounted outside the sidebar. */
const DRAG_PREVIEW_PROPERTIES = [
  '--dsh-sidebar-row-padding',
  '--dsh-sidebar-label-gap',
  '--dsh-sidebar-paint-inset',
] as const
/** The standard locale seat, prop-passed from the browser root. */
type RowTranslate = WorkspaceBrowserProps['t']
/**
 * Child-seat renderer threaded from the browser root: the row's action lists,
 * its leading and trailing decorations, and its hover-card section. The leading
 * seat is rendered only while the row's primary state is idle, so a status dot and a
 * leading occupant never share the row; the hover seat only while the row's
 * card is open.
 */
type RowRenderSlots = PropsRenderSlots<
  | 'sidebar.workspaces.session.row.action'
  | 'sidebar.session.row.trailing'
  | 'sidebar.session.row.leading'
  | 'sidebar.session.row.hover'
>['renderSlot']
/** Row display title: blank rows show the localized New Session label. */
function displayTitle(node: SessionNode, t: RowTranslate): string {
  return node.blank ? t('session.new') : node.title || t('session.untitled')
}
/** Localized compact relative time ("刚刚"/"5分钟" in zh, "now"/"5min" in en). */
function timeLabel(updatedAt: number, now: number, t: RowTranslate): string {
  const { unit, n } = relativeTime(updatedAt, now)
  return unit === 'now' ? t('time.now') : t(`time.${unit}`, { n })
}
/** Hover-card variant: distances wrap in the ago template; the now bucket stays bare (no "now ago"). */
function hoverTimeLabel(updatedAt: number, now: number, t: RowTranslate): string {
  const { unit, n } = relativeTime(updatedAt, now)
  return unit === 'now' ? t('time.now') : t('time.ago', { t: t(`time.${unit}`, { n }) })
}
/**
 * Absolute creation time through the dictionary's date template (the message
 * clock pattern): `toLocaleString` would follow the browser language, not the
 * app locale, and produce mixed-language text after a switch.
 */
function createdLabel(createdAt: number, t: RowTranslate): string {
  const d = new Date(createdAt)
  const pad2 = (v: number): string => String(v).padStart(2, '0')
  const date = t('date.ymd', { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() })
  return t('hover.created', { time: `${date} ${pad2(d.getHours())}:${pad2(d.getMinutes())}` })
}
const WorkspaceHoverContent = defineComponent(
  (props: { label: string; cwd: string | undefined; createdAt: number; t: RowTranslate }) => {
    return () => {
      return h('div', { class: css.hoverContent }, [
        h('div', { class: css.hoverTitle }, [props.label]),
        h('div', { class: css.hoverPath }, [props.cwd]),
        h('div', { class: css.hoverTime }, [createdLabel(props.createdAt, props.t)]),
      ])
    }
  },
  { props: ['label', 'cwd', 'createdAt', 't'] },
)
/**
 * Row drag wiring supplied by the tree owner. `drop` reports the half of the
 * row where the pointer released so the owner can resolve an insert anchor.
 */
export interface RowDragProps {
  /** Start dragging this row. */
  start: () => void
  /** A compatible row drag is in flight. */
  active: boolean
  /** Current marker on this row: insert line above, below, or none. */
  marker: 'before' | 'after' | null
  /** Report the hovered half while a compatible drag passes over this row. */
  hover: (half: 'before' | 'after') => void
  drop: (half: 'before' | 'after') => void
  end: () => void
}
/** Drag lifecycle owned by a workspace row; its enclosing group owns hit testing. */
interface WorkspaceRowDragProps {
  start: () => void
  end: () => void
}
/** Pointer-position half of a row (insert line above or below). */
function rowHalf(e: { clientY: number; currentTarget: HTMLElement }): 'before' | 'after' {
  const rect = e.currentTarget.getBoundingClientRect()
  return e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
}
/** Owner props of one Workspace header row; the access Hooks are the browser root's own standard seats. */
type ProjectRowItemProps = {
  group: GroupNode
  newShortcut?: ShortcutCatalogEntry | undefined
  containsCurrentDescendant?: boolean
  onToggle: () => void
  onCreate: (workspaceId: WorkspaceId) => void
  /** Present only for real Workspace rows in the grouped view. */
  drag?: WorkspaceRowDragProps | undefined
  /** Host account home; POSIX home-rooted hover paths display as `~`. */
  home?: string | undefined
  t: RowTranslate
} & Pick<
  WorkspaceBrowserProps,
  'useWorkspaceAccess' | 'renderFactorySlot' | 'useContextMenuTarget' | 'useContextMenu'
>
/** The header actions one row offers; an absent create offers no New Session button. */
interface ProjectRowActions {
  readonly create?: (() => void) | undefined
  readonly reorder: boolean
}
/**
 * Project (workspace) header row: folder + title;
 * hover reveals the chevron and, on a real Workspace, the create button;
 * dwelling on a real Workspace shows its hover card. The ungrouped bucket
 * has neither, because it has no backing Workspace to start a Session in.
 * `containsCurrent` arrives on the node (derivation fact, no renderer scan).
 * Create and drag follow the Workspace access snapshot. Menu providers own
 * their access checks; the ungrouped bucket has no Workspace menu.
 * @param props.group - derived group node.
 * @param props.containsCurrentDescendant - highlight an ancestor even when its subtree is collapsed.
 * @param props.onToggle - expand/collapse the group.
 * @param props.onCreate - start a frontend Session inside the given Workspace.
 * @param props.drag - optional workspace-row drag wiring.
 * @param props.home - host account home for POSIX hover-path abbreviation.
 * @param props.t - the browser root's locale seat.
 * @returns the row element.
 */
export const ProjectRowItem = defineComponent(
  (props: ProjectRowItemProps) => {
    const workspaceId = computed(() => props.group.workspaceId)
    return () => {
      return workspaceId.value === undefined
        ? h(UngroupedProjectRow, { ...props })
        : h(WorkspaceProjectRow, { ...props, workspaceId: workspaceId.value })
    }
  },
  {
    props: [
      'group',
      'newShortcut',
      'containsCurrentDescendant',
      'onToggle',
      'onCreate',
      'drag',
      'home',
      't',
      'useWorkspaceAccess',
      'renderFactorySlot',
      'useContextMenuTarget',
      'useContextMenu',
    ],
  },
)
const UngroupedProjectRow = defineComponent(
  (props: ProjectRowItemProps) => {
    return () => {
      return h(ProjectRow, { ...props, actions: { reorder: false } })
    }
  },
  {
    props: [
      'group',
      'newShortcut',
      'containsCurrentDescendant',
      'onToggle',
      'onCreate',
      'drag',
      'home',
      't',
      'useWorkspaceAccess',
      'renderFactorySlot',
      'useContextMenuTarget',
      'useContextMenu',
    ],
  },
)
const WorkspaceProjectRow = defineComponent(
  (
    props: ProjectRowItemProps & {
      workspaceId: WorkspaceId
    },
  ) => {
    const { useWorkspaceAccess } = props
    const create = useWorkspaceAccess(props.workspaceId, 'session/create')
    const reorder = useWorkspaceAccess(props.workspaceId, 'workspace/insertBefore')
    const actions = computed<ProjectRowActions>(() => ({
      create: create.value
        ? () => {
          props.onCreate(props.workspaceId)
        }
        : undefined,
      reorder: reorder.value === true,
    }))
    return () => {
      return h(ProjectRow, { ...props, actions: actions.value })
    }
  },
  {
    props: [
      'group',
      'newShortcut',
      'containsCurrentDescendant',
      'onToggle',
      'onCreate',
      'drag',
      'home',
      't',
      'useWorkspaceAccess',
      'renderFactorySlot',
      'useContextMenuTarget',
      'useContextMenu',
      'workspaceId',
    ],
  },
)
const ProjectRow = defineComponent(
  (
    props: Omit<ProjectRowItemProps, 'onCreate'> & {
      actions: ProjectRowActions
    },
  ) => {
    const { getTriggerProps } = props.useContextMenu()
    const drag = computed(() => (props.actions.reorder ? props.drag : undefined))
    const create = computed(() => props.actions.create)
    const row = computed(() => props.group)
    // The ungrouped bucket has no workspace title: its label is dictionary copy.
    const label = computed(() =>
      row.value.workspaceId === undefined ? props.t('group.ungrouped') : row.value.label,
    )
    const active = computed(
      () =>
        (props.containsCurrentDescendant ?? false) ||
        (props.group.expanded && props.group.containsCurrent),
    )
    const menuOpen = props.useContextMenuTarget(
      target =>
        target?.kind === 'workspace' && target.value.workspaceId === row.value.workspaceId,
    )
    const dragPreview = useRowDragPreview(css.dragPreview as string, DRAG_PREVIEW_PROPERTIES)
    const workspaceMenuTarget = computed(() =>
      row.value.workspaceId !== undefined && row.value.cwd !== undefined
        ? { workspaceId: row.value.workspaceId, path: row.value.cwd }
        : undefined,
    )
    const ownRow = computed(() =>
      h(
        'div',
        {
          class: clsx(css.projectRow, menuOpen.value && css.menuOpen),
          'data-row-key': `workspace:${props.group.key}`,
          role: 'treeitem',
          'aria-expanded': row.value.expanded,
          onClick: props.onToggle,
          ...getTriggerProps(
            workspaceMenuTarget.value === undefined
              ? undefined
              : {
                kind: 'workspace',
                value: { ...workspaceMenuTarget.value, displayTitle: label.value },
              },
          ),
          draggable: drag.value !== undefined,
          onDragstart:
            drag.value === undefined
              ? undefined
              : (
                e: DragEvent & {
                  currentTarget: HTMLDivElement
                },
              ) => {
                if (e.dataTransfer === null) return
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', row.value.key)
                drag.value?.start()
                dragPreview.start(e)
              },
          onDragend: () => {
            if (dragPreview.clear()) drag.value?.end()
          },
        },
        [
          h('span', { class: clsx(css.slot, css.folder, active.value && css.folderActive) }, [
            row.value.expanded ? h(IconFolderOpenRegular, {}) : h(IconFolderCloseRegular, {}),
          ]),
          h('span', { class: clsx(css.slot, css.chevron) }, [
            h(IconTriangleRightFillRegular, {
              class: clsx(css.arrow, row.value.expanded && css.arrowOpen),
            }),
          ]),
          h('span', { class: css.projectText }, [h('span', { class: css.title }, [label.value])]),
          h('span', { class: css.rowActions }, [
            workspaceMenuTarget.value !== undefined &&
              props.renderFactorySlot('contextMenu.button', {
                target: {
                  kind: 'workspace',
                  value: { ...workspaceMenuTarget.value, displayTitle: label.value },
                },
                label: props.t('actions.workspace.aria', { name: label.value }),
                className: css.iconButton,
              }),
            create.value !== undefined &&
              h(
                Tooltip,
                {
                  label: props.t('actions.newSession'),
                  ...(props.newShortcut?.keys === undefined
                    ? {}
                    : { shortcutKeys: props.newShortcut.keys }),
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
                        'aria-keyshortcuts': props.newShortcut?.aria,
                        'aria-label': props.t('actions.newSession.aria', { name: label.value }),
                        onClick: (e) => {
                          e.stopPropagation()
                          create.value?.()
                        },
                      },
                      [h(IconNewChatOutlineRegular, { size: 14 })],
                    ),
                  ],
                },
              ),
          ]),
        ],
      ),
    )
    // The ungrouped bucket has no backing Workspace: no card to show.
    return () => {
      // The ungrouped bucket has no backing Workspace: no card to show.
      const createdAt = row.value.createdAt
      if (createdAt === undefined) return ownRow.value
      return h(
        HoverCard,
        {
          openDelayMs: 800,
          grouped: true,
          disabled: menuOpen.value,
          ...(row.value.cwd === undefined ? {} : { copyText: row.value.cwd }),
          copyLabel: props.t('copy'),
          copiedLabel: props.t('hover.copied'),
        },
        {
          anchor: () => ownRow.value,
          default: () =>
            h(WorkspaceHoverContent, {
              label: row.value.label,
              cwd:
                row.value.cwd === undefined
                  ? undefined
                  : abbreviateHomePath(row.value.cwd, props.home),
              createdAt,
              t: props.t,
            }),
        },
      )
    }
  },
  {
    props: [
      'useWorkspaceAccess',
      'renderFactorySlot',
      'useContextMenuTarget',
      'useContextMenu',
      'group',
      'newShortcut',
      'containsCurrentDescendant',
      'onToggle',
      'drag',
      'home',
      't',
      'actions',
    ],
  },
)
/* v8 ignore next 3 -- closed-union backstop; only reached if the status is forged */
function assertNever(value: never): never {
  throw new Error(`unknown pending interaction: ${String(value)}`)
}
interface SessionStatus {
  state: StateDotState
  label: string
  /** Compact text that replaces the Session row's update time. */
  trailingLabel?: string
}
/**
 * Session status presentation; pending interaction is primary and live activity
 * outranks completion reminders.
 */
function sessionStatuses(
  node: Pick<
    SessionNode,
    'pendingInteraction' | 'running' | 'runningSubagentCount' | 'completed' | 'failed'
  >,
  t: RowTranslate,
): readonly [SessionStatus, ...SessionStatus[]] {
  const subagents: SessionStatus | undefined =
    node.runningSubagentCount === 0
      ? undefined
      : {
        state: 'ongoing',
        label: t(
          node.runningSubagentCount === 1
            ? 'status.subagentsRunning.one'
            : 'status.subagentsRunning.other',
          { n: node.runningSubagentCount },
        ),
      }
  let pending: SessionStatus | undefined
  switch (node.pendingInteraction) {
    case 'approval':
      pending = {
        state: 'warning',
        label: t('status.waitingApproval'),
        trailingLabel: t('status.compact.approval'),
      }
      break
    case 'plan-review':
      pending = {
        state: 'warning',
        label: t('status.planReview'),
        trailingLabel: t('status.compact.planReview'),
      }
      break
    case 'question':
      pending = {
        state: 'warning',
        label: t('status.waitingAnswer'),
        trailingLabel: t('status.compact.answer'),
      }
      break
    case undefined:
      break
    /* v8 ignore next -- closed PendingInteractionStatus union */
    default:
      return assertNever(node.pendingInteraction)
  }
  const completion: SessionStatus = node.failed
    ? { state: 'error', label: t('status.failed') }
    : { state: 'done', label: t('status.unread') }
  const unread: SessionStatus[] = node.completed ? [completion] : []
  if (pending !== undefined)
    return subagents === undefined ? [pending, ...unread] : [pending, subagents, ...unread]
  if (node.running) {
    const primary: SessionStatus = { state: 'ongoing', label: t('status.running') }
    return subagents === undefined ? [primary, ...unread] : [primary, subagents, ...unread]
  }
  if (subagents !== undefined) return [subagents, ...unread]
  if (node.completed) return [completion]
  return [{ state: 'idle', label: t('status.idle') }]
}
const SessionStatusDots = defineComponent(
  (props: { statuses: readonly [SessionStatus, ...SessionStatus[]] }) => {
    return () => {
      return h(Fragment, {}, [
        h(StateDot, { state: props.statuses[0].state }),
        props.statuses.map(status =>
          h('span', { class: css.visuallyHidden, key: status.label }, [status.label]),
        ),
      ])
    }
  },
  { props: ['statuses'] },
)
const PinnedIndicator = defineComponent(
  (props: { t: RowTranslate }) => {
    const label = computed(() => props.t('row.pinned'))
    return () => {
      return h(
        'span',
        { class: css.pinIndicator, role: 'img', 'aria-label': label.value, title: label.value },
        [h(IconPinFillRegular, { size: 14 })],
      )
    }
  },
  { props: ['t'] },
)
const SessionHoverContent = defineComponent(
  (props: {
    node: SessionNode
    /** Display working directory; absent omits the line. */
    cwd: string | undefined
    now: number
    renderSlot: RowRenderSlots
    t: RowTranslate
  }) => {
    const statuses = computed(() =>
      sessionStatuses(
        props.node.archived ? { ...props.node, completed: false } : props.node,
        props.t,
      ).filter(status => !(props.node.archived && status.state === 'idle')),
    )
    return () => {
      return h('div', { class: css.hoverContent }, [
        h('div', { class: css.hoverTitle }, [displayTitle(props.node, props.t)]),
        props.cwd !== undefined && h('div', { class: css.hoverPath }, [props.cwd]),
        !props.node.blank &&
          h('div', { class: css.hoverTime }, [
            hoverTimeLabel(props.node.updatedAt, props.now, props.t),
          ]),
        props.renderSlot('sidebar.session.row.hover', { sessionId: props.node.id }),
        statuses.value.map(status =>
          h('div', { class: css.hoverStatus, key: status.label }, [
            h(StateDot, { state: status.state }),
            h('span', {}, [status.label]),
          ]),
        ),
        props.node.archived &&
          h('div', { class: clsx(css.hoverStatus, css.hoverArchived) }, [
            h(IconArchiveOutlineRegular, { size: 14 }),
            h('span', {}, [props.t('row.archived')]),
          ]),
      ])
    }
  },
  { props: ['node', 'cwd', 'now', 'renderSlot', 't'] },
)
/**
 * One flat search result: title, Workspace context, and optional content
 * excerpt. Search navigation opens the session only; it does not address an
 * event inside the conversation. Archived rows carry a hover unarchive
 * button, because search is where the filter surfaces them for recovery.
 * @param props.result - merged local/content search row.
 * @param props.currentId - selected session id.
 * @param props.onOpen - open the selected session.
 * @param props.onUnarchive - unarchive an archived result row.
 * @param props.useSessionAccess - the browser root's Session access Hook; the restore control
 * appears only while the snapshot allows `workspace/unarchiveSession` for that Session.
 * @param props.t - Workspace-browser translation seat.
 * @returns the result row.
 */
export const SearchResultItem = defineComponent(
  (
    props: {
      result: SearchResultNode
      currentId: string | undefined
      onOpen: (id: SearchResultNode['id']) => void
      onUnarchive: (id: SearchResultNode['id']) => void
      t: RowTranslate
    } & Pick<WorkspaceBrowserProps, 'useSessionAccess'>,
  ) => {
    const selected = computed(() => props.result.id === props.currentId)
    const canUnarchive = props.useSessionAccess(
      computed(() => props.result.id),
      'workspace/unarchiveSession',
    )
    const statuses = computed(() => sessionStatuses(props.result, props.t))
    const primaryStatus = computed(() => statuses.value[0])
    return () => {
      return h(
        'div',
        {
          class: clsx(
            css.searchResultRow,
            selected.value && css.selected,
            props.result.archived && css.archived,
          ),
          role: 'treeitem',
          'aria-selected': selected.value,
          'aria-description': props.result.archived
            ? props.t('toast.archivedNotOpenable')
            : undefined,
          onClick: () => {
            props.onOpen(props.result.id)
          },
        },
        [
          h('span', { class: css.searchResultHeading }, [
            h('span', { class: css.slot }, [
              !props.result.archived &&
                primaryStatus.value.state !== 'idle' &&
                h(SessionStatusDots, { statuses: statuses.value }),
            ]),
            h('span', { class: css.searchResultTitle }, [
              props.result.title || props.t('session.untitled'),
            ]),
            props.result.archived &&
              canUnarchive.value &&
              h('span', { class: css.rowActions }, [
                h(
                  Tooltip,
                  {
                    label: props.t('actions.unarchive'),
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
                          'aria-label': props.t('menu.unarchiveSession'),
                          onClick: (e) => {
                            e.stopPropagation()
                            props.onUnarchive(props.result.id)
                          },
                        },
                        [h(IconUnarchiveOutlineRegular, { size: 14 })],
                      ),
                    ],
                  },
                ),
              ]),
          ]),
          h('span', { class: css.searchResultMeta }, [
            h('span', { class: css.searchResultWorkspace }, [
              props.result.workspace || props.t('group.ungrouped'),
            ]),
            props.result.snippet !== undefined &&
              h('span', { class: css.searchResultSnippet }, [props.result.snippet]),
          ]),
        ],
      )
    }
  },
  { props: ['result', 'currentId', 'onOpen', 'onUnarchive', 't', 'useSessionAccess'] },
)
/**
 * One top-level 32px session row: leading 16px cell (status dot, or the
 * leading seat while the row's primary state is idle), title, relative time or
 * compact pending label, and the row actions menu. A row that owns a state dot
 * keeps that cell and renders no seat, so an ambient automation mark never
 * appears beside the row's own state dot. An archived row keeps the cell blank:
 * neither marker renders there, and its live status stays on the hover card.
 * The row accepts Tab focus and opens with unmodified Enter or Space; descendant controls
 * handle their own activation without opening the row.
 * @param props.node - derived session node.
 * @param props.currentId - selected session id (row highlight).
 * @param props.now - epoch ms for relative-time formatting.
 * @param props.onOpen - open a session by id.
 * @param props.onRenameRequest - open the rename dialog from a title double-click (id + current title);
 * called only after a single press on the title since the window last lost focus.
 * @param props.renderSlot - child-seat renderer for the row's action lists
 * (`sidebar.workspaces.session.menu.item` / `sidebar.workspaces.session.row.action`),
 * its leading and trailing decorations, and its hover-card section.
 * @param props.onReveal - scroll this row into view after search navigation, then acknowledge it.
 * @param props.drag - optional row-drag target wiring; blank rows, and rows whose access excludes
 * `workspace/insertSessionBefore`, cannot start a drag.
 * @param props.home - host account home for POSIX hover-path abbreviation.
 * @param props.useSessionAccess - the browser root's Session access Hook; the title double-click
 * renames only while it allows `session/rename`.
 * @param props.t - the browser root's locale seat.
 * @returns the session row.
 */
export const SessionNodeItem = defineComponent(
  (
    props: {
      useContextMenu: WorkspaceBrowserProps['useContextMenu']
      renderFactorySlot: WorkspaceBrowserProps['renderFactorySlot']
      useContextMenuTarget: WorkspaceBrowserProps['useContextMenuTarget']
      node: SessionNode
      currentId: string | undefined
      now: number
      onOpen: (id: SessionNode['id']) => void
      /** Open the rename dialog from a title double-click (id + current title); see the function JSDoc for the press precondition. */
      onRenameRequest: (id: SessionNode['id'], currentTitle: string) => void
      /** Scroll this row into view after search navigation, then acknowledge it. */
      onReveal?: (() => void) | undefined
      /** Present on reorderable-list rows so every row can remain a drop target. */
      drag?: RowDragProps | undefined
      /** Host account home; POSIX home-rooted hover paths display as `~`. */
      home?: string | undefined
      t: RowTranslate
    } & Pick<WorkspaceBrowserProps, 'useSessionAccess'> &
      PropsRenderSlots<
        | 'sidebar.workspaces.session.row.action'
        | 'sidebar.session.row.trailing'
        | 'sidebar.session.row.leading'
        | 'sidebar.session.row.hover'
      >,
  ) => {
    const { getTriggerProps } = props.useContextMenu()
    const row = computed(() => props.node)
    const title = computed(() => displayTitle(props.node, props.t))
    const selected = computed(() => props.node.id === props.currentId)
    const statuses = computed(() => sessionStatuses(props.node, props.t))
    const primaryStatus = computed(() => statuses.value[0])
    const showStatus = computed(() => primaryStatus.value.state !== 'idle')
    // Archived rows hold their in-place grayed slot, so manual reorder cannot
    // move them. Pinned rows drag within the pinned block: the browser gates
    // their drop targets to fellow pinned rows.
    const renamable = props.useSessionAccess(
      computed(() => props.node.id),
      'session/rename',
    )
    const reorderable = props.useSessionAccess(
      computed(() => props.node.id),
      'workspace/insertSessionBefore',
    )
    const draggable = computed(
      () =>
        props.drag !== undefined && reorderable.value && !row.value.blank && !row.value.archived,
    )
    const menuOpen = props.useContextMenuTarget(
      target => target?.kind === 'session' && target.value.sessionId === props.node.id,
    )
    const dragPreview = useRowDragPreview(css.dragPreview as string, DRAG_PREVIEW_PROPERTIES)
    const rowRef = shallowRef<HTMLDivElement | null>(null)
    const titleRef = shallowRef<HTMLSpanElement | null>(null)
    const marquee = useHoverMarquee(titleRef, { hold: menuOpen })
    // On macOS the click that activates the window is not delivered, but the
    // next click arrives with detail 2 and fires dblclick, so rename requires a
    // detail-1 press on this title since the window last lost focus.
    const renameArmed = shallowRef(false)
    const disarmRename = () => {
      renameArmed.value = false
    }
    watch(
      [() => props.onReveal, () => rowRef.value],
      () => {
        if (props.onReveal === undefined || rowRef.value === null) return
        rowRef.value.scrollIntoView({ block: 'nearest' })
        props.onReveal()
      },
      { immediate: true, flush: 'post' },
    )
    const ownRow = computed(() =>
      h(
        'div',
        {
          ref: rowRef,
          onPointerenter: marquee.onPointerEnter,
          onPointerleave: marquee.onPointerLeave,
          'data-row-key': `session:${props.node.id}`,
          class: clsx(
            css.sessionRow,
            selected.value && css.selected,
            menuOpen.value && css.menuOpen,
            row.value.archived && css.archived,
            props.drag?.marker === 'before' && css.dropBefore,
            props.drag?.marker === 'after' && css.dropAfter,
          ),
          role: 'treeitem',
          'aria-selected': selected.value,
          'aria-description': row.value.archived ? props.t('toast.archivedNotOpenable') : undefined,
          tabindex: 0,
          onClick: () => {
            props.onOpen(props.node.id)
          },
          ...getTriggerProps(
            row.value.blank
              ? undefined
              : {
                kind: 'session',
                value: { sessionId: props.node.id, displayTitle: row.value.title },
              },
            {
              onKeydown: (event: KeyboardEvent) => {
                if (
                  event.target !== event.currentTarget ||
                  (event.key !== 'Enter' && event.key !== ' ')
                )
                  return
                if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
                event.preventDefault()
                props.onOpen(props.node.id)
              },
            },
          ),
          draggable: draggable.value,
          onDragstart: !draggable.value
            ? undefined
            : (
              e: DragEvent & {
                currentTarget: HTMLDivElement
              },
            ) => {
              if (e.dataTransfer === null) return
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', props.node.id)
              props.drag?.start()
              dragPreview.start(e)
            },
          onDragend: () => {
            if (dragPreview.clear()) props.drag?.end()
          },
          onDragover:
            props.drag === undefined
              ? undefined
              : (
                e: DragEvent & {
                  currentTarget: HTMLDivElement
                },
              ) => {
                if (!props.drag?.active || e.dataTransfer === null) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                props.drag.hover(rowHalf(e))
              },
          onDrop:
            props.drag === undefined
              ? undefined
              : (
                e: DragEvent & {
                  currentTarget: HTMLDivElement
                },
              ) => {
                if (!props.drag?.active) return
                e.preventDefault()
                props.drag.drop(rowHalf(e))
              },
        },
        [
          h('span', { class: css.slot }, [
            !row.value.archived &&
              !row.value.blank &&
              (showStatus.value
                ? h(SessionStatusDots, { statuses: statuses.value })
                : props.renderSlot('sidebar.session.row.leading', { sessionId: props.node.id })),
          ]),
          h(
            MarqueeText,
            {
              elementRef: (element: HTMLSpanElement | null) => { titleRef.value = element },
              class: css.title,
              onMousedown: (e: MouseEvent) => {
                if (e.detail !== 1) return
                renameArmed.value = true
                // One shared function and options: repeated presses add one listener.
                window.addEventListener('blur', disarmRename, { once: true })
              },
              onDblclick:
                row.value.blank || !renamable.value
                  ? undefined
                  : (e: MouseEvent) => {
                    e.stopPropagation()
                    if (!renameArmed.value) return
                    renameArmed.value = false
                    props.onRenameRequest(props.node.id, row.value.title)
                  },
            },
            { default: () => title.value },
          ),
          !row.value.blank &&
            h('span', { class: css.rowResting }, [
              h(
                'span',
                {
                  class: clsx(
                    css.time,
                    primaryStatus.value.trailingLabel === undefined && css.timestamp,
                  ),
                  'aria-hidden': primaryStatus.value.trailingLabel === undefined ? undefined : true,
                },
                [
                  primaryStatus.value.trailingLabel ??
                    timeLabel(row.value.updatedAt, props.now, props.t),
                ],
              ),
              props.renderSlot('sidebar.session.row.trailing', { sessionId: props.node.id }),
              row.value.pinned && !row.value.archived && h(PinnedIndicator, { t: props.t }),
            ]),
          !row.value.blank &&
            h(
              'span',
              {
                class: css.rowActions,
                onClick: (e: MouseEvent) => {
                  e.stopPropagation()
                },
              },
              [
                props.renderFactorySlot('contextMenu.button', {
                  target: {
                    kind: 'session',
                    value: { sessionId: props.node.id, displayTitle: row.value.title },
                  },
                  label: props.t('actions.session.aria', { name: title.value }),
                  className: css.iconButton,
                }),
                h('span', { class: css.rowQuickActions }, [
                  props.renderSlot('sidebar.workspaces.session.row.action', {
                    sessionId: props.node.id,
                    displayTitle: row.value.title,
                  }),
                ]),
              ],
            ),
        ],
      ),
    )
    return () => {
      return h(
        HoverCard,
        {
          openDelayMs: 800,
          grouped: true,
          disabled: menuOpen.value || props.drag?.active === true,
          ...(!row.value.blank && row.value.title !== '' ? { copyText: row.value.title } : {}),
          copyLabel: props.t('copy'),
          copiedLabel: props.t('hover.copied'),
        },
        {
          anchor: () => ownRow.value,
          default: () =>
            h(SessionHoverContent, {
              node: props.node,
              cwd:
                row.value.cwd === undefined
                  ? undefined
                  : abbreviateHomePath(row.value.cwd, props.home),
              now: props.now,
              renderSlot: props.renderSlot,
              t: props.t,
            }),
        },
      )
    }
  },
  {
    props: [
      'useContextMenu',
      'renderFactorySlot',
      'useContextMenuTarget',
      'node',
      'currentId',
      'now',
      'onOpen',
      'onRenameRequest',
      'onReveal',
      'drag',
      'home',
      't',
      'useSessionAccess',
      'renderSlot',
      '__renders',
    ],
  },
)
