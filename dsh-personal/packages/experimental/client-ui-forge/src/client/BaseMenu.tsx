import { defineComponent, h, computed, shallowRef, watch, type VNodeChild } from "vue";
/** Base branch picker of the local changes view's `branch` scope: the automatic fork point, then remote-tracking and local branches. */
import clsx from "clsx";
import {
  Button,
  IconBranchOutlineRegular,
  IconCheckOutlineRegular,
  IconChevronDownOutlineRegular,
  IconSearchOutlineRegular,
  IconWarningTriangleOutlineRegular,
  Input,
  Menu,
  MenuItemButton,
  StateDot,
  Tooltip,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type { PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import type { RemoteResult } from "@deepseek-ai/dsh-typert-protocol";
import type { ForgeBaseBranch, ForgeBaseBranches } from "../types.ts";
import type { NS } from "./locales.ts";
import { searchFieldKeyDown } from "./menu-search.ts";
import css from "./BaseMenu.module.css";
/** Milliseconds between the last keystroke of a search and the listing it reads. */
const SEARCH_DELAY_MS = 150;
/** Props of the base branch picker. */
export interface BaseMenuProps extends PropsLocale<typeof NS> {
  /** Chosen branch, or null for the automatic fork point. */
  readonly chosen: ForgeBaseBranch | null;
  /** Name the trigger shows: the chosen branch, the automatic fork point, or the automatic choice's own name. */
  readonly label: string;
  /** Whether the chosen branch no longer exists. */
  readonly missing: boolean;
  /** Whether the owning tab is visible; a hidden tab keeps the menu closed. */
  readonly visible: boolean;
  /** Read the branches whose names contain `query`; `signal` aborts the read. */
  readonly list: (query: string, signal: AbortSignal) => Promise<RemoteResult<ForgeBaseBranches>>;
  /** Compare with a branch, or with the automatic fork point for null. */
  readonly choose: (base: ForgeBaseBranch | null) => void;
}
/** One selectable row: a branch, or the automatic fork point. */
interface BaseOption {
  readonly key: string;
  readonly name: string;
  readonly base: ForgeBaseBranch | null;
  readonly tag?: string;
}
/**
 * Render the trigger and, while open, the searchable menu. Opening and each
 * search read the branches again; rows already shown follow the search at once
 * until the new listing arrives.
 * @param props - the choice, the trigger label, the listing read, the choose action, and copy.
 * @returns the trigger with its portalled menu.
 */
export const BaseMenu = defineComponent(
  (props: BaseMenuProps) => {
    const open = shallowRef(false);
    const setOpen = (
      next: typeof open.value | ((previous: typeof open.value) => typeof open.value),
    ) => {
      open.value = typeof next === "function" ? next(open.value) : next;
    };
    const query = shallowRef("");
    const setQuery = (
      next: typeof query.value | ((previous: typeof query.value) => typeof query.value),
    ) => {
      query.value = typeof next === "function" ? next(query.value) : next;
    };
    const attempt = shallowRef(0);
    const setAttempt = (
      next: typeof attempt.value | ((previous: typeof attempt.value) => typeof attempt.value),
    ) => {
      attempt.value = typeof next === "function" ? next(attempt.value) : next;
    };
    const listing = shallowRef<RemoteResult<ForgeBaseBranches> | null>(null);
    const setListing = (
      next: typeof listing.value | ((previous: typeof listing.value) => typeof listing.value),
    ) => {
      listing.value = typeof next === "function" ? next(listing.value) : next;
    };
    const search = shallowRef<HTMLInputElement | null>(null);
    const shown = computed(() => props.visible && open.value);
    watch(
      () => [shown.value, query.value, attempt.value, props.list],
      (_next, _previous, onCleanup) => {
        const dispose = (() => {
          if (!shown.value) return;
          const controller = new AbortController();
          const timer = setTimeout(
            () => {
              void props.list(query.value, controller.signal).then((result) => {
                if (!controller.signal.aborted) setListing(result);
              });
            },
            query.value === "" ? 0 : SEARCH_DELAY_MS,
          );
          return () => {
            clearTimeout(timer);
            controller.abort();
          };
        })();
        if (typeof dispose === "function") onCleanup(dispose);
      },
      { immediate: true, flush: "post" },
    );
    // The portalled menu measures itself hidden before its first frame, and a hidden field cannot take the keyboard.
    // A touch screen keeps its on-screen keyboard closed until the field is tapped.
    watch(
      () => [shown.value],
      (_next, _previous, onCleanup) => {
        const dispose = (() => {
          if (
            !shown.value ||
            (typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches)
          )
            return;
          const frame = requestAnimationFrame(() => {
            search.value?.focus();
          });
          return () => {
            cancelAnimationFrame(frame);
          };
        })();
        if (typeof dispose === "function") onCleanup(dispose);
      },
      { immediate: true, flush: "post" },
    );
    return () => {
      const close = (): void => {
        setOpen(false);
        setQuery("");
      };
      const pick = (base: ForgeBaseBranch | null): void => {
        close();
        if ((base?.ref ?? null) !== (props.chosen?.ref ?? null)) props.choose(base);
      };
      const value = listing.value?.ok === true ? listing.value.value : null;
      const needle = query.value.trim().toLowerCase();
      const matches = (name: string): boolean => name.toLowerCase().includes(needle);
      const automatic = value?.automatic ?? null;
      const groups: {
        readonly id: string;
        readonly label: string;
        readonly options: readonly BaseOption[];
      }[] = [
        {
          id: "automatic",
          label: props.t("diff.base.automatic"),
          options:
            automatic === null || !matches(automatic.name)
              ? []
              : [
                  {
                    key: "automatic",
                    name: automatic.name,
                    base: null,
                    tag: props.t(automatic.worktree ? "diff.base.worktree" : "diff.base.automatic"),
                  },
                ],
        },
        {
          id: "remote",
          label: props.t("diff.base.remote"),
          // The automatic fork point of a code host's default branch is the same comparison as choosing that branch.
          options: (value?.remote ?? [])
            .filter(
              (branch) =>
                matches(branch.name) &&
                (automatic === null || automatic.worktree || branch.name !== automatic.name),
            )
            .map((branch) => ({ key: branch.ref, name: branch.name, base: branch })),
        },
        {
          id: "local",
          label: props.t("diff.base.local"),
          options: (value?.local ?? [])
            .filter((branch) => matches(branch.name))
            .map((branch) => ({ key: branch.ref, name: branch.name, base: branch })),
        },
      ].filter((group) => group.options.length > 0);
      const first = groups[0]?.options[0];
      let body: VNodeChild;
      if (listing.value === null) {
        body = h("div", { class: css.status, role: "status" }, [
          h(StateDot, { state: "ongoing" }),
          props.t("diff.base.loading"),
        ]);
      } else if (!listing.value.ok) {
        body = h("div", { class: css.status, role: "status" }, [
          h("span", null, [props.t("toast.branchesFailed")]),
          h(
            Button,
            {
              size: "sm",
              variant: "outline",
              onClick: () => {
                setAttempt((count) => count + 1);
              },
            },
            { default: () => [props.t("retry")] },
          ),
        ]);
      } else if (groups.length === 0) {
        body = h("div", { class: css.status }, [props.t("diff.base.empty")]);
      } else {
        body = groups.map((group) =>
          h("div", { key: group.id, role: "group", "aria-label": group.label }, [
            group.id !== "automatic" &&
              h("div", { class: css.label, role: "presentation" }, [group.label]),
            group.options.map((option) => {
              const selected = (option.base?.ref ?? null) === (props.chosen?.ref ?? null);
              return h(
                MenuItemButton,
                {
                  key: option.key,
                  current: selected,
                  onSelect: () => {
                    pick(option.base);
                  },
                },
                {
                  icon: () => h(IconBranchOutlineRegular, { size: 14 }),
                  default: () => [
                    h("span", { class: css.option }, [
                      h("span", { class: css.name }, [option.name]),
                      option.tag !== undefined && h("span", { class: css.tag }, [option.tag]),
                      selected &&
                        h(IconCheckOutlineRegular, { size: 14, className: css.check ?? "" }),
                    ]),
                  ],
                },
              );
            }),
          ]),
        );
      }
      return h(
        Menu,
        {
          open: shown.value,
          portal: true,
          dense: true,
          align: "start",
          className: css.anchor ?? "",
          listClassName: css.menu ?? "",
          onClose: close,
        },
        {
          anchor: () =>
            h(
              Tooltip,
              {
                label: props.t("diff.base.aria", { base: props.label }),
                side: "bottom",
                portal: true,
                delayMs: 500,
              },
              {
                default: () => [
                  h(
                    "button",
                    {
                      type: "button",
                      class: clsx(css.trigger, props.missing && css.missing),
                      "aria-haspopup": "menu",
                      "aria-expanded": shown.value,
                      "aria-label": props.t("diff.base.aria", { base: props.label }),
                      "data-forge-base": props.chosen?.ref ?? "",
                      onClick: () => {
                        if (shown.value) close();
                        else setOpen(true);
                      },
                    },
                    [
                      props.missing &&
                        h(IconWarningTriangleOutlineRegular, {
                          size: 12,
                          className: css.warning ?? "",
                        }),
                      h("span", { class: css.triggerName }, [props.label]),
                      h(IconChevronDownOutlineRegular, { size: 12 }),
                    ],
                  ),
                ],
              },
            ),
          default: () => [
            h("div", { class: css.root, "data-forge-base-menu": "" }, [
              h("div", { class: css.search }, [
                h(Input, {
                  elementRef: (element: HTMLInputElement | null) => {
                    search.value = element;
                  },
                  className: clsx(css.searchInput),
                  icon: h(IconSearchOutlineRegular, { size: 14 }),
                  value: query.value,
                  "aria-label": props.t("diff.base.search"),
                  placeholder: props.t("diff.base.search"),
                  onInput: (event: Event) => {
                    setQuery((event.currentTarget as HTMLInputElement).value);
                  },
                  onKeydown: (event: KeyboardEvent) => {
                    searchFieldKeyDown(
                      event,
                      first === undefined
                        ? undefined
                        : () => {
                            pick(first.base);
                          },
                    );
                  },
                }),
              ]),
              h("div", { class: css.rows }, [body]),
              h("div", { class: css.note }, [props.t("diff.base.note")]),
            ]),
          ],
        },
      );
    };
  },
  { props: ["chosen", "label", "missing", "visible", "list", "choose", "t"] },
);
