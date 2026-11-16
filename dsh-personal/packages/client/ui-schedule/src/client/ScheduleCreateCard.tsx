import { h, defineComponent, computed } from "vue";
import { Button, IconClockOutlineRegular } from "@deepseek-ai/dsh-client-ui-primitives";
import type { InjectFace, PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import type { ToolCallViewProps } from "@deepseek-ai/dsh-client-ui-tool/client";
import type { ScheduleId, ScheduleRecord } from "@deepseek-ai/dsh-schedule/client";
import { formatScheduleFrequency, taskName } from "./schedule-format.ts";
import { scheduleCreateCardModel } from "./schedule-create-card.ts";
import css from "./ScheduleCreateCard.module.css";
/** Task navigation the card receives from its Turn-tail registration. */
export interface ScheduleCreateCardInjected {
  /**
   * Show one created task's detail in the right Sidebar.
   * @param id - Task created by this call.
   */
  readonly openTaskDetail: (id: ScheduleId) => void;
}
/** Props of the `schedule_create` transcript card. */
export type ScheduleCreateCardProps = ToolCallViewProps &
  PropsLocale<"schedule.manager"> &
  InjectFace<ScheduleCreateCardInjected> & {
    readonly currentTask?: ScheduleRecord | null;
  };
/**
 * Fields one card reads.
 *
 * The keyed Tool seat also carries the owner's file opener, image loader, and
 * workspace facts; this card reads none of them, so the Turn tail that renders
 * it supplies these fields alone and a template that starts reading another
 * owner field fails to compile here.
 */
export type ScheduleCreateCardInput = Pick<
  ScheduleCreateCardProps,
  "callId" | "toolName" | "block" | "openTaskDetail" | "t" | "currentTask"
>;
/**
 * Render one `schedule_create` call as the created task's card.
 *
 * A settled result yields the task's title, its localized frequency, and the
 * button that opens that task's right-Sidebar detail. A running call, a failed
 * creation, or a replayed result with no complete task renders its title and
 * raw result text with no open action, so the card never presents an identity
 * it does not have.
 * @param props - the settled card payload, injected task navigation, and copy.
 * @returns the created task's transcript card.
 */
export const ScheduleCreateCard = defineComponent(
  (props: ScheduleCreateCardInput) => {
    const model = computed(() => scheduleCreateCardModel(props.block, props.toolName));
    const task = computed(() => props.currentTask ?? model.value.task);
    const deleted = computed(() => props.currentTask === null);
    const title = computed(() =>
      props.currentTask === undefined || props.currentTask === null
        ? model.value.title
        : taskName(props.currentTask),
    );
    const openable = computed(() => task.value !== undefined && !deleted.value);
    return () => {
      return h("div", { class: css.card, "data-tool": "schedule_create" }, [
        openable.value
          ? h("button", {
              type: "button",
              class: css.cardOpen,
              "aria-label": props.t("card.openLabel", { title: title.value }),
              onClick: () => {
                props.openTaskDetail(task.value!.id);
              },
            })
          : null,
        h("div", { class: css.row }, [
          h("span", { class: css.leading }, [h(IconClockOutlineRegular, { size: 18 })]),
          h("span", { class: css.body }, [
            h("span", { class: css.title }, [title.value]),
            task.value !== undefined
              ? h("span", { class: css.frequency }, [
                  deleted.value
                    ? props.t("card.deleted")
                    : formatScheduleFrequency(task.value, props.t),
                ])
              : null,
          ]),
          openable.value
            ? h(
                Button,
                {
                  variant: "outline",
                  size: "sm",
                  className: css.openButton!,
                  onClick: () => {
                    props.openTaskDetail(task.value!.id);
                  },
                },
                { default: () => [props.t("card.open")] },
              )
            : null,
        ]),
        task.value === undefined && model.value.output !== null
          ? h("pre", { class: css.fallback }, [model.value.output])
          : null,
      ]);
    };
  },
  { props: ["openTaskDetail", "callId", "toolName", "block", "t", "currentTask"] },
);
