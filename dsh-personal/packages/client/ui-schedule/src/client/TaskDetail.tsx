import { h, Fragment, useId, defineComponent, computed, shallowRef, watch } from "vue";
import clsx from "clsx";
import type { PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import type {
  ScheduleCatalogEntry,
  ScheduleCreateRequest,
  ScheduleEditRequest,
  ScheduleId,
} from "@deepseek-ai/dsh-schedule/client";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
import type { SessionSummary } from "@deepseek-ai/dsh-api-session-controller/client";
import {
  Button,
  IconCloseOutlineRegular,
  IconEllipsisOutlineRegular,
  IconPauseOutlineRegular,
  IconPlayOutlineRegular,
  IconChevronRightOutlineRegular,
  Menu,
  MenuItemButton,
  Modal,
  Tooltip,
} from "@deepseek-ai/dsh-client-ui-primitives";
import { CatalogFeedback } from "./CatalogFeedback.tsx";
import { DeliveryHistory, type DeliveryHistoryInjected } from "./DeliveryHistory.tsx";
import type { CatalogDeleteOutcome, CatalogSnapshot } from "./catalog-source.ts";
import {
  TaskEditorFields,
  draftTarget,
  newTaskDraft,
  projectChoices,
  reapplyTaskDraft,
  taskDraft,
  taskDraftIssue,
  taskDraftPatch,
} from "./TaskEditorFields.tsx";
import type { TaskEditorDraft } from "./TaskEditorFields.tsx";
import type { TaskEditorStoreProps } from "./editor-store.ts";
import { timingFromDraft } from "./editor-timing.ts";
import { formatAvailableAt, nextRunParts, recordTimeZone } from "./schedule-format.ts";
import { sessionLinkState } from "./session-link.ts";
import { taskNextRunAt, taskSessionId } from "./task-record.ts";
import { NewSessionLimit } from "./NewSessionLimit.tsx";
import { RELATIVE_CLOCK_PERIOD_MS, useRelativeClock } from "./relative-clock.ts";
import css from "./TaskManagerPage.module.css";
/** Localized reason the Host refused an edit, or reason the wiring could not confirm it. */
export type HostEditFailure =
  | "host.saveError"
  | "host.conflict"
  | "host.notFuture"
  | "host.invalidRule"
  | "detail.missing";
/** Localized reason the Host refused a run, or reason the wiring could not confirm it. */
export type HostRunFailure = "host.runError" | "host.executionPending" | "detail.missing";
/** Creation keeps a failed draft and never creates or activates its destination Session. */
export type TaskCreateOutcome =
  | {
      readonly created: ScheduleCatalogEntry;
    }
  | {
      readonly failed: "host.createError" | "host.notFuture" | "host.invalidRule";
    };
/** Target-based mutations supplied by the owning plugin's Remote wiring. */
export interface HostTaskActions {
  /**
   * Apply one edit and refresh the catalog after the Host answers.
   * @param request - task, change, and the `updatedAt` value that the change started from.
   * @returns `saved`, or the localized reason the edit did not take effect.
   */
  readonly edit: (request: ScheduleEditRequest) => Promise<
    | "saved"
    | {
        readonly failed: HostEditFailure;
      }
  >;
  /**
   * Queue one run now and refresh the catalog after the Host answers.
   * @param id - task to run.
   * @returns `queued`, or the localized reason the run did not start.
   */
  readonly run: (id: ScheduleId) => Promise<
    | "queued"
    | {
        readonly failed: HostRunFailure;
      }
  >;
  /** Read the configured minimum new-conversation interval; undefined means the read failed. */
  readonly loadNewSessionInterval: () => Promise<number | undefined>;
}
/** The two views of one task's detail: its rule, or its saved delivery records. */
export type TaskDetailTab = "rule" | "records";
/** Deletion, Host edit and run, saved-history, and linked-Session actions one task's detail calls. */
export interface TaskDetailInjected extends DeliveryHistoryInjected {
  /** Host-owned edit, run, and new-Session interval actions. */
  readonly hostActions: HostTaskActions;
  /**
   * Delete one task.
   * @param id - Task shown in this detail.
   * @returns The deletion's outcome after the Remote acknowledgement and
   * authoritative refresh; the wiring reports it as the app-wide toast.
   */
  readonly onDelete: (id: ScheduleId) => Promise<CatalogDeleteOutcome>;
  /**
   * Reload the catalog after a query failure or an acknowledged edit,
   * and from a surface that needs a read newer than its own record.
   * @param since - request ordinal the caller last observed, 0 to share any read in flight.
   * @returns Resolution after publishing the read result; failures remain in catalog state.
   */
  readonly onRetry: (since?: number) => Promise<void>;
  /**
   * Open an available, unarchived linked conversation after rechecking current metadata.
   * @param id - Session linked to the shown task.
   */
  readonly onOpenSession: (id: SessionId) => void;
}
/** One task's detail, as the Tasks page and the task tab both compose it. */
type TaskDetailCommonProps = TaskDetailInjected &
  TaskEditorStoreProps &
  PropsLocale<"schedule.manager"> &
  Pick<PropsRuntime<"main">, "useSessions" | "useWorkspaces"> & {
    /** Element id shared by the detail panels and any control that points at them. */
    readonly id: string;
    /** Catalog query state; loading disables saved-task actions. */
    readonly status: "loading" | "ready" | "error";
    /** Tasks with a deletion in flight. */
    readonly deleting: readonly ScheduleId[];
    /**
     * Retain a task while a confirmed deletion and its catalog refresh settle.
     */
    readonly onRetainTask: (task: ScheduleCatalogEntry | null) => void;
    /** Active detail view; the owner resets it to Rules when it selects another task. */
    readonly tab: TaskDetailTab;
    /** Select the active detail view. */
    readonly onTabChange: (tab: TaskDetailTab) => void;
    /** Task whose deletion confirmation the owner asked for, or null when none is open. */
    readonly confirmId: ScheduleId | null;
    /** Ask for one task's deletion confirmation, or dismiss it with null. */
    readonly onConfirm: (id: ScheduleId | null) => void;
    /**
     * Leave the shown task once the Host applied its deletion and the catalog refresh after it
     * settled: the Tasks page clears its selection and the session task tab closes.
     */
    readonly onDeleted: () => void;
    /** Close this detail; a view with no list to return to omits the control. */
    readonly onClose?: () => void;
  };
/** New and existing tasks use the same editable page; only submission and saved-task actions differ. */
export type TaskDetailProps = TaskDetailCommonProps &
  (
    | {
        readonly task: ScheduleCatalogEntry;
        readonly authoritative: boolean;
        readonly onCreateTask?: never;
        readonly onCreated?: never;
      }
    | {
        readonly task?: undefined;
        readonly authoritative?: never;
        readonly onCreateTask: (request: ScheduleCreateRequest) => Promise<TaskCreateOutcome>;
        readonly onCreated: (task: ScheduleCatalogEntry) => void;
      }
  );
/** One task detail's selected tab, confirmation, and retained catalog row. */
export interface TaskDetailController {
  /** Catalog row the shown id resolves to, or undefined when the read has no such row. */
  readonly record: ScheduleCatalogEntry | undefined;
  /** Task to show: the catalog row, an unsaved draft's baseline, or a confirmed deletion's retained row. */
  readonly task: ScheduleCatalogEntry | undefined;
  /** Props the shared detail element takes, without the task it shows. */
  readonly props: Omit<TaskDetailCommonProps, "onClose" | "onDeleted">;
}
/**
 * Own selected-task state shared by the Tasks page and task tabs.
 *
 * The shown task comes from the catalog, an unsaved form's CAS baseline, or a
 * confirmed deletion. The view and confirmation reset when selection changes;
 * the entry's store retains unsaved fields by task identity.
 * @param injected - detail actions, localized copy, and framework readers.
 * @param catalog - the owner's authoritative task catalog snapshot.
 * @param taskId - task the owner selected, or undefined when it selected none.
 * @returns the shown task and catalog row, its element id, its confirmation, and the detail props.
 */
export function useTaskDetail(
  injected: TaskDetailInjected &
    TaskEditorStoreProps &
    PropsLocale<"schedule.manager"> &
    Pick<PropsRuntime<"main">, "useSessions" | "useWorkspaces">,
  catalog: () => CatalogSnapshot<ScheduleCatalogEntry>,
  taskId: () => ScheduleId | undefined,
): Readonly<import("vue").Ref<TaskDetailController>> {
  const retained = shallowRef<ScheduleCatalogEntry | null>(null);
  const tab = shallowRef<TaskDetailTab>("rule");
  const confirmId = shallowRef<ScheduleId | null>(null);
  const id = useId();
  const savedDraft = injected.useStore((state) =>
    taskId() === undefined ? undefined : state.drafts[`task:${taskId()}`],
  );
  watch(
    taskId,
    () => {
      retained.value = null;
      tab.value = "rule";
      confirmId.value = null;
    },
    { immediate: true, flush: "sync" },
  );
  return computed(() => {
    const record = catalog().records.find((item) => item.id === taskId());
    const saved = savedDraft.value;
    const edited =
      record === undefined &&
      saved?.base !== undefined &&
      Object.keys(taskDraftPatch(saved.draft, saved.base)).length > 0
        ? saved.base
        : undefined;
    const task =
      record ??
      edited ??
      (retained.value !== null && retained.value.id === taskId() ? retained.value : undefined);
    return {
      record,
      task,
      props: {
        ...injected,
        status: catalog().status,
        deleting: catalog().deleting,
        id,
        onRetainTask: (value: ScheduleCatalogEntry | null) => {
          retained.value = value;
        },
        tab: tab.value,
        onTabChange: (value: TaskDetailTab) => {
          tab.value = value;
        },
        confirmId: confirmId.value,
        onConfirm: (value: ScheduleId | null) => {
          confirmId.value = value;
        },
      },
    };
  });
}
/**
 * Render one new or existing task's editable rule or saved deliveries.
 * @param props - Task, catalog state, detail view, confirmation, locale, and actions.
 * @returns The detail region and its deletion confirmation dialog.
 */
export const TaskDetail = defineComponent(
  (props: TaskDetailProps) => {
    return () => {
      return h(TaskDetailView, {
        key: props.task === undefined ? "new" : `task:${props.task.id}`,
        ...props,
      });
    };
  },
  {
    props: [
      "hostActions",
      "onDelete",
      "onRetry",
      "onOpenSession",
      "loadHistory",
      "useStore",
      "actions",
      "useSessions",
      "useWorkspaces",
      "id",
      "status",
      "deleting",
      "onRetainTask",
      "tab",
      "onTabChange",
      "confirmId",
      "onConfirm",
      "onDeleted",
      "onClose",
      "task",
      "authoritative",
      "onCreateTask",
      "onCreated",
    ],
  },
);
const TaskDetailView = defineComponent(
  (props: TaskDetailProps) => {
    const sessions = props.useSessions((snapshot) => snapshot);
    const workspaces = props.useWorkspaces((snapshot) => snapshot);
    const key = computed(() => (props.task === undefined ? "new" : `task:${props.task.id}`));
    const stored = props.useStore((state) => state.drafts[key.value]);
    const seed = shallowRef(newTaskDraft());
    const initial = computed(() => stored.value?.initial ?? seed.value);
    const changes = computed(() =>
      stored.value?.base === undefined
        ? undefined
        : taskDraftPatch(stored.value.draft, stored.value.base),
    );
    const storedDirty = computed(
      () => changes.value !== undefined && Object.keys(changes.value!).length > 0,
    );
    const cached = computed(() =>
      stored.value?.base !== undefined &&
      !storedDirty.value &&
      !stored.value.pending &&
      stored.value.failure === undefined &&
      stored.value.base.updatedAt !== props.task?.updatedAt
        ? undefined
        : stored.value,
    );
    const base = computed(() => cached.value?.base ?? props.task);
    const input = computed(
      () =>
        cached.value?.draft ?? (props.task === undefined ? initial.value : taskDraft(props.task)),
    );
    const projects = computed(() =>
      projectChoices(workspaces.value.items, props.t("host.defaultProject")),
    );
    const draft = computed(() =>
      props.task === undefined && input.value.cwd === ""
        ? { ...input.value, cwd: projects.value.defaultCwd }
        : input.value,
    );
    const dirty = computed(() =>
      base.value === undefined
        ? JSON.stringify(draft.value) !==
          JSON.stringify({ ...initial.value, cwd: initial.value.cwd || projects.value.defaultCwd })
        : storedDirty.value,
    );
    const issue = computed(() =>
      dirty.value ? taskDraftIssue(draft.value, changes.value!) : undefined,
    );
    const valid = computed(() => issue.value === undefined);
    const actionPending = shallowRef<"toggle" | "run" | "delete" | null>(null);
    const actionFailure = shallowRef<HostEditFailure | HostRunFailure | null>(null);
    const saving = computed(() => cached.value?.pending === true);
    const pending = computed(() => actionPending.value !== null || saving.value);
    const actionHold = computed(
      () => actionPending.value === "toggle" || actionPending.value === "run",
    );
    const nativeHold = computed(() => pending.value && !actionHold.value);
    const failure = computed(() =>
      !pending.value &&
      dirty.value &&
      base.value !== undefined &&
      props.task !== undefined &&
      base.value.updatedAt !== props.task.updatedAt
        ? "host.conflict"
        : (actionFailure.value ?? cached.value?.failure ?? null),
    );
    const menuOpen = shallowRef(false);
    const moreRef = shallowRef<HTMLButtonElement | null>(null);
    const panelRef = shallowRef<HTMLElement | null>(null);
    const scrollRef = shallowRef<HTMLDivElement | null>(null);
    const mounted = shallowRef(true);
    watch(
      [() => props.tab, () => scrollRef.value],
      (_value, _previous, onCleanup) => {
        const cleanup: void | (() => void) = (() => {
          const scroll = scrollRef.value;
          if (scroll === null) return;
          const measure = (): void => {
            scroll.style.setProperty(
              "--detail-scrollbar-space",
              `${scroll.offsetWidth - scroll.clientWidth}px`,
            );
          };
          measure();
          const observer = new ResizeObserver(measure);
          observer.observe(scroll);
          return () => {
            observer.disconnect();
          };
        })();
        if (typeof cleanup === "function") onCleanup(cleanup);
      },
      { immediate: true, flush: "post" },
    );
    watch(
      [() => panelRef.value],
      (_value, _previous, onCleanup) => {
        const cleanup: void | (() => void) = (() => {
          mounted.value = true;
          panelRef.value?.focus({ preventScroll: true });
          return () => {
            mounted.value = false;
          };
        })();
        if (typeof cleanup === "function") onCleanup(cleanup);
      },
      { immediate: true, flush: "post" },
    );
    const floorEndsAt = computed(() =>
      props.task?.deliveryFloorEndsAt === undefined
        ? undefined
        : Date.parse(props.task.deliveryFloorEndsAt),
    );
    const now = useRelativeClock(RELATIVE_CLOCK_PERIOD_MS, () => floorEndsAt.value);
    const deletingTask = computed(
      () => props.task !== undefined && props.deleting.includes(props.task.id),
    );
    const busy = computed(
      () =>
        pending.value ||
        deletingTask.value ||
        (props.task !== undefined && props.status === "loading"),
    );
    const executionActive = computed(() => props.task?.executionActive === true);
    const deliveryFloor = computed(
      () => floorEndsAt.value !== undefined && floorEndsAt.value > now.value,
    );
    const linkedId = computed(() =>
      props.task === undefined ? undefined : taskSessionId(props.task),
    );
    const linkedText = computed(() =>
      linkedId.value === undefined
        ? ""
        : (sessions.value.byId[linkedId.value]?.displayTitle ?? linkedId.value),
    );
    const linkedState = computed(() =>
      linkedId.value === undefined
        ? "unavailable"
        : sessionLinkState(linkedId.value, sessions.value, workspaces.value),
    );
    const targetArchived = computed(
      () => props.task?.target.kind !== "new" && linkedState.value === "archived",
    );
    const runHeld = computed(
      () =>
        busy.value ||
        dirty.value ||
        executionActive.value ||
        targetArchived.value ||
        !props.authoritative,
    );
    const nextRunAt = computed(() => (props.task === undefined ? "" : taskNextRunAt(props.task)));
    const next = computed(() =>
      props.task === undefined
        ? undefined
        : nextRunParts(nextRunAt.value, props.t("time.locale"), now.value, props.t),
    );
    const choices = computed(() =>
      sessions.value.ids.map((value) => ({
        value,
        label: (sessions.value.byId[value] as SessionSummary).displayTitle,
      })),
    );
    const setDraft = (value: TaskEditorDraft): void => {
      props.actions.setDraft(key.value, {
        base: base.value,
        draft: value,
        ...(props.task === undefined ? { initial: initial.value } : {}),
        ...(cached.value?.failure === "host.conflict" ? { failure: cached.value.failure } : {}),
      });
      actionFailure.value = null;
    };
    const reset = (): void => {
      props.actions.clearDraft(key.value);
      actionFailure.value = null;
    };
    const save = async (): Promise<void> => {
      props.actions.setDraft(key.value, {
        base: base.value,
        draft: draft.value,
        pending: true,
        ...(props.task === undefined ? { initial: initial.value } : {}),
      });
      actionFailure.value = null;
      const existingBase = base.value as ScheduleCatalogEntry;
      const outcome =
        props.task === undefined
          ? await props.onCreateTask({
              title: draft.value.title.trim(),
              prompt: draft.value.prompt.trim(),
              timing: timingFromDraft(draft.value, true),
              target: draftTarget(draft.value),
            })
          : await props.hostActions.edit({
              id: props.task.id,
              action: "update",
              patch: taskDraftPatch(draft.value, existingBase, true),
              expectedUpdatedAt: existingBase.updatedAt ?? null,
            });
      if (outcome === "saved" || "created" in outcome) {
        props.actions.clearDraft(key.value);
        if (mounted.value && outcome !== "saved") props.onCreated?.(outcome.created);
        if (mounted.value && outcome === "saved") panelRef.value?.focus({ preventScroll: true });
      } else
        props.actions.setDraft(key.value, {
          base: base.value,
          draft: draft.value,
          failure: outcome.failed,
          ...(props.task === undefined ? { initial: initial.value } : {}),
        });
    };
    const setActive = async (task: ScheduleCatalogEntry): Promise<void> => {
      // The toggle stays focusable while busy, so a second press is ignored here instead of by `disabled`.
      if (busy.value) return;
      actionPending.value = "toggle";
      const outcome = await props.hostActions.edit({
        id: task.id,
        action: "update",
        patch: { active: task.status !== "active" },
        expectedUpdatedAt: task.updatedAt ?? null,
      });
      if (!mounted.value) return;
      actionPending.value = null;
      actionFailure.value = outcome === "saved" ? null : outcome.failed;
    };
    const run = async (id: ScheduleId): Promise<void> => {
      menuOpen.value = false;
      actionPending.value = "run";
      const outcome = await props.hostActions.run(id);
      if (!mounted.value) return;
      actionPending.value = null;
      actionFailure.value = outcome === "queued" ? null : outcome.failed;
    };
    return () => {
      return h(Fragment, {}, [
        h(
          "aside",
          {
            ref: panelRef,
            tabindex: -1,
            class: css.detail,
            id: props.id,
            "aria-busy": pending.value || deletingTask.value,
            "aria-label": props.t(props.task === undefined ? "host.manualCreate" : "detail.label"),
            onKeydown: (event) => {
              if (pending.value && event.key === "Escape" && !event.defaultPrevented) {
                event.preventDefault();
                event.stopPropagation();
              }
            },
          },
          [
            h("div", { class: css.detailTabsBar }, [
              props.task === undefined
                ? h("h2", { class: css.createTitle }, [props.t("host.manualCreate")])
                : h(
                    "div",
                    {
                      class: css.detailTabs,
                      role: "tablist",
                      "aria-label": props.t("detail.tabs"),
                    },
                    [
                      (["rule", "records"] as const).map((value) =>
                        h(
                          "button",
                          {
                            key: value,
                            type: "button",
                            role: "tab",
                            id: `${props.id}-${value}-tab`,
                            "aria-controls": `${props.id}-${value}-panel`,
                            tabindex: props.tab === value ? 0 : -1,
                            "aria-selected": props.tab === value,
                            class: css.detailTab,
                            onKeydown: (event) => {
                              if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
                                return;
                              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
                                return;
                              event.preventDefault();
                              const next =
                                event.key === "Home"
                                  ? 0
                                  : event.key === "End"
                                    ? 1
                                    : value === "rule"
                                      ? 1
                                      : 0;
                              props.onTabChange(next === 0 ? "rule" : "records");
                              const button = (event.currentTarget as HTMLElement).parentElement
                                ?.children[next];
                              if (button instanceof HTMLButtonElement) button.focus();
                            },
                            onClick: () => {
                              props.onTabChange(value);
                            },
                          },
                          [props.t(value === "rule" ? "detail.rule" : "detail.records")],
                        ),
                      ),
                    ],
                  ),
              h("div", { class: css.detailActions }, [
                props.task !== undefined &&
                  h(Fragment, {}, [
                    h(
                      Tooltip,
                      {
                        label: props.t(
                          props.task.status === "active" ? "host.pause" : "host.resume",
                        ),
                        side: "bottom",
                        delayMs: 500,
                        portal: true,
                      },
                      {
                        default: () => [
                          h("span", {}, [
                            h(
                              Button,
                              {
                                size: "sm",
                                className: css.detailIconButton!,
                                disabled:
                                  dirty.value ||
                                  executionActive.value ||
                                  props.task.status === "ended" ||
                                  !props.authoritative,
                                "aria-disabled": busy.value || undefined,
                                "aria-label": props.t(
                                  props.task.status === "active" ? "host.pause" : "host.resume",
                                ),
                                onClick: () => {
                                  void setActive(props.task);
                                },
                              },
                              {
                                default: () => [
                                  props.task.status === "active"
                                    ? h(IconPauseOutlineRegular, {})
                                    : h(IconPlayOutlineRegular, {}),
                                ],
                              },
                            ),
                          ]),
                        ],
                      },
                    ),
                    h(
                      Menu,
                      {
                        open: menuOpen.value,
                        onClose: () => {
                          menuOpen.value = false;
                        },
                        align: "end",
                        portal: true,
                        autoFocus: true,
                      },
                      {
                        default: () => [
                          h(
                            MenuItemButton,
                            {
                              disabled: runHeld.value || deliveryFloor.value,
                              disabledReason:
                                deliveryFloor.value && !runHeld.value
                                  ? props.t("host.runAfterInterval", {
                                      time: formatAvailableAt(
                                        floorEndsAt.value!,
                                        props.t("time.locale"),
                                        now.value,
                                      ),
                                    })
                                  : undefined,
                              onSelect: () => {
                                void run(props.task.id);
                              },
                            },
                            { default: () => [props.t("host.run")] },
                          ),
                          h(
                            MenuItemButton,
                            {
                              disabled:
                                busy.value ||
                                dirty.value ||
                                executionActive.value ||
                                !props.authoritative,
                              onSelect: () => {
                                // The dialog returns focus to the control that held it on open, not to the removed menu row.
                                moreRef.value?.focus();
                                menuOpen.value = false;
                                props.onConfirm(props.task.id);
                              },
                            },
                            { default: () => [props.t("delete.action")] },
                          ),
                        ],
                        anchor: () =>
                          h(
                            Button,
                            {
                              elementRef: (element) => (moreRef.value = element),
                              size: "sm",
                              className: css.detailIconButton!,
                              "aria-label": props.t("detail.more"),
                              "aria-haspopup": "menu",
                              "aria-expanded": menuOpen.value,
                              onClick: () => {
                                menuOpen.value = ((value) => !value)(menuOpen.value);
                              },
                            },
                            { default: () => [h(IconEllipsisOutlineRegular, {})] },
                          ),
                      },
                    ),
                  ]),
                props.onClose !== undefined &&
                  h(
                    Button,
                    {
                      size: "sm",
                      className: css.detailIconButton!,
                      "aria-label": props.t(
                        props.task === undefined ? "host.closeCreate" : "detail.close",
                      ),
                      disabled: nativeHold.value,
                      "aria-disabled": actionHold.value || undefined,
                      onClick: () => {
                        if (!actionHold.value) props.onClose?.();
                      },
                    },
                    { default: () => [h(IconCloseOutlineRegular, {})] },
                  ),
              ]),
            ]),
            h(
              "div",
              {
                ref: scrollRef,
                class: clsx(css.detailScroll, props.tab === "records" && css.detailRecords),
                role: props.task === undefined ? undefined : "tabpanel",
                id: `${props.id}-${props.tab}-panel`,
                "aria-labelledby":
                  props.task === undefined ? undefined : `${props.id}-${props.tab}-tab`,
                tabindex: 0,
              },
              [
                h(CatalogFeedback, {
                  status: props.status,
                  populated: true,
                  onRetry: props.onRetry,
                  t: props.t,
                }),
                props.tab === "rule" &&
                  h(Fragment, {}, [
                    props.task !== undefined &&
                      h(Fragment, {}, [
                        h("header", { class: css.detailHeader }, [
                          h("h2", { class: css.readonlyName }, [props.task.title]),
                        ]),
                        h("div", { class: css.nextRun }, [
                          h("p", {}, [
                            props.task.status === "active"
                              ? h(Fragment, {}, [
                                  props.t("detail.nextRun"),
                                  h("time", { dateTime: nextRunAt.value }, [next.value?.absolute]),
                                  " ",
                                  h("span", { class: css.nextRunRelative }, [next.value?.relative]),
                                ])
                              : props.t(`status.${props.task.status}`),
                          ]),
                        ]),
                        linkedId.value !== undefined &&
                          linkedState.value !== "available" &&
                          props.task.target.kind === "session" &&
                          h("p", { class: css.detailNotice, role: "status" }, [
                            props.t(
                              linkedState.value === "archived"
                                ? "detail.sessionArchived"
                                : linkedState.value === "loading"
                                  ? "detail.sessionLoading"
                                  : "detail.sessionUnavailable",
                            ),
                          ]),
                        executionActive.value &&
                          failure.value !== "host.executionPending" &&
                          h("p", { class: css.detailNotice, role: "status" }, [
                            props.t("host.executionActive"),
                          ]),
                        dirty.value &&
                          !props.authoritative &&
                          props.status === "ready" &&
                          !deletingTask.value &&
                          failure.value !== "detail.missing" &&
                          h("p", { class: css.detailNotice, role: "status" }, [
                            props.t("detail.missing"),
                          ]),
                      ]),
                    failure.value === "host.conflict"
                      ? h("div", { class: clsx(css.notice, css.conflictNotice) }, [
                          h("p", { role: "alert" }, [props.t(failure.value)]),
                          changes.value !== undefined &&
                            dirty.value &&
                            props.task !== undefined &&
                            props.authoritative &&
                            props.status === "ready" &&
                            h(
                              Button,
                              {
                                variant: "outline",
                                size: "sm",
                                disabled: busy.value,
                                onClick: () => {
                                  props.actions.setDraft(key.value, {
                                    base: props.task,
                                    draft: reapplyTaskDraft(
                                      draft.value,
                                      props.task,
                                      changes.value!,
                                    ),
                                  });
                                  actionFailure.value = null;
                                  panelRef.value?.focus({ preventScroll: true });
                                },
                              },
                              { default: () => [props.t("host.reapply")] },
                            ),
                        ])
                      : failure.value === "host.executionPending"
                        ? h("p", { class: css.detailNotice, role: "status" }, [
                            props.t(failure.value),
                          ])
                        : failure.value !== null &&
                          h("p", { class: css.saveFailure, role: "alert" }, [
                            props.t(failure.value),
                          ]),
                    h(TaskEditorFields, {
                      draft: draft.value,
                      onChange: setDraft,
                      disabled: pending.value || executionActive.value || deletingTask.value,
                      held: actionHold.value,
                      projects: projects.value,
                      original: base.value,
                      t: props.t,
                    }),
                    draft.value.target === "new" &&
                      h(NewSessionLimit, {
                        load: props.hostActions.loadNewSessionInterval,
                        t: props.t,
                      }),
                    failure.value === null &&
                      issue.value !== undefined &&
                      issue.value !== "incomplete" &&
                      h("p", { class: css.saveFailure, role: "status" }, [props.t(issue.value)]),
                  ]),
                props.tab === "records" &&
                  props.task !== undefined &&
                  h(DeliveryHistory, {
                    id: props.task.id,
                    latestMessageId: props.task.lastDelivery?.messageId,
                    timeZone: recordTimeZone(props.task),
                    loadHistory: props.loadHistory,
                    onOpenSession: props.onOpenSession,
                    sessionTitles: Object.fromEntries(
                      choices.value.map((choice) => [choice.value, choice.label]),
                    ),
                    availableSessionIds: sessions.value.ids.filter(
                      (value) =>
                        sessionLinkState(value, sessions.value, workspaces.value) === "available",
                    ),
                    t: props.t,
                  }),
              ],
            ),
            props.task !== undefined &&
              (props.task.target.kind !== "new" || linkedId.value !== undefined) &&
              h("footer", { class: css.hostSessionFooter }, [
                h("span", {}, [
                  props.t(
                    props.task.target.kind === "new" ? "host.latestConversation" : "detail.session",
                  ),
                ]),
                linkedId.value === undefined ||
                (props.task.target.kind === "new_once" && linkedState.value === "unavailable")
                  ? h("span", { class: css.hostSessionEmpty }, [
                      props.t("host.sessionAfterFirstRun"),
                    ])
                  : h(
                      Button,
                      {
                        variant: "outline",
                        disabled: linkedState.value !== "available",
                        "aria-label":
                          linkedText.value === linkedId.value
                            ? props.t("detail.openSession")
                            : props.t("detail.openSessionTitle", { title: linkedText.value }),
                        onClick: () => {
                          props.onOpenSession(linkedId.value!);
                        },
                      },
                      { default: () => [linkedText.value, h(IconChevronRightOutlineRegular, {})] },
                    ),
              ]),
            (props.tab === "rule" || dirty.value) &&
              h("footer", { class: css.saveFooter }, [
                h("span", { class: css.saveNotice }, [dirty.value ? props.t("rule.unsaved") : ""]),
                h(
                  Button,
                  {
                    disabled:
                      nativeHold.value ||
                      (props.task !== undefined && !dirty.value && failure.value === null),
                    "aria-disabled": actionHold.value || undefined,
                    onClick: () => {
                      if (actionHold.value) return;
                      reset();
                      if (props.task === undefined) props.onClose?.();
                    },
                  },
                  { default: () => [props.t("rule.cancel")] },
                ),
                h(
                  Button,
                  {
                    variant: "primary",
                    disabled:
                      busy.value ||
                      !dirty.value ||
                      !valid.value ||
                      failure.value === "host.conflict" ||
                      (props.task !== undefined && (!props.authoritative || executionActive.value)),
                    onClick: () => {
                      void save();
                    },
                  },
                  {
                    default: () => [
                      props.t(
                        saving.value
                          ? props.task === undefined
                            ? "host.creating"
                            : "rule.saving"
                          : props.task === undefined
                            ? "host.create"
                            : "rule.save",
                      ),
                    ],
                  },
                ),
              ]),
          ],
        ),
        props.task !== undefined &&
          h(
            Modal,
            {
              open: props.confirmId === props.task.id,
              className: css.confirmDialog! as string,
              contentClassName: css.confirmContent as string,
              title: props.t("delete.title"),
              description: props.t("delete.description"),
              closeLabel: props.t("delete.close"),
              onClose: () => {
                props.onConfirm(null);
              },
            },
            {
              default: () => [h("p", { class: css.confirmPrompt }, [props.task.prompt])],
              footer: () =>
                h("div", { class: css.confirmActions }, [
                  h(
                    Button,
                    {
                      "data-modal-autofocus": true,
                      onClick: () => {
                        props.onConfirm(null);
                      },
                    },
                    { default: () => [props.t("delete.cancel")] },
                  ),
                  h(
                    Button,
                    {
                      disabled: busy.value,
                      onClick: () => {
                        props.onConfirm(null);
                        actionPending.value = "delete";
                        // The refresh that drops the row lands before the outcome, so the owner retains the task until then.
                        props.onRetainTask(props.task);
                        void props.onDelete(props.task.id).then((outcome) => {
                          if (!mounted.value) return;
                          actionPending.value = null;
                          if (outcome === "deleted") {
                            props.actions.clearDraft(key.value);
                            props.onDeleted();
                          } else props.onRetainTask(null);
                        });
                      },
                    },
                    { default: () => [props.t("delete.confirm")] },
                  ),
                ]),
            },
          ),
      ]);
    };
  },
  {
    props: [
      "hostActions",
      "onDelete",
      "onRetry",
      "onOpenSession",
      "loadHistory",
      "useStore",
      "actions",
      "useSessions",
      "useWorkspaces",
      "id",
      "status",
      "deleting",
      "onRetainTask",
      "tab",
      "onTabChange",
      "confirmId",
      "onConfirm",
      "onDeleted",
      "onClose",
      "task",
      "authoritative",
      "onCreateTask",
      "onCreated",
      "t",
    ],
  },
);
