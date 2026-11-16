import {
  defineComponent,
  h,
  createVNode,
  Fragment,
  computed,
  shallowRef,
  watch,
  type VNodeChild,
} from "vue";
/** Virtualized raw-data table shared by Session log and Chat structure views. */
import {
  defaultRangeExtractor,
  useVirtualizer,
  type Range,
  type Virtualizer,
} from "@tanstack/vue-virtual";
import type { ConvViewProps } from "@deepseek-ai/dsh-client-ui-conversation/client";
import type { ObservableSnapshot } from "@deepseek-ai/dsh-client-store";
import type { InjectFace, PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import { Tooltip } from "@deepseek-ai/dsh-client-ui-primitives";
import {
  InspectorTableHierarchy,
  inspectorRowCollapsed,
  type InspectorDisclosure,
  type InspectorRecord,
  type InspectorRow,
} from "./table-model.ts";
import { inspectorPreview } from "./format.ts";
import { inspectorJson } from "./raw-json.ts";
import { InspectorDetails } from "./InspectorDetails.tsx";
import { InspectorJsonTree, InspectorObjectTree } from "./InspectorObjectTree.tsx";
import type { InspectorChatTarget, InspectorObjects, InspectorObjectReference } from "./objects.ts";
import {
  InspectorTableLayout,
  INSPECTOR_ROW_HEIGHT,
  type InspectorRowAnchor,
} from "./table-layout.ts";
import { InspectorTypeFilter } from "./type-filter.ts";
import { TypeFilter } from "./TypeFilter.tsx";
import css from "./inspector.module.css";
/** Framework-bound row sources and Session pagination command. */
export interface InspectorInjected {
  readonly hooks: {
    readonly rows: ObservableSnapshot<readonly InspectorRow[]>;
  };
  readonly keyedHooks: {
    readonly record: (key: string) => ObservableSnapshot<InspectorRecord | undefined> | undefined;
  };
  /** Load the preceding page through the existing Session reference. */
  readonly loadOlder: () => Promise<void>;
  /** @param key - Loaded row identity. @returns Current type without mounting a row subscription. */
  readonly typeOf: (key: string) => string | undefined;
}
/** Inputs of either Inspector conversation view. */
export type InspectorTableProps = Pick<ConvViewProps, "useSession"> &
  InjectFace<InspectorInjected> &
  PropsLocale<"session-inspector"> & {
    readonly title: string;
    readonly flash: boolean;
    readonly showTime: boolean;
    readonly modeSelector?: VNodeChild;
    readonly objects?: InspectorObjects;
    readonly navigation?: {
      readonly reveal: (target: InspectorChatTarget) => void;
      readonly target: (key: string) => InspectorChatTarget | undefined;
    };
    readonly pickedRow?:
      | {
          readonly key: string;
        }
      | undefined;
    readonly notice?: string | undefined;
  };
interface RowProps extends Pick<InspectorTableProps, "useRecord" | "t" | "flash" | "showTime"> {
  readonly row: InspectorRow;
  readonly selected: boolean;
  readonly branch: boolean;
  readonly collapsed: boolean;
  readonly added: boolean;
  readonly stickyLevel: number | undefined;
  readonly pulse: number;
  readonly context: boolean;
  readonly select: (key: string) => void;
  readonly toggle: (row: InspectorRow, element: HTMLTableRowElement) => void;
}
interface ObjectHistory {
  readonly rootKey: string;
  readonly rootLabel: string;
  readonly references: readonly InspectorObjectReference[];
}
const DataRow = defineComponent(
  (props: RowProps) => {
    const record = props.useRecord(computed(() => props.row.key));
    const element = shallowRef<HTMLTableRowElement | null>(null);
    const previous = { value: record.value };
    const previousPulse = { value: 0 };
    watch(
      () => [record.value, props.added, props.flash, props.pulse],
      (_next, _previous, onCleanup) => {
        const dispose = (() => {
          const changed = previous.value !== record.value;
          previous.value = record.value;
          const navigated = props.pulse > 0 && previousPulse.value !== props.pulse;
          previousPulse.value = props.pulse;
          if (
            (!props.flash && !navigated) ||
            (!changed && !props.added && !navigated) ||
            element.value === null ||
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
          )
            return;
          const color = getComputedStyle(element.value).getPropertyValue(
            "--dsw-specific-bubble-highlight",
          );
          const animation = element.value.animate(
            [{ backgroundColor: color }, { backgroundColor: "transparent" }],
            { duration: 700 },
          );
          return () => {
            animation.cancel();
          };
        })();
        if (typeof dispose === "function") onCleanup(dispose);
      },
      { immediate: true, flush: "post" },
    );
    const summary = computed(
      () =>
        (props.collapsed ? record.value?.collapsedSummary : undefined) ??
        record.value?.summary ??
        inspectorPreview(record.value?.value),
    );
    return () => {
      return h(
        "tr",
        {
          ref: element,
          "aria-selected": props.selected,
          "data-inspector-context": props.context ? "" : undefined,
          title: props.context ? props.t("filter.context") : undefined,
          class: [
            props.selected && css.selected,
            props.stickyLevel !== undefined && css.sticky,
            props.context && css.contextRow,
          ]
            .filter(Boolean)
            .join(" "),
          style:
            props.stickyLevel === undefined
              ? undefined
              : {
                  top: `${(props.stickyLevel + 1) * INSPECTOR_ROW_HEIGHT}px`,
                  zIndex: 9 - props.stickyLevel,
                },
        },
        [
          h("td", { class: css.identity }, [
            h(
              Tooltip,
              { label: record.value?.identity ?? "", side: "right", portal: true },
              {
                default: () => [
                  h("span", { class: css.identityText, tabindex: 0 }, [record.value?.identity]),
                ],
              },
            ),
          ]),
          h("td", { style: { paddingInlineStart: `${8 + props.row.depth * 20}px` } }, [
            props.branch &&
              h(
                "button",
                {
                  type: "button",
                  class: css.disclosure,
                  "aria-label": props.collapsed
                    ? props.t("table.expand")
                    : props.t("table.collapse"),
                  "aria-expanded": !props.collapsed,
                  onClick: () => {
                    // oxlint-disable-next-line typescript/no-non-null-assertion -- The clicked button belongs to this mounted row.
                    props.toggle(props.row, element.value!);
                  },
                },
                [props.collapsed ? "▸" : "▾"],
              ),
            h(
              "button",
              {
                type: "button",
                class: css.record,
                onClick: () => {
                  props.select(props.row.key);
                },
              },
              [record.value?.type],
            ),
          ]),
          h("td", null, [record.value?.location]),
          props.showTime &&
            h("td", null, [
              record.value?.time === undefined
                ? ""
                : new Date(record.value.time).toISOString().slice(11, 23),
            ]),
          h("td", null, [
            h(
              "button",
              {
                type: "button",
                class: css.preview,
                onClick: () => {
                  props.select(props.row.key);
                },
              },
              [summary.value],
            ),
          ]),
        ],
      );
    };
  },
  {
    props: [
      "row",
      "selected",
      "branch",
      "collapsed",
      "added",
      "stickyLevel",
      "pulse",
      "context",
      "select",
      "toggle",
      "useRecord",
      "flash",
      "showTime",
      "t",
    ],
  },
);
/**
 * Render a paged hierarchy with stable virtual row keys and live JSON details.
 * @param props - Framework hooks, pagination, locale, and the view's highlight policy.
 * @returns Virtual table and selected raw data.
 */
export const InspectorTable = defineComponent(
  (props: InspectorTableProps) => {
    const allRows = props.useRows((value) => value);
    const hasMore = props.useSession((value) => value.hasMore);
    const loading = props.useSession((value) => value.loadingOlder);
    const openError = props.useSession((value) => value.openError);
    const failure = shallowRef<string | null | null>(null);
    const setFailure = (
      next: typeof failure.value | ((previous: typeof failure.value) => typeof failure.value),
    ) => {
      failure.value = typeof next === "function" ? next(failure.value) : next;
    };
    const selected = shallowRef<string | null | null>(null);
    const setSelected = (
      next: typeof selected.value | ((previous: typeof selected.value) => typeof selected.value),
    ) => {
      selected.value = typeof next === "function" ? next(selected.value) : next;
    };
    const record = props.useRecord(computed(() => selected.value ?? ""));
    const rowLabel = computed(
      () => `${record.value?.type ?? ""} · ${record.value?.identity ?? selected.value}`,
    );
    const objectHistory = shallowRef<ObjectHistory | null | null>(null);
    const setObjectHistory = (
      next:
        | typeof objectHistory.value
        | ((previous: typeof objectHistory.value) => typeof objectHistory.value),
    ) => {
      objectHistory.value = typeof next === "function" ? next(objectHistory.value) : next;
    };
    const objectTarget = computed(() => objectHistory.value?.references.at(-1));
    const reveal = shallowRef<{
      key: string;
      pulse: number;
    } | null | null>(null);
    const setReveal = (
      next: typeof reveal.value | ((previous: typeof reveal.value) => typeof reveal.value),
    ) => {
      reveal.value = typeof next === "function" ? next(reveal.value) : next;
    };
    const appliedReveal = { value: null } as { value: typeof reveal.value };
    const appliedPick = { value: undefined } as { value: typeof props.pickedRow | undefined };
    const disclosures = shallowRef<ReadonlyMap<string, InspectorDisclosure>>(new Map());
    const setDisclosures = (
      next:
        | typeof disclosures.value
        | ((previous: typeof disclosures.value) => typeof disclosures.value),
    ) => {
      disclosures.value = typeof next === "function" ? next(disclosures.value) : next;
    };
    const typeQuery = shallowRef("");
    const setTypeQuery = (
      next: typeof typeQuery.value | ((previous: typeof typeQuery.value) => typeof typeQuery.value),
    ) => {
      typeQuery.value = typeof next === "function" ? next(typeQuery.value) : next;
    };
    const typeFilter = computed(() => new InspectorTypeFilter(typeQuery.value));
    const filtered = computed(() => typeFilter.value.apply(allRows.value, props.typeOf));
    const suggestTypes = (query: string) =>
      new InspectorTypeFilter(query).suggest(allRows.value, props.typeOf);
    const scroller = shallowRef<HTMLDivElement | null>(null);
    const followMode = shallowRef<"tail" | "scroll" | "manual">("tail");
    const viewport = { value: { offset: 0, height: 600 } };
    const disclosureAnchor = { value: undefined } as { value: InspectorRowAnchor | undefined };
    const spacingGeneration = shallowRef(0);
    const resetSpacing = (
      next:
        | typeof spacingGeneration.value
        | ((previous: typeof spacingGeneration.value) => typeof spacingGeneration.value),
    ) => {
      spacingGeneration.value = typeof next === "function" ? next(spacingGeneration.value) : next;
    };
    const toggle = (row: InspectorRow, element: HTMLTableRowElement) => {
      // oxlint-disable-next-line typescript/no-non-null-assertion -- Row disclosure runs only inside the mounted scrollport.
      const host = scroller.value!;
      followMode.value = "manual";
      disclosureAnchor.value = {
        key: row.key,
        top:
          element.getBoundingClientRect().top - host.getBoundingClientRect().top - host.clientTop,
      };
      viewport.value = { offset: host.scrollTop, height: host.clientHeight };
      setDisclosures((previous) => {
        const next = new Map(previous);
        next.set(row.key, {
          state: row.disclosure,
          collapsed: !inspectorRowCollapsed(row, previous),
        });
        return next;
      });
    };
    const locateChat = (target: InspectorChatTarget | undefined) => {
      props.navigation?.reveal(target ?? {});
    };
    const select = (key: string) => {
      setSelected(key);
      setObjectHistory(null);
      const target = props.navigation?.target(key);
      locateChat(target);
    };
    const revealRow = (key: string) => {
      const clearFilter =
        typeFilter.value.active && !filtered.value.rows.some((row) => row.key === key);
      if (clearFilter) setTypeQuery("");
      followMode.value = "scroll";
      setSelected(key);
      setDisclosures((previous) => {
        const next = new Map(previous);
        const byKey = new Map(
          (clearFilter ? allRows.value : filtered.value.rows).map((row) => [row.key, row]),
        );
        let parent = byKey.get(key)?.parent;
        while (parent !== undefined) {
          const row = byKey.get(parent);
          if (row === undefined) break;
          next.set(parent, { state: row.disclosure, collapsed: false });
          parent = row.parent;
        }
        return next;
      });
      setReveal((previous) => ({ key, pulse: (previous?.pulse ?? 0) + 1 }));
    };
    const navigate = (reference: InspectorObjectReference) => {
      setObjectHistory((previous) => ({
        // oxlint-disable-next-line typescript/no-non-null-assertion -- Detail navigation is mounted only for a selected row.
        rootKey: previous?.rootKey ?? selected.value!,
        rootLabel: previous?.rootLabel ?? rowLabel.value,
        references: [...(previous?.references ?? []), reference],
      }));
      locateChat(reference.target);
      if (reference.rowKey !== undefined) revealRow(reference.rowKey);
    };
    const backToObject = (index: number): void => {
      // oxlint-disable-next-line typescript/no-non-null-assertion -- A breadcrumb is enabled only when a reference history exists.
      const history = objectHistory.value!;
      const reference = history.references[index - 1];
      const key = index === 0 ? history.rootKey : reference?.rowKey;
      const target = index === 0 ? props.navigation?.target(history.rootKey) : reference?.target;
      setObjectHistory(
        index === 0 ? null : { ...history, references: history.references.slice(0, index) },
      );
      if (key !== undefined) revealRow(key);
      locateChat(target);
    };
    watch(
      () => [props.pickedRow, allRows.value, revealRow],
      (_next, _previous, onCleanup) => {
        const dispose = (() => {
          if (
            props.pickedRow === undefined ||
            appliedPick.value === props.pickedRow ||
            !allRows.value.some((row) => row.key === props.pickedRow?.key)
          )
            return;
          appliedPick.value = props.pickedRow;
          setObjectHistory(null);
          revealRow(props.pickedRow.key);
        })();
        if (typeof dispose === "function") onCleanup(dispose);
      },
      { immediate: true, flush: "post" },
    );
    const hierarchy = computed(
      () => new InspectorTableHierarchy(filtered.value.rows, disclosures.value),
    );
    const rows = computed(() => hierarchy.value.rows);
    const committed = { value: undefined } as {
      value:
        | {
            layout: InspectorTableLayout;
            disclosures: typeof disclosures.value;
            spacingGeneration: number;
          }
        | undefined;
    };
    const layout = computed(
      () =>
        new InspectorTableLayout(
          hierarchy.value,
          committed.value?.disclosures === disclosures.value &&
            committed.value.spacingGeneration === spacingGeneration.value
            ? committed.value.layout
            : undefined,
          viewport.value,
          disclosureAnchor.value,
        ),
    );
    const anchoredOffset = computed(() =>
      committed.value?.layout !== layout.value ? layout.value.scrollOffset : undefined,
    );
    const seen = { value: new Map<string, number>() };
    const initialized = { value: false };
    const arrivals = computed(() => {
      const now = performance.now();
      const next = new Map(
        allRows.value.map((row) => [
          row.key,
          seen.value.get(row.key) ?? (initialized.value ? now : -Infinity),
        ]),
      );
      if (allRows.value.length > 0) initialized.value = true;
      seen.value = next;
      return next;
    });
    // oxlint-disable-next-line typescript/no-non-null-assertion -- Virtualizer indexes are bounded by this layout's item count.
    const keyOf = (index: number) => layout.value.items[index]!.key;
    // oxlint-disable-next-line typescript/no-non-null-assertion -- Virtualizer indexes are bounded by this layout's item count.
    const sizeOf = (index: number) => layout.value.items[index]!.size;
    const virtualRef = { value: undefined } as {
      value: Virtualizer<HTMLDivElement, HTMLTableRowElement> | undefined;
    };
    const extractRange = (range: Range) => {
      // oxlint-disable-next-line typescript/no-non-null-assertion -- The enabled Virtualizer initializes its offset before range extraction.
      const offset = anchoredOffset.value ?? virtualRef.value!.scrollOffset!;
      // Render the anchored viewport before the layout effect moves the scrollport.
      const visible =
        anchoredOffset.value === undefined
          ? range
          : {
              ...range,
              startIndex: Math.max(0, Math.floor(offset / INSPECTOR_ROW_HEIGHT) - 1),
              endIndex: Math.min(
                range.count - 1,
                Math.ceil((offset + viewport.value.height) / INSPECTOR_ROW_HEIGHT) - 1,
              ),
            };
      return [
        ...new Set([
          ...layout.value.stickyIndexesAtOffset(offset),
          ...defaultRangeExtractor(visible),
        ]),
      ].sort((left, right) => left - right);
    };
    const virtual = useVirtualizer<HTMLDivElement, HTMLTableRowElement>(
      computed(() => ({
        count: layout.value.items.length,
        getScrollElement: () => scroller.value,
        estimateSize: sizeOf,
        getItemKey: keyOf,
        overscan: 12,
        initialRect: { width: 0, height: 600 },
        anchorTo:
          layout.value.scrollOffset !== undefined || followMode.value === "manual"
            ? "start"
            : "end",
        scrollEndThreshold: 40,
        paddingStart: INSPECTOR_ROW_HEIGHT,
        scrollPaddingStart: INSPECTOR_ROW_HEIGHT,
        rangeExtractor: extractRange,
        paddingEnd: layout.value.bottomPadding,
      })),
    );
    virtualRef.value = virtual.value;
    const viewportHeight = computed(() => virtual.value.scrollRect?.height);
    const applyTypeFilter = (query: string): void => {
      followMode.value = "scroll";
      setTypeQuery(new InspectorTypeFilter(query).query);
      setDisclosures(new Map());
      resetSpacing((value) => value + 1);
      setSelected(null);
      setObjectHistory(null);
      setReveal(null);
      virtual.value.scrollToOffset(0);
    };
    watch(
      [
        () => layout.value,
        () => disclosures.value,
        () => spacingGeneration.value,
        () => viewportHeight.value,
        () => anchoredOffset.value,
        () => scroller.value,
      ],
      (_next, _previous, onCleanup) => {
        const dispose = (() => {
          if (anchoredOffset.value !== undefined)
            virtual.value.scrollToOffset(anchoredOffset.value);
          else if (followMode.value === "tail" && layout.value.bottomPadding === 0)
            virtual.value.scrollToEnd();
          // oxlint-disable-next-line typescript/no-non-null-assertion -- This layout effect runs with the scrollport ref attached.
          if (scroller.value === null) return;
          viewport.value = {
            offset: scroller.value.scrollTop,
            height: viewportHeight.value ?? 600,
          };
          disclosureAnchor.value = undefined;
          committed.value = {
            layout: layout.value,
            disclosures: disclosures.value,
            spacingGeneration: spacingGeneration.value,
          };
        })();
        if (typeof dispose === "function") onCleanup(dispose);
      },
      { immediate: true, flush: "post" },
    );
    watch(
      [() => layout.value, () => reveal.value],
      (_next, _previous, onCleanup) => {
        const dispose = (() => {
          if (reveal.value === null || appliedReveal.value === reveal.value) return;
          const index = layout.value.items.findIndex((item) => item.key === reveal.value?.key);
          if (index === -1) return;
          virtual.value.scrollToIndex(index, { align: "center" });
          appliedReveal.value = reveal.value;
        })();
        if (typeof dispose === "function") onCleanup(dispose);
      },
      { immediate: true, flush: "post" },
    );
    return () => {
      const items = virtual.value.getVirtualItems();
      // oxlint-disable-next-line typescript/no-non-null-assertion -- getVirtualItems initializes the enabled Virtualizer's scroll offset.
      const sticky = new Map(
        layout.value
          .stickyIndexesAtOffset(anchoredOffset.value ?? virtual.value.scrollOffset!)
          .map((index, level) => [index, level]),
      );
      const lastItem = items.at(-1);
      const bottom =
        lastItem === undefined ? 0 : Math.max(0, virtual.value.getTotalSize() - lastItem.end);
      const detail = computed(() =>
        inspectorJson(props.objects === undefined ? record.value?.value : undefined),
      );
      const detailValue =
        objectTarget.value === undefined ? record.value?.value : objectTarget.value.read();
      const breadcrumbs = [
        objectHistory.value?.rootLabel ?? rowLabel.value,
        ...(objectHistory.value?.references.map(
          (reference) => `${props.t(`object.${reference.kind}`)} · ${reference.identity}`,
        ) ?? []),
      ];
      const columns = props.showTime ? 5 : 4;
      return h("section", { class: css.root, "aria-label": props.title }, [
        h("div", { class: css.toolbar }, [
          h("span", null, [
            props.modeSelector ?? props.title,
            " \u00B7 ",
            typeFilter.value.active
              ? `${filtered.value.matches.size} / ${allRows.value.length}`
              : allRows.value.length,
          ]),
          hasMore.value &&
            h(
              "button",
              {
                type: "button",
                disabled: loading.value,
                onClick: () => {
                  followMode.value = "scroll";
                  setFailure(null);
                  void props.loadOlder().catch((error: unknown) => {
                    setFailure(String(error));
                  });
                },
              },
              [loading.value ? props.t("table.loading") : props.t("table.older")],
            ),
          h(
            "button",
            {
              type: "button",
              onClick: () => {
                followMode.value = "tail";
                resetSpacing((value) => value + 1);
              },
            },
            [props.t("table.latest")],
          ),
        ]),
        props.notice !== undefined &&
          h("div", { class: css.pickNotice, role: "status" }, [props.notice]),
        (failure.value !== null || openError.value !== null) &&
          h("p", { role: "alert" }, [failure.value ?? openError.value?.message]),
        h(
          "div",
          {
            ref: scroller,
            class: css.scroller,
            onScroll: (event: Event) => {
              const currentTarget = event.currentTarget as HTMLElement;
              viewport.value.offset = currentTarget.scrollTop;
              if (followMode.value !== "manual") {
                followMode.value =
                  currentTarget.scrollHeight -
                    currentTarget.clientHeight -
                    currentTarget.scrollTop <=
                  40
                    ? "tail"
                    : "scroll";
              }
            },
          },
          [
            h(
              "table",
              {
                class: css.table,
                "aria-label": props.title,
                "aria-rowcount": rows.value.length + 1,
              },
              [
                h("thead", null, [
                  h("tr", null, [
                    h("th", { class: css.idColumn }, [props.t("table.id")]),
                    h("th", { class: css.typeColumn }, [
                      h("span", { class: css.typeHeader }, [
                        props.t("table.type"),
                        h(TypeFilter, {
                          value: typeQuery.value,
                          suggest: suggestTypes,
                          apply: applyTypeFilter,
                          t: props.t,
                        }),
                      ]),
                    ]),
                    h("th", { class: css.locationColumn }, [props.t("table.location")]),
                    props.showTime && h("th", { class: css.timeColumn }, [props.t("table.time")]),
                    h("th", null, [props.t("table.data")]),
                  ]),
                ]),
                h("tbody", null, [
                  items.map((item, position) => {
                    const gap = item.start - (items[position - 1]?.end ?? INSPECTOR_ROW_HEIGHT);
                    // oxlint-disable-next-line typescript/no-non-null-assertion -- The virtual item comes from this layout's count.
                    const entry = layout.value.items[item.index]!;
                    // oxlint-disable-next-line typescript/no-non-null-assertion -- Every layout row belongs to the arrival map's allRows input.
                    const arrival = arrivals.value.get(entry.row.key)!;
                    return createVNode(Fragment, { key: String(item.key) }, [
                      gap > 0 &&
                        h("tr", { "aria-hidden": "true" }, [
                          h("td", { colSpan: columns, style: { height: `${gap}px`, padding: 0 } }),
                        ]),
                      h(DataRow, {
                        row: entry.row,
                        selected: entry.row.key === selected.value,
                        context:
                          typeFilter.value.active && !filtered.value.matches.has(entry.row.key),
                        branch: hierarchy.value.isBranch(entry.row.key),
                        collapsed: inspectorRowCollapsed(entry.row, disclosures.value),
                        stickyLevel: sticky.get(item.index),
                        pulse: reveal.value?.key === entry.row.key ? reveal.value.pulse : 0,
                        added: performance.now() - arrival < 700,
                        useRecord: props.useRecord,
                        select: select,
                        toggle: toggle,
                        flash: props.flash,
                        showTime: props.showTime,
                        t: props.t,
                      }),
                    ]);
                  }),
                  bottom > 0 &&
                    h(
                      "tr",
                      {
                        "aria-hidden": "true",
                        "data-inspector-fold-space":
                          layout.value.bottomPadding > 0 ? "" : undefined,
                      },
                      [h("td", { colSpan: columns, style: { height: `${bottom}px`, padding: 0 } })],
                    ),
                ]),
              ],
            ),
            rows.value.length === 0 && h("p", { class: css.empty }, [props.t("table.empty")]),
          ],
        ),
        selected.value !== null &&
          h(
            InspectorDetails,
            {
              failed: detail.value.failed,
              text:
                record.value === undefined
                  ? props.t("table.removed")
                  : detail.value.failed
                    ? `${props.t("table.rawError")}\n${detail.value.text}`
                    : detail.value.text,
              close: () => {
                setSelected(null);
                setObjectHistory(null);
              },
              t: props.t,
            },
            {
              default: () => [
                props.objects === undefined
                  ? record.value === undefined || detail.value.failed
                    ? undefined
                    : h(InspectorJsonTree, {
                        key: selected.value!,
                        text: detail.value.text,
                        t: props.t,
                      })
                  : createVNode(Fragment, null, [
                      h(
                        "nav",
                        {
                          class: css.objectBreadcrumbs,
                          "aria-label": props.t("object.navigation"),
                        },
                        [
                          h("ol", null, [
                            breadcrumbs.map((label, index) =>
                              h("li", { key: index }, [
                                index > 0 && h("span", { "aria-hidden": "true" }, ["\u203A"]),
                                h(
                                  "button",
                                  {
                                    type: "button",
                                    title: label,
                                    disabled: index === breadcrumbs.length - 1,
                                    "aria-current":
                                      index === breadcrumbs.length - 1 ? "page" : undefined,
                                    onClick: () => {
                                      backToObject(index);
                                    },
                                  },
                                  [label],
                                ),
                              ]),
                            ),
                          ]),
                        ],
                      ),
                      h(InspectorObjectTree, {
                        key: objectTarget.value?.id ?? selected.value!,
                        value: detailValue,
                        objects: props.objects,
                        navigate: navigate,
                        t: props.t,
                      }),
                    ]),
              ],
            },
          ),
      ]);
    };
  },
  {
    props: [
      "title",
      "flash",
      "showTime",
      "modeSelector",
      "objects",
      "navigation",
      "pickedRow",
      "notice",
      "useRows",
      "useRecord",
      "useSession",
      "loadOlder",
      "typeOf",
      "t",
    ],
  },
);
