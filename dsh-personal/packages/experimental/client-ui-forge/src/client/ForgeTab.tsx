import { defineComponent, h, Fragment, computed, shallowRef, watch } from "vue";
/** Body of the forge sidebar tab: where the Session works, its local changes, and the change requests it created or pushed. */
import {
  Button,
  IconBranchOutlineRegular,
  IconCopyOutlineRegular,
  IconFolderCloseRegular,
  IconWarningTriangleOutlineRegular,
  StateDot,
  Tooltip,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type {
  HostObservable,
  InjectFace,
  PropsLocale,
  PropsRenderSlots,
  PropsRuntime,
} from "@deepseek-ai/dsh-client-ui-slots";
import type { RemoteHostFacts } from "@deepseek-ai/dsh-api-remotes/client";
import type { MergeRequest } from "@deepseek-ai/dsh-experimental-forge/types";
import type { ForgePanelChangeRequest, ForgePanelState } from "../types.ts";
import { changesAddress, type ChangesSource } from "./changes-address.ts";
import { ChangeRequestCard, type ChangeRequestActions } from "./ChangeRequestCard.tsx";
import { checkoutLabel } from "./checkout.ts";
import { LocalChangesCard } from "./LocalChangesCard.tsx";
import type { NS } from "./locales.ts";
import { RefreshGlyph } from "./RefreshGlyph.tsx";
import type { PanelSnapshot } from "./source.ts";
import { defaultExpanded, openChangeRequestOf } from "./status.ts";
import css from "./ForgeTab.module.css";
/** Business face of the tab body. */
export interface ForgeTabInjected {
  /** Panel snapshot of the Session and the Host facts; the renderer binds them as `usePanel` and `useHost`. */
  readonly hooks: {
    readonly panel: HostObservable<PanelSnapshot>;
    readonly host: HostObservable<RemoteHostFacts>;
    readonly locale: HostObservable<string>;
  };
  /** Open the stream again after it ended. */
  readonly reconnect: () => void;
  /**
   * Reinspect the checkout, probe sign-in, and poll the change requests;
   * settles once the Host has inspected and probed, after reporting a failure.
   */
  readonly refresh: () => Promise<void>;
  /** Remove a change request from the Session, offering to undo it. */
  readonly remove: (entry: ForgePanelChangeRequest) => void;
  /** Mark a draft ready for review; settles once the outcome is reported. */
  readonly markReady: (entry: ForgePanelChangeRequest) => Promise<void>;
  /** Merge a change request as `request` describes; settles once the outcome is reported. */
  readonly merge: (entry: ForgePanelChangeRequest, request: MergeRequest) => Promise<void>;
  /** Read the complete checks of an opened change request. */
  readonly readChecks: NonNullable<ChangeRequestActions["readChecks"]>;
  /** Rerun the failed checks or one check; settles once the outcome is reported. */
  readonly rerunChecks: NonNullable<ChangeRequestActions["rerunChecks"]>;
  /** Request reviews from more reviewers; settles once the outcome is reported. */
  readonly requestReviews: NonNullable<ChangeRequestActions["requestReviews"]>;
  /** List accounts a review can be requested from. */
  readonly reviewerCandidates: NonNullable<ChangeRequestActions["reviewerCandidates"]>;
  /** Bring the base branch's new commits into the head branch; settles once the outcome is reported. */
  readonly updateBranch: NonNullable<ChangeRequestActions["updateBranch"]>;
  /** Check the removed worktree of the Session out again, reporting the outcome. */
  readonly restore: () => void;
  /** Open a URL outside the app. */
  readonly openLink: (url: string) => void;
  /** Copy text to the clipboard and report the outcome. */
  readonly copyText: (text: string) => void;
  /** Copy a path to the clipboard and report the outcome. */
  readonly copyPath: (path: string) => void;
  /** Record whether the tab is visible, for the header entry's pressed state. */
  readonly reportVisible: (visible: boolean) => void;
  /** Ask the Session's Agent to create a change request for its changes, reporting the outcome. */
  readonly createChangeRequest: () => void;
}
/** Full props of the tab body. */
export type ForgeTabProps = Pick<
  PropsRuntime<"sidebar.right.pane.tab">,
  "useTabInfo" | "sessionId"
> &
  Pick<PropsRenderSlots<"forge.change-request.card.actions">, "renderSlot"> &
  InjectFace<ForgeTabInjected> &
  PropsLocale<typeof NS>;
type Translate = ForgeTabProps["t"];
const Checkout = defineComponent(
  (props: {
    readonly state: ForgePanelState;
    readonly home: string | undefined;
    readonly restore: () => void;
    readonly copyPath: (path: string) => void;
    readonly t: Translate;
  }) => {
    const checkout = computed(() => props.state.checkout);
    const label = computed(() => checkoutLabel(props.state, props.home, props.t));
    const copyLabel = computed(() =>
      props.t(label.value?.worktree ? "checkout.copyWorktreePath" : "checkout.copyProjectPath"),
    );
    return () => {
      const capture0 = checkout.value;
      const capture1 = label.value;
      const capture2 = copyLabel.value;
      const renderCheckout = capture0;
      const renderLabel = capture1;
      const renderCopyLabel = capture2;
      if (renderLabel === undefined) {
        if (renderCheckout.state === "none")
          return h(
            "div",
            {
              class: css.checkout,
            },
            [props.t("checkout.none")],
          );
        if (renderCheckout.state !== "failed") return null;
        return h(
          Tooltip,
          {
            label: renderCheckout.message,
            side: "bottom",
          },
          {
            default: () => [
              h(
                "div",
                {
                  class: css.checkout,
                  tabindex: 0,
                },
                [props.t("checkout.failed")],
              ),
            ],
          },
        );
      }
      return h(
        "div",
        {
          class: css.checkout,
          "data-forge-checkout": "",
          "data-missing": renderLabel.missing ? "" : undefined,
        },
        [
          h(
            Tooltip,
            {
              label: renderLabel.tooltip,
              side: "bottom",
            },
            {
              default: () => [
                h(
                  "span",
                  {
                    class: css.checkoutName,
                    tabindex: 0,
                  },
                  [
                    renderLabel.missing
                      ? h(IconWarningTriangleOutlineRegular, {
                          size: 14,
                          className: css.checkoutIcon ?? "",
                        })
                      : renderLabel.worktree
                        ? h(IconBranchOutlineRegular, {
                            size: 14,
                            className: css.checkoutIcon ?? "",
                          })
                        : h(IconFolderCloseRegular, {
                            size: 14,
                            className: css.checkoutIcon ?? "",
                          }),
                    renderLabel.detached && h("span", {}, [props.t("checkout.detached")]),
                    renderLabel.detached &&
                      renderLabel.name !== null &&
                      h(
                        "span",
                        {
                          "aria-hidden": "true",
                        },
                        ["\u00B7"],
                      ),
                    renderLabel.name !== null &&
                      h(
                        "span",
                        {
                          class: css.checkoutBranch,
                        },
                        [renderLabel.name],
                      ),
                  ],
                ),
              ],
            },
          ),
          h(
            "span",
            {
              class: css.checkoutNote,
            },
            [renderLabel.kind],
          ),
          h(
            Tooltip,
            {
              label: renderCopyLabel,
              side: "bottom",
            },
            {
              default: () => [
                h(
                  "button",
                  {
                    type: "button",
                    class: `${css.iconButton} ${css.checkoutCopy}`,
                    "aria-label": renderCopyLabel,
                    onClick: () => {
                      props.copyPath(renderLabel.path);
                    },
                  },
                  [
                    h(IconCopyOutlineRegular, {
                      size: 14,
                    }),
                  ],
                ),
              ],
            },
          ),
          renderLabel.missing &&
            h(
              Button,
              {
                size: "sm",
                variant: "outline",
                disabled: props.state.worktree.restoration !== null,
                onClick: props.restore,
              },
              {
                icon: () =>
                  props.state.worktree.restoration === null
                    ? undefined
                    : h(StateDot, { state: "ongoing", size: 14 }),
                default: () => [props.t("checkout.restore")],
              },
            ),
        ],
      );
    };
  },
  { name: "Checkout", props: ["state", "home", "restore", "copyPath", "t"] as const },
);
const SignIn = defineComponent(
  (props: {
    readonly state: ForgePanelState;
    readonly copyText: (text: string) => void;
    readonly t: Translate;
  }) => {
    return () => {
      const { repository: renderRepository, readiness: renderReadiness } = props.state;
      if (
        renderRepository === null ||
        renderReadiness === null ||
        renderReadiness.state === "ready"
      )
        return null;
      const renderHost = renderRepository.host;
      const renderCommand =
        renderRepository.forge === "github" ? `gh auth login --hostname ${renderHost}` : undefined;
      if (renderReadiness.state === "unavailable") {
        return h(
          "div",
          {
            class: css.banner,
            role: "status",
          },
          [
            props.t("signin.unavailable", {
              host: renderHost,
              message: renderReadiness.message ?? "",
            }),
          ],
        );
      }
      return h(
        "div",
        {
          class: css.banner,
          role: "status",
        },
        [
          h("span", {}, [props.t("signin.title", { host: renderHost })]),
          renderCommand === undefined
            ? renderReadiness.message !== null &&
              h(
                "span",
                {
                  class: css.bannerDetail,
                },
                [renderReadiness.message],
              )
            : h(Fragment, null, [
                h(
                  "code",
                  {
                    class: css.bannerCommand,
                  },
                  [renderCommand],
                ),
                h(
                  Button,
                  {
                    size: "sm",
                    variant: "outline",
                    className: css.bannerAction ?? "",
                    onClick: () => {
                      props.copyText(renderCommand);
                    },
                  },
                  { default: () => [props.t("signin.copy")] },
                ),
              ]),
        ],
      );
    };
  },
  { name: "SignIn", props: ["state", "copyText", "t"] as const },
);
export const ForgeTab = defineComponent(
  (props: ForgeTabProps) => {
    const snapshot = props.usePanel((current) => current);
    const home = props.useHost((facts) => facts.home);
    const locale = props.useLocale((value) => value);
    const tabInfo = props.useTabInfo();
    const tab = computed(() => tabInfo.value.tab);
    const visible = computed(() => tab.value.visible);
    const chosen = shallowRef<ReadonlySet<string> | null>(null);
    const refreshing = shallowRef(false);
    watch(
      () => props.reportVisible,
      (report, _previous, onCleanup) => {
        onCleanup(() => report(false));
      },
      { immediate: true, flush: "post" },
    );
    watch(
      [() => props.reportVisible, () => visible.value],
      ([report, value]) => {
        report(value);
      },
      { immediate: true, flush: "post" },
    );
    const state = computed(() => snapshot.value.state);
    const disconnected = computed(
      () =>
        snapshot.value.disconnected &&
        h(
          "div",
          {
            class: css.disconnected,
            role: "status",
          },
          [
            h("span", {}, [props.t("stream.failed")]),
            h(
              Button,
              {
                size: "sm",
                variant: "outline",
                onClick: props.reconnect,
              },
              { default: () => [props.t("retry")] },
            ),
          ],
        ),
    );
    const viewChanges = (source: ChangesSource, path?: string): void => {
      const capture8 = tab.value;
      capture8.actions.openResource(
        changesAddress({ sessionId: props.sessionId, source }),
        path === undefined ? undefined : { params: { path } },
      );
    };
    const startRefresh = (): void => {
      const capture9 = refreshing.value;
      if (capture9) return;
      refreshing.value = true;
      void props.refresh().finally(() => {
        refreshing.value = false;
      });
    };
    const actions = computed<ChangeRequestActions>(() => ({
      openLink: props.openLink,
      copyLink: props.copyText,
      retry: startRefresh,
      remove: props.remove,
      markReady: props.markReady,
      merge: props.merge,
      readChecks: props.readChecks,
      rerunChecks: props.rerunChecks,
      requestReviews: props.requestReviews,
      reviewerCandidates: props.reviewerCandidates,
      updateBranch: props.updateBranch,
      viewChanges: (entry) => {
        viewChanges({ kind: "change", url: entry.url });
      },
      renderActions: (owner) => props.renderSlot("forge.change-request.card.actions", owner),
    }));
    const local = computed(() =>
      state.value?.local != null && state.value.local.files.length > 0 ? state.value.local : null,
    );
    const expanded = computed(
      () => chosen.value ?? defaultExpanded(state.value?.changeRequests ?? []),
    );
    const toggle = (url: string): void => {
      const capture10 = expanded.value;
      const next = new Set(capture10);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      chosen.value = next;
    };
    const count = computed(() => state.value?.changeRequests.length ?? 0);
    return () => {
      const capture11 = home.value;
      const capture12 = locale.value;
      const capture13 = refreshing.value;
      const capture14 = state.value;
      const capture15 = disconnected.value;
      const capture16 = actions.value;
      const capture17 = local.value;
      const capture18 = expanded.value;
      const capture19 = Date.now();
      const capture20 = count.value;
      const renderHome = capture11;
      const renderLocale = capture12;
      const renderRefreshing = capture13;
      const renderState = capture14;
      const renderDisconnected = capture15;
      const renderActions = capture16;
      const renderLocal = capture17;
      const renderExpanded = capture18;
      const renderNow = capture19;
      const renderCount = capture20;
      if (renderState === null)
        return h(
          "div",
          {
            class: css.centered,
          },
          [
            renderDisconnected ||
              h(StateDot, {
                state: "ongoing",
              }),
          ],
        );
      return h(
        "div",
        {
          class: css.root,
          "data-forge-panel": "",
        },
        [
          renderDisconnected,
          h(Checkout, {
            state: renderState,
            home: renderHome,
            restore: props.restore,
            copyPath: props.copyPath,
            t: props.t,
          }),
          renderLocal !== null &&
            h(LocalChangesCard, {
              local: renderLocal,
              creatable:
                renderState.repository !== null && openChangeRequestOf(renderState) === undefined,
              view: (path) => {
                viewChanges({ kind: "local" }, path);
              },
              create: props.createChangeRequest,
              t: props.t,
            }),
          h(
            "section",
            {
              class: css.section,
            },
            [
              h(
                "div",
                {
                  class: css.sectionHeader,
                },
                [
                  h(
                    "h3",
                    {
                      class: css.sectionTitle,
                    },
                    [props.t("changes.title", { count: renderCount })],
                  ),
                  h(
                    Tooltip,
                    {
                      label: props.t("refresh"),
                      side: "top",
                    },
                    {
                      default: () => [
                        h(
                          "button",
                          {
                            type: "button",
                            class: css.iconButton,
                            "aria-label": props.t("refresh"),
                            "aria-disabled": renderRefreshing,
                            onClick: startRefresh,
                          },
                          [
                            h(RefreshGlyph, {
                              busy: renderRefreshing,
                              size: 14,
                            }),
                          ],
                        ),
                      ],
                    },
                  ),
                ],
              ),
              h(SignIn, {
                state: renderState,
                copyText: props.copyText,
                t: props.t,
              }),
              renderCount === 0
                ? h(
                    "div",
                    {
                      class: css.empty,
                    },
                    [
                      h(
                        "p",
                        {
                          class: css.emptyTitle,
                        },
                        [props.t("changes.empty")],
                      ),
                      h(
                        "p",
                        {
                          class: css.emptyHint,
                        },
                        [props.t("changes.emptyHint")],
                      ),
                    ],
                  )
                : h(
                    "ul",
                    {
                      class: css.list,
                    },
                    [
                      renderState.changeRequests.map((entry) =>
                        h(ChangeRequestCard, {
                          key: entry.url,
                          entry: entry,
                          expanded: renderExpanded.has(entry.url),
                          onToggle: () => {
                            toggle(entry.url);
                          },
                          now: renderNow,
                          actions: renderActions,
                          locale: renderLocale,
                          t: props.t,
                        }),
                      ),
                    ],
                  ),
            ],
          ),
        ],
      );
    };
  },
  {
    name: "ForgeTab",
    props: [
      "useTabInfo",
      "sessionId",
      "renderSlot",
      "reconnect",
      "refresh",
      "remove",
      "markReady",
      "merge",
      "readChecks",
      "rerunChecks",
      "requestReviews",
      "reviewerCandidates",
      "updateBranch",
      "restore",
      "openLink",
      "copyText",
      "copyPath",
      "reportVisible",
      "createChangeRequest",
      "usePanel",
      "useHost",
      "useLocale",
      "t",
    ] as const,
  },
);
