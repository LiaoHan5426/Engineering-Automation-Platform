import { h, defineComponent, computed, shallowRef } from "vue";
/**
 * Scheduled-task section of the Sidebar Session-row hover card.
 *
 * The row's own card already carries the Session title, its relative time, and
 * the trailing status line; this seat contributes the Session's active tasks
 * between them. It is mounted only while the card is open, and it projects the
 * one shared Host task catalog onto the hovered Session.
 */
import { IconClockOutlineRegular } from "@deepseek-ai/dsh-client-ui-primitives";
import type { InjectFace, PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import type {} from "@deepseek-ai/dsh-client-ui-workspace/client";
import {
  formatScheduleFrequency,
  nextRunParts,
  orderScheduleRecords,
  taskName,
} from "./schedule-format.ts";
import { taskNextRunAt } from "./task-record.ts";
import {
  useSessionScheduleFacts,
  type SessionScheduleCatalogObservable,
} from "./session-schedule-state.ts";
import { NS } from "./locales.ts";
import css from "./SessionScheduleMark.module.css";
/** Most task rows one hover card shows before it reports the omitted remainder. */
export const SESSION_HOVER_TASK_LIMIT = 2;
/** Injected share of the Session-row hover-card task section: the shared Host task catalog. */
export interface SessionScheduleHoverInjected {
  /** One catalog shared by every row; the renderer binds it to the `useCatalog` selector hook. */
  readonly hooks: {
    readonly catalog: SessionScheduleCatalogObservable;
  };
}
/** Full props of the Session-row hover-card task section. */
export type SessionScheduleHoverProps = PropsRuntime<"sidebar.session.row.hover"> &
  PropsLocale<typeof NS> &
  InjectFace<SessionScheduleHoverInjected>;
/**
 * Render up to {@link SESSION_HOVER_TASK_LIMIT} overdue-first task rows.
 *
 * The reference clock is sampled once per mount: the card is a long-hover
 * preview, so its "next run" text must not drift while the pointer rests.
 * @param props.sessionId - Session this row shows.
 * @param props.useCatalog - selector hook over the shared Host task catalog.
 * @param props.t - Schedule catalog locale seat.
 * @returns the task rows plus an omission line, or nothing without an active task.
 */
export const SessionScheduleHover = defineComponent(
  (props: SessionScheduleHoverProps) => {
    const facts = useSessionScheduleFacts(props.useCatalog, () => props.sessionId);
    const now = shallowRef((() => Date.now())());
    const ordered = computed(() => orderScheduleRecords(facts.value.records, now.value));
    const shown = computed(() => ordered.value.slice(0, SESSION_HOVER_TASK_LIMIT));
    const omitted = computed(() => ordered.value.length - shown.value.length);
    return () => {
      if (!facts.value.hasActive) return null;
      return h("div", { class: css.tasks, "data-session-schedule-tasks": "" }, [
        shown.value.map((record) => {
          const nextRunAt = taskNextRunAt(record);
          const nextRun = nextRunParts(nextRunAt, props.t("time.locale"), now.value, props.t);
          return h("div", { class: css.task, key: record.id, "data-session-schedule-task": "" }, [
            h("span", { class: css.taskIcon, "aria-hidden": "true" }, [
              h(IconClockOutlineRegular, { size: 12 }),
            ]),
            h("span", { class: css.taskBody }, [
              h("span", { class: css.taskName }, [taskName(record)]),
              h("span", { class: css.taskTiming }, [
                `${formatScheduleFrequency(record, props.t)} · `,
                h("time", { dateTime: nextRunAt }, [nextRun.absolute]),
                " ",
                h("span", { class: css.taskRelative }, [nextRun.relative]),
              ]),
            ]),
          ]);
        }),
        omitted.value > 0 &&
          h("div", { class: css.omitted }, [props.t("hover.more", { count: omitted.value })]),
      ]);
    };
  },
  {
    props: [
      "sessionId",
      "useRemoteAccess",
      "useSessions",
      "useSessionRetainInfo",
      "useSessionAccess",
      "usePanelInfo",
      "useContextMenu",
      "useWorkspaces",
      "useCatalog",
      "t",
    ],
  },
);
