import { normalizeClass, computed, defineComponent, h, onMounted, shallowRef, watch } from "vue";
/** Sidebar account launcher and locally authoritative sign-out action. */
import {
  Toast,
  Menu,
  IconEllipsisOutlineMedium,
  IconPaperPlaneOutlineMedium,
  IconSettingsOutlineMedium,
  IconUserOutlineMedium,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type {
  InjectFace,
  PropsLocale,
  PropsRuntime,
  PropsRenderSlots,
} from "@deepseek-ai/dsh-client-ui-slots";
import type { AccountSectionInjected } from "./AccountSection.tsx";
import { SignOutDialog } from "./SignOutDialog.tsx";
import { SignInDialog } from "./SignInDialog.tsx";
import { LogoutIcon } from "./LogoutIcon.tsx";
import { AccountAvatar } from "./AccountAvatar.tsx";
import type {} from "./account-ui.ts";
import css from "./AccountMenu.module.css";
/** Account launcher composed by the settings shell. */
export type AccountMenuProps = PropsRuntime<"settings.launcher"> &
  PropsRenderSlots<"settings.launcher.notifications"> &
  PropsLocale<"settings.account"> &
  InjectFace<AccountSectionInjected>;
/** The signed-in label stays empty while the profile loads.
 * @param props - sidebar geometry, settings navigation and account operations.
 * @returns account menu launcher.
 */
export const AccountMenu = defineComponent(
  (componentProps: AccountMenuProps) => {
    const settingsWasOpen = shallowRef(false);
    onMounted(() => {
      watch(
        () => [componentProps.refreshAccount, componentProps.settingsOpen],
        (_values, _old, onCleanup) => {
          const dispose = (() => {
            if (componentProps.settingsOpen && !settingsWasOpen.value)
              void componentProps.refreshAccount();
            settingsWasOpen.value = componentProps.settingsOpen;
          })();
          if (typeof dispose === "function") onCleanup(dispose);
        },
        { immediate: true, flush: "post" },
      );
    });
    const accountRef = componentProps.useAccount((state) => state);
    const colorSchemeRef = componentProps.useTheme((snapshot) => snapshot.active.colorScheme);
    const signedInRef = computed(() => accountRef.value.view?.status === "credential-stored");
    const signInNoticeRef = shallowRef(0);
    const setSignInNotice = (
      value:
        | typeof signInNoticeRef.value
        | ((previous: typeof signInNoticeRef.value) => typeof signInNoticeRef.value),
    ): void => {
      signInNoticeRef.value = typeof value === "function" ? value(signInNoticeRef.value) : value;
    };
    onMounted(() => {
      watch(
        () => [componentProps.subscribeModelSignInRequired],
        (_values, _old, onCleanup) => {
          const dispose = (() =>
            componentProps.subscribeModelSignInRequired?.(() => {
              setSignInNotice((value) => value + 1);
            }))();
          if (typeof dispose === "function") onCleanup(dispose);
        },
        { immediate: true, flush: "post" },
      );
    });
    const expiryNoticeRef = shallowRef(false);
    const setExpiryNotice = (
      value:
        | typeof expiryNoticeRef.value
        | ((previous: typeof expiryNoticeRef.value) => typeof expiryNoticeRef.value),
    ): void => {
      expiryNoticeRef.value = typeof value === "function" ? value(expiryNoticeRef.value) : value;
    };
    onMounted(() => {
      watch(
        () => [componentProps.subscribeSessionExpired],
        (_values, _old, onCleanup) => {
          const dispose = (() =>
            componentProps.subscribeSessionExpired?.(() => {
              setExpiryNotice(true);
            }))();
          if (typeof dispose === "function") onCleanup(dispose);
        },
        { immediate: true, flush: "post" },
      );
    });
    const profileRef = computed(() => accountRef.value.details?.profile);
    const labelRef = computed(() =>
      profileRef.value === undefined
        ? null
        : profileRef.value.status === "ready"
          ? (profileRef.value.value.name ??
            profileRef.value.value.contact ??
            componentProps.t("signedIn"))
          : componentProps.t("signedIn"),
    );
    const openRef = shallowRef(false);
    const setOpen = (
      value: typeof openRef.value | ((previous: typeof openRef.value) => typeof openRef.value),
    ): void => {
      openRef.value = typeof value === "function" ? value(openRef.value) : value;
    };
    const trigger = shallowRef<HTMLButtonElement | null>(null);
    const busyRef = shallowRef(false);
    const setBusy = (
      value: typeof busyRef.value | ((previous: typeof busyRef.value) => typeof busyRef.value),
    ): void => {
      busyRef.value = typeof value === "function" ? value(busyRef.value) : value;
    };
    const signOutImpactRef = shallowRef<boolean | "unknown">();
    const setSignOutImpact = (
      value:
        | typeof signOutImpactRef.value
        | ((previous: typeof signOutImpactRef.value) => typeof signOutImpactRef.value),
    ): void => {
      signOutImpactRef.value = typeof value === "function" ? value(signOutImpactRef.value) : value;
    };
    const requestSignOut = async () => {
      setBusy(true);
      try {
        setSignOutImpact(await componentProps.hasRunningAccountTasks());
        setOpen(false);
      } catch (_error) {
        setSignOutImpact("unknown");
        setOpen(false);
      } finally {
        setBusy(false);
      }
    };
    const beginSignIn = (): void => {
      setOpen(false);
      void componentProps.start().catch(() => undefined);
    };
    const openAccount = () => {
      componentProps.openSettings("account");
    };
    return () => {
      const render_signedInRef = signedInRef.value;
      const render_signInNoticeRef = signInNoticeRef.value;
      const render_expiryNoticeRef = expiryNoticeRef.value;
      const render_accountRef = accountRef.value;
      const render_openRef = openRef.value;
      const render_busyRef = busyRef.value;
      const render_labelRef = labelRef.value;
      const render_colorSchemeRef = colorSchemeRef.value;
      const render_signOutImpactRef = signOutImpactRef.value;
      const render_prop_wide = componentProps.wide;
      const render_prop_t = componentProps.t;
      const render_prop_renderSlot = componentProps.renderSlot;
      const render_prop_settingsShortcut = componentProps.settingsShortcut;
      const render_prop_openSettings = componentProps.openSettings;
      const render_prop_contactUs = componentProps.contactUs;
      const render_prop_avatarFailed = componentProps.avatarFailed;
      const render_prop_start = componentProps.start;
      const render_prop_cancel = componentProps.cancel;
      const render_prop_showLogin = componentProps.showLogin;
      const render_prop_openOnboarding = componentProps.openOnboarding;
      const render_prop_signOut = componentProps.signOut;
      return h("div", { class: css.root, "data-inset": render_signedInRef && render_prop_wide }, [
        render_signInNoticeRef > 0 &&
          h(Toast, {
            key: render_signInNoticeRef,
            text: render_prop_t("modelSignInRequired"),
            onDone: () => {
              setSignInNotice(0);
            },
          }),
        render_expiryNoticeRef &&
          h(Toast, {
            text: render_prop_t("sessionExpired"),
            onDone: () => {
              setExpiryNotice(false);
            },
          }),
        h("div", { class: css.notifications, hidden: !render_prop_wide }, [
          render_prop_renderSlot("settings.launcher.notifications", {
            active:
              render_signedInRef &&
              !render_accountRef.desktopOnboardingVisible &&
              !render_accountRef.onboarding,
            openAccount,
          }),
        ]),
        h(
          Menu,
          {
            open: render_openRef,
            side: "top",
            portal: true,
            autoFocus: true,
            className: normalizeClass(css.anchor),
            listClassName: normalizeClass(render_signedInRef ? undefined : css.signedOutMenu),
            items: [
              {
                id: "settings",
                label: render_prop_t("settings"),
                icon: h(IconSettingsOutlineMedium, { size: 16 }),
                ...(render_prop_settingsShortcut === undefined
                  ? {}
                  : { shortcut: render_prop_settingsShortcut }),
              },
              {
                id: "contact",
                label: render_prop_t("contactUs"),
                icon: h(IconPaperPlaneOutlineMedium, { size: 16 }),
              },
              ...(render_signedInRef
                ? [
                    {
                      id: "signout",
                      label: render_prop_t("signOut"),
                      icon: h(LogoutIcon, null),
                      disabled: render_busyRef,
                    },
                  ]
                : [
                    {
                      id: "signin",
                      label: render_prop_t("signIn"),
                      icon: h(IconUserOutlineMedium, { size: 16 }),
                    },
                  ]),
            ],
            onClose: () => {
              setOpen(false);
            },
            onSelect: (id) => {
              if (id === "settings") {
                setOpen(false);
                trigger.value?.focus();
                render_prop_openSettings();
              } else if (id === "contact") {
                setOpen(false);
                render_prop_contactUs();
              } else if (id === "signin") beginSignIn();
              else void requestSignOut();
            },
          },
          {
            anchor: () =>
              h(
                "button",
                {
                  ref: trigger,
                  type: "button",
                  class: css.trigger,
                  "data-collapsed": !render_prop_wide,
                  "data-signed-out": !render_signedInRef,
                  "aria-label": render_prop_t("menu"),
                  "aria-haspopup": "menu",
                  "aria-expanded": render_openRef,
                  onClick: () => {
                    setOpen((value) => !value);
                  },
                },
                [
                  render_signedInRef
                    ? h(
                        "span",
                        {
                          class: css.avatar,
                          "data-avatar-status": render_accountRef.avatar?.status,
                        },
                        [
                          h(AccountAvatar, {
                            avatar: render_accountRef.avatar,
                            avatarFailed: render_prop_avatarFailed,
                          }),
                        ],
                      )
                    : h(IconEllipsisOutlineMedium, { size: 14 }),
                  render_prop_wide &&
                    h("span", { class: css.label }, [
                      render_signedInRef ? render_labelRef : render_prop_t("more"),
                    ]),
                ],
              ),
          },
        ),
        render_accountRef.loginVisible &&
          !render_accountRef.onboarding &&
          h(SignInDialog, {
            account: render_accountRef,
            colorScheme: render_colorSchemeRef,
            start: render_prop_start,
            cancel: render_prop_cancel,
            t: render_prop_t,
            close: () => {
              render_prop_showLogin(false);
            },
            useApiKey: () => {
              render_prop_showLogin(false);
              render_prop_openOnboarding("deepseek-official");
            },
          }),
        render_signedInRef &&
          render_signOutImpactRef !== undefined &&
          h(SignOutDialog, {
            running: render_signOutImpactRef,
            signOut: render_prop_signOut,
            close: () => {
              setSignOutImpact(undefined);
            },
            t: render_prop_t,
          }),
      ]);
    };
  },
  {
    inheritAttrs: false,
    props: [
      "subscribeSessionExpired",
      "subscribeModelSignInRequired",
      "wide",
      "settingsShortcut",
      "openSettings",
      "openOnboarding",
      "settingsOpen",
      "useAccount",
      "useTheme",
      "signOut",
      "hasRunningAccountTasks",
      "refreshAccount",
      "renderSlot",
      "contactUs",
      "showLogin",
      "start",
      "cancel",
      "avatarFailed",
      "t",
    ],
  },
);
