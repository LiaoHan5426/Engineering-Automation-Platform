/** New Session option: start the Session in a new worktree, from a chosen local branch. */
import { defineComponent, h, shallowRef } from "vue";
import clsx from "clsx";
import {
  IconBranchOutlineRegular,
  IconChevronDownOutlineRegular,
  Menu,
  Tooltip,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type { MenuEntry } from "@deepseek-ai/dsh-client-ui-primitives";
import type { HostObservable, InjectFace, PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
import type { ForgeBranches, ForgePanelState, ForgeWorktreeBlocker } from "../types.ts";
import type { NS } from "./locales.ts";
import type { PanelSnapshot } from "./source.ts";
import css from "./WorktreeToggle.module.css";
/** Business face of the New Session option. */
export interface WorktreeToggleInjected {
  /** Panel snapshot of the Session; the renderer binds it as `usePanel`. */
  readonly hooks: {
    readonly panel: HostObservable<PanelSnapshot>;
  };
  /**
   * Request a worktree from a base branch, replacing an open request.
   * @param from - base branch, or null for HEAD.
   * @returns whether the Host accepted it.
   */
  readonly request: (from: string | null) => Promise<boolean>;
  /**
   * Withdraw the open request.
   * @returns whether the Host accepted it.
   */
  readonly cancel: () => Promise<boolean>;
  /**
   * List the local branches of the Session's checkout.
   * @returns the branches, or undefined when they could not be read.
   */
  readonly branches: () => Promise<ForgeBranches | undefined>;
}
/** Full props of the New Session option. */
export type WorktreeToggleProps = InjectFace<WorktreeToggleInjected> & PropsLocale<typeof NS>;
type Translate = WorktreeToggleProps["t"];
const BaseMenu = defineComponent(
  (props: {
    readonly base: string | null;
    /** Whether the worktree is being created, which freezes the base. */
    readonly held: boolean;
    readonly branches: WorktreeToggleInjected["branches"];
    readonly request: WorktreeToggleInjected["request"];
    readonly t: Translate;
  }) => {
    const listed = shallowRef<ForgeBranches | null>(null);
    const open = shallowRef(false);
    const loading = shallowRef(false);
    return () => {
      const { base, held, branches, request, t } = props;
      const show = (): void => {
        if (loading.value || held) return;
        if (open.value) {
          open.value = false;
          return;
        }
        loading.value = true;
        void branches().then((result) => {
          loading.value = false;
          if (result === undefined) return;
          listed.value = result;
          open.value = true;
        });
      };
      const items: MenuEntry[] = [
        { type: "label", id: "title", text: t("worktree.baseMenu") },
        ...(listed.value?.branches ?? []).map((name) => ({
          id: name,
          label:
            name === listed.value?.current
              ? h("span", { class: css.option }, [
                  h("span", { class: css.optionName }, [name]),
                  h("span", { class: css.optionNote }, [t("worktree.currentBranch")]),
                ])
              : h("span", { class: css.optionName }, [name]),
        })),
      ];
      return h(
        Menu,
        {
          open: open.value,
          items,
          ...(base === null ? {} : { selectedId: base }),
          onSelect: (id: string) => {
            open.value = false;
            if (id !== base) void request(id);
          },
          onClose: () => {
            open.value = false;
          },
          side: "bottom",
          align: "end",
          portal: true,
        },
        {
          anchor: () =>
            h(
              "button",
              {
                type: "button",
                class: css.base,
                "aria-haspopup": "menu",
                "aria-expanded": open.value,
                disabled: loading.value || held,
                onClick: show,
              },
              [
                h("span", { class: css.baseLabel }, [
                  base === null ? t("worktree.baseHead") : t("worktree.base", { branch: base }),
                ]),
                h(IconChevronDownOutlineRegular, {
                  size: 12,
                  className: clsx(css.chevron, open.value && css.chevronOpen),
                }),
              ],
            ),
        },
      );
    };
  },
  { props: ["base", "held", "branches", "request", "t"], inheritAttrs: false },
);
/** What the option shows for a panel state, or undefined while it stays hidden. */
function optionOf(state: ForgePanelState | null):
  | {
      readonly blocker: Exclude<ForgeWorktreeBlocker, "not-git"> | null;
      readonly current: string | null;
      readonly commit: string | null;
    }
  | undefined {
  if (state === null || !state.worktree.editable) return undefined;
  const blocker = state.worktree.blocker;
  if (blocker === "not-git") return undefined;
  const checkout = state.checkout;
  if (checkout.state !== "ready") return undefined;
  return { blocker, current: checkout.checkout.branch, commit: checkout.checkout.commit };
}
/**
 * Render the worktree option while the Session can still start in a worktree:
 * the current branch, or the base branch menu once requested, then the checkbox.
 * A blocked request keeps its selected base visible without a menu; the checkbox
 * only withdraws it. Branch details support pointer, touch, and keyboard access.
 * The request stays fixed while the worktree is being created.
 * @param props - panel snapshot hook, request actions, and copy.
 * @returns the option, or nothing outside a known Git checkout, once a turn started,
 * the request settled, or no worktree service is mounted.
 */
export const WorktreeToggle = defineComponent(
  (props: WorktreeToggleProps) => {
    const pending = shallowRef<boolean | null>(null);
    const state = props.usePanel((snapshot) => snapshot.state);
    return () => {
      const { request, cancel, branches, t } = props;
      const option = optionOf(state.value);
      if (state.value === null || option === undefined) return null;
      const held = state.value.worktree.creation !== null;
      const requested = pending.value ?? state.value.worktree.request !== null;
      const usable = option.blocker === null;
      const disabled = held || pending.value !== null || (!usable && !requested);
      const current =
        option.current ??
        (option.commit === null
          ? t("checkout.detached")
          : t("worktree.detachedTip", { commit: option.commit }));
      const base =
        state.value.worktree.request === null ? option.current : state.value.worktree.request.from;
      const branchText = requested
        ? base === null
          ? t("worktree.baseHead")
          : t("worktree.base", { branch: base })
        : current;
      const branchTip =
        requested || option.current === null
          ? branchText
          : t("worktree.currentBranchTip", { branch: option.current });
      const change = (checked: boolean): void => {
        if (pending.value !== null || disabled) return;
        pending.value = checked;
        void (checked ? request(option.current) : cancel()).then(() => {
          pending.value = null;
        });
      };
      return h("span", { class: css.root, "data-forge-worktree": "" }, [
        requested && usable
          ? h(
              BaseMenu,
              {
                base: state.value.worktree.request?.from ?? option.current,
                held: held,
                branches: branches,
                request: request,
                t: t,
              },
              undefined,
            )
          : h(
              Tooltip,
              { label: branchTip, side: "bottom", portal: true, openOnClick: true },
              {
                default: () => [
                  h(
                    "button",
                    {
                      type: "button",
                      class: css.current,
                      "aria-label": branchTip,
                      "data-forge-current-branch": requested ? undefined : "",
                      "data-forge-base-branch": requested ? "" : undefined,
                    },
                    [
                      h(IconBranchOutlineRegular, { size: 14 }, undefined),
                      h("span", { class: css.baseLabel }, [branchText]),
                    ],
                  ),
                ],
              },
            ),
        h(
          Tooltip,
          {
            label:
              option.blocker === null
                ? t("worktree.hint")
                : t(`worktree.blocked.${option.blocker}`),
            side: "bottom",
            delayMs: 500,
          },
          {
            default: () => [
              h("label", { class: css.toggle, "data-disabled": disabled ? "" : undefined }, [
                h(
                  "input",
                  {
                    type: "checkbox",
                    class: css.checkbox,
                    checked: requested,
                    disabled: disabled,
                    onChange: (event: Event) => {
                      if (event.currentTarget instanceof HTMLInputElement)
                        change(event.currentTarget.checked);
                    },
                  },
                  undefined,
                ),
                t("worktree.label"),
              ]),
            ],
          },
        ),
      ]);
    };
  },
  { props: ["usePanel", "request", "cancel", "branches", "t"], inheritAttrs: false },
);
