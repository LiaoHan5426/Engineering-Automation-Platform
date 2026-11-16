import { Teleport, defineComponent, h, onBeforeUnmount, onMounted, shallowRef, watch } from "vue";
/** Body-portaled introduction with shared background interaction ownership. */
import { acquireOverlayInert } from "./overlay-inert.ts";
import css from "./OnboardingSurface.module.css";
/**
 * Render a body-portaled onboarding stage and keep the application root inert
 * while mounted. Completion reveals the root beneath a fading stage;
 * native titlebar controls, dialogs, and account pages remain above the stage.
 * @param props.children - the step's page content, centered on the stage.
 * @param props.exiting - reveal the application while the owner retains the stage for its 180ms exit.
 * @returns the body-portaled overlay tree.
 */
export const OnboardingSurface = defineComponent(
  (
    componentProps: {
      exiting?: boolean;
    },
    { slots },
  ) => {
    const rootState = shallowRef<{
      element: HTMLElement;
      opacity: string;
    } | null | null>(null);
    onMounted(() => {
      const dispose = (() => {
        const appRoot = document.getElementById("root");
        if (appRoot === null) return;
        const releaseInert = acquireOverlayInert(appRoot);
        const previousOpacity = appRoot.style.opacity;
        rootState.value = { element: appRoot, opacity: previousOpacity };
        appRoot.style.opacity = "0";
        return () => {
          releaseInert();
          appRoot.style.opacity = previousOpacity;
          rootState.value = null;
        };
      })();
      if (typeof dispose === "function") onBeforeUnmount(dispose);
    });
    onMounted(() => {
      watch(
        () => [componentProps.exiting ?? false],
        (_values, _old, onCleanup) => {
          const dispose = (() => {
            const root = rootState.value;
            if (root !== null)
              root.element.style.opacity = (componentProps.exiting ?? false) ? root.opacity : "0";
          })();
          if (typeof dispose === "function") onCleanup(dispose);
        },
        { immediate: true, flush: "post" },
      );
    });
    return () => {
      const render_prop_exiting = componentProps.exiting;
      return h(Teleport, { to: document.body }, [
        h(
          "div",
          {
            class: css.onboardingOverlay,
            "data-exiting": (render_prop_exiting ?? false) || undefined,
            role: "presentation",
          },
          [
            h("div", { class: css.dragBand, "data-window-drag": true, "aria-hidden": "true" }),
            h("div", { class: css.onboardingStage, "data-window-drag-controls": true }, [
              slots.default?.(),
            ]),
          ],
        ),
      ]);
    };
  },
  { inheritAttrs: false, props: ["exiting"] },
);
