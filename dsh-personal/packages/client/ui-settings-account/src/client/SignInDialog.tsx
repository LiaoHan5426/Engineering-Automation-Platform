import { normalizeClass, computed, defineComponent, h, onMounted, shallowRef, watch } from "vue";
/** Account authorization dialog; errors allow retry after cancelling any active attempt. */
import {
  Button,
  IconCloseOutlineRegular,
  IconLoadingOutlineRegular,
  Modal,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type { AccountSnapshot } from "./AccountSection.tsx";
import type { SignInAttemptId } from "@deepseek-ai/dsh-deepseek-account/types";
import type { AccountKey } from "./locales.ts";
import { authorizeUrlWithTheme } from "./authorize-url.ts";
import css from "./SignInDialog.module.css";
/** @param props - safe account state, localized copy, and user actions. @returns login dialog. */
export const SignInDialog = defineComponent(
  (componentProps: {
    account: AccountSnapshot;
    /** Resolved scheme of the active application theme; the copied link carries it. */
    colorScheme: "light" | "dark";
    start: () => Promise<void>;
    cancel: (id: SignInAttemptId) => Promise<void>;
    close: () => void;
    useApiKey: () => void;
    t: (key: AccountKey) => string;
  }) => {
    const busyRef = shallowRef(false);
    const setBusy = (
      value: typeof busyRef.value | ((previous: typeof busyRef.value) => typeof busyRef.value),
    ): void => {
      busyRef.value = typeof value === "function" ? value(busyRef.value) : value;
    };
    const failedRef = shallowRef(false);
    const setFailed = (
      value:
        | typeof failedRef.value
        | ((previous: typeof failedRef.value) => typeof failedRef.value),
    ): void => {
      failedRef.value = typeof value === "function" ? value(failedRef.value) : value;
    };
    const copyResultRef = shallowRef<{
      messageKey: "copiedLink" | "copyFailed";
    } | null>(null);
    const setCopyResult = (
      value:
        | typeof copyResultRef.value
        | ((previous: typeof copyResultRef.value) => typeof copyResultRef.value),
    ): void => {
      copyResultRef.value = typeof value === "function" ? value(copyResultRef.value) : value;
    };
    const attemptRef = computed(() => componentProps.account.view?.attempt);
    onMounted(() => {
      watch(
        () => [attemptRef.value?.id, attemptRef.value?.authorizeUrl],
        (_values, _old, onCleanup) => {
          const dispose = (() => {
            setCopyResult(null);
          })();
          if (typeof dispose === "function") onCleanup(dispose);
        },
        { immediate: true, flush: "post" },
      );
    });
    onMounted(() => {
      watch(
        () => [copyResultRef.value],
        (_values, _old, onCleanup) => {
          const dispose = (() => {
            if (copyResultRef.value === null) return;
            const timer = setTimeout(() => {
              setCopyResult(null);
            }, 2000);
            return () => {
              clearTimeout(timer);
            };
          })();
          if (typeof dispose === "function") onCleanup(dispose);
        },
        { immediate: true, flush: "post" },
      );
    });
    const authorizeUrlRef = computed(() => attemptRef.value?.authorizeUrl);
    const phaseRef = computed(() => attemptRef.value?.phase);
    const activeRef = computed(
      () =>
        busyRef.value ||
        phaseRef.value === "initializing" ||
        phaseRef.value === "waiting-browser" ||
        phaseRef.value === "exchanging" ||
        phaseRef.value === "committing",
    );
    const expiredRef = computed(() => phaseRef.value === "expired");
    const localFailureRef = computed(
      () => failedRef.value || componentProps.account.loginFailed || componentProps.account.failed,
    );
    const errorRef = computed(() => localFailureRef.value || phaseRef.value === "failed");
    const failureKeyRef = computed(() =>
      !localFailureRef.value &&
      phaseRef.value === "failed" &&
      attemptRef.value?.errorCode === "no-response"
        ? "noResponse"
        : "failed",
    );
    const waitingRef = computed(() => activeRef.value && !errorRef.value);
    const committingRef = computed(() => phaseRef.value === "committing");
    onMounted(() => {
      watch(
        () => [componentProps.account.view?.status, componentProps.close],
        (_values, _old, onCleanup) => {
          const dispose = (() => {
            if (componentProps.account.view?.status === "credential-stored") componentProps.close();
          })();
          if (typeof dispose === "function") onCleanup(dispose);
        },
        { immediate: true, flush: "post" },
      );
    });
    const run = async (action: () => Promise<void>) => {
      setBusy(true);
      setFailed(false);
      try {
        await action();
      } catch {
        setFailed(true);
      } finally {
        setBusy(false);
      }
    };
    const dismiss = () => {
      const attempt = attemptRef.value;
      if (committingRef.value || busyRef.value) return;
      if (activeRef.value && attempt)
        void run(async () => {
          await componentProps.cancel(attempt.id);
          componentProps.close();
        });
      else componentProps.close();
    };
    const retry = async () => {
      if (activeRef.value && attemptRef.value) await componentProps.cancel(attemptRef.value.id);
      await componentProps.start();
    };
    const copyLink = async (authorizeUrl: string) => {
      try {
        await navigator.clipboard.writeText(
          authorizeUrlWithTheme(authorizeUrl, componentProps.colorScheme),
        );
        setCopyResult({ messageKey: "copiedLink" });
      } catch {
        setCopyResult({ messageKey: "copyFailed" });
      }
    };
    const titleRef = computed(() =>
      errorRef.value
        ? componentProps.t("failureTitle")
        : activeRef.value
          ? componentProps.t("browserTitle")
          : expiredRef.value
            ? componentProps.t("timeoutTitle")
            : componentProps.t("loginTitle"),
    );
    return () => {
      const render_titleRef = titleRef.value;
      const render_waitingRef = waitingRef.value;
      const render_authorizeUrlRef = authorizeUrlRef.value;
      const render_copyResultRef = copyResultRef.value;
      const render_errorRef = errorRef.value;
      const render_failureKeyRef = failureKeyRef.value;
      const render_expiredRef = expiredRef.value;
      const render_committingRef = committingRef.value;
      const render_busyRef = busyRef.value;
      const render_activeRef = activeRef.value;
      const render_prop_t = componentProps.t;
      const render_prop_useApiKey = componentProps.useApiKey;
      const render_prop_account = componentProps.account;
      return h(
        Modal,
        {
          open: true,
          headless: true,
          title: render_titleRef,
          onClose: dismiss,
          className: normalizeClass(css.dialog),
        },
        {
          default: () => [
            h("div", { class: css.content }, [
              h("div", { class: css.header }, [
                h("h2", { class: css.title }, [render_titleRef]),
                h(
                  "button",
                  {
                    type: "button",
                    class: css.close,
                    "aria-label": render_prop_t("close"),
                    onClick: dismiss,
                  },
                  [h(IconCloseOutlineRegular, { size: 14 })],
                ),
              ]),
              render_waitingRef
                ? h("p", { class: css.description }, [
                    render_prop_t("browserPrompt"),
                    h(
                      "button",
                      {
                        type: "button",
                        class: css.link,
                        disabled: !render_authorizeUrlRef,
                        onClick: render_authorizeUrlRef
                          ? () => {
                              void copyLink(render_authorizeUrlRef);
                            }
                          : undefined,
                      },
                      [render_prop_t(render_copyResultRef?.messageKey ?? "copyLink")],
                    ),
                    render_prop_t("browserDescription"),
                  ])
                : h("p", { class: css.description }, [
                    render_errorRef
                      ? render_prop_t(render_failureKeyRef)
                      : render_expiredRef
                        ? render_prop_t("timeoutDescription")
                        : render_prop_t("loginDescription"),
                  ]),
            ]),
            h("div", { class: css.actions }, [
              h(
                Button,
                {
                  variant: "outline",
                  className: normalizeClass(css.secondaryButton),
                  disabled: render_committingRef || render_busyRef,
                  onClick: render_activeRef ? dismiss : render_prop_useApiKey,
                },
                {
                  default: () => render_prop_t(render_activeRef ? "cancel" : "addApiKey"),
                },
              ),
              h(
                Button,
                {
                  variant: "primary",
                  className: normalizeClass(css.primaryButton),
                  disabled:
                    render_busyRef ||
                    render_committingRef ||
                    render_waitingRef ||
                    render_prop_account.view === undefined,
                  "aria-label": render_waitingRef ? render_prop_t("waiting") : undefined,
                  onClick: () => {
                    void run(retry);
                  },
                },
                {
                  default: () =>
                    render_waitingRef
                      ? h(IconLoadingOutlineRegular, { className: normalizeClass(css.spinner) })
                      : render_prop_t(render_expiredRef || render_errorRef ? "retry" : "signIn"),
                },
              ),
            ]),
          ],
        },
      );
    };
  },
  {
    inheritAttrs: false,
    props: ["account", "colorScheme", "start", "cancel", "close", "useApiKey", "t"],
  },
);
