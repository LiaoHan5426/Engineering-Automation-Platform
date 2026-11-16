import { normalizeClass } from "vue";
import { defineComponent, h, onBeforeUnmount, onMounted, shallowRef, watch } from "vue";
/** Shared modal chrome for every step registered by this onboarding plugin. */
import { Modal } from "@deepseek-ai/dsh-client-ui-primitives";
import css from "./OnboardingModal.module.css";
const ignoreImplicitDismiss = (): void => {};
/** Render a blocking onboarding dialog, owning inert state until unmount. */
export const OnboardingModal = defineComponent(
  (
    props: {
      title: string;
      focusTitle?: boolean;
    },
    { slots },
  ) => {
    const titleRef = shallowRef<HTMLHeadingElement | null>(null);
    let restoreInert: (() => void) | undefined;
    onMounted(() => {
      const appRoot = document.getElementById("root");
      if (appRoot === null) return;
      const previous = appRoot.inert;
      appRoot.inert = true;
      restoreInert = () => {
        appRoot.inert = previous;
      };
    });
    onBeforeUnmount(() => {
      restoreInert?.();
    });
    watch(
      [titleRef, () => props.focusTitle],
      () => {
        if (props.focusTitle === true) titleRef.value?.focus();
      },
      { flush: "post" },
    );
    return () =>
      h(
        Modal,
        {
          open: true,
          title: props.title,
          onClose: ignoreImplicitDismiss,
          headless: true,
          className: normalizeClass(css.dialog) as string,
        },
        {
          default: () =>
            h("div", { class: css.content }, [
              h(
                "h2",
                {
                  ref: titleRef,
                  class: css.title,
                  tabindex: props.focusTitle === true ? -1 : undefined,
                },
                props.title,
              ),
              h("div", { class: css.body }, slots.default?.()),
            ]),
        },
      );
  },
  { inheritAttrs: false, props: ["title", "focusTitle"] },
);
