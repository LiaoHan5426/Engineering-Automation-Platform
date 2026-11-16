import { normalizeClass, computed, defineComponent, h } from "vue";
/** Credit and setup confirmations with contained keyboard focus. */
import { Button, IconCloseOutlineRegular, Modal } from "@deepseek-ai/dsh-client-ui-primitives";
import type { DesktopOnboardingProps } from "./onboarding-contract.ts";
import css from "./DesktopOnboarding.module.css";
/** The action requiring confirmation, including skipping directly from the credit page. */
export type OnboardingConfirmationKind = "credit" | "credit-skip" | "skip";
/** @param props - confirmation action, localized copy and navigation callbacks. @returns a focus-contained dialog. */
export const OnboardingConfirmation = defineComponent(
  (
    componentProps: Pick<DesktopOnboardingProps, "t"> & {
      kind: OnboardingConfirmationKind;
      busy: boolean;
      canRecharge: boolean;
      onClose: () => void;
      onContinueSetup: () => void;
      onContinue: () => void;
      onRecharge: () => void;
      onSkip: () => void;
    },
  ) => {
    const creditRef = computed(() => componentProps.kind !== "skip");
    const titleRef = computed(() =>
      componentProps.t(creditRef.value ? "onboardingNoCreditTitle" : "onboardingSkipTitle"),
    );
    return () => {
      const render_titleRef = titleRef.value;
      const render_creditRef = creditRef.value;
      const render_prop_onClose = componentProps.onClose;
      const render_prop_t = componentProps.t;
      const render_prop_busy = componentProps.busy;
      const render_prop_kind = componentProps.kind;
      const render_prop_onSkip = componentProps.onSkip;
      const render_prop_onContinue = componentProps.onContinue;
      const render_prop_onContinueSetup = componentProps.onContinueSetup;
      const render_prop_canRecharge = componentProps.canRecharge;
      const render_prop_onRecharge = componentProps.onRecharge;
      return h(
        Modal,
        {
          open: true,
          headless: true,
          backdropBlur: false,
          title: render_titleRef,
          onClose: render_prop_onClose,
        },
        {
          default: () =>
            h("div", { class: css.confirmation }, [
              h("div", { class: css.confirmationHeading }, [
                h("h2", null, [render_titleRef]),
                h(
                  "button",
                  {
                    type: "button",
                    class: css.confirmationClose,
                    "aria-label": render_prop_t("close"),
                    onClick: render_prop_onClose,
                  },
                  [h(IconCloseOutlineRegular, { size: 14 })],
                ),
              ]),
              h("p", null, [
                render_prop_t(
                  render_creditRef
                    ? "onboardingNoCreditDescription"
                    : /** @param props - confirmation action, localized copy and navigation callbacks. @returns a focus-contained dialog. */
                      "onboardingSkipDescription",
                ),
              ]),
              h("div", { class: css.confirmationActions }, [
                h(
                  Button,
                  {
                    className: normalizeClass(css.dialogButton),
                    variant: "outline",
                    disabled: render_prop_busy,
                    onClick:
                      render_prop_kind === "credit-skip"
                        ? render_prop_onSkip
                        : render_prop_kind === "credit"
                          ? render_prop_onContinue
                          : render_prop_onContinueSetup,
                  },
                  {
                    default: () =>
                      render_prop_t(
                        render_creditRef ? "onboardingUnderstood" : "onboardingKeepSetting",
                      ),
                  },
                ),
                h(
                  Button,
                  {
                    className: normalizeClass(css.dialogButton),
                    variant: "primary",
                    disabled: render_prop_busy || (render_creditRef && !render_prop_canRecharge),
                    onClick: render_creditRef ? render_prop_onRecharge : render_prop_onSkip,
                  },
                  {
                    default: () =>
                      render_prop_t(render_creditRef ? "onboardingGoTopUp" : "onboardingEnter"),
                  },
                ),
              ]),
            ]),
        },
      );
    };
  },
  {
    inheritAttrs: false,
    props: [
      "kind",
      "t",
      "busy",
      "canRecharge",
      "onClose",
      "onContinueSetup",
      "onContinue",
      "onRecharge",
      "onSkip",
    ],
  },
);
