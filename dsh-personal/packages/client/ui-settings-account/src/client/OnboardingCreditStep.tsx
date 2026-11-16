import { normalizeClass, defineComponent, h } from "vue";
import type { Ref } from "vue";
/** Credit introduction retains the action ordering selected on first entry. */
import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import type { DesktopOnboardingProps } from "./onboarding-contract.ts";
import { OnboardingIllustration } from "./OnboardingIllustration.tsx";
import art from "./assets/onboarding-recharge.webp";
import artDark from "./assets/onboarding-recharge-dark.webp";
import artZh from "./assets/onboarding-recharge-zh.webp";
import artZhDark from "./assets/onboarding-recharge-zh-dark.webp";
import css from "./DesktopOnboarding.module.css";
/** @param props - credit facts, localized content and recharge/navigation actions. @returns the credit step. */
export const OnboardingCreditStep = defineComponent(
  (
    componentProps: Pick<DesktopOnboardingProps, "t" | "locale"> & {
      heading: Ref<HTMLHeadingElement | null>;
      busy: boolean;
      funded: boolean;
      canRecharge: boolean;
      onContinue: () => void;
      onRecharge: () => void;
      onLater: () => void;
    },
  ) => {
    return () => {
      const render_prop_locale = componentProps.locale;
      const render_prop_heading = componentProps.heading;
      const render_prop_t = componentProps.t;
      const render_prop_busy = componentProps.busy;
      const render_prop_funded = componentProps.funded;
      const render_prop_canRecharge = componentProps.canRecharge;
      const render_prop_onContinue = componentProps.onContinue;
      const render_prop_onRecharge = componentProps.onRecharge;
      const render_prop_onLater = componentProps.onLater;
      return h("div", { class: `${css.content} ${css.credit}` }, [
        h(OnboardingIllustration, {
          className: normalizeClass(css.creditIllustration),
          src: render_prop_locale === "zh" ? artZh : art,
          darkSrc: render_prop_locale === "zh" ? artZhDark : artDark,
        }),
        h("div", { class: css.copy }, [
          h("h1", { id: "desktop-onboarding-title", ref: render_prop_heading, tabIndex: -1 }, [
            render_prop_t("onboardingCredit"),
          ]),
          h("p", { class: css.heroDescription }, [render_prop_t("onboardingCreditDescription")]),
          h("div", { class: css.creditActions }, [
            h(
              Button,
              {
                className: normalizeClass(css.action),
                variant: "primary",
                disabled: render_prop_busy || (!render_prop_funded && !render_prop_canRecharge),
                onClick: render_prop_funded ? render_prop_onContinue : render_prop_onRecharge,
              },
              {
                default: () =>
                  render_prop_t(render_prop_funded ? "onboardingContinue" : "onboardingTopUp"),
              },
            ),
            h(
              Button,
              {
                variant: "outline",
                className: normalizeClass(`${css.action} ${css.laterAction}`),
                disabled: render_prop_busy || (render_prop_funded && !render_prop_canRecharge),
                onClick: render_prop_funded ? render_prop_onRecharge : render_prop_onLater,
              },
              {
                default: () =>
                  render_prop_t(render_prop_funded ? "onboardingFundedTopUp" : "onboardingLater"),
              },
            ),
          ]),
        ]),
      ]);
    };
  },
  {
    inheritAttrs: false,
    props: [
      "t",
      "locale",
      "heading",
      "busy",
      "funded",
      "canRecharge",
      "onContinue",
      "onRecharge",
      "onLater",
    ],
  },
);
