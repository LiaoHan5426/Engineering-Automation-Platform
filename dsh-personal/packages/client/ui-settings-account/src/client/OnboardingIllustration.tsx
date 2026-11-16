import { defineComponent, h } from "vue";
/** Paired artwork follows the page's light and dark theme selectors. */
import css from "./DesktopOnboarding.module.css";
/** @param props - artwork URLs and feature-owned geometry. @returns decorative theme variants. */
export const OnboardingIllustration = defineComponent(
  (componentProps: { className?: string | undefined; src: string; darkSrc: string }) => {
    return () => {
      const render_prop_className = componentProps.className;
      const render_prop_src = componentProps.src;
      const render_prop_darkSrc = componentProps.darkSrc;
      return h(
        "div",
        { class: `${css.illustration} ${render_prop_className ?? ""}`, "aria-hidden": "true" },
        [
          h("img", { class: css.lightIllustration, src: render_prop_src, alt: "" }),
          h("img", { class: css.darkIllustration, src: render_prop_darkSrc, alt: "" }),
        ],
      );
    };
  },
  { inheritAttrs: false, props: ["className", "src", "darkSrc"] },
);
