import { normalizeClass } from "vue";
import { h, defineComponent, watchEffect } from "vue";
/** Product-wide, versioned preview notice. */
import type { SnapshotStore } from "@deepseek-ai/dsh-client-store";
import type { InjectFace, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import type { WelcomeNoticeState, WelcomeNoticeStore } from "./welcome-store.ts";
import type { en } from "./locales.ts";
import { OnboardingModal } from "./OnboardingModal.tsx";
import css from "./WelcomeNotice.module.css";
/** Registration-side dependencies of {@link WelcomeNotice}. */
export interface WelcomeNoticeInjected {
  hooks: {
    /** Durable acknowledgement state. */
    welcome: SnapshotStore<WelcomeNoticeState>;
  };
  /** Welcome acknowledgement controller. */
  controller: WelcomeNoticeStore;
  /** Onboarding copy. */
  t: (key: keyof typeof en) => string;
}
/** Coordinator owner props plus this step's injected face. */
export type WelcomeNoticeProps = PropsRuntime<"settings.onboarding"> &
  InjectFace<WelcomeNoticeInjected>;
/**
 * Render the current notice until its exact copy version is acknowledged.
 * @param props - settings-shell owner state and welcome dependencies.
 * @returns the welcome modal or null while the step decides not to show.
 */
export const WelcomeNotice = defineComponent(
  (props: WelcomeNoticeProps) => {
    const stateRef = props.useWelcome((snapshot) => snapshot);
    let finished = false;
    const finish = (): void => {
      if (finished) return;
      finished = true;
      props.complete();
    };
    watchEffect(() => {
      if (stateRef.value.status === "idle") void props.controller.load();
      if (stateRef.value.acknowledged) finish();
    });
    const acknowledge = async (): Promise<void> => {
      if (await props.controller.acknowledge()) finish();
    };
    return () => {
      const state = stateRef.value;
      const t = props.t;
      if (state.status === "idle" || state.status === "loading" || state.acknowledged) return null;
      return h(
        OnboardingModal,
        { title: t("welcomeTitle"), focusTitle: true },
        {
          default: () => [
            h(
              "div",
              { class: css.copy },
              t("welcomeBody")
                .split("\n\n")
                .map((paragraph) => h("p", { key: paragraph }, paragraph)),
            ),
            state.error === null
              ? null
              : h("p", { class: css.error, role: "alert" }, t("welcomeError")),
            h("div", { class: css.actions }, [
              h(
                Button,
                {
                  variant: "primary",
                  className: normalizeClass(css.primary),
                  disabled: state.status === "saving",
                  onClick: () => {
                    void acknowledge();
                  },
                },
                { default: () => t("welcomeContinue") },
              ),
            ]),
          ],
        },
      );
    };
  },
  { inheritAttrs: false, props: ["complete", "controller", "useWelcome", "t"] },
);
