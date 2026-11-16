import {
  Fragment,
  computed,
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  watch,
} from "vue";
/** Coordinates onboarding navigation, transitions and the shared native recharge page. */
import type { ProductEventMap } from "@deepseek-ai/dsh-client-product-analytics/client";
import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import { hasOnboardingCredit } from "./onboarding-balance.ts";
import { OnboardingSurface } from "./OnboardingSurface.tsx";
import type { DesktopOnboardingProps } from "./onboarding-contract.ts";
import { OnboardingWelcomeStep } from "./OnboardingWelcomeStep.tsx";
import { OnboardingCreditStep } from "./OnboardingCreditStep.tsx";
import { OnboardingPurposeStep } from "./OnboardingPurposeStep.tsx";
import { OnboardingProcessStep } from "./OnboardingProcessStep.tsx";
import {
  OnboardingConfirmation,
  type OnboardingConfirmationKind,
} from "./OnboardingConfirmation.tsx";
import backIcon from "./assets/onboarding-back.svg";
import css from "./DesktopOnboarding.module.css";
const onboardingPages = {
  welcome: "onboarding_welcome",
  credit: "onboarding_recharge",
  purpose: "onboarding_use_case",
  process: "onboarding_process",
  done: undefined,
} as const;
/**
 * @param props - durable choices, account state, localized copy and the shared recharge page channel.
 * @returns the active first-run page.
 */
export const DesktopOnboarding = defineComponent(
  (componentProps: DesktopOnboardingProps) => {
    const dialogRef = shallowRef<OnboardingConfirmationKind | null>(null);
    const setDialog = (
      value:
        | typeof dialogRef.value
        | ((previous: typeof dialogRef.value) => typeof dialogRef.value),
    ): void => {
      dialogRef.value = typeof value === "function" ? value(dialogRef.value) : value;
    };
    const heading = shallowRef<HTMLHeadingElement | null>(null);
    const page = shallowRef<HTMLElement | null>(null);
    const releaseRecharge = shallowRef<(() => void) | undefined>(undefined);
    onMounted(() => {
      const dispose = (() => () => {
        releaseRecharge.value?.();
        releaseRecharge.value = undefined;
      })();
      if (typeof dispose === "function") onBeforeUnmount(dispose);
    });
    const progressRef = computed(() => componentProps.state.progress);
    const targetStepRef = computed(() => progressRef.value.step);
    const stepRef = shallowRef(targetStepRef.value);
    const setStep = (
      value: typeof stepRef.value | ((previous: typeof stepRef.value) => typeof stepRef.value),
    ): void => {
      stepRef.value = typeof value === "function" ? value(stepRef.value) : value;
    };
    const busyRef = computed(
      () =>
        componentProps.state.status === "loading" ||
        componentProps.state.status === "saving" ||
        (componentProps.exiting ?? false) ||
        stepRef.value !== targetStepRef.value,
    );
    onMounted(() => {
      watch(
        () => [targetStepRef.value, stepRef.value, componentProps.state.visible],
        (_values, _old, onCleanup) => {
          const dispose = (() => {
            if (stepRef.value === targetStepRef.value) return;
            const element = page.value;
            if (
              !componentProps.state.visible ||
              element?.animate === undefined ||
              matchMedia("(prefers-reduced-motion: reduce)").matches
            ) {
              setStep(targetStepRef.value);
              return;
            }
            const animation = element.animate([{ opacity: 1 }, { opacity: 0 }], {
              duration: 40,
              fill: "forwards",
              easing: "ease-out",
            });
            void animation.finished.then(
              () => {
                setStep(targetStepRef.value);
              },
              (_error: unknown) => {
                // A newer step or unmount cancels this visual transition.
              },
            );
            return () => {
              animation.cancel();
            };
          })();
          if (typeof dispose === "function") onCleanup(dispose);
        },
        { immediate: true, flush: "post" },
      );
    });
    onMounted(() => {
      watch(
        () => [stepRef.value],
        (_values, _old, onCleanup) => {
          const dispose = (() => {
            heading.value?.focus();
          })();
          if (typeof dispose === "function") onCleanup(dispose);
        },
        { immediate: true, flush: "post" },
      );
    });
    const pageNameRef = computed(() => onboardingPages[stepRef.value]);
    const shownPage = shallowRef<string | null | null>(null);
    onMounted(() => {
      watch(
        () => [
          componentProps.state.visible,
          componentProps.state.status,
          stepRef.value,
          pageNameRef.value,
          componentProps.exiting ?? false,
          componentProps.track,
        ],
        (_values, _old, onCleanup) => {
          const dispose = (() => {
            if (
              !componentProps.state.visible ||
              pageNameRef.value === undefined ||
              (componentProps.exiting ?? false)
            ) {
              shownPage.value = null;
              return;
            }
            if (componentProps.state.status === "loading") return;
            if (shownPage.value === pageNameRef.value) return;
            shownPage.value = pageNameRef.value;
            componentProps.track?.("onboarding_page_view", { page_name: pageNameRef.value });
          })();
          if (typeof dispose === "function") onCleanup(dispose);
        },
        { immediate: true, flush: "post" },
      );
    });
    const shownPopup = shallowRef<string | null | null>(null);
    onMounted(() => {
      watch(
        () => [
          dialogRef.value,
          componentProps.track,
          componentProps.state.visible,
          componentProps.state.status,
          stepRef.value,
        ],
        (_values, _old, onCleanup) => {
          const dispose = (() => {
            if (
              dialogRef.value === null ||
              !componentProps.state.visible ||
              componentProps.state.status === "loading" ||
              stepRef.value === "done"
            ) {
              shownPopup.value = null;
              return;
            }
            if (shownPopup.value === dialogRef.value) return;
            shownPopup.value = dialogRef.value;
            componentProps.track?.("onboarding_popup_view", {
              popup_name: dialogRef.value === "skip" ? "skip_setting" : "skip_charge",
            });
          })();
          if (typeof dispose === "function") onCleanup(dispose);
        },
        { immediate: true, flush: "post" },
      );
    });
    const popupClick = (button_name: ProductEventMap["onboarding_popup_click"]["button_name"]) => {
      componentProps.track?.("onboarding_popup_click", {
        popup_name: dialogRef.value === "skip" ? "skip_setting" : "skip_charge",
        button_name,
      });
    };
    return () => {
      const render_pageNameRef = pageNameRef.value;
      const render_stepRef = stepRef.value;
      const render_progressRef = progressRef.value;
      const render_dialogRef = dialogRef.value;
      const render_busyRef = busyRef.value;
      const render_prop_state = componentProps.state;
      const render_prop_t = componentProps.t;
      const render_prop_track = componentProps.track;
      const render_prop_update = componentProps.update;
      const render_prop_openPlatformPage = componentProps.openPlatformPage;
      const render_prop_account = componentProps.account;
      const render_prop_complete = componentProps.complete;
      const render_prop_exiting = componentProps.exiting;
      const render_prop_locale = componentProps.locale;
      const render_prop_retry = componentProps.retry;
      if (render_prop_state.visible && render_prop_state.status === "loading")
        return h(OnboardingSurface, null, {
          default: () =>
            h("div", { class: css.loading, role: "status" }, [render_prop_t("onboardingLoading")]),
        });
      if (!render_prop_state.visible || render_pageNameRef === undefined) return null;
      const click = (button_name: ProductEventMap["onboarding_page_click"]["button_name"]) => {
        const selected_content =
          render_stepRef === "purpose" && render_progressRef.purpose !== null
            ? ({ office: "office", development: "code", both: "code_office" } as const)[
                render_progressRef.purpose
              ]
            : render_stepRef === "process" && render_progressRef.process !== null
              ? (
                  {
                    compact: "focus_result",
                    standard: "key_detail",
                    detailed: "full_process",
                  } as const
                )[render_progressRef.process]
              : undefined;
        render_prop_track?.("onboarding_page_click", {
          page_name: render_pageNameRef,
          button_name,
          ...(selected_content === undefined ? {} : { selected_content }),
        });
      };
      const go = (next: "welcome" | "credit" | "purpose" | "process") => {
        void render_prop_update({ step: next });
      };
      const canRecharge = render_prop_openPlatformPage !== undefined;
      const recharge = () => {
        setDialog(null);
        releaseRecharge.value?.();
        // Every control that reaches this is disabled without the callback.
        releaseRecharge.value = render_prop_openPlatformPage?.("top-up", () => {
          releaseRecharge.value = undefined;
        });
      };
      const later = () => {
        const balance = render_prop_account.details?.balance;
        if (balance?.status === "ready" && !hasOnboardingCredit(balance)) setDialog("credit");
        else go("purpose");
      };
      const purposeNext = () => {
        if (render_progressRef.purpose === "office") void render_prop_complete("completed");
        else go("process");
      };
      return h(Fragment, null, [
        h(
          OnboardingSurface,
          { exiting: render_prop_exiting ?? false },
          {
            default: () =>
              h(
                "section",
                {
                  key: render_stepRef,
                  ref: page,
                  class: `${css.page} ${render_dialogRef !== null ? css.blurred : ""}`,
                  "data-desktop-onboarding": render_stepRef,
                  lang: render_prop_locale,
                  "aria-labelledby": "desktop-onboarding-title",
                  "aria-busy": render_busyRef,
                },
                [
                  render_stepRef === "welcome" &&
                    h(OnboardingWelcomeStep, {
                      t: render_prop_t,
                      locale: render_prop_locale,
                      heading: heading,
                      busy: render_busyRef,
                      onStart: () => {
                        click("next");
                        go("credit");
                      },
                    }),
                  render_stepRef === "credit" &&
                    h(OnboardingCreditStep, {
                      t: render_prop_t,
                      locale: render_prop_locale,
                      heading: heading,
                      busy: render_busyRef,
                      funded: render_prop_state.creditFunded,
                      canRecharge: canRecharge,
                      onContinue: () => {
                        click("continue");
                        go("purpose");
                      },
                      onRecharge: () => {
                        click("charge");
                        recharge();
                      },
                      onLater: () => {
                        click("later");
                        later();
                      },
                    }),
                  render_stepRef === "purpose" &&
                    h(OnboardingPurposeStep, {
                      t: render_prop_t,
                      heading: heading,
                      busy: render_busyRef,
                      purpose: render_progressRef.purpose,
                      onSelect: (purpose) => {
                        void render_prop_update({ purpose });
                      },
                      onContinue: () => {
                        click("next");
                        purposeNext();
                      },
                    }),
                  render_stepRef === "process" &&
                    h(OnboardingProcessStep, {
                      t: render_prop_t,
                      heading: heading,
                      busy: render_busyRef,
                      process: render_progressRef.process,
                      onSelect: (process) => {
                        void render_prop_update({ process });
                      },
                      onComplete: () => {
                        click("next");
                        void render_prop_complete("completed");
                      },
                    }),
                  render_prop_state.error !== null &&
                    h("div", { class: css.status, role: "alert" }, [
                      render_prop_t("onboardingSaveFailed"),
                      h(
                        Button,
                        {
                          disabled: render_busyRef,
                          onClick: () => {
                            void render_prop_retry();
                          },
                        },
                        {
                          default: () => render_prop_t("onboardingRetry"),
                        },
                      ),
                    ]),
                  render_stepRef !== "welcome" &&
                    h("footer", { class: css.navigation }, [
                      h(
                        "button",
                        {
                          type: "button",
                          disabled: render_busyRef,
                          onClick: () => {
                            click("back");
                            go(
                              render_stepRef === "credit"
                                ? "welcome"
                                : render_stepRef === "purpose"
                                  ? "credit"
                                  : "purpose",
                            );
                          },
                        },
                        [
                          h("span", {
                            class: css.backIcon,
                            style: { maskImage: `url(${backIcon})` },
                            "aria-hidden": "true",
                          }),
                          render_prop_t("onboardingBack"),
                        ],
                      ),
                      h(
                        "button",
                        {
                          type: "button",
                          disabled: render_busyRef,
                          onClick: () => {
                            click("skip");
                            setDialog(render_stepRef === "credit" ? "credit-skip" : "skip");
                          },
                        },
                        [render_prop_t("onboardingSkip")],
                      ),
                    ]),
                ],
              ),
          },
        ),
        render_dialogRef !== null &&
          h(OnboardingConfirmation, {
            kind: render_dialogRef,
            t: render_prop_t,
            busy: render_busyRef,
            canRecharge: canRecharge,
            onClose: () => {
              popupClick("close");
              setDialog(null);
            },
            onContinueSetup: () => {
              popupClick("setting");
              setDialog(null);
            },
            onContinue: () => {
              popupClick("know");
              setDialog(null);
              go("purpose");
            },
            onRecharge: () => {
              popupClick("charge");
              recharge();
            },
            onSkip: () => {
              popupClick(render_dialogRef === "skip" ? "enter" : "know");
              void render_prop_complete("skipped").then(() => {
                setDialog(null);
              });
            },
          }),
      ]);
    };
  },
  {
    inheritAttrs: false,
    props: [
      "state",
      "account",
      "openPlatformPage",
      "update",
      "complete",
      "retry",
      "t",
      "locale",
      "track",
      "exiting",
    ],
  },
);
