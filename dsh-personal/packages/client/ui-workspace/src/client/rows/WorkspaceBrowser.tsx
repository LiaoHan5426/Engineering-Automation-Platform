import {
  h,
  defineComponent,
  computed,
  shallowRef,
  watch,
  type VNodeChild,
  type CSSProperties,
} from "vue";
/**
 * The workspace/session browsing region filling the sidebar shell's
 * `sidebar.workspaces` hole: section header (title + view options + add
 * workspace), search, the grouped tree or flat list, and the workspace
 * dialogs. Wide state renders the full browser; rail state renders the two
 * region icons (search / add workspace) as 36px controls on the shell's shared
 * rail entry path, each requesting expansion through the owner share. Adding
 * is the header button's one action, so it raises the directory flow with no
 * menu in between; the flow and its error dialog live in WorkspacePicker
 * (same package — direct composition, no slot between them). A Session row's
 * "..." menu and hover buttons are the `sidebar.workspaces.session.menu.item`
 * and `sidebar.workspaces.session.row.action` lists rendered through this
 * entry's `renderSlot`; the actions in them, this package's own included,
 * are slot entries with their own behavior, so this component threads no
 * action callbacks and hosts no action surface.
 */
import clsx from "clsx";
import { WorkspaceDialogs } from "./WorkspaceDialogs.tsx";
import {
  AnimatedRows,
  HoverCardGroup,
  IconArchiveCheckOutlineRegular,
  IconArchiveOffOutlineRegular,
  IconArchiveOutlineRegular,
  IconChevronsUpDownOutlineRegular,
  IconClockOutlineRegular,
  IconCloseFillRegular,
  IconFlatListOutlineRegular,
  IconFolderCloseRegular,
  IconProjectAddOutlineRegular,
  IconQueueOutlineRegular,
  IconSearchOutlineRegular,
  IconSlidersTwoOutlineRegular,
  IconWorkspaceTreeOutlineRegular,
  Menu,
  Tooltip,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type {
  SessionListState,
  SessionSearchResultItem,
} from "@deepseek-ai/dsh-api-session-controller/client";
import type { WorkspaceId, WorkspaceView } from "@deepseek-ai/dsh-api-workspace-controller/client";
import { workspaceDisplayTitle } from "@deepseek-ai/dsh-api-workspace-controller/default-workspace";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
import type { PropsRenderSlots } from "@deepseek-ai/dsh-client-ui-slots";
import type { WorkspaceBrowserProps } from "../contract/slots.ts";
import type {
  ArchivedFilter,
  GroupNode,
  SessionNode,
  SessionOrderBy,
  SessionRowState,
} from "../tree.ts";
import {
  deriveFlat,
  deriveGroups,
  deriveSearchResults,
  orderByRecency,
  sessionSearchIndex,
  owningGroupKey,
  owningParentFolder,
  pinCurrentBlank,
  reconcileManualOrder,
  sessionMemberIds,
  UNGROUPED_KEY,
} from "../tree.ts";
import { ProjectRowItem, SearchResultItem, SessionNodeItem } from "./Rows.tsx";
import { FLAT_SESSION_ORDER_KEY, type SessionGroupBy } from "../stores.ts";
import { WorkspacePickFlow } from "../WorkspacePicker.tsx";
import css from "./WorkspaceBrowser.module.css";
/**
 * Column slide length (--ds-transition-duration-slow): rail-search focus waits it out —
 * focus() forces a synchronous layout and would jank the slide.
 */
const EXPAND_SLIDE_MS = 300;
/** Pause between the latest keystroke and a Host content-search request. */
const SEARCH_DEBOUNCE_MS = 250;
/** `session.search` wire bound, measured in JavaScript UTF-16 code units. */
const SEARCH_QUERY_MAX_CODE_UNITS = 500;
/** Non-blank Session rows visible per Workspace while no Session raises its watermark. */
const SESSION_WATERMARK_BASE = 5;
/** Highest watermark that attention-bearing Sessions raise automatically; Show more and search reveals may exceed it. */
const SESSION_WATERMARK_AUTO_MAX = 50;
/** Show the blank row plus the first `watermark` non-blank rows, in list order. */
function watermarkRows(
  sessions: readonly SessionNode[],
  watermark: number,
): {
  rows: readonly SessionNode[];
  hiddenCount: number;
} {
  let count = 0;
  const rows = sessions.filter((session) => {
    if (session.blank) return true;
    count += 1;
    return count <= watermark;
  });
  return { rows, hiddenCount: sessions.length - rows.length };
}
/**
 * Smallest watermark that covers every non-blank row within the automatic maximum that is running, has a running
 * child, awaits the user, carries an unread completion, or is current, and the reveal target at any position.
 */
function requiredWatermark(
  sessions: readonly SessionNode[],
  current: SessionId | undefined,
  revealSessionId: SessionId | undefined,
): number {
  let index = 0;
  let required = 0;
  for (const session of sessions) {
    if (session.blank) continue;
    index += 1;
    const attention =
      index <= SESSION_WATERMARK_AUTO_MAX &&
      (session.running ||
        session.runningSubagentCount > 0 ||
        session.pendingInteraction !== undefined ||
        session.completed ||
        session.id === current);
    if (attention || session.id === revealSessionId) required = index;
  }
  return required;
}
/** Raise each listed group's watermark to its requirement; returns `marks` itself when nothing rises. */
function raiseWatermarks(
  marks: Readonly<Record<string, number>>,
  required: ReadonlyMap<string, number>,
): Readonly<Record<string, number>> {
  let raised = marks;
  for (const [key, watermark] of required) {
    if (watermark > (raised[key] ?? SESSION_WATERMARK_BASE))
      raised = { ...raised, [key]: watermark };
  }
  return raised;
}
/** Keep controlled input and RPC payload inside the session.search wire contract. */
function sanitizeSearchQuery(value: string): string {
  const withoutNul = value.replaceAll("\0", "");
  if (withoutNul.length <= SEARCH_QUERY_MAX_CODE_UNITS) return withoutNul;
  let end = SEARCH_QUERY_MAX_CODE_UNITS;
  const last = withoutNul.charCodeAt(end - 1);
  const next = withoutNul.charCodeAt(end);
  if (last >= 0xd800 && last <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) end--;
  return withoutNul.slice(0, end);
}
/**
 * Accept the native drag at document level while a row drag is active: row
 * hover still owns the insertion marker, and releasing outside the list must
 * not be rendered as a rejected drop before dragend commits that last marker.
 */
function useNativeDragAcceptance(active: () => boolean): void {
  watch(
    active,
    (_value, _previous, onCleanup) => {
      const cleanup: void | (() => void) = (() => {
        if (!active()) return;
        const acceptDrag = (event: DragEvent): void => {
          event.preventDefault();
          if (event.dataTransfer !== null) event.dataTransfer.dropEffect = "move";
        };
        const acceptDrop = (event: DragEvent): void => {
          event.preventDefault();
        };
        document.addEventListener("dragover", acceptDrag);
        document.addEventListener("drop", acceptDrop);
        return () => {
          document.removeEventListener("dragover", acceptDrag);
          document.removeEventListener("drop", acceptDrop);
        };
      })();
      if (typeof cleanup === "function") onCleanup(cleanup);
    },
    { immediate: true, flush: "post" },
  );
}
const ViewOptionsMenu = defineComponent(
  (props: {
    groupBy: SessionGroupBy;
    orderBy: SessionOrderBy;
    archivedFilter: ArchivedFilter;
    onGroupPick: (mode: SessionGroupBy) => void;
    onOrderPick: (mode: SessionOrderBy) => void;
    onArchivedFilterPick: (filter: ArchivedFilter) => void;
    t: WorkspaceBrowserProps["t"];
  }) => {
    const open = shallowRef(false);
    return () => {
      return h(
        Menu,
        {
          open: open.value,
          onClose: () => {
            open.value = false;
          },
          items: [
            { type: "label" as const, id: "group-by", text: props.t("groupBy.label") },
            {
              id: "workspace",
              label: props.t("groupBy.workspace"),
              icon: h(IconFolderCloseRegular, {}),
            },
            {
              id: "workspace-tree",
              label: props.t("groupBy.workspaceTree"),
              icon: h(IconWorkspaceTreeOutlineRegular, {}),
            },
            { id: "flat", label: props.t("groupBy.flat"), icon: h(IconFlatListOutlineRegular, {}) },
            { type: "separator" as const, id: "order-by-separator" },
            { type: "label" as const, id: "order-by", text: props.t("orderBy.label") },
            {
              id: "manual",
              label: props.t("orderBy.manual"),
              icon: h(IconChevronsUpDownOutlineRegular, {}),
            },
            {
              id: "updated",
              label: props.t("orderBy.updated"),
              icon: h(IconClockOutlineRegular, {}),
            },
            { type: "separator" as const, id: "archived-filter-separator" },
            { type: "label" as const, id: "filter-by", text: props.t("filterBy.label") },
            {
              id: "hide-archived",
              label: props.t("viewOptions.hideArchived"),
              icon: h(IconArchiveOffOutlineRegular, {}),
            },
            {
              id: "show-archived",
              label: props.t("viewOptions.showArchived"),
              icon: h(IconQueueOutlineRegular, {}),
            },
            {
              id: "only-archived",
              label: props.t("viewOptions.onlyArchived"),
              icon: h(IconArchiveCheckOutlineRegular, {}),
            },
          ],
          selectedIds: [
            props.groupBy,
            props.orderBy,
            { default: "hide-archived", show: "show-archived", only: "only-archived" }[
              props.archivedFilter
            ],
          ],
          onSelect: (id) => {
            if (id === "workspace" || id === "workspace-tree" || id === "flat")
              props.onGroupPick(id);
            else if (id === "manual" || id === "updated") props.onOrderPick(id);
            else if (id === "hide-archived") props.onArchivedFilterPick("default");
            else if (id === "show-archived") props.onArchivedFilterPick("show");
            else if (id === "only-archived") props.onArchivedFilterPick("only");
            open.value = false;
          },
          align: "end",
          dense: true,
          listClassName: css.viewOptionsMenu!,
          portal: true,
        },
        {
          anchor: () =>
            h(
              Tooltip,
              { label: props.t("viewOptions.label"), side: "bottom", delayMs: 500, portal: true },
              {
                default: () => [
                  h(
                    "button",
                    {
                      type: "button",
                      class: clsx(css.iconButton, css.wide),
                      "aria-label": props.t("viewOptions.label"),
                      onClick: () => {
                        open.value = ((v) => !v)(open.value);
                      },
                    },
                    [h(IconSlidersTwoOutlineRegular, {})],
                  ),
                ],
              },
            ),
        },
      );
    };
  },
  {
    props: [
      "groupBy",
      "orderBy",
      "archivedFilter",
      "onGroupPick",
      "onOrderPick",
      "onArchivedFilterPick",
      "t",
    ],
  },
);
/** In-flight root-row drag: source identity plus the current insert marker. */
interface DragState {
  /** Workspace id, or {@link UNGROUPED_KEY} for the browser-local loose-session account. */
  accountKey: string;
  sessionId: SessionNode["id"];
  /** Source row was pinned at drag start; drop targets share the pinned block. */
  pinned: boolean;
  /** Row the marker sits on and which half (insert above/below it). */
  over: {
    id: SessionNode["id"];
    half: "before" | "after";
  } | null;
}
/** Apply a visible drop to the complete account without removing hidden members. */
function sessionDragOrder(
  order: readonly SessionId[],
  rows: readonly SessionNode[],
  drag: DragState,
  over: NonNullable<DragState["over"]>,
): SessionId[] | undefined {
  const source = rows.find((row) => row.id === drag.sessionId);
  const target = rows.find((row) => row.id === over.id);
  if (
    source === undefined ||
    target === undefined ||
    source.blank ||
    source.pinned !== drag.pinned ||
    target.pinned !== drag.pinned ||
    source.id === target.id ||
    !order.includes(source.id)
  )
    return;
  const section = rows.filter((row) => row.pinned === drag.pinned);
  const sourceIndex = section.findIndex((row) => row.id === source.id);
  const withoutSource = section.filter((row) => row.id !== source.id);
  const insertAt =
    withoutSource.findIndex((row) => row.id === target.id) + (over.half === "after" ? 1 : 0);
  if (insertAt === sourceIndex) return;
  const next = order.filter((id) => id !== source.id);
  const targetIndex = next.indexOf(target.id);
  if (targetIndex === -1) return;
  next.splice(targetIndex + (over.half === "after" ? 1 : 0), 0, source.id);
  return pinCurrentBlank(next, rows.find((row) => row.blank)?.id);
}
/** In-flight Workspace-row drag: source identity plus the current marker. */
interface WorkspaceDragState {
  workspaceId: WorkspaceId;
  over: {
    id: WorkspaceId;
    half: "before" | "after";
  } | null;
}
/** Resolve an insertion side across the Workspace header, descendants, and Sessions. */
function workspaceGroupHalf(e: {
  clientY: number;
  currentTarget: HTMLElement;
}): "before" | "after" {
  const rect = e.currentTarget.getBoundingClientRect();
  return e.clientY < rect.top + rect.height / 2 ? "before" : "after";
}
type SessionTreeProps = Pick<
  WorkspaceBrowserProps,
  | "useSessionStatus"
  | "startSession"
  | "open"
  | "renderFactorySlot"
  | "useContextMenuTarget"
  | "useContextMenu"
  | "insertWorkspaceBefore"
  | "t"
  | "usePanelInfo"
  | "useSessionAccess"
  | "useWorkspaceAccess"
> &
  PropsRenderSlots<
    | "sidebar.workspaces.session.row.action"
    | "sidebar.session.row.trailing"
    | "sidebar.session.row.leading"
    | "sidebar.session.row.hover"
  > & {
    shortcuts: readonly import("@deepseek-ai/dsh-client-shortcuts/client").ShortcutCatalogEntry[];
    /** Always-mounted Session list snapshot. */
    list: SessionListState;
    /** Host account home for POSIX hover-path abbreviation. */
    home?: string | undefined;
    /** Workspaces in Host group order with browser-projected Session order. */
    workspaces: readonly WorkspaceView[];
    /** Browser-projected order for Sessions outside every Workspace. */
    ungroupedSessionIds: readonly SessionId[];
    /** Whether the current Workspace stream has a complete Host baseline. */
    workspaceReady: boolean;
    /** Grouping, ordering, and filter changes replace the view without row motion. */
    animationResetKey: string;
    /** Nest Workspaces under their nearest registered ancestors. */
    nestWorkspaces: boolean;
    /** Explicit persisted group expansion, including descendants in tree mode. */
    groupExpansion: Readonly<Record<string, boolean>>;
    /** Persist one Workspace group's expansion. */
    setGroupExpanded: (key: string, expanded: boolean) => void;
    /** Save a drag order and select Manual. */
    setSessionOrder: (accountKey: string, order: readonly string[]) => void;
    /** Registry-global pin and archive sets plus the archived-visibility choice. */
    rowState: SessionRowState;
    /** Switch the archived filter back to the default hide-archived view. */
    onLeaveArchivedOnly: () => void;
    /** Open the rename dialog from a row title double-click. */
    onSessionRenameRequest: (sessionId: SessionNode["id"], currentTitle: string) => void;
    /** One Session chosen from search that must be exposed and scrolled into view. */
    revealSessionId?: SessionId | undefined;
    /** Acknowledge that the chosen Session row has been revealed. */
    onSessionRevealed: (sessionId: SessionId) => void;
  };
const EmptySessions = defineComponent(
  (props: Pick<SessionTreeProps, "rowState" | "onLeaveArchivedOnly" | "t">) => {
    const archivedOnly = computed(() => props.rowState.archivedFilter === "only");
    return () => {
      return h("div", { class: css.emptyState, "data-row-key": "empty" }, [
        archivedOnly.value
          ? h(IconArchiveOutlineRegular, { size: 24 })
          : h(IconQueueOutlineRegular, { size: 24 }),
        h("div", {}, [archivedOnly.value ? props.t("empty.noneArchived") : props.t("empty.none")]),
        archivedOnly.value &&
          h(
            "button",
            { type: "button", class: css.emptyAction, onClick: props.onLeaveArchivedOnly },
            [props.t("empty.viewOthers")],
          ),
      ]);
    };
  },
  { props: ["t", "rowState", "onLeaveArchivedOnly"] },
);
const SessionTree = defineComponent(
  (props: SessionTreeProps) => {
    const panelActive = props.usePanelInfo((info) => info.activePanelId !== null);
    const statuses = props.useSessionStatus((s) => s);
    const current = computed(() =>
      panelActive.value
        ? undefined
        : Object.values(props.list.byId).find((session) => (session.retainedBy.mainView ?? 0) > 0)
            ?.id,
    );
    const revealGroup = computed(() =>
      props.revealSessionId === undefined || !props.workspaceReady
        ? undefined
        : owningGroupKey(props.workspaces, props.revealSessionId),
    );
    // Per-group raised watermarks; an absent key means the base watermark.
    const storedWatermarks = shallowRef<Readonly<Record<string, number>>>({});
    const watermarkMotionKey = shallowRef(0);
    const drag = shallowRef<DragState | null>(null);
    const sessionDropCommitted = shallowRef(false);
    const workspaceDrag = shallowRef<WorkspaceDragState | null>(null);
    const workspaceDropCommitted = shallowRef(false);
    const nativeDragActive = computed(() => drag.value !== null || workspaceDrag.value !== null);
    useNativeDragAcceptance(() => nativeDragActive.value);
    const currentGroup = computed(() =>
      current.value === undefined || !props.workspaceReady
        ? undefined
        : owningGroupKey(props.workspaces, current.value),
    );
    watch(
      [
        () => current.value,
        () => currentGroup.value,
        () => props.setGroupExpanded,
        () => props.groupExpansion,
      ],
      (_value, _previous, onCleanup) => {
        const cleanup: void | (() => void) = (() => {
          if (
            current.value === undefined ||
            currentGroup.value === undefined ||
            Object.hasOwn(props.groupExpansion, currentGroup.value)
          )
            return;
          props.setGroupExpanded(currentGroup.value, true);
        })();
        if (typeof cleanup === "function") onCleanup(cleanup);
      },
      { immediate: true, flush: "post" },
    );
    const parents = computed(() => {
      if (!props.nestWorkspaces) return new Map<string, WorkspaceId | undefined>();
      const keysByPath = new Map(
        props.workspaces.map((workspace) => [workspace.path, workspace.workspaceId]),
      );
      const paths = [...keysByPath.keys()];
      return new Map<string, WorkspaceId | undefined>(
        props.workspaces.map((workspace) => {
          const path = owningParentFolder(workspace.path, paths);
          return [workspace.workspaceId, path === undefined ? undefined : keysByPath.get(path)];
        }),
      );
    });
    const currentAncestors = computed(() => {
      const keys = new Set<string>();
      for (
        let key =
          currentGroup.value === undefined ? undefined : parents.value.get(currentGroup.value);
        key !== undefined;
        key = parents.value.get(key)
      ) {
        keys.add(key);
      }
      return keys;
    });
    const expandedGroups = computed(() => {
      const ancestorKeys = new Set<string | undefined>(parents.value.values());
      return [...props.workspaces.map((workspace) => workspace.workspaceId), UNGROUPED_KEY].filter(
        (key) => props.groupExpansion[key] ?? ancestorKeys.has(key),
      );
    });
    const groups = computed(() =>
      deriveGroups(props.list, props.workspaces, props.rowState, statuses.value, {
        expandedGroups: expandedGroups.value,
        ungroupedOrder: props.ungroupedSessionIds,
      }),
    );
    watch(
      [
        () => props.groupExpansion,
        () => parents.value,
        () => revealGroup.value,
        () => props.setGroupExpanded,
      ],
      (_value, _previous, onCleanup) => {
        const cleanup: void | (() => void) = (() => {
          for (let key = revealGroup.value; key !== undefined; key = parents.value.get(key)) {
            if (
              props.groupExpansion[key] === false ||
              (key === revealGroup.value && props.groupExpansion[key] !== true)
            ) {
              props.setGroupExpanded(key, true);
            }
          }
        })();
        if (typeof cleanup === "function") onCleanup(cleanup);
      },
      { immediate: true, flush: "post" },
    );
    const baselines = computed(
      () =>
        new Map(
          groups.value.map((group) => [
            group.key,
            Math.max(
              SESSION_WATERMARK_BASE,
              requiredWatermark(
                group.sessions,
                current.value,
                group.key === revealGroup.value ? props.revealSessionId : undefined,
              ),
            ),
          ]),
        ),
    );
    const foldedKeys = computed(
      () => new Set(groups.value.filter((group) => !group.expanded).map((group) => group.key)),
    );
    const underFoldedAncestor = (key: string): boolean => {
      for (
        let owner = parents.value.get(key);
        owner !== undefined;
        owner = parents.value.get(owner)
      ) {
        if (foldedKeys.value.has(owner)) return true;
      }
      return false;
    };
    // A group hidden by a folded ancestor keeps its own expansion and rows but must not raise its watermark.
    const requiredWatermarks = computed(
      () => new Map([...baselines.value].filter(([key]) => !underFoldedAncestor(key))),
    );
    const sessionWatermarks = computed(() =>
      raiseWatermarks(storedWatermarks.value, requiredWatermarks.value),
    );
    // Raising during render keeps the watermark monotonic without committing a lower frame first.
    const dropWatermarks = (drop: (key: string) => boolean): void => {
      if (!Object.keys(storedWatermarks.value).some(drop)) return;
      storedWatermarks.value = ((marks) =>
        Object.fromEntries(Object.entries(marks).filter(([key]) => !drop(key))))(
        storedWatermarks.value,
      );
      watermarkMotionKey.value = ((key) => key + 1)(watermarkMotionKey.value);
    };
    const withinGroup = (key: string, root: string): boolean => {
      for (
        let owner: string | undefined = key;
        owner !== undefined;
        owner = parents.value.get(owner)
      ) {
        if (owner === root) return true;
      }
      return false;
    };
    const now = computed(() => Date.now());
    const commitSessionDrag = (
      activeDrag: DragState,
      over: NonNullable<DragState["over"]>,
    ): void => {
      if (sessionDropCommitted.value) return;
      sessionDropCommitted.value = true;
      drag.value = null;
      const group = groups.value.find((candidate) => candidate.key === activeDrag.accountKey);
      if (group === undefined) return;
      if (over.id === activeDrag.sessionId) return;
      const accountSessionIds =
        activeDrag.accountKey === UNGROUPED_KEY
          ? props.ungroupedSessionIds
          : props.workspaces.find((workspace) => workspace.workspaceId === activeDrag.accountKey)
              ?.sessionIds;
      if (accountSessionIds === undefined) return;
      const renderedSessions = watermarkRows(
        group.sessions,
        sessionWatermarks.value[group.key] ?? SESSION_WATERMARK_BASE,
      ).rows;
      const nextOrder = sessionDragOrder(accountSessionIds, renderedSessions, activeDrag, over);
      if (nextOrder !== undefined) props.setSessionOrder(activeDrag.accountKey, nextOrder);
    };
    const commitWorkspaceDrag = (
      activeDrag: WorkspaceDragState,
      over: NonNullable<WorkspaceDragState["over"]>,
    ): void => {
      if (workspaceDropCommitted.value) return;
      workspaceDropCommitted.value = true;
      workspaceDrag.value = null;
      const owner = parents.value.get(activeDrag.workspaceId);
      const siblings = props.workspaces.filter(
        (workspace) => parents.value.get(workspace.workspaceId) === owner,
      );
      const rowIndex = siblings.findIndex((workspace) => workspace.workspaceId === over.id);
      if (rowIndex === -1) return;
      const anchor = over.half === "before" ? over.id : siblings[rowIndex + 1]?.workspaceId;
      if (anchor === activeDrag.workspaceId) return;
      const sourceIndex = siblings.findIndex(
        (workspace) => workspace.workspaceId === activeDrag.workspaceId,
      );
      const anchorIndex =
        anchor === undefined
          ? siblings.length
          : siblings.findIndex((workspace) => workspace.workspaceId === anchor);
      if (sourceIndex !== -1 && (anchorIndex === sourceIndex || anchorIndex === sourceIndex + 1))
        return;
      props.insertWorkspaceBefore(activeDrag.workspaceId, anchor).catch((reason: unknown) => {
        console.warn("workspace reorder rejected:", reason);
      });
    };
    const childrenByParent = computed(() => {
      const rendered = new Set(groups.value.map((group) => group.key));
      const children = new Map<string | undefined, GroupNode[]>();
      for (const group of groups.value) {
        // The archived-only view drops empty groups, so an ancestor may be
        // absent; nest under the nearest rendered one.
        let parent = parents.value.get(group.key);
        while (parent !== undefined && !rendered.has(parent)) parent = parents.value.get(parent);
        const siblings = children.get(parent);
        if (siblings === undefined) children.set(parent, [group]);
        else siblings.push(group);
      }
      return children;
    });
    const rootGroups = computed(() => childrenByParent.value.get(undefined) ?? []);
    const workspaceDropAtListStart = computed(
      () =>
        rootGroups.value[0]?.workspaceId !== undefined &&
        workspaceDrag.value?.over?.id === rootGroups.value[0].workspaceId &&
        workspaceDrag.value.over.half === "before",
    );
    const rowKeys = computed<string[]>(() => (groups.value.length === 0 ? ["empty"] : []));
    const renderGroup = (group: GroupNode, depth: number): VNodeChild => {
      const workspaceId = group.workspaceId;
      const children = childrenByParent.value.get(group.key) ?? [];
      const compatibleDrag =
        workspaceDrag.value !== null &&
        parents.value.get(workspaceDrag.value.workspaceId) === parents.value.get(group.key);
      const watermark = sessionWatermarks.value[group.key] ?? SESSION_WATERMARK_BASE;
      const collapsed = watermarkRows(
        group.sessions,
        baselines.value.get(group.key) ?? SESSION_WATERMARK_BASE,
      );
      const visible = watermarkRows(group.sessions, watermark);
      const sessionsExpanded = visible.hiddenCount === 0;
      rowKeys.value.push(`workspace:${group.key}`);
      const childRows = group.expanded
        ? children.map((child) => renderGroup(child, depth + 1))
        : [];
      const sessions = visible.rows;
      for (const node of sessions) rowKeys.value.push(`session:${node.id}`);
      if (collapsed.hiddenCount > 0) rowKeys.value.push(`overflow:${group.key}`);
      const workspaceMarker =
        workspaceId !== undefined && workspaceDrag.value?.over?.id === workspaceId
          ? workspaceDrag.value.over.half
          : null;
      const workspaceDragProps =
        workspaceId === undefined
          ? undefined
          : {
              start: () => {
                workspaceDropCommitted.value = false;
                workspaceDrag.value = { workspaceId, over: null };
              },
              end: () => {
                if (workspaceDrag.value?.over !== null && workspaceDrag.value?.over !== undefined) {
                  commitWorkspaceDrag(workspaceDrag.value!, workspaceDrag.value.over);
                } else {
                  workspaceDrag.value = null;
                }
                workspaceDropCommitted.value = false;
              },
            };
      const hoverWorkspace =
        workspaceId === undefined || !compatibleDrag
          ? undefined
          : (half: "before" | "after") => {
              workspaceDrag.value = ((active) =>
                active === null ? active : { ...active, over: { id: workspaceId, half } })(
                workspaceDrag.value,
              );
            };
      const dropWorkspace =
        workspaceId === undefined || !compatibleDrag
          ? undefined
          : (half: "before" | "after") => {
              commitWorkspaceDrag(workspaceDrag.value!, { id: workspaceId, half });
            };
      return h(
        "div",
        {
          key: group.key,
          style: { "--dsh-workspace-indent": `${depth * 12}px` } as CSSProperties,
          class: clsx(
            css.groupSection,
            workspaceMarker === "before" && css.workspaceDropBefore,
            workspaceMarker === "after" && css.workspaceDropAfter,
          ),
          onDragover:
            workspaceDrag.value === null
              ? undefined
              : (
                  e: DragEvent & {
                    currentTarget: HTMLDivElement;
                  },
                ) => {
                  e.preventDefault();
                  if (hoverWorkspace === undefined && parents.value.get(group.key) !== undefined)
                    return;
                  e.stopPropagation();
                  if (hoverWorkspace === undefined) {
                    e.dataTransfer!.dropEffect = "none";
                    if (workspaceDrag.value !== null && workspaceDrag.value.over !== null)
                      workspaceDrag.value = { ...workspaceDrag.value, over: null };
                  } else {
                    e.dataTransfer!.dropEffect = "move";
                    hoverWorkspace(workspaceGroupHalf(e));
                  }
                },
          onDrop:
            workspaceDrag.value === null
              ? undefined
              : (
                  e: DragEvent & {
                    currentTarget: HTMLDivElement;
                  },
                ) => {
                  e.preventDefault();
                  if (dropWorkspace === undefined && parents.value.get(group.key) !== undefined)
                    return;
                  e.stopPropagation();
                  if (dropWorkspace === undefined) {
                    workspaceDropCommitted.value = true;
                    workspaceDrag.value = null;
                  } else {
                    dropWorkspace(workspaceGroupHalf(e));
                  }
                },
        },
        [
          h(ProjectRowItem, {
            newShortcut: props.shortcuts.find((row) => row.id === "session.new"),
            group: group,
            renderFactorySlot: props.renderFactorySlot,
            useContextMenu: props.useContextMenu,
            useContextMenuTarget: props.useContextMenuTarget,
            useWorkspaceAccess: props.useWorkspaceAccess,
            containsCurrentDescendant: currentAncestors.value.has(group.key),
            home: props.home,
            t: props.t,
            onToggle: () => {
              if (group.expanded) dropWatermarks((key) => withinGroup(key, group.key));
              props.setGroupExpanded(group.key, !group.expanded);
            },
            onCreate: (workspaceId) => {
              props.setGroupExpanded(group.key, true);
              props.startSession(workspaceId);
            },
            drag: workspaceDragProps,
          }),
          childRows.length > 0 && h("div", { role: "group" }, [childRows]),
          sessions.map((node) => {
            // Session drag never leaves its browser-local account, and pinned
            // rows reorder only within their leading pinned block.
            const sameGroupDrag = drag.value !== null && drag.value.accountKey === group.key;
            const compatibleTarget = sameGroupDrag && drag.value!.pinned === node.pinned;
            const normalizeHalf = (half: "before" | "after"): "before" | "after" =>
              node.blank ? "after" : half;
            const dragProps = {
              start: () => {
                sessionDropCommitted.value = false;
                drag.value = {
                  accountKey: group.key,
                  sessionId: node.id,
                  pinned: node.pinned,
                  over: null,
                };
              },
              active: compatibleTarget,
              marker:
                sameGroupDrag && drag.value?.over?.id === node.id ? drag.value!.over!.half : null,
              hover: (half: "before" | "after") => {
                /* v8 ignore next -- narrowing guard: Rows gates hover on `active`, which is false while the drag state is null. */
                drag.value = ((d) =>
                  d === null
                    ? d
                    : {
                        ...d,
                        over: { id: node.id, half: normalizeHalf(half) },
                      })(drag.value);
              },
              drop: (half: "before" | "after") => {
                /* v8 ignore next -- narrowing guard: Rows gates drop on `active`, which is false while the drag state is null. */
                if (drag.value === null) return;
                commitSessionDrag(drag.value, { id: node.id, half: normalizeHalf(half) });
              },
              end: () => {
                if (drag.value?.over !== null && drag.value?.over !== undefined)
                  commitSessionDrag(drag.value, drag.value.over);
                else drag.value = null;
                sessionDropCommitted.value = false;
              },
            };
            return h(SessionNodeItem, {
              key: node.id,
              node: node,
              currentId: current.value,
              now: now.value,
              onOpen: props.open,
              onRenameRequest: props.onSessionRenameRequest,
              renderSlot: props.renderSlot,
              renderFactorySlot: props.renderFactorySlot,
              useContextMenu: props.useContextMenu,
              useContextMenuTarget: props.useContextMenuTarget,
              onReveal:
                node.id === props.revealSessionId && group.key === revealGroup.value
                  ? () => {
                      props.onSessionRevealed(node.id);
                    }
                  : undefined,
              drag: dragProps,
              home: props.home,
              useSessionAccess: props.useSessionAccess,
              t: props.t,
            });
          }),
          collapsed.hiddenCount > 0 &&
            h(
              "button",
              {
                type: "button",
                class: css.sessionOverflowButton,
                "data-row-key": `overflow:${group.key}`,
                "aria-expanded": sessionsExpanded,
                onClick: () => {
                  if (sessionsExpanded) {
                    dropWatermarks((key) => key === group.key);
                    return;
                  }
                  storedWatermarks.value = ((marks) => ({
                    ...marks,
                    [group.key]:
                      visible.hiddenCount <= SESSION_WATERMARK_BASE
                        ? Infinity
                        : watermark + SESSION_WATERMARK_BASE,
                  }))(storedWatermarks.value);
                  watermarkMotionKey.value = ((key) => key + 1)(watermarkMotionKey.value);
                },
              },
              [
                sessionsExpanded
                  ? props.t("sessions.collapse")
                  : props.t("sessions.expand", { n: visible.hiddenCount }),
              ],
            ),
        ],
      );
    };
    const groupRows = computed(() => rootGroups.value.map((group) => renderGroup(group, 0)));
    return () => {
      // Raising during render keeps the watermark monotonic without committing a lower frame first.
      if (sessionWatermarks.value !== storedWatermarks.value)
        storedWatermarks.value = ((marks) => raiseWatermarks(marks, requiredWatermarks.value))(
          storedWatermarks.value,
        );
      return h(
        HoverCardGroup,
        { className: clsx(css.treeBody, css.wide) },
        {
          default: () => [
            workspaceDropAtListStart.value &&
              h("span", { class: css.listTopDropIndicator, "aria-hidden": "true" }),
            h(
              AnimatedRows,
              {
                className: clsx(css.list, workspaceDropAtListStart.value && css.listTopDropActive),
                role: "tree",
                label: props.t("section.sessions"),
                rowKeys: rowKeys.value,
                ready:
                  props.list.phase === "ready" && props.workspaceReady && !nativeDragActive.value,
                resetKey: JSON.stringify([props.animationResetKey, watermarkMotionKey.value]),
              },
              {
                default: () => [
                  groups.value.length === 0 &&
                    h(EmptySessions, {
                      rowState: props.rowState,
                      onLeaveArchivedOnly: props.onLeaveArchivedOnly,
                      t: props.t,
                    }),
                  groupRows.value,
                ],
              },
            ),
          ],
        },
      );
    };
  },
  {
    props: [
      "startSession",
      "open",
      "insertWorkspaceBefore",
      "useWorkspaceAccess",
      "renderFactorySlot",
      "useContextMenuTarget",
      "useContextMenu",
      "t",
      "useSessionAccess",
      "useSessionStatus",
      "usePanelInfo",
      "renderSlot",
      "__renders",
      "shortcuts",
      "list",
      "home",
      "workspaces",
      "ungroupedSessionIds",
      "workspaceReady",
      "animationResetKey",
      "nestWorkspaces",
      "groupExpansion",
      "setGroupExpanded",
      "setSessionOrder",
      "rowState",
      "onLeaveArchivedOnly",
      "onSessionRenameRequest",
      "revealSessionId",
      "onSessionRevealed",
    ],
  },
);
const FlatList = defineComponent(
  (
    props: Pick<
      SessionTreeProps,
      | "useSessionStatus"
      | "useSessionAccess"
      | "open"
      | "onSessionRenameRequest"
      | "renderSlot"
      | "renderFactorySlot"
      | "useContextMenuTarget"
      | "useContextMenu"
      | "usePanelInfo"
      | "setSessionOrder"
      | "workspaceReady"
      | "animationResetKey"
      | "revealSessionId"
      | "onSessionRevealed"
      | "rowState"
      | "onLeaveArchivedOnly"
      | "home"
      | "t"
    > & {
      list: SessionListState;
      sessionIds: readonly SessionId[];
    },
  ) => {
    const panelActive = props.usePanelInfo((info) => info.activePanelId !== null);
    const statuses = props.useSessionStatus((s) => s);
    const rows = computed(() =>
      deriveFlat(props.list, props.sessionIds, props.rowState, statuses.value),
    );
    const drag = shallowRef<DragState | null>(null);
    const dropCommitted = shallowRef(false);
    useNativeDragAcceptance(() => drag.value !== null);
    const currentId = computed(() =>
      panelActive.value
        ? undefined
        : Object.values(props.list.byId).find((session) => (session.retainedBy.mainView ?? 0) > 0)
            ?.id,
    );
    const commitDrag = (activeDrag: DragState, over: NonNullable<DragState["over"]>): void => {
      if (dropCommitted.value) return;
      dropCommitted.value = true;
      drag.value = null;
      const nextOrder = sessionDragOrder(props.sessionIds, rows.value, activeDrag, over);
      if (nextOrder !== undefined) props.setSessionOrder(FLAT_SESSION_ORDER_KEY, nextOrder);
    };
    const now = computed(() => Date.now());
    return () => {
      return h(
        HoverCardGroup,
        { className: clsx(css.treeBody, css.wide) },
        {
          default: () => [
            h(
              AnimatedRows,
              {
                className: clsx(css.list, css.flatList),
                role: "tree",
                label: props.t("section.sessions"),
                rowKeys:
                  rows.value.length === 0
                    ? ["empty"]
                    : rows.value.map((row) => `session:${row.id}`),
                ready: props.list.phase === "ready" && props.workspaceReady && drag.value === null,
                resetKey: props.animationResetKey,
              },
              {
                default: () => [
                  rows.value.length === 0 &&
                    h(EmptySessions, {
                      rowState: props.rowState,
                      onLeaveArchivedOnly: props.onLeaveArchivedOnly,
                      t: props.t,
                    }),
                  rows.value.map((node) => {
                    const active = drag.value !== null && drag.value.pinned === node.pinned;
                    const normalizeHalf = (half: "before" | "after"): "before" | "after" =>
                      node.blank ? "after" : half;
                    return h(SessionNodeItem, {
                      key: node.id,
                      node: node,
                      currentId: currentId.value,
                      now: now.value,
                      onOpen: props.open,
                      onRenameRequest: props.onSessionRenameRequest,
                      renderSlot: props.renderSlot,
                      renderFactorySlot: props.renderFactorySlot,
                      useContextMenu: props.useContextMenu,
                      useContextMenuTarget: props.useContextMenuTarget,
                      onReveal:
                        node.id === props.revealSessionId
                          ? () => {
                              props.onSessionRevealed(node.id);
                            }
                          : undefined,
                      useSessionAccess: props.useSessionAccess,
                      drag: {
                        start: () => {
                          dropCommitted.value = false;
                          drag.value = {
                            accountKey: FLAT_SESSION_ORDER_KEY,
                            sessionId: node.id,
                            pinned: node.pinned,
                            over: null,
                          };
                        },
                        active,
                        marker:
                          active && drag.value!.over?.id === node.id
                            ? drag.value!.over!.half
                            : null,
                        hover: (half) => {
                          drag.value = ((current) =>
                            current === null
                              ? current
                              : {
                                  ...current,
                                  over: { id: node.id, half: normalizeHalf(half) },
                                })(drag.value);
                        },
                        drop: (half) => {
                          if (drag.value !== null)
                            commitDrag(drag.value, { id: node.id, half: normalizeHalf(half) });
                        },
                        end: () => {
                          if (drag.value?.over !== null && drag.value?.over !== undefined)
                            commitDrag(drag.value, drag.value.over);
                          else drag.value = null;
                          dropCommitted.value = false;
                        },
                      },
                      home: props.home,
                      t: props.t,
                    });
                  }),
                ],
              },
            ),
          ],
        },
      );
    };
  },
  {
    props: [
      "setSessionOrder",
      "open",
      "renderFactorySlot",
      "useContextMenuTarget",
      "useContextMenu",
      "home",
      "t",
      "useSessionAccess",
      "useSessionStatus",
      "usePanelInfo",
      "rowState",
      "onLeaveArchivedOnly",
      "onSessionRenameRequest",
      "renderSlot",
      "workspaceReady",
      "animationResetKey",
      "revealSessionId",
      "onSessionRevealed",
      "list",
      "sessionIds",
    ],
  },
);
interface RemoteSearchState {
  query: string;
  status: "idle" | "loading" | "ready" | "error";
  items: readonly SessionSearchResultItem[];
  hasMore: boolean;
}
const SearchResults = defineComponent(
  (
    props: Pick<
      WorkspaceBrowserProps,
      "useSessions" | "useSessionStatus" | "open" | "t" | "usePanelInfo" | "useSessionAccess"
    > & {
      workspaces: readonly WorkspaceView[];
      archivedSessionIds: readonly SessionNode["id"][];
      /** Search matches follow the archived filter selected for the list. */
      archivedFilter: ArchivedFilter;
      /** Unarchive an archived result row in place. */
      onUnarchive: (id: SessionNode["id"]) => void;
      query: string;
      remote: RemoteSearchState;
      resultLimit: number;
    },
  ) => {
    const panelActive = props.usePanelInfo((info) => info.activePanelId !== null);
    const list = props.useSessions((s) => s);
    const statuses = props.useSessionStatus((s) => s);
    const currentRemote = computed(() =>
      props.remote.query === props.query
        ? props.remote
        : { query: props.query, status: "loading" as const, items: [], hasMore: false },
    );
    // The Session list republishes while replies run; each republish updates the
    // previous index so unchanged titles, labels, and ids keep their preparation.
    let previousIndex: ReturnType<typeof sessionSearchIndex> | undefined;
    const index = computed(() => {
      previousIndex = sessionSearchIndex(
        list.value,
        props.workspaces,
        props.archivedSessionIds,
        props.archivedFilter,
        previousIndex,
      );
      return previousIndex;
    });
    const results = computed(() =>
      deriveSearchResults(
        list.value,
        props.workspaces,
        props.query,
        props.archivedSessionIds,
        props.archivedFilter,
        statuses.value,
        currentRemote.value,
        props.resultLimit,
        index.value,
      ),
    );
    const pending = computed(() => currentRemote.value.status === "loading");
    const currentId = computed(() =>
      panelActive.value
        ? undefined
        : Object.values(list.value.byId).find((session) => (session.retainedBy.mainView ?? 0) > 0)
            ?.id,
    );
    return () => {
      return h("div", { class: clsx(css.treeBody, css.wide) }, [
        h("div", { class: css.list }, [
          h(
            "div",
            { class: css.searchTree, role: "tree", "aria-label": props.t("search.results.aria") },
            [
              results.value.items.map((result) =>
                h(SearchResultItem, {
                  key: result.id,
                  result: result,
                  currentId: currentId.value,
                  onOpen: props.open,
                  onUnarchive: props.onUnarchive,
                  useSessionAccess: props.useSessionAccess,
                  t: props.t,
                }),
              ),
            ],
          ),
          pending.value &&
            h("div", { role: "status", "aria-label": props.t("search.pending") }, [
              (results.value.items.length === 0 ? [0, 1] : [0]).map((i) =>
                h("div", { key: i, class: css.skeletonRow, "aria-hidden": "true" }, [
                  h("span", { class: css.skeletonDot }),
                  h("span", { class: css.skeletonBars }, [
                    h("span", { class: css.skeletonBar }),
                    h("span", { class: clsx(css.skeletonBar, css.skeletonBarWide) }),
                  ]),
                ]),
              ),
            ]),
          !pending.value &&
            results.value.items.length === 0 &&
            h("div", { class: css.empty }, [props.t("search.noMatches")]),
          results.value.hasMore &&
            h("div", { class: css.searchStatus }, [
              props.t("search.hasMore", { n: props.resultLimit }),
            ]),
        ]),
      ]);
    };
  },
  {
    props: [
      "open",
      "t",
      "useSessionAccess",
      "useSessionStatus",
      "usePanelInfo",
      "useSessions",
      "workspaces",
      "archivedSessionIds",
      "archivedFilter",
      "onUnarchive",
      "query",
      "remote",
      "resultLimit",
    ],
  },
);
/**
 * Render the browsing region.
 * @param props - composed slot props (shell owner share + store + injected actions).
 * @returns the region element tree.
 */
export const WorkspaceBrowser = defineComponent(
  (props: WorkspaceBrowserProps) => {
    const home = props.useHostInfo((info) => info.home);
    const shortcuts = props.useShortcuts((rows) => rows);
    const searchShortcut = computed(() =>
      shortcuts.value.find((row) => row.id === "session.search"),
    );
    const addShortcut = computed(() => shortcuts.value.find((row) => row.id === "workspace.add"));
    const shortcutState = props.useWorkspaceShortcuts((state) => state);
    // Ordering remains live while the rail or search replaces the list body.
    const list = props.useSessions((state) => state);
    const storedWorkspaces = props.useWorkspaces((state) => state.items);
    // The resolved name, not `t`, is the memo dependency: the bound seat keeps
    // its identity across a language switch.
    const defaultWorkspaceName = computed(() => props.t("workspace.defaultName"));
    const workspaces = computed(() =>
      storedWorkspaces.value.map((workspace) => ({
        ...workspace,
        title: workspaceDisplayTitle(workspace.title, defaultWorkspaceName.value),
      })),
    );
    const workspacePhase = props.useWorkspaces((state) => state.phase);
    const workspaceStreamState = props.useWorkspaces((state) => state.state);
    const archivedSessionIds = props.useWorkspaces((state) => state.archivedSessionIds);
    const pinnedSessionIds = props.useWorkspaces((state) => state.pinnedSessionIds);
    // Live occupancy of this surface's directory-flow hole (the same source the
    // flow reads): a composition without a picking affordance can add nothing.
    const directoryFlowAvailable = props.useDirectoryFlow((occupied) => occupied);
    const groupBy = props.useStore((s) => s.groupBy);
    const orderBy = props.useStore((s) => s.orderBy);
    // Persisted view blobs written before the archived filter existed rehydrate
    // without the field; they read as the default hide-archived view.
    const archivedFilter = props.useStore((s) => s.archivedFilter ?? "default");
    const groupExpansion = props.useStore((s) => s.groupExpansion);
    const sessionOrderByAccount = props.useStore((s) => s.sessionOrderByAccount);
    // Archived sessions are not openable: the row stays visible under the
    // filter but a click explains instead of navigating.
    const guardedOpen = (sessionId: SessionId): void => {
      if (archivedSessionIds.value.includes(sessionId)) {
        props.notifyArchivedNotOpenable();
        return;
      }
      props.open(sessionId);
    };
    const leaveArchivedOnly = (): void => {
      props.actions.setArchivedFilter("default");
    };
    const workspaceReady = computed(
      () => workspacePhase.value === "ready" && workspaceStreamState.value !== "loading",
    );
    const mainSessionId = computed(
      () =>
        Object.values(list.value.byId).find((session) => (session.retainedBy.mainView ?? 0) > 0)
          ?.id,
    );
    const currentBlank = computed(() =>
      mainSessionId.value !== undefined && list.value.byId[mainSessionId.value]?.blank === true
        ? mainSessionId.value
        : undefined,
    );
    const ungroupedMemberIds = computed(() => {
      const accounted = new Set(workspaces.value.flatMap((workspace) => workspace.sessionIds));
      return list.value.ids.filter((id) => list.value.byId[id] !== undefined && !accounted.has(id));
    });
    const orderState = computed(() => ({
      pinnedSessionIds: pinnedSessionIds.value,
      archivedSessionIds: archivedSessionIds.value,
    }));
    const rowState = computed<SessionRowState>(() => ({
      ...orderState.value,
      archivedFilter: archivedFilter.value,
    }));
    const flatMemberIds = computed(() => sessionMemberIds(list.value));
    const orderedWorkspaces = computed(() =>
      workspaces.value.map((workspace) => {
        const memberIds = workspace.sessionIds;
        const baseOrder =
          orderBy.value === "updated"
            ? orderByRecency(memberIds, list.value.byId)
            : reconcileManualOrder(
                memberIds,
                sessionOrderByAccount.value[workspace.workspaceId],
                list.value.byId,
                orderState.value,
              );
        return {
          ...workspace,
          sessionIds: pinCurrentBlank(
            baseOrder,
            currentBlank.value !== undefined && memberIds.includes(currentBlank.value)
              ? currentBlank.value
              : undefined,
          ),
        };
      }),
    );
    const orderedUngroupedSessionIds = computed(() => {
      const baseOrder =
        orderBy.value === "updated"
          ? orderByRecency(ungroupedMemberIds.value, list.value.byId)
          : reconcileManualOrder(
              ungroupedMemberIds.value,
              sessionOrderByAccount.value[UNGROUPED_KEY],
              list.value.byId,
              orderState.value,
            );
      return pinCurrentBlank(
        baseOrder,
        currentBlank.value !== undefined && ungroupedMemberIds.value.includes(currentBlank.value)
          ? currentBlank.value
          : undefined,
      );
    });
    const orderedFlatSessionIds = computed(() => {
      const baseOrder =
        orderBy.value === "updated"
          ? orderByRecency(flatMemberIds.value, list.value.byId)
          : reconcileManualOrder(
              flatMemberIds.value,
              sessionOrderByAccount.value[FLAT_SESSION_ORDER_KEY],
              list.value.byId,
              orderState.value,
            );
      return pinCurrentBlank(
        baseOrder,
        currentBlank.value !== undefined && flatMemberIds.value.includes(currentBlank.value)
          ? currentBlank.value
          : undefined,
      );
    });
    const activeSessionOrders = computed<Readonly<Record<string, readonly SessionId[]>>>(() =>
      Object.fromEntries([
        ...orderedWorkspaces.value.map(
          (workspace) => [workspace.workspaceId, workspace.sessionIds] as const,
        ),
        [UNGROUPED_KEY, orderedUngroupedSessionIds.value] as const,
        [FLAT_SESSION_ORDER_KEY, orderedFlatSessionIds.value] as const,
      ]),
    );
    watch(
      [() => props.actions.retainAccountKeys, () => workspacePhase.value, () => workspaces.value],
      (_value, _previous, onCleanup) => {
        const cleanup: void | (() => void) = (() => {
          if (workspacePhase.value !== "ready") return;
          props.actions.retainAccountKeys([
            UNGROUPED_KEY,
            FLAT_SESSION_ORDER_KEY,
            ...workspaces.value.map((workspace) => workspace.workspaceId),
          ]);
        })();
        if (typeof cleanup === "function") onCleanup(cleanup);
      },
      { immediate: true, flush: "post" },
    );
    watch(
      [
        () => props.actions.syncSessionOrders,
        () => activeSessionOrders.value,
        () => currentBlank.value,
        () => list.value.phase,
        () => orderBy.value,
        () => sessionOrderByAccount.value,
        () => workspacePhase.value,
        () => workspaceReady.value,
      ],
      (_value, _previous, onCleanup) => {
        const cleanup: void | (() => void) = (() => {
          if (
            list.value.phase !== "ready" ||
            workspaceReady.value ||
            orderBy.value !== "manual" ||
            currentBlank.value === undefined
          )
            return;
          // A first prompt can end blank pinning before the Workspace baseline arrives.
          // Preserve saved members until that baseline can establish departures.
          const changed: Record<string, readonly string[]> = {};
          for (const [key, ids] of Object.entries(activeSessionOrders.value)) {
            if (key !== FLAT_SESSION_ORDER_KEY && workspacePhase.value !== "ready") continue;
            const saved = sessionOrderByAccount.value[key] ?? [];
            if (ids[0] !== currentBlank.value || saved[0] === currentBlank.value) continue;
            changed[key] = [currentBlank.value, ...saved.filter((id) => id !== currentBlank.value)];
          }
          if (Object.keys(changed).length > 0) props.actions.syncSessionOrders(changed);
        })();
        if (typeof cleanup === "function") onCleanup(cleanup);
      },
      { immediate: true, flush: "post" },
    );
    watch(
      [
        () => props.actions.syncSessionOrders,
        () => activeSessionOrders.value,
        () => currentBlank.value,
        () => list.value.phase,
        () => orderBy.value,
        () => sessionOrderByAccount.value,
        () => workspaceReady.value,
      ],
      (_value, _previous, onCleanup) => {
        const cleanup: void | (() => void) = (() => {
          if (
            list.value.phase !== "ready" ||
            !workspaceReady.value ||
            orderBy.value !== "manual" ||
            currentBlank.value === undefined
          )
            return;
          const moved = Object.entries(activeSessionOrders.value).some(
            ([key, ids]) =>
              ids[0] === currentBlank.value &&
              sessionOrderByAccount.value[key]?.[0] !== currentBlank.value,
          );
          if (moved) props.actions.syncSessionOrders(activeSessionOrders.value);
        })();
        if (typeof cleanup === "function") onCleanup(cleanup);
      },
      { immediate: true, flush: "post" },
    );
    const saveSessionOrder = (accountKey: string, order: readonly string[]): void => {
      props.actions.setSessionOrder(accountKey, order, activeSessionOrders.value);
    };
    // The query outlives the tree and the input (both wide-only) so collapsing
    // does not silently drop an in-progress filter.
    const query = shallowRef("");
    const searchExpanded = shallowRef(false);
    const searchSpacingMotionEnabled = shallowRef(false);
    const searchOnExpand = shallowRef(false);
    const lastSearchRequest = shallowRef(0);
    const changeSearchExpanded = (expanded: boolean): void => {
      searchSpacingMotionEnabled.value = props.wide;
      searchExpanded.value = expanded;
    };
    const revealSessionId = shallowRef<SessionId | undefined>(undefined);
    const normalizedQuery = computed(() => sanitizeSearchQuery(query.value).trim());
    const remoteSearch = shallowRef<RemoteSearchState>({
      query: "",
      status: "idle",
      items: [],
      hasMore: false,
    });
    const searchRoot = shallowRef<HTMLDivElement | null>(null);
    const searchInput = shallowRef<HTMLInputElement | null>(null);
    // The list area is this section's own vertical scroller; the sidebar hands wheel
    // scrolling over its viewport to it once the navigation has moved away.
    const sectionScroller = props.useSectionScroller();
    const focusSearch = () => {
      searchInput.value?.focus({ preventScroll: true });
    };
    // Section-header ＋ opens the picker menu (same popover in wide and rail
    // states; the menu anchors on this button).
    const wsPickerOpen = computed(() => shortcutState.value.addRequested);
    const wsPlusRef = shallowRef<HTMLButtonElement | null>(null);
    const workspaceActionRequest = props.useWorkspaceActionRequest((value) => value);
    const openSearchResult = (sessionId: SessionId): void => {
      if (archivedSessionIds.value.includes(sessionId)) {
        props.notifyArchivedNotOpenable();
        return;
      }
      revealSessionId.value = sessionId;
      query.value = "";
      changeSearchExpanded(false);
      props.open(sessionId);
    };
    const acknowledgeSessionReveal = (sessionId: SessionId): void => {
      revealSessionId.value = ((current) => (current === sessionId ? undefined : current))(
        revealSessionId.value,
      );
    };
    watch(
      [() => normalizedQuery.value],
      (_value, _previous, onCleanup) => {
        const cleanup: void | (() => void) = (() => {
          if (normalizedQuery.value !== "") revealSessionId.value = undefined;
        })();
        if (typeof cleanup === "function") onCleanup(cleanup);
      },
      { immediate: true, flush: "post" },
    );
    // Rail search = expand + land in the search box: the flag arms before the
    // expand request; once the shell flips wide the input mounts and takes focus.
    watch(
      [() => props.wide, () => searchOnExpand.value, () => focusSearch],
      (_value, _previous, onCleanup) => {
        const cleanup: void | (() => void) = (() => {
          if (props.wide && searchOnExpand.value) {
            const timer = window.setTimeout(() => {
              focusSearch();
              searchOnExpand.value = false;
            }, EXPAND_SLIDE_MS);
            return () => {
              window.clearTimeout(timer);
            };
          }
        })();
        if (typeof cleanup === "function") onCleanup(cleanup);
      },
      { immediate: true, flush: "post" },
    );
    watch(
      [() => shortcutState.value.searchRequest, () => focusSearch],
      (_value, _previous, onCleanup) => {
        const cleanup: void | (() => void) = (() => {
          if (shortcutState.value.searchRequest === 0) return;
          props.closeAddWorkspace();
          if (!props.wide || searchInput.value?.closest("[inert]")) {
            searchOnExpand.value = true;
            props.expandSidebar();
          } else focusSearch();
        })();
        if (typeof cleanup === "function") onCleanup(cleanup);
      },
      { immediate: true, flush: "post" },
    );
    watch(
      [() => props.wide, () => searchExpanded.value, () => searchOnExpand.value, () => focusSearch],
      (_value, _previous, onCleanup) => {
        const cleanup: void | (() => void) = (() => {
          if (!props.wide || !searchExpanded.value || searchOnExpand.value) return;
          focusSearch();
        })();
        if (typeof cleanup === "function") onCleanup(cleanup);
      },
      { immediate: true, flush: "post" },
    );
    // Outside-click dismissal stays off while the rail gesture is in flight
    // (searchOnExpand): the rail click flips the shell wide and mounts this
    // listener during its own dispatch, then keeps bubbling to document with
    // the now-unmounted rail button as its target — outside searchRoot, so the
    // listener would dismiss the search that click just opened.
    watch(
      [
        () => normalizedQuery.value,
        () => props.wide,
        () => searchExpanded.value,
        () => searchOnExpand.value,
      ],
      (_value, _previous, onCleanup) => {
        const cleanup: void | (() => void) = (() => {
          if (!props.wide || !searchExpanded.value || searchOnExpand.value) return;
          const onClick = (event: MouseEvent): void => {
            if (
              !(event.target instanceof Node) ||
              searchRoot.value?.contains(event.target) === true
            )
              return;
            searchInput.value?.blur();
            if (normalizedQuery.value !== "") return;
            changeSearchExpanded(false);
          };
          document.addEventListener("click", onClick);
          return () => {
            document.removeEventListener("click", onClick);
          };
        })();
        if (typeof cleanup === "function") onCleanup(cleanup);
      },
      { immediate: true, flush: "post" },
    );
    watch(
      [() => normalizedQuery.value, () => props.searchSessions],
      (_value, _previous, onCleanup) => {
        const cleanup: void | (() => void) = (() => {
          if (normalizedQuery.value === "") {
            remoteSearch.value = { query: "", status: "idle", items: [], hasMore: false };
            return;
          }
          const controller = new AbortController();
          remoteSearch.value = {
            query: normalizedQuery.value,
            status: "loading",
            items: [],
            hasMore: false,
          };
          const timer = window.setTimeout(() => {
            props
              .searchSessions(normalizedQuery.value, controller.signal)
              .then((result) => {
                if (controller.signal.aborted) return;
                remoteSearch.value = {
                  query: normalizedQuery.value,
                  status: "ready",
                  items: result.items,
                  hasMore: result.hasMore,
                };
              })
              .catch(() => {
                if (controller.signal.aborted) return;
                remoteSearch.value = {
                  query: normalizedQuery.value,
                  status: "error",
                  items: [],
                  hasMore: false,
                };
              });
          }, SEARCH_DEBOUNCE_MS);
          return () => {
            window.clearTimeout(timer);
            controller.abort();
          };
        })();
        if (typeof cleanup === "function") onCleanup(cleanup);
      },
      { immediate: true, flush: "post" },
    );
    const onSessionUnarchive = (sessionId: SessionNode["id"]) => {
      props.unarchiveSession(sessionId).catch((reason: unknown) => {
        console.warn("session unarchive rejected:", reason);
      });
    };
    return () => {
      // Search state must commit before the effect expands the shell's external store.
      if (lastSearchRequest.value !== shortcutState.value.searchRequest) {
        lastSearchRequest.value = shortcutState.value.searchRequest;
        if (shortcutState.value.searchRequest !== 0) {
          searchExpanded.value = true;
          searchSpacingMotionEnabled.value = props.wide;
          if (!props.wide) searchOnExpand.value = true;
        }
      }
      // Search gestures animate spacing; entering wide layout from the rail lands at its final geometry.
      if (!props.wide && searchSpacingMotionEnabled.value) searchSpacingMotionEnabled.value = false;
      // The ref's release belongs to the owner selected for this VNode. Its
      // contextual source may already be withdrawn when Vue calls ref(null).
      const bindScrollerRef = props.wide ? sectionScroller.value.bindScrollerRef : undefined;
      return h("div", { class: clsx(css.root, !props.wide && css.rail) }, [
        h(
          "div",
          {
            class: clsx(
              css.sectionHeader,
              props.wide && searchSpacingMotionEnabled.value && css.searchSpacingMotion,
            ),
            "data-sidebar-workspace-header": "",
          },
          [
            props.wide &&
              h(
                "span",
                {
                  class: clsx(
                    css.sectionLabel,
                    css.wide,
                    searchExpanded.value && css.sectionLabelHidden,
                  ),
                },
                [
                  groupBy.value === "flat"
                    ? props.t("section.sessions")
                    : props.t("section.workspaces"),
                ],
              ),
            props.wide &&
              h(
                "div",
                { class: clsx(css.searchSlot, searchExpanded.value && css.searchSlotExpanded) },
                [
                  h(
                    "div",
                    {
                      ref: searchRoot,
                      class: clsx(css.search, searchExpanded.value && css.searchExpanded),
                      onClick: () => {
                        props.closeAddWorkspace();
                        changeSearchExpanded(true);
                        focusSearch();
                      },
                    },
                    [
                      h(
                        Tooltip,
                        {
                          label: props.t("search"),
                          ...(searchShortcut.value?.keys === undefined
                            ? {}
                            : { shortcutKeys: searchShortcut.value?.keys }),
                          side: "bottom",
                          delayMs: 500,
                          disabled: searchExpanded.value,
                          portal: true,
                        },
                        {
                          default: () => [
                            h(
                              "button",
                              {
                                type: "button",
                                class: css.searchButton,
                                "aria-label": props.t("search.sessions.aria"),
                                "aria-keyshortcuts": searchShortcut.value?.aria,
                                "aria-expanded": searchExpanded.value,
                                onClick: () => {
                                  props.requestSearch();
                                },
                              },
                              [
                                h(IconSearchOutlineRegular, {
                                  size: searchExpanded.value ? 11 : 14,
                                }),
                              ],
                            ),
                          ],
                        },
                      ),
                      h("input", {
                        ref: searchInput,
                        class: css.searchInput,
                        type: "text",
                        placeholder: props.t("search.placeholder"),
                        maxLength: SEARCH_QUERY_MAX_CODE_UNITS,
                        value: query.value,
                        tabindex: searchExpanded.value ? 0 : -1,
                        onInput: (e) => {
                          query.value = sanitizeSearchQuery(
                            (e.currentTarget as HTMLInputElement).value,
                          );
                        },
                        onKeydown: (e) => {
                          if (e.key !== "Escape") return;
                          query.value = "";
                          changeSearchExpanded(false);
                        },
                      }),
                      searchExpanded.value &&
                        h(
                          "button",
                          {
                            type: "button",
                            class: css.clearButton,
                            "aria-label": props.t("search.clear"),
                            onClick: (e) => {
                              e.stopPropagation();
                              query.value = "";
                              changeSearchExpanded(false);
                            },
                          },
                          [h(IconCloseFillRegular, {})],
                        ),
                    ],
                  ),
                ],
              ),
            h(
              "div",
              {
                class: clsx(
                  css.headerActions,
                  props.wide && searchExpanded.value && css.headerActionsHidden,
                ),
              },
              [
                props.wide &&
                  h(ViewOptionsMenu, {
                    groupBy: groupBy.value,
                    orderBy: orderBy.value,
                    archivedFilter: archivedFilter.value,
                    onGroupPick: props.actions.setGroupBy,
                    onOrderPick: (mode) => {
                      props.actions.setOrderBy(mode, activeSessionOrders.value);
                    },
                    onArchivedFilterPick: props.actions.setArchivedFilter,
                    t: props.t,
                  }),
                directoryFlowAvailable.value &&
                  h(
                    Tooltip,
                    {
                      label: props.t("workspace.add"),
                      ...(addShortcut.value?.keys === undefined
                        ? {}
                        : { shortcutKeys: addShortcut.value?.keys }),
                      side: "bottom",
                      delayMs: 500,
                      portal: true,
                    },
                    {
                      default: () => [
                        h(
                          "button",
                          {
                            ref: wsPlusRef,
                            type: "button",
                            class: css.iconButton,
                            "aria-label": props.t("workspace.add"),
                            "aria-keyshortcuts": addShortcut.value?.aria,
                            onClick: () => {
                              props.requestAddWorkspace();
                            },
                          },
                          [h(IconProjectAddOutlineRegular, { size: props.wide ? 16 : 18 })],
                        ),
                      ],
                    },
                  ),
              ],
            ),
            h(WorkspacePickFlow, {
              t: props.t,
              open: wsPickerOpen.value,
              anchorRef: wsPlusRef,
              useWorkspaces: props.useWorkspaces,
              createWorkspace: props.createWorkspace,
              useDirectoryFlow: props.useDirectoryFlow,
              renderDirectoryFlow: (owner) =>
                props.renderSlot("sidebar.workspaces.directoryFlow", owner),
              addOnly: true,
              onBusyChange: props.setDirectoryBusy,
              side: "right",
              onPick: (workspaceId) => {
                props.closeAddWorkspace();
                props.startSession(workspaceId, { clearPreviousDraft: false });
              },
              onClose: () => {
                props.closeAddWorkspace();
              },
            }),
          ],
        ),
        !props.wide &&
          h("div", { class: css.search }, [
            h(
              Tooltip,
              {
                label: props.t("search"),
                ...(searchShortcut.value?.keys === undefined
                  ? {}
                  : { shortcutKeys: searchShortcut.value?.keys }),
                portal: true,
              },
              {
                default: () => [
                  h(
                    "button",
                    {
                      type: "button",
                      class: css.searchButton,
                      "aria-label": props.t("search.sessions.aria"),
                      "aria-keyshortcuts": searchShortcut.value?.aria,
                      onClick: () => {
                        props.requestSearch();
                      },
                    },
                    [h(IconSearchOutlineRegular, { size: 18 })],
                  ),
                ],
              },
            ),
          ]),
        h(
          "div",
          {
            ...(bindScrollerRef
              ? {
                  ref: (element) =>
                    bindScrollerRef(element instanceof HTMLElement ? element : null),
                }
              : {}),
            class: css.listArea,
            "data-sidebar-list-area": "",
          },
          [
            props.wide &&
              (normalizedQuery.value !== ""
                ? h(SearchResults, {
                    usePanelInfo: props.usePanelInfo,
                    useSessionAccess: props.useSessionAccess,
                    useSessions: props.useSessions,
                    useSessionStatus: props.useSessionStatus,
                    open: openSearchResult,
                    onUnarchive: onSessionUnarchive,
                    workspaces: workspaces.value,
                    archivedSessionIds: archivedSessionIds.value,
                    archivedFilter: archivedFilter.value,
                    query: normalizedQuery.value,
                    remote: remoteSearch.value,
                    resultLimit: props.searchResultLimit,
                    t: props.t,
                  })
                : groupBy.value === "flat"
                  ? h(FlatList, {
                      useSessionAccess: props.useSessionAccess,
                      usePanelInfo: props.usePanelInfo,
                      list: list.value,
                      sessionIds: orderedFlatSessionIds.value,
                      rowState: rowState.value,
                      onLeaveArchivedOnly: leaveArchivedOnly,
                      workspaceReady: workspaceReady.value,
                      animationResetKey: `${groupBy.value}/${orderBy.value}/${archivedFilter.value}`,
                      useSessionStatus: props.useSessionStatus,
                      open: guardedOpen,
                      onSessionRenameRequest: props.requestSessionRename,
                      renderSlot: props.renderSlot,
                      renderFactorySlot: props.renderFactorySlot,
                      useContextMenu: props.useContextMenu,
                      useContextMenuTarget: props.useContextMenuTarget,
                      setSessionOrder: saveSessionOrder,
                      revealSessionId: revealSessionId.value,
                      onSessionRevealed: acknowledgeSessionReveal,
                      home: home.value,
                      t: props.t,
                    })
                  : h(SessionTree, {
                      useSessionAccess: props.useSessionAccess,
                      useWorkspaceAccess: props.useWorkspaceAccess,
                      usePanelInfo: props.usePanelInfo,
                      list: list.value,
                      shortcuts: shortcuts.value,
                      useSessionStatus: props.useSessionStatus,
                      onSessionRenameRequest: props.requestSessionRename,
                      renderSlot: props.renderSlot,
                      renderFactorySlot: props.renderFactorySlot,
                      useContextMenu: props.useContextMenu,
                      useContextMenuTarget: props.useContextMenuTarget,
                      workspaces: orderedWorkspaces.value,
                      ungroupedSessionIds: orderedUngroupedSessionIds.value,
                      workspaceReady: workspaceReady.value,
                      nestWorkspaces: groupBy.value === "workspace-tree",
                      animationResetKey: `${groupBy.value}/${orderBy.value}/${archivedFilter.value}`,
                      groupExpansion: groupExpansion.value,
                      setGroupExpanded: props.actions.setGroupExpanded,
                      setSessionOrder: saveSessionOrder,
                      rowState: rowState.value,
                      onLeaveArchivedOnly: leaveArchivedOnly,
                      startSession: props.startSession,
                      open: guardedOpen,
                      insertWorkspaceBefore: props.insertWorkspaceBefore,
                      revealSessionId: revealSessionId.value,
                      onSessionRevealed: acknowledgeSessionReveal,
                      home: home.value,
                      t: props.t,
                    })),
          ],
        ),
        workspaceActionRequest.value !== null &&
          h(WorkspaceDialogs, {
            key: `${workspaceActionRequest.value.action}/${workspaceActionRequest.value.workspaceId}`,
            request: workspaceActionRequest.value,
            workspaces: workspaces.value,
            renameWorkspace: props.renameWorkspace,
            deleteWorkspace: props.deleteWorkspace,
            settleWorkspaceAction: props.settleWorkspaceAction,
            t: props.t,
          }),
      ]);
    };
  },
  {
    props: [
      "wide",
      "expandSidebar",
      "useSectionScroller",
      "useRemoteAccess",
      "useSessions",
      "useSessionRetainInfo",
      "useSessionAccess",
      "usePanelInfo",
      "useContextMenu",
      "useSessionStatus",
      "useWorkspaces",
      "renderFactorySlot",
      "renderSlot",
      "__renders",
      "useStore",
      "actions",
      "createWorkspace",
      "settleWorkspaceAction",
      "requestSearch",
      "requestAddWorkspace",
      "closeAddWorkspace",
      "setDirectoryBusy",
      "startSession",
      "open",
      "searchSessions",
      "searchResultLimit",
      "requestSessionRename",
      "notifyArchivedNotOpenable",
      "renameWorkspace",
      "deleteWorkspace",
      "insertWorkspaceBefore",
      "unarchiveSession",
      "useDirectoryFlow",
      "useWorkspaceActionRequest",
      "useContextMenuTarget",
      "useHostInfo",
      "useWorkspaceShortcuts",
      "useShortcuts",
      "t",
      "useWorkspaceAccess",
    ],
  },
);
