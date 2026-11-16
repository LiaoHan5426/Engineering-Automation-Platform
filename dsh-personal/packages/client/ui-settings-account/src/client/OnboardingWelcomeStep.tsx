import { normalizeClass, defineComponent, h } from "vue";
import type { Ref } from "vue";
/** Welcome page with a required explicit start. */
import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import type { DesktopOnboardingProps } from "./onboarding-contract.ts";
import { OnboardingIllustration } from "./OnboardingIllustration.tsx";
import art from "./assets/onboarding-welcome.webp";
import artDark from "./assets/onboarding-welcome-dark.webp";
import artZh from "./assets/onboarding-welcome-zh.webp";
import artZhDark from "./assets/onboarding-welcome-zh-dark.webp";
import css from "./DesktopOnboarding.module.css";
/** @param props - localized content, focus target and navigation. @returns the welcome step. */
export const OnboardingWelcomeStep = defineComponent(
  (
    componentProps: Pick<DesktopOnboardingProps, "t" | "locale"> & {
      heading: Ref<HTMLHeadingElement | null>;
      busy: boolean;
      onStart: () => void;
    },
  ) => {
    return () => {
      const render_prop_heading = componentProps.heading;
      const render_prop_t = componentProps.t;
      const render_prop_busy = componentProps.busy;
      const render_prop_onStart = componentProps.onStart;
      const render_prop_locale = componentProps.locale;
      return h("div", { class: `${css.content} ${css.welcome}` }, [
        h("div", { class: css.copy }, [
          h("h1", { id: "desktop-onboarding-title", ref: render_prop_heading, tabIndex: -1 }, [
            render_prop_t("onboardingWelcome"),
            " ",
            h("em", { class: css.brand }, [render_prop_t("onboardingBrand")]),
          ]),
          h("p", { class: css.heroDescription }, [render_prop_t("onboardingIntroduction")]),
          h(
            Button,
            {
              variant: "primary",
              className: normalizeClass(`${css.action} ${css.start}`),
              disabled: render_prop_busy,
              onClick: render_prop_onStart,
            },
            {
              default: () => render_prop_t("onboardingStart"),
            },
          ),
        ]),
        h("div", { class: css.welcomeIllustration, "aria-hidden": "true" }, [
          h(OnboardingIllustration, {
            className: normalizeClass(css.welcomeArtwork),
            src: render_prop_locale === "zh" ? artZh : art,
            darkSrc: render_prop_locale === "zh" ? artZhDark : artDark,
          }),
        ]),
      ]);
    };
  },
  { inheritAttrs: false, props: ["t", "locale", "heading", "busy", "onStart"] },
);
