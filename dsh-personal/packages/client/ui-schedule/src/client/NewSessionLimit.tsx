import { h, defineComponent, computed, shallowRef, watch } from "vue";
import { Button, StateDot } from "@deepseek-ai/dsh-client-ui-primitives";
import type { PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import type { HostTaskActions } from "./TaskDetail.tsx";
import css from "./TaskManagerPage.module.css";
/** Read the configured interval through an injected action; failed reads stay visible and retryable.
 * @param props - The failure-contained read action and task-manager translations.
 * @returns The configured interval, a loading indicator, or a retryable failure.
 */
export const NewSessionLimit = defineComponent(
  (
    props: PropsLocale<"schedule.manager"> & {
      readonly load: HostTaskActions["loadNewSessionInterval"];
    },
  ) => {
    const attempt = shallowRef(0);
    const interval = shallowRef<number | "loading" | "error">("loading");
    watch(
      [() => props.load, () => attempt.value],
      (_value, _previous, onCleanup) => {
        const cleanup: void | (() => void) = (() => {
          let active = true;
          interval.value = "loading";
          void props.load().then((seconds) => {
            if (active) interval.value = seconds ?? "error";
          });
          return () => {
            active = false;
          };
        })();
        if (typeof cleanup === "function") onCleanup(cleanup);
      },
      { immediate: true, flush: "post" },
    );
    const unit = computed(() =>
      (interval.value as number) % 3600 === 0
        ? "hour"
        : (interval.value as number) % 60 === 0
          ? "minute"
          : "second",
    );
    const value = computed(
      () =>
        (interval.value as number) /
        (unit.value === "hour" ? 3600 : unit.value === "minute" ? 60 : 1),
    );
    const label = computed(() =>
      new Intl.NumberFormat(props.t("time.locale"), {
        style: "unit",
        unit: unit.value,
        unitDisplay: "long",
      }).format(value.value),
    );
    return () => {
      if (interval.value === "loading")
        return h(
          "div",
          { class: css.saveNotice, role: "status", "aria-label": props.t("host.limitsLoading") },
          [h(StateDot, { state: "ongoing" })],
        );
      if (interval.value === "error")
        return h("div", { class: css.notice }, [
          h("p", { role: "alert" }, [props.t("host.limitsError")]),
          h(
            Button,
            {
              size: "sm",
              onClick: () => {
                attempt.value = ((value) => value + 1)(attempt.value);
              },
            },
            { default: () => [props.t("list.retry")] },
          ),
        ]);
      return h("p", { class: css.saveNotice }, [
        props.t("host.newSessionInterval", { interval: label.value }),
      ]);
    };
  },
  { props: ["load", "t"] },
);
