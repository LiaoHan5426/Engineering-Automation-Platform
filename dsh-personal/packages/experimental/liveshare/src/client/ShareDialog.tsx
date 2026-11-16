import {
  Fragment,
  computed,
  defineComponent,
  h,
  normalizeClass,
  onMounted,
  shallowRef,
  watch,
} from "vue";

/** Liveshare owner-side share dialog. */
import {
  Button,
  IconCloseOutlineRegular,
  IconQuestionOutlineRegular,
  Input,
  Modal,
  Tooltip,
  writeClipboard,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type { PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
import type { CreatedShare } from "../share-api-types.ts";
import type { NS } from "./locales.ts";
import type { OwnerShares } from "./owner-shares.ts";
import { mayCreateShare } from "./owner-identity.ts";
import type { OwnerLoginFailure, OwnerLoginPhase } from "./owner-login.ts";
import { useOwnerIdentityLogin } from "./owner-identity-login.ts";
import { ShareEditPanel, useShareEdit } from "./ShareEditPanel.tsx";
import { ShareCreateForm, useShareCreateForm, type CreatedShareInfo } from "./ShareCreateForm.tsx";
import { useShareRelayAddress } from "./share-relay-address.ts";
import css from "./ShareDialog.module.css";
/** Props for one session-scoped share dialog. */
export interface LiveshareShareDialogProps extends PropsLocale<typeof NS> {
  /** Session this share exposes. */
  readonly sessionId: SessionId;
  /** Human-facing Session title sent with the share; the panel deliberately does not print it. */
  readonly sessionTitle: string;
  /** Address the mounted share host reported as saved; empty while none is saved. */
  readonly defaultRelay: string;
  /** Owner share management, addressed through the generated `liveshareShares` namespace. */
  readonly shares: OwnerShares;
  /** Open the global share manager. */
  readonly onManage?: () => void;
  /** Close the dialog. */
  readonly onClose: () => void;
}
/**
 * Create one read-only Liveshare share and show its link.
 * @param props - Session identity, relay default, close callback, and copy.
 * @returns the share modal.
 */
export const LiveshareShareDialog = defineComponent(
  (componentProps: LiveshareShareDialogProps) => {
    const linkRef = shallowRef("");
    const setLink = (
      value: typeof linkRef.value | ((previous: typeof linkRef.value) => typeof linkRef.value),
    ): void => {
      linkRef.value = typeof value === "function" ? value(linkRef.value) : value;
    };
    const errorRef = shallowRef("");
    const setError = (
      value: typeof errorRef.value | ((previous: typeof errorRef.value) => typeof errorRef.value),
    ): void => {
      errorRef.value = typeof value === "function" ? value(errorRef.value) : value;
    };
    const copiedRef = shallowRef(false);
    const setCopied = (
      value:
        | typeof copiedRef.value
        | ((previous: typeof copiedRef.value) => typeof copiedRef.value),
    ): void => {
      copiedRef.value = typeof value === "function" ? value(copiedRef.value) : value;
    };
    const snapshot3Ref = useShareRelayAddress({
      get shares() {
        return componentProps.shares;
      },
      get sessionId() {
        return componentProps.sessionId;
      },
      get defaultRelay() {
        return componentProps.defaultRelay;
      },
      get t() {
        return componentProps.t;
      },
    });
    const snapshot4Ref = useOwnerIdentityLogin({
      get shares() {
        return componentProps.shares;
      },
      get relay() {
        return snapshot3Ref.effectiveRelay;
      },
      get t() {
        return componentProps.t;
      },
      get onVerified() {
        return () => {
          snapshot3Ref.setReverify(false);
          snapshot3Ref.resetPermission();
        };
      },
    });
    const editRef = useShareEdit({
      get shares() {
        return componentProps.shares;
      },
      get sessionId() {
        return componentProps.sessionId;
      },
      get onLink() {
        return (next: string) => {
          setLink((current) => current || next);
        };
      },
      get t() {
        return componentProps.t;
      },
    });
    const saveRelay = (relayUrl: string): Promise<void> =>
      snapshot3Ref.save(relayUrl, {
        verified: snapshot4Ref.status.state === "verified",
        refresh: snapshot4Ref.refresh,
      });
    const onCreated = async (data: CreatedShare, info: CreatedShareInfo): Promise<void> => {
      setLink(data.link);
      await editRef.adoptCreated(data, info.reportedMode, info.allowsFork);
    };
    const createFormRef = useShareCreateForm({
      get shares() {
        return componentProps.shares;
      },
      get sessionId() {
        return componentProps.sessionId;
      },
      get sessionTitle() {
        return componentProps.sessionTitle;
      },
      get connectivity() {
        return snapshot3Ref.connectivity;
      },
      get permission() {
        return snapshot3Ref.permission;
      },
      get ownerIdentity() {
        return snapshot4Ref.status;
      },
      get offered() {
        return editRef.offered;
      },
      get testConnectivity() {
        return snapshot3Ref.testConnectivity;
      },
      get testPermission() {
        return snapshot3Ref.testPermission;
      },
      get onError() {
        return setError;
      },
      get onCreated() {
        return onCreated;
      },
      get identityStateLine() {
        return snapshot4Ref.stateLine;
      },
      get t() {
        return componentProps.t;
      },
    });
    const busyRef = computed(() => createFormRef.busy);
    const modeOutcomeRef = computed(() => createFormRef.modeOutcome);
    const createRef = computed(() => createFormRef.create);
    const isCreatingRef = computed(() => createFormRef.isCreating);
    const copy = async (): Promise<void> => {
      const ok = await writeClipboard(linkRef.value);
      setCopied(ok);
      setError(ok ? "" : componentProps.t("dialog.copyFailed"));
    };
    const requestClose = (): void => {
      if (isCreatingRef.value()) return;
      /* v8 ignore start -- the edit panel's dirty close is covered through its own surface. */
      if (editRef.dirty && !editRef.discardWarned) {
        editRef.warnDiscard();
        return;
      }
      /* v8 ignore stop */
      componentProps.onClose();
    };
    const canConfigure = (): boolean => mayCreateShare(snapshot4Ref.status);
    const activeLogin = ():
      | {
          readonly phase: OwnerLoginPhase;
          readonly failure?: OwnerLoginFailure;
        }
      | undefined =>
      snapshot4Ref.login === undefined ||
      snapshot4Ref.login.phase === "verified" ||
      !snapshot3Ref.named ||
      snapshot3Ref.draftUnsaved()
        ? undefined
        : snapshot4Ref.login;
    const statusLine = (): string => {
      const attempt = activeLogin();
      if (attempt !== undefined) return snapshot4Ref.line(attempt.phase, attempt.failure);
      if (!snapshot3Ref.named || snapshot3Ref.draftUnsaved()) {
        return snapshot3Ref.draftUnsaved()
          ? componentProps.t("dialog.relayUnsavedHint")
          : componentProps.t("dialog.addressHint");
      }
      if (snapshot3Ref.reverify) return componentProps.t("dialog.relayReverify");
      if (snapshot3Ref.connectivity === "testing")
        return componentProps.t("dialog.connectivityChecking");
      if (snapshot3Ref.connectivity === "unreachable") return snapshot3Ref.connectivityError;
      if (snapshot3Ref.connectivity !== "ok")
        return componentProps.t("dialog.connectivityChecking");
      if (!canConfigure()) return snapshot4Ref.stateLine();
      if (snapshot3Ref.permission === "checking")
        return componentProps.t("dialog.permissionChecking");
      if (snapshot3Ref.permission === "blocked" || snapshot3Ref.permission === "warn")
        return snapshot3Ref.permissionError;
      if (snapshot3Ref.permission === "ok") return componentProps.t("dialog.permissionOk");
      return componentProps.t("dialog.permissionPending");
    };
    const statusClass = (): string | undefined => {
      const attempt = activeLogin();
      if (attempt !== undefined) return attempt.phase === "failed" ? css.testWarn : css.description;
      if (!snapshot3Ref.named || snapshot3Ref.draftUnsaved() || snapshot3Ref.reverify)
        return snapshot3Ref.reverify ? css.testWarn : css.description;
      if (snapshot3Ref.connectivity === "unreachable") return css.testFail;
      if (snapshot3Ref.connectivity !== "ok") return css.description;
      if (!canConfigure()) return css.testWarn;
      if (snapshot3Ref.permission === "blocked") return css.testFail;
      if (snapshot3Ref.permission === "warn") return css.testWarn;
      if (snapshot3Ref.permission === "ok") return css.testOk;
      return css.description;
    };
    const statusAlerts = (): boolean => activeLogin()?.phase === "failed";
    const createBlockedReason = (): string | undefined => {
      if (!snapshot3Ref.named || snapshot3Ref.draftUnsaved())
        return componentProps.t("dialog.addressHint");
      if (snapshot3Ref.connectivity === "unreachable") return snapshot3Ref.connectivityError;
      if (!canConfigure()) return snapshot4Ref.stateLine();
      if (snapshot3Ref.permission === "blocked") return snapshot3Ref.permissionError;
      return undefined;
    };
    const mayVerify = (): boolean =>
      snapshot3Ref.named && !snapshot3Ref.draftUnsaved() && snapshot3Ref.connectivity === "ok";
    onMounted(() => {
      watch(
        () => [snapshot3Ref.connectivity, snapshot4Ref.status.state, snapshot3Ref.permission],
        (_values, _old, onCleanup) => {
          const dispose = (() => {
            if (
              snapshot3Ref.connectivity !== "ok" ||
              snapshot4Ref.status.state !== "verified" ||
              snapshot3Ref.permission !== "idle"
            )
              return;
            void snapshot3Ref.testPermission();
          })();
          if (typeof dispose === "function") onCleanup(dispose);
        },
        { immediate: true, flush: "post" },
      );
    });
    return () => {
      return h(Fragment, null, [
        h(
          Modal,
          {
            open: true,
            headless: true,
            onClose: requestClose,
            title: componentProps.t("dialog.title"),
            className: normalizeClass(css.modal),
          },
          {
            default: () =>
              h("div", { class: css.panel }, [
                h("header", { class: css.panelHeader }, [
                  h("div", { class: css.panelTitleBlock }, [
                    h("h2", { class: css.panelTitle }, [componentProps.t("dialog.title")]),
                    h("span", { class: css.sessionTitle, title: componentProps.sessionTitle }, [
                      componentProps.sessionTitle,
                    ]),
                  ]),
                  h(
                    Tooltip,
                    { label: componentProps.t("dialog.help"), side: "bottom" },
                    {
                      default: () =>
                        h(
                          "button",
                          {
                            type: "button",
                            class: css.iconAction,
                            "aria-label": componentProps.t("dialog.help"),
                          },
                          [h(IconQuestionOutlineRegular, { size: 14 })],
                        ),
                    },
                  ),
                  h("span", { class: css.headerGap }),
                  componentProps.onManage === undefined
                    ? null
                    : h(
                        "button",
                        {
                          type: "button",
                          class: css.textAction,
                          disabled: busyRef.value,
                          onClick: componentProps.onManage,
                        },
                        [componentProps.t("dialog.manage")],
                      ),
                  h(
                    "button",
                    {
                      type: "button",
                      class: css.iconAction,
                      "aria-label": componentProps.t(
                        linkRef.value === ""
                          ? "dialog.cancel"
                          : /** Session this share exposes. */
                            /** Session this share exposes. */ "dialog.done",
                      ),
                      onClick: requestClose,
                    },
                    [h(IconCloseOutlineRegular, { size: 14 })],
                  ),
                ]),
                h("div", { class: css.body }, [
                  h("div", { class: css.field }, [
                    h("span", { class: css.label }, [componentProps.t("dialog.relay")]),
                    h("div", { class: css.linkRow }, [
                      h(Input, {
                        className: normalizeClass(css.relayInput),
                        value: snapshot3Ref.draft,
                        disabled: snapshot3Ref.busy,
                        "aria-label": componentProps.t("dialog.relay"),
                        title: snapshot3Ref.draft,
                        placeholder: componentProps.t("dialog.relayUnset"),
                        onInput: (event: Event) => {
                          if (event.target instanceof HTMLInputElement)
                            snapshot3Ref.editDraft(event.target.value);
                        },
                        onBlur: () => {
                          if (
                            snapshot3Ref.draft.trim() !== "" &&
                            (!snapshot3Ref.named || snapshot3Ref.draftUnsaved())
                          )
                            void saveRelay(snapshot3Ref.draft);
                        },
                        onKeydown: (event: KeyboardEvent) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void saveRelay(snapshot3Ref.draft);
                          }
                        },
                      }),
                    ]),
                    snapshot3Ref.draftUnsaved()
                      ? h("span", { class: css.hint }, [
                          componentProps.t("dialog.relayUnsavedHint"),
                        ])
                      : null,
                    snapshot3Ref.error === ""
                      ? null
                      : h("span", { class: css.testFail, role: "alert" }, [snapshot3Ref.error]),
                  ]),
                  linkRef.value === ""
                    ? null
                    : h("div", { class: css.field }, [
                        h("span", { class: css.label }, [componentProps.t("dialog.shareLink")]),
                        h("div", { class: css.linkRow }, [
                          h(Input, {
                            className: normalizeClass(css.relayInput),
                            value: linkRef.value,
                            readOnly: true,
                            "aria-label": componentProps.t("dialog.shareLink"),
                            onFocus: (event: FocusEvent) => {
                              if (event.target instanceof HTMLInputElement) event.target.select();
                            },
                          }),
                          h(
                            Button,
                            {
                              variant: "outline",
                              onClick: () => {
                                void copy();
                              },
                            },
                            {
                              default: () =>
                                componentProps.t(copiedRef.value ? "dialog.copied" : "dialog.copy"),
                            },
                          ),
                        ]),
                        h("span", { class: css.hint }, [componentProps.t("dialog.linkHelp")]),
                      ]),
                  h("div", { class: css.accountRow }, [
                    snapshot4Ref.status.state === "verified"
                      ? h(Fragment, null, [
                          snapshot4Ref.status.avatarUrl !== undefined &&
                            h("img", {
                              class: css.identityAvatar,
                              src: snapshot4Ref.status.avatarUrl,
                              alt: "",
                            }),
                          h("span", { class: css.identityName, title: snapshot4Ref.tooltip() }, [
                            snapshot4Ref.name(),
                          ]),
                          h("span", { class: css.headerGap }),
                          h(
                            "button",
                            {
                              type: "button",
                              class: css.textAction,
                              disabled: busyRef.value || snapshot4Ref.busy || !mayVerify(),
                              title: mayVerify()
                                ? undefined
                                : componentProps.t("dialog.identity.verifyBlocked"),
                              onClick: snapshot4Ref.begin,
                            },
                            [componentProps.t("dialog.identity.reverify")],
                          ),
                        ])
                      : h(Fragment, null, [
                          snapshot4Ref.needsVerification
                            ? h(
                                Button,
                                {
                                  variant: "primary",
                                  size: "sm",
                                  disabled: busyRef.value || snapshot4Ref.busy || !mayVerify(),
                                  title: mayVerify()
                                    ? undefined
                                    : componentProps.t("dialog.identity.verifyBlocked"),
                                  onClick: snapshot4Ref.begin,
                                },
                                {
                                  default: () => componentProps.t("dialog.identity.verify"),
                                },
                              )
                            : snapshot4Ref.status.state === "unknown"
                              ? h(
                                  Button,
                                  {
                                    variant: "ghost",
                                    size: "sm",
                                    disabled: busyRef.value || !mayVerify(),
                                    title: mayVerify()
                                      ? undefined
                                      : componentProps.t("dialog.identity.verifyBlocked"),
                                    onClick: () => {
                                      snapshot4Ref.refresh();
                                    },
                                  },
                                  {
                                    default: () => componentProps.t("dialog.identity.retry"),
                                  },
                                )
                              : null,
                        ]),
                  ]),
                  h("span", { class: statusClass(), role: statusAlerts() ? "alert" : "status" }, [
                    statusLine(),
                  ]),
                  linkRef.value === ""
                    ? h(ShareCreateForm, {
                        form: createFormRef,
                        disabled: !canConfigure(),
                        t: componentProps.t,
                      })
                    : null,
                  h(ShareEditPanel, {
                    visible: linkRef.value !== "",
                    edit: editRef,
                    t: componentProps.t,
                  }),
                  modeOutcomeRef.value === "notGranted"
                    ? h("p", { class: css.testWarn }, [
                        componentProps.t("dialog.sessionMode.notGranted"),
                      ])
                    : null,
                  errorRef.value === ""
                    ? null
                    : h("div", { class: css.error, role: "alert" }, [errorRef.value]),
                ]),
                h("footer", { class: css.panelFooter }, [
                  linkRef.value === ""
                    ? h(Fragment, null, [
                        h(
                          Button,
                          {
                            variant: "outline",
                            disabled: busyRef.value,
                            onClick: componentProps.onClose,
                          },
                          {
                            default: () => componentProps.t("dialog.cancel"),
                          },
                        ),
                        h(
                          Button,
                          {
                            variant: "primary",
                            disabled:
                              busyRef.value ||
                              snapshot3Ref.testing ||
                              !snapshot3Ref.named ||
                              snapshot3Ref.draftUnsaved() ||
                              snapshot3Ref.connectivity === "unreachable" ||
                              snapshot3Ref.permission === "blocked" ||
                              !mayCreateShare(snapshot4Ref.status),
                            title: createBlockedReason(),
                            onClick: () => {
                              void createRef.value();
                            },
                          },
                          {
                            default: () =>
                              busyRef.value
                                ? componentProps.t("dialog.creating")
                                : snapshot3Ref.testing
                                  ? componentProps.t("dialog.testing")
                                  : componentProps.t("dialog.create"),
                          },
                        ),
                      ])
                    : h(Fragment, null, [
                        editRef.dirty
                          ? h("span", { class: editRef.discardWarned ? css.testWarn : css.hint }, [
                              componentProps.t(
                                editRef.discardWarned
                                  ? "dialog.permissions.discard"
                                  : "dialog.permissions.unsaved",
                              ),
                            ])
                          : null,
                        h("span", { class: css.headerGap }),
                        h(
                          Button,
                          { variant: "outline", onClick: requestClose },
                          {
                            default: () => componentProps.t("dialog.done"),
                          },
                        ),
                        h(
                          Button,
                          {
                            variant: "primary",
                            disabled:
                              !editRef.dirty ||
                              editRef.saveBusy ||
                              editRef.editableShare === undefined,
                            onClick: () => {
                              void editRef.savePermissions();
                            },
                          },
                          {
                            default: () =>
                              componentProps.t(
                                editRef.saveBusy
                                  ? "dialog.permissions.saving"
                                  : "dialog.permissions.save",
                              ),
                          },
                        ),
                      ]),
                ]),
              ]),
          },
        ),
      ]);
    };
  },
  {
    inheritAttrs: false,
    props: ["sessionId", "sessionTitle", "defaultRelay", "shares", "onManage", "onClose", "t"],
  },
);
