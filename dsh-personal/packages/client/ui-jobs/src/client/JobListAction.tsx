import {
  h,
  Fragment,
  Teleport,
  nextTick,
  useId,
  defineComponent,
  computed,
  shallowRef,
  watch,
} from "vue";
import type {
  JobsSnapshot,
  JobView,
  ObservedJob,
} from "@deepseek-ai/dsh-api-job-controller/client";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
import {
  IconChevronDownOutlineRegular,
  IconLayersOutlineRegular,
  IconStopFillRegular,
  MenuSurface,
  StateDot,
  TerminalBlock,
  Tooltip,
  useDismissOnOutsidePointer,
  type StateDotState,
  type TerminalBlockLabels,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type {
  InjectFace,
  PropsLocale,
  PropsRuntime,
  TranslateNS,
} from "@deepseek-ai/dsh-client-ui-slots";
import { NS } from "./locales.ts";
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
import css from "./JobListAction.module.css";
/** Registration-side business face for the job list. */
export interface JobListInjected {
  hooks: {
    /** Client jobs snapshot (rosters and observations) bound by the renderer as useJobs. */
    jobs: {
      getSnapshot(): JobsSnapshot;
      subscribe(listener: () => void): () => void;
    };
  };
  /**
   * Keep one session's roster current while the list is mounted; returns the
   * stop function. Reference-counted by the client service.
   */
  watchRows: (sessionId: SessionId) => () => void;
  /**
   * Start observing one job's live output; returns the stop function.
   * Reference-counted by the client service, so panels can overlap safely.
   */
  observe: (sessionId: SessionId | undefined, id: JobView["id"]) => () => void;
  /**
   * Kill one background job on the human's behalf. Resolves `true` when the
   * registry admitted the request (`requested` or `already-finished`); row
   * state itself converges through the jobs control frames.
   */
  killJob: (sessionId: SessionId, jobId: string) => Promise<boolean>;
}
/** Full props for the session-header job-list action. */
export type JobListActionProps = PropsRuntime<"conversation.session.header.actions"> &
  PropsLocale<typeof NS> &
  InjectFace<JobListInjected>;
/** Stable empty list so a session with no jobs keeps one array identity. */
const NO_JOBS: readonly JobView[] = [];
/** Keyboard-reachable controls inside the list, in document order. */
const FOCUSABLE = 'button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';
/** How long an armed kill waits for its confirming press before disarming. */
const KILL_ARM_MS = 3000;
/** How long a failed kill keeps its hint before the button resets. */
const KILL_FAILED_MS = 4000;
function isLive(job: JobView): boolean {
  return job.status === "running" || job.status === "stopping";
}
/**
 * Whether the row offers an output panel: every live job (its output may
 * still arrive) and a settled one that left retained output behind.
 */
function isObservable(job: JobView): boolean {
  return isLive(job) || job.output.total > 0;
}
/** The one-line qualifier beside the status: live progress while running, the terminal reason once settled. */
function jobDetail(job: JobView): string | undefined {
  return job.progress ?? job.detail;
}
/** Closed-union exhaustiveness fence for the wire status set. */
/* v8 ignore next 3 -- closed-union backstop; only reached if a status is forged */
function assertNever(value: never): never {
  throw new Error(`unhandled job status: ${JSON.stringify(value)}`);
}
/**
 * Status marker semantics. `stopping` and `killed` share the attention color:
 * both mean the work ended (or is ending) on request rather than on its own.
 */
function dotState(status: JobView["status"]): StateDotState {
  switch (status) {
    case "running":
      return "ongoing";
    case "stopping":
      return "warning";
    case "completed":
      return "done";
    case "killed":
      return "warning";
    case "failed":
      return "error";
    /* v8 ignore next -- closed wire status union */
    default:
      return assertNever(status);
  }
}
function statusLabel(status: JobView["status"], t: TranslateNS<typeof NS>): string {
  switch (status) {
    case "running":
      return t("status.running");
    case "stopping":
      return t("status.stopping");
    case "completed":
      return t("status.completed");
    case "killed":
      return t("status.killed");
    case "failed":
      return t("status.failed");
    /* v8 ignore next -- closed wire status union */
    default:
      return assertNever(status);
  }
}
/**
 * Elapsed time in at most two adjacent units. A job that outlives an hour is
 * already exceptional, so hours is the widest unit — beyond that the figure
 * stays in hours rather than growing a day/month vocabulary no producer
 * currently reaches.
 */
function formatDuration(elapsedMs: number, t: TranslateNS<typeof NS>): string {
  const total = Math.max(0, Math.floor(elapsedMs / 1000));
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  if (hours > 0) return t("duration.hours", { hours, minutes });
  if (minutes > 0) return t("duration.minutes", { minutes, seconds });
  return t("duration.seconds", { seconds });
}
/** Localized display copy for the embedded terminal panel. */
function terminalLabels(t: TranslateNS<typeof NS>): TerminalBlockLabels {
  return {
    commandLine: (line) => t("terminal.commandLine", { n: line }),
    // The labels contract requires exit-fact formatters, but this panel never
    // passes exit facts, so TerminalBlock never invokes them.
    /* v8 ignore next */
    signal: (signal) => t("terminal.signal", { signal }),
    /* v8 ignore next */
    exitCode: (code) => t("terminal.exitCode", { code }),
    noExitCode: t("terminal.noExitCode"),
    running: t("terminal.running"),
    failed: t("terminal.failed"),
    done: t("terminal.done"),
    copy: t("terminal.copy"),
    copied: t("terminal.copied"),
    noOutput: t("terminal.noOutput"),
    collapseAria: t("terminal.collapseAria"),
    collapse: t("terminal.collapse"),
    // The panel never caps lines (it scrolls), so the fold controls that
    // would invoke these stay unrendered.
    /* v8 ignore next */
    expandAria: (hidden) => t("terminal.expandAria", { n: hidden }),
    /* v8 ignore next */
    expand: (hidden) => t("terminal.expand", { n: hidden }),
  };
}
/**
 * Live rows first in start order, then settled rows newest-first. Two rows
 * that settled in the same millisecond fall back to start order, so the sort
 * never depends on the host's map iteration.
 */
function ordered(jobs: readonly JobView[]): JobView[] {
  return [...jobs].sort((left, right) => {
    const liveLeft = isLive(left);
    if (liveLeft !== isLive(right)) return liveLeft ? -1 : 1;
    if (liveLeft) return left.startedAt - right.startedAt;
    const finished = (right.finishedAt ?? right.startedAt) - (left.finishedAt ?? left.startedAt);
    return finished !== 0 ? finished : left.startedAt - right.startedAt;
  });
}
/**
 * Two-press kill affordance state: `armed` waits for the confirming second
 * press (and disarms on a timer), `pending` covers the in-flight RPC until the
 * row's own status flip removes the button, `failed` shows briefly after a
 * rejected kill.
 */
type KillState = "idle" | "armed" | "pending" | "failed";
const JobItem = defineComponent(
  (props: {
    job: JobView;
    view: ObservedJob | undefined;
    expanded: boolean;
    /** Clock sample live rows derive their running duration from. */
    now: number;
    onToggle: () => void;
    /** Present on running rows: the human-kill button state and press handler. */
    kill?: {
      state: KillState;
      onPress: () => void;
    };
    t: TranslateNS<typeof NS>;
  }) => {
    const live = computed(() => isLive(props.job));
    const status = computed(() => statusLabel(props.job.status, props.t));
    const detail = computed(() => jobDetail(props.job));
    const observable = computed(() => isObservable(props.job));
    const labels = computed(() => terminalLabels(props.t));
    const elapsed = computed(() =>
      live.value
        ? props.now - props.job.startedAt
        : (props.job.finishedAt ?? props.job.startedAt) - props.job.startedAt,
    );
    const duration = computed(() => formatDuration(elapsed.value, props.t));
    const durationCell = computed(() =>
      h(
        "span",
        {
          class: css.duration,
          title: props.t(live.value ? "duration.title.live" : "duration.title.done", {
            duration: duration.value,
          }),
        },
        [duration.value],
      ),
    );
    const body = computed(() =>
      live.value
        ? h(Fragment, {}, [
            h(StateDot, { state: dotState(props.job.status), className: css.rowDot! }),
            h("span", { class: css.main }, [
              h("span", { class: css.primary }, [
                h("span", { class: css.label, title: props.job.label }, [props.job.label]),
              ]),
              h("span", { class: css.secondary, title: detail.value ?? status.value }, [
                h("span", { class: css.kind }, [props.job.kind]),
                detail.value !== undefined
                  ? h("span", { class: css.status }, [detail.value])
                  : null,
                durationCell.value,
              ]),
            ]),
            h("span", { class: css.chevronBox }, [
              h(IconChevronDownOutlineRegular, {
                size: 12,
                className: props.expanded ? `${css.chevron} ${css.chevronOpen}` : css.chevron!,
              }),
            ]),
          ])
        : h(Fragment, {}, [
            h(StateDot, { state: dotState(props.job.status), className: css.rowDot! }),
            h("span", { class: css.kind }, [props.job.kind]),
            h("span", { class: css.label, title: props.job.label }, [props.job.label]),
            h("span", { class: css.status, title: detail.value ?? status.value }, [
              detail.value ?? status.value,
            ]),
            durationCell.value,
            observable.value
              ? h("span", { class: css.chevronBox }, [
                  h(IconChevronDownOutlineRegular, {
                    size: 12,
                    className: props.expanded ? `${css.chevron} ${css.chevronOpen}` : css.chevron!,
                  }),
                ])
              : null,
          ]),
    );
    const killTitle = computed(() =>
      props.kill === undefined
        ? undefined
        : props.kill.state === "armed"
          ? props.t("kill.confirm")
          : props.kill.state === "failed"
            ? props.t("kill.failed")
            : props.t("kill.stop", { label: props.job.label }),
    );
    return () => {
      return h("li", { class: css.item }, [
        h("div", { class: live.value ? `${css.rowLine} ${css.rowLineLive}` : css.rowLine }, [
          observable.value
            ? h(
                "button",
                {
                  type: "button",
                  class: live.value ? css.row : `${css.row} ${css.rowSettled}`,
                  "aria-expanded": props.expanded,
                  "aria-label": props.t(props.expanded ? "row.collapseAria" : "row.expandAria", {
                    label: props.job.label,
                  }),
                  onClick: props.onToggle,
                },
                [body.value],
              )
            : h("span", { class: `${css.row} ${css.rowSettled} ${css.rowStatic}` }, [body.value]),
          props.kill !== undefined
            ? h(
                "button",
                {
                  type: "button",
                  class:
                    props.kill.state === "armed"
                      ? `${css.stop} ${css.stopArmed}`
                      : props.kill.state === "failed"
                        ? `${css.stop} ${css.stopFailed}`
                        : css.stop,
                  "data-kill-state": props.kill.state,
                  disabled: props.kill.state === "pending",
                  "aria-label": killTitle.value,
                  title: killTitle.value,
                  onClick: props.kill.onPress,
                },
                [
                  h(IconStopFillRegular, { size: 10 }),
                  props.kill.state === "armed"
                    ? h("span", { class: css.stopLabel }, [props.t("kill.confirmAction")])
                    : null,
                ],
              )
            : null,
        ]),
        props.expanded && props.view !== undefined
          ? h("div", { class: css.panel }, [
              props.view.gapBefore
                ? h("div", { class: css.notice }, [props.t("output.gap")])
                : null,
              props.view.error !== undefined
                ? h("div", { class: `${css.notice} ${css.noticeError}` }, [
                    props.t("output.error", { error: props.view.error }),
                  ])
                : null,
              h(TerminalBlock, {
                command: props.job.label,
                output: props.view.text,
                running: live.value,
                copyText: props.job.label,
                runStateDot: false,
                maxLines: Number.POSITIVE_INFINITY,
                labels: labels.value,
              }),
            ])
          : null,
      ]);
    };
  },
  { props: ["job", "view", "expanded", "now", "onToggle", "kill", "t"] },
);
/**
 * Session-header entry point for this session's background jobs. Mounting it
 * keeps the session's roster stream open; it renders nothing at all until the
 * session can see at least one job. Expanding an observable row (a live job,
 * or a settled one with retained output) starts its observation stream, and
 * collapsing (or closing the popover) stops it — output only flows while
 * someone is watching. A running row carries a two-press stop button that
 * requests a human kill through the job controller. Non-touch hover on a
 * text-visible trigger opens after 150ms and closes after 120ms outside both
 * trigger and portal. Compact triggers toggle on click; ArrowDown opens and
 * pins either layout. Interacting inside also pins the menu until explicit
 * dismissal; timers and the pin are local to the mounted session.
 * @param props - runtime slot currency, the jobs snapshot hook, the roster,
 *   observation, and kill controls, and the namespace translator.
 * @returns the trigger and its popover list, or null when there is nothing to show.
 */
export const JobListAction = defineComponent(
  (props: JobListActionProps) => {
    const activityId = useId();
    const jobSource = props.useJobs((state) => state.rows[props.sessionId]);
    const jobs = computed(() => jobSource.value ?? NO_JOBS);
    const observedViews = props.useJobs((state) => state.observed);
    const menuState = shallowRef<{
      sessionId: SessionId;
      mode: "closed" | "hover" | "pinned";
    }>({ sessionId: props.sessionId, mode: "closed" });
    const hoverOpenTimer = shallowRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const hoverCloseTimer = shallowRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const expandedKey = shallowRef<string | undefined>(undefined);
    const now = shallowRef((() => Date.now())());
    const settledOpen = shallowRef<boolean | undefined>(undefined);
    const clearedKeys = shallowRef<ReadonlySet<string>>((() => new Set())());
    const killPhase = shallowRef<
      | {
          key: string;
          state: Exclude<KillState, "idle">;
        }
      | undefined
    >(undefined);
    const rootRef = shallowRef<HTMLDivElement | null>(null);
    const triggerRef = shallowRef<HTMLButtonElement | null>(null);
    const countRef = shallowRef<HTMLSpanElement | null>(null);
    const menuRef = shallowRef<HTMLDivElement | null>(null);
    const rows = computed(() => ordered(jobs.value));
    const liveRows = computed(() => rows.value.filter(isLive));
    const settledRows = computed(() =>
      rows.value.filter((job) => !isLive(job) && !clearedKeys.value.has(String(job.id))),
    );
    const settledExpanded = computed(() => settledOpen.value ?? liveRows.value.length === 0);
    const visibleCount = computed(() => liveRows.value.length + settledRows.value.length);
    const hasJobs = computed(() => visibleCount.value > 0);
    const open = computed(
      () =>
        hasJobs.value &&
        menuState.value.sessionId === props.sessionId &&
        menuState.value.mode !== "closed",
    );
    const cancelHover = (): void => {
      clearTimeout(hoverOpenTimer.value);
      clearTimeout(hoverCloseTimer.value);
      hoverOpenTimer.value = undefined;
      hoverCloseTimer.value = undefined;
    };
    const changeOpen = (next: boolean): void => {
      cancelHover();
      if (next) now.value = Date.now();
      menuState.value = { sessionId: props.sessionId, mode: next ? "pinned" : "closed" };
    };
    // CSS owns the compact breakpoint; read its result only for pointer gestures.
    const allowsHoverOpen = (): boolean =>
      countRef.value !== null && getComputedStyle(countRef.value).display !== "none";
    const hoverEnter = (event: PointerEvent): void => {
      if (event.pointerType === "touch") return;
      cancelHover();
      if (open.value || !allowsHoverOpen()) return;
      hoverOpenTimer.value = setTimeout(() => {
        hoverOpenTimer.value = undefined;
        if (!allowsHoverOpen()) return;
        now.value = Date.now();
        menuState.value = { sessionId: props.sessionId, mode: "hover" };
      }, 150);
    };
    const hoverLeave = (event: PointerEvent): void => {
      if (event.pointerType === "touch") return;
      cancelHover();
      if (!open.value || menuState.value.mode === "pinned") return;
      hoverCloseTimer.value = setTimeout(() => {
        hoverCloseTimer.value = undefined;
        menuState.value = { sessionId: props.sessionId, mode: "closed" };
      }, 120);
    };
    // Timers belong to this mounted session and cannot survive a disappearing trigger.
    // Timers belong to this mounted session and cannot survive a disappearing trigger.
    watch(
      [() => cancelHover, () => props.sessionId, () => hasJobs.value],
      (_value, _previous, onCleanup) => {
        const cleanup: void | (() => void) = (() => cancelHover)();
        if (typeof cleanup === "function") onCleanup(cleanup);
      },
      { immediate: true, flush: "post" },
    );
    const anchorName = `--dsh-jobs-${useId().replaceAll(":", "")}`;
    useDismissOnOutsidePointer(rootRef, () => open.value, changeOpen, menuRef);
    // Hover does not move focus; Escape must also work from the rest of the page.
    watch(
      [() => open.value, () => changeOpen],
      (_value, _previous, onCleanup) => {
        const cleanup: void | (() => void) = (() => {
          if (!open.value) return;
          const dismiss = (event: globalThis.KeyboardEvent): void => {
            if (event.key !== "Escape" || event.defaultPrevented) return;
            event.preventDefault();
            changeOpen(false);
          };
          document.addEventListener("keydown", dismiss);
          return () => {
            document.removeEventListener("keydown", dismiss);
          };
        })();
        if (typeof cleanup === "function") onCleanup(cleanup);
      },
      { immediate: true, flush: "post" },
    );
    // The roster follows the mounted session: one stream while this control
    // lives, released with it.
    watch(
      [() => props.sessionId, () => props.watchRows],
      (_value, _previous, onCleanup) => {
        const cleanup: void | (() => void) = (() => props.watchRows(props.sessionId))();
        if (typeof cleanup === "function") onCleanup(cleanup);
      },
      { immediate: true, flush: "post" },
    );
    // The clock only runs while an open list is showing something that moves.
    watch(
      [() => open.value, () => liveRows.value.length],
      (_value, _previous, onCleanup) => {
        const cleanup: void | (() => void) = (() => {
          if (!open.value || liveRows.value.length === 0) return;
          now.value = Date.now();
          const timer = setInterval(() => {
            now.value = Date.now();
          }, 1000);
          return () => {
            clearInterval(timer);
          };
        })();
        if (typeof cleanup === "function") onCleanup(cleanup);
      },
      { immediate: true, flush: "post" },
    );
    const expandedRow = computed(() =>
      open.value && expandedKey.value !== undefined
        ? rows.value.find((job) => String(job.id) === expandedKey.value)
        : undefined,
    );
    const activeJob = computed(() =>
      expandedRow.value !== undefined && isObservable(expandedRow.value)
        ? expandedRow.value.id
        : undefined,
    );
    watch(
      [() => props.sessionId, () => activeJob.value, () => props.observe],
      (_value, _previous, onCleanup) => {
        const cleanup: void | (() => void) = (() => {
          if (activeJob.value === undefined) return;
          return props.observe(props.sessionId, activeJob.value);
        })();
        if (typeof cleanup === "function") onCleanup(cleanup);
      },
      { immediate: true, flush: "post" },
    );
    // A returning roster starts closed rather than restoring an obsolete pin.
    watch(
      [() => hasJobs.value, () => changeOpen],
      (_value, _previous, onCleanup) => {
        const cleanup: void | (() => void) = (() => {
          if (!hasJobs.value) changeOpen(false);
        })();
        if (typeof cleanup === "function") onCleanup(cleanup);
      },
      { immediate: true, flush: "post" },
    );
    // An expanded row that left the list (owner disposal) folds its panel.
    watch(
      [() => rows.value, () => expandedKey.value],
      (_value, _previous, onCleanup) => {
        const cleanup: void | (() => void) = (() => {
          if (
            expandedKey.value !== undefined &&
            !rows.value.some((job) => String(job.id) === expandedKey.value)
          ) {
            expandedKey.value = undefined;
          }
        })();
        if (typeof cleanup === "function") onCleanup(cleanup);
      },
      { immediate: true, flush: "post" },
    );
    // An armed kill disarms on a timer, and a failed one clears its hint; the
    // pending phase instead waits for the RPC (or the row's own status flip).
    // The cleanup clears the timer on every phase change, so a firing timer
    // always describes the current phase and may reset unconditionally.
    watch(
      [() => killPhase.value],
      (_value, _previous, onCleanup) => {
        const cleanup: void | (() => void) = (() => {
          if (killPhase.value === undefined || killPhase.value!.state === "pending") return;
          const timer = setTimeout(
            () => {
              killPhase.value = undefined;
            },
            killPhase.value!.state === "armed" ? KILL_ARM_MS : KILL_FAILED_MS,
          );
          return () => {
            clearTimeout(timer);
          };
        })();
        if (typeof cleanup === "function") onCleanup(cleanup);
      },
      { immediate: true, flush: "post" },
    );
    // A phase whose row stopped being killable (settled, stopping, removed)
    // has no button to describe any more.
    watch(
      [() => rows.value, () => killPhase.value],
      (_value, _previous, onCleanup) => {
        const cleanup: void | (() => void) = (() => {
          if (
            killPhase.value !== undefined &&
            !rows.value.some(
              (job) => String(job.id) === killPhase.value!.key && job.status === "running",
            )
          ) {
            killPhase.value = undefined;
          }
        })();
        if (typeof cleanup === "function") onCleanup(cleanup);
      },
      { immediate: true, flush: "post" },
    );
    const pressKill = (job: JobView): void => {
      const key = String(job.id);
      if (killPhase.value?.key !== key || killPhase.value!.state !== "armed") {
        killPhase.value = { key, state: "armed" };
        return;
      }
      killPhase.value = { key, state: "pending" };
      void props.killJob(props.sessionId, key).then((ok) => {
        // An admitted kill stays pending: the unary response (HTTP) and the jobs
        // frames (control stream) have no cross-carrier ordering, so re-enabling
        // here could offer a duplicate kill while the row still reads `running`.
        // The authoritative jobs frame flips the row to `stopping`, which removes
        // the button and clears the phase through the killable-set effect above.
        killPhase.value = ((current) =>
          current?.key === key && !ok ? { key, state: "failed" } : current)(killPhase.value);
      });
    };
    const count = computed(() =>
      liveRows.value.length > 0 ? liveRows.value.length : visibleCount.value,
    );
    const countLabel = computed(() =>
      props.t(count.value === 1 ? "count.idle.one" : "count.idle.other", { count: count.value }),
    );
    const clearSettled = (): void => {
      clearedKeys.value = ((current) => {
        const next = new Set(current);
        for (const job of settledRows.value) next.add(String(job.id));
        return next;
      })(clearedKeys.value);
      if (
        expandedKey.value !== undefined &&
        settledRows.value.some((job) => String(job.id) === expandedKey.value)
      ) {
        expandedKey.value = undefined;
      }
    };
    // The portaled list sits at the end of the document, so Tab is bridged to
    // keep the in-place order: the trigger leads into the list, and leaving
    // either end of the list returns to the trigger's position in the page.
    const onKeyDown = (event: KeyboardEvent & { currentTarget: HTMLDivElement }): void => {
      const trigger = triggerRef.value;
      if (event.key === "Escape") {
        event.preventDefault();
        changeOpen(false);
        trigger?.focus();
        return;
      }
      if (!open.value) return;
      const menu = menuRef.value;
      /* v8 ignore next -- both refs are attached while the open list renders. */
      if (event.key !== "Tab" || trigger === null || menu === null) return;
      const focusable = [...menu.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (event.target === trigger) {
        // Every list carries a control: a live row's toggle or the settled section's buttons.
        if (event.shiftKey) return;
        event.preventDefault();
        focusable[0]?.focus();
      } else if (
        event.shiftKey ? event.target === focusable[0] : event.target === focusable.at(-1)
      ) {
        // Shift+Tab lands on the trigger itself; Tab continues from it to the
        // control that follows the trigger.
        if (event.shiftKey) event.preventDefault();
        trigger.focus();
      }
    };
    const item = (job: JobView) =>
      h(JobItem, {
        key: String(job.id),
        job: job,
        view: isObservable(job) ? observedViews.value[String(job.id)] : undefined,
        expanded: expandedKey.value === String(job.id),
        now: now.value,
        onToggle: () => {
          expandedKey.value = ((current) =>
            current === String(job.id) ? undefined : String(job.id))(expandedKey.value);
        },
        ...(job.status === "running"
          ? {
              kill: {
                state:
                  killPhase.value?.key === String(job.id)
                    ? killPhase.value!.state
                    : ("idle" as const),
                onPress: () => {
                  pressKill(job);
                },
              },
            }
          : {}),
        t: props.t,
      });
    return () => {
      if (visibleCount.value === 0) return null;
      return h("div", { ref: rootRef, style: { anchorName: anchorName }, onKeydown: onKeyDown }, [
        h(
          Tooltip,
          {
            label: countLabel.value,
            disabled: open.value,
            delayMs: 500,
            portal: true,
            side: "bottom",
          },
          {
            default: () => [
              h(
                "button",
                {
                  ref: triggerRef,
                  type: "button",
                  class: css.trigger,
                  "aria-expanded": open.value,
                  "aria-label": countLabel.value,
                  "aria-describedby": liveRows.value.length > 0 ? activityId : undefined,
                  onPointerenter: hoverEnter,
                  onPointerleave: hoverLeave,
                  onClick: () => {
                    changeOpen(
                      !open.value || (allowsHoverOpen() && menuState.value.mode !== "pinned"),
                    );
                  },
                  onKeydown: (event) => {
                    if (event.key !== "ArrowDown") return;
                    event.preventDefault();
                    changeOpen(true);
                    void nextTick(() => {
                      menuRef.value?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
                    });
                  },
                },
                [
                  h("span", { class: css.activitySlot, "aria-hidden": true }, [
                    h(IconLayersOutlineRegular, {
                      size: 14,
                      className: liveRows.value.length > 0 ? css.compactIcon! : "",
                    }),
                    liveRows.value.length > 0 &&
                      h(StateDot, { state: "ongoing", className: css.textModeActivity! }),
                  ]),
                  h("span", { ref: countRef, class: css.count, "data-job-count": true }, [
                    countLabel.value,
                  ]),
                ],
              ),
            ],
          },
        ),
        liveRows.value.length > 0 &&
          h("span", { id: activityId, hidden: true }, [props.t("section.live")]),
        open.value
          ? h(Teleport, { to: document.body }, [
              h(
                MenuSurface,
                {
                  onKeydown: onKeyDown,
                  elementRef: (element: HTMLDivElement | null) => {
                    menuRef.value = element;
                  },
                  className: css.menu!,
                  style: { positionAnchor: anchorName },
                  onPointerenter: hoverEnter,
                  onPointerleave: hoverLeave,
                  onPointerdownCapture: () => {
                    changeOpen(true);
                  },
                  onFocusCapture: () => {
                    changeOpen(true);
                  },
                },
                {
                  default: () => [
                    h("ul", { class: css.menuBody, "aria-label": props.t("list.aria") }, [
                      liveRows.value.length > 0
                        ? h("li", { class: css.sectionHeader, "aria-hidden": "true" }, [
                            props.t("section.live"),
                          ])
                        : null,
                      liveRows.value.map(item),
                      settledRows.value.length > 0
                        ? h("li", { class: css.sectionHeader }, [
                            h(
                              "button",
                              {
                                type: "button",
                                class: css.sectionToggle,
                                "aria-expanded": settledExpanded.value,
                                onClick: () => {
                                  settledOpen.value = !settledExpanded.value;
                                },
                              },
                              [
                                h(IconChevronDownOutlineRegular, {
                                  size: 12,
                                  className: settledExpanded.value
                                    ? `${css.sectionChevron} ${css.sectionChevronOpen}`
                                    : css.sectionChevron!,
                                }),
                                props.t("section.settledCount", {
                                  count: settledRows.value.length,
                                }),
                              ],
                            ),
                            h(
                              "button",
                              { type: "button", class: css.sectionClear, onClick: clearSettled },
                              [props.t("section.clear")],
                            ),
                          ])
                        : null,
                      settledExpanded.value ? settledRows.value.map(item) : null,
                    ]),
                  ],
                },
              ),
            ])
          : null,
      ]);
    };
  },
  { props: ["watchRows", "observe", "killJob", "useJobs", "sessionId", "t"] },
);
