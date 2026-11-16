import type { DockPointerEvent } from "./pointer.ts";
/** Stable tab siblings in one horizontal Grid, including viewport-positioned floats. */
import { defineComponent, h, shallowRef, computed, watchPostEffect } from "vue";
import clsx from "clsx";
import type { DockIntents } from "../contract/adapter.ts";
import type { LayoutState, PaneId, PaneNode, TabId, TabRecord } from "../contract/types.ts";
import { findTabPane, floatRect, getNode, getPane } from "../engine/tree.ts";
import type { SizePreview } from "./PaneTree.tsx";
import type { PaneCallbacks } from "./render.ts";
import { FloatHeader, floatStyle, useFloatGestures } from "./FloatLayer.tsx";
import { TabBody } from "./TabBody.tsx";
import { PaneDropHints, TabPanel, TabStrip } from "./TabPanel.tsx";
import css from "./dockkit.module.css";
/** Host policy for lazily retaining a tab body without reparenting it. */
export interface TabRetention {
  /** Whether a visited body survives hiding; omitted means visibility-mounted. */
  readonly keepMounted?: (tab: TabRecord) => boolean;
  /** Whether this layout's Session is on screen; defaults to true. */
  readonly active?: boolean;
}
interface LayoutProps extends TabRetention {
  readonly state: LayoutState;
  readonly callbacks: PaneCallbacks;
  readonly preview: SizePreview | undefined;
  readonly intents: DockIntents;
}
interface TabHostProps extends LayoutProps {
  readonly tab: TabRecord;
  readonly pane: PaneNode;
  readonly column: number;
  readonly floats: ReturnType<typeof useFloatGestures>;
  readonly focusRequest: {
    current:
      | {
          readonly tabId: TabId;
          readonly origin: Element | null;
        }
      | undefined;
  };
  /** Chip-box offsets by pane, read and recorded by each selected tab's strip. */
  readonly offsets: Map<PaneId, number>;
}
/** A tab's ancestors stay identical across selection, pane moves and floating. */
const TabHost = defineComponent(
  (props: TabHostProps) => {
    const visited = shallowRef(false);
    const host = shallowRef<HTMLElement | null>(null);
    const body = shallowRef<HTMLDivElement | null>(null);
    const visible = computed(
      () =>
        (props.active ?? true) &&
        (props.pane.host === "float" || props.pane.activeTabId === props.tab.id) &&
        (props.pane.host === "float" || props.state.expanded),
    );
    watchPostEffect(() => {
      const section = host.value;
      if (!section) return;
      section.inert = !visible.value;
      const focused = document.activeElement;
      if (!visible.value && focused instanceof HTMLElement && section.contains(focused))
        focused.blur();
      const request = props.focusRequest.current;
      if (!visible.value || request?.tabId !== props.tab.id) return;
      props.focusRequest.current = undefined;
      if (
        focused !== null &&
        focused !== document.body &&
        focused !== document.documentElement &&
        focused !== request.origin
      )
        return;
      const chip = [...section.querySelectorAll<HTMLElement>("[data-dockkit-tab]")].find(
        (element) => element.dataset.dockkitTab === props.tab.id,
      );
      chip?.focus({ preventScroll: true });
    });
    watchPostEffect((cleanup) => {
      const element = body.value;
      if (!element) return;
      const focus = (): void => {
        if (!visible.value) return;
        if (props.pane.host === "float") props.floats.raise(props.pane.id);
        else if (props.state.activePaneId !== props.pane.id)
          props.callbacks.onFocusPane(props.pane.id);
      };
      element.addEventListener("focus", focus, true);
      cleanup(() => element.removeEventListener("focus", focus, true));
    });
    return () => {
      const {
        state,
        callbacks,
        intents,
        tab,
        pane,
        column,
        floats,
        offsets,
        keepMounted,
        active = true,
      } = props;
      const floating = pane.host === "float";
      const selected = floating || pane.activeTabId === tab.id;
      if (visible.value) visited.value = true;
      const retained = keepMounted?.(tab) ?? false;
      const lifted =
        floating && floats.preview?.paneId === pane.id ? floats.preview.rect : undefined;
      const rect = floating ? floats.rectOf(pane.id, floatRect(pane)) : undefined;
      const depth =
        lifted === undefined ? state.floats.indexOf(pane.id) + 1 : state.floats.length + 1;
      return h(
        "div",
        {
          class: clsx(css.tabCell, floating && css.floatingCell),
          hidden: !selected,
          "data-dockkit-host": floating ? "float" : "dock",
          "data-dockkit-column": floating ? undefined : column,
          style: {
            gridColumn: floating ? 1 : column * 2 + 1,
            gridRow: 1,
            order: floating ? depth : 0,
          },
        },
        [
          h(
            "section",
            {
              ref: host,
              tabindex: -1,
              class: clsx(css.tabHost, floating ? css.float : css.pane),
              "aria-hidden": !visible.value || undefined,
              "data-dockkit-content": tab.id,
              "data-dockkit-pane": !floating && selected ? pane.id : undefined,
              "data-dockkit-pane-active":
                (!floating && state.activePaneId === pane.id) || undefined,
              "data-dockkit-float": floating ? pane.id : undefined,
              "data-dockkit-float-active":
                (floating && state.activePaneId === pane.id) || undefined,
              "data-dockkit-column": !floating ? column : undefined,
              style: rect === undefined ? undefined : floatStyle(rect, lifted !== undefined),
              onPointerdown: () => {
                if (floating) floats.raise(pane.id);
              },
              onClick: () => {
                if (!floating && state.activePaneId !== pane.id) callbacks.onFocusPane(pane.id);
              },
            },
            [
              h(
                "div",
                {
                  class: css.tabHostHeader,
                },
                [
                  selected &&
                    (floating
                      ? h(FloatHeader, {
                          paneId: pane.id,
                          tab: tab,
                          labels: callbacks.labels,
                          intents: intents,
                          renderTabTitle: callbacks.renderTabTitle,
                          canCloseTab: callbacks.canCloseTab,
                          drag: floats.drag,
                        })
                      : h(TabStrip, {
                          state: state,
                          pane: pane,
                          callbacks: callbacks,
                          offsets: offsets,
                        })),
                ],
              ),
              h(
                "div",
                {
                  ref: body,
                  class: clsx(css.tabHostBody, floating ? css.floatBody : css.paneBody),
                  "data-dockkit-pane-body": floating ? undefined : "",
                },
                [
                  visited.value && (retained || (active && selected))
                    ? h(TabBody, {
                        tab: tab,
                        renderTab: callbacks.renderTab,
                      })
                    : null,
                  !floating &&
                    h(PaneDropHints, {
                      pane: pane,
                      callbacks: callbacks,
                    }),
                ],
              ),
              floating &&
                h(
                  "div",
                  {
                    class: css.floatResize,
                    "data-dockkit-float-resize": pane.id,
                    onPointerdown: (event: DockPointerEvent) => {
                      floats.drag("resize", pane.id, event);
                    },
                  },
                  [],
                ),
            ],
          ),
        ],
      );
    };
  },
  {
    props: [
      "state",
      "callbacks",
      "preview",
      "intents",
      "tab",
      "pane",
      "column",
      "floats",
      "focusRequest",
      "offsets",
      "keepMounted",
      "active",
    ],
  },
);
/**
 * One or two horizontal panes; CSS resolves content sizes from track fractions.
 * @param props - committed layout, gesture preview and body retention policy.
 * @returns stable tab containers, including floating tabs.
 * @throws if the docked tree is not one pane or two horizontal panes.
 */
export const TabLayout = defineComponent(
  (props: LayoutProps) => {
    const focusRequest: {
      current:
        | {
            readonly tabId: TabId;
            readonly origin: Element | null;
          }
        | undefined;
    } = { current: undefined };
    const offsets = new Map<PaneId, number>();
    const floats = useFloatGestures(() => props.state, props.intents);
    return () => {
      const { state, callbacks, preview } = props;
      // Each pane's strip remounts under the newly selected tab's host.
      const tabCallbacks: PaneCallbacks = {
        ...callbacks,
        onFocusTab: (tabId) => {
          // Only changing the selected body replaces its strip; pane-only focus does not.
          focusRequest.current =
            findTabPane(state, tabId).activeTabId === tabId
              ? undefined
              : { tabId, origin: document.activeElement };
          callbacks.onFocusTab(tabId);
        },
      };
      const root = getNode(state, state.rootId);
      if (root.kind === "split" && (root.axis !== "row" || root.children.length !== 2)) {
        throw new Error("DockLayout requires one pane or two horizontally split panes");
      }
      const panes = root.kind === "pane" ? [root] : root.children.map((id) => getPane(state, id));
      const sizes =
        root.kind === "split" ? (preview?.splitId === root.id ? preview.sizes : root.sizes) : [1];
      const columns = sizes.map((size) => `minmax(0, ${size}fr)`).join(" 0px ");
      return h(
        "div",
        {
          class: css.tabLayout,
          "data-dockkit-split": root.kind === "split" ? root.id : undefined,
          style: { gridTemplateColumns: columns },
        },
        [
          Object.values(state.tabs)
            .sort((a, b) => a.id.localeCompare(b.id))
            .map((tab) => {
              const pane = findTabPane(state, tab.id);
              return h(TabHost, {
                key: tab.id,
                ...props,
                callbacks: tabCallbacks,
                tab: tab,
                pane: pane,
                column: panes.findIndex((candidate) => candidate.id === pane.id),
                floats: floats,
                focusRequest: focusRequest,
                offsets: offsets,
              });
            }),
          panes
            .filter((pane) => pane.tabs.length === 0)
            .map((pane) =>
              h(
                "div",
                {
                  key: pane.id,
                  class: css.emptyTabHost,
                  "data-dockkit-empty": "",
                  style: { gridColumn: panes.indexOf(pane) * 2 + 1, gridRow: 1 },
                },
                [
                  h(TabPanel, {
                    state: state,
                    pane: pane,
                    callbacks: callbacks,
                  }),
                ],
              ),
            ),
          root.kind === "split" &&
            h(
              "div",
              {
                class: clsx(css.divider, css.tabLayoutDivider),
                "data-dockkit-divider": `${root.id}:0`,
                style: { gridColumn: 2, gridRow: 1 },
                onPointerdown: (event: DockPointerEvent) => {
                  callbacks.onDividerPressed(root.id, 0, event);
                },
              },
              [],
            ),
        ],
      );
    };
  },
  { props: ["state", "callbacks", "preview", "intents", "keepMounted", "active"] },
);
