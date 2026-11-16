import { defineComponent, h, onMounted, watch } from "vue";
/** Account choice inside the model credential onboarding step. */
import type { InjectFace, PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import type {} from "@deepseek-ai/dsh-client-ui-settings-models/client";
import type { AccountSectionInjected } from "./AccountSection.tsx";
import { SignInDialog } from "./SignInDialog.tsx";
/** @param props - onboarding completion, account state and actions. @returns account dialog while signed out. */
export const AccountOnboarding = defineComponent(
  (
    componentProps: PropsRuntime<"settings.models.sign-in"> &
      PropsLocale<"settings.account"> &
      InjectFace<AccountSectionInjected>,
  ) => {
    const accountRef = componentProps.useAccount((value) => value);
    const colorSchemeRef = componentProps.useTheme((snapshot) => snapshot.active.colorScheme);
    onMounted(() => {
      watch(
        () => [componentProps.setOnboarding],
        (_values, _old, onCleanup) => {
          const dispose = (() => {
            componentProps.setOnboarding(true);
            return () => {
              const render_prop_setOnboarding = componentProps.setOnboarding;
              render_prop_setOnboarding(false);
            };
          })();
          if (typeof dispose === "function") onCleanup(dispose);
        },
        { immediate: true, flush: "post" },
      );
    });
    onMounted(() => {
      watch(
        () => [accountRef.value.view?.status, componentProps.complete],
        (_values, _old, onCleanup) => {
          const dispose = (() => {
            if (accountRef.value.view?.status === "credential-stored") componentProps.complete();
          })();
          if (typeof dispose === "function") onCleanup(dispose);
        },
        { immediate: true, flush: "post" },
      );
    });
    return () => {
      const render_accountRef = accountRef.value;
      const render_colorSchemeRef = colorSchemeRef.value;
      const render_prop_start = componentProps.start;
      const render_prop_cancel = componentProps.cancel;
      const render_prop_t = componentProps.t;
      const render_prop_showLogin = componentProps.showLogin;
      const render_prop_complete = componentProps.complete;
      const render_prop_useApiKey = componentProps.useApiKey;
      if (!render_accountRef.view || render_accountRef.view.status === "credential-stored")
        return null;
      return h(SignInDialog, {
        account: render_accountRef,
        colorScheme: render_colorSchemeRef,
        start: render_prop_start,
        cancel: render_prop_cancel,
        t: render_prop_t,
        close: () => {
          render_prop_showLogin(false);
          render_prop_complete();
        },
        useApiKey: () => {
          render_prop_showLogin(false);
          render_prop_useApiKey();
        },
      });
    };
  },
  {
    inheritAttrs: false,
    props: [
      "complete",
      "useApiKey",
      "useAccount",
      "useTheme",
      "setOnboarding",
      "showLogin",
      "start",
      "cancel",
      "t",
    ],
  },
);
