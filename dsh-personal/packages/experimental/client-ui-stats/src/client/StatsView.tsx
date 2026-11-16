import { defineComponent, computed, shallowRef, watch, h, onUpdated, onMounted } from "vue";
import { SegmentedControl, Switch } from "@deepseek-ai/dsh-client-ui-primitives";
import type { LoadOlderResult } from "./stats-contract.ts";
import { aggregateTotals, turnContext } from "./stats-aggregate.ts";
import { isNumber } from "./stats-usage.ts";
import { totalsFromProjections } from "./stats-totals.ts";
import css from "./stats.module.css";
import {
  COLUMNS,
  EMPTY_STEP_VIEW,
  LOAD_OLDER_THRESHOLD,
  TableButton,
  TotalsRow,
  createViewState,
  defaultTurnOpen,
  isTimeRunning,
  totalSpan,
  turnRows,
  type StatsViewProps,
  type StatsViewInjected,
  type StepViewState,
  type ViewState,
} from "./StatsTable.tsx";
export type { StatsViewInjected, StatsViewProps };
/** Scroll metrics captured before an older page loads, applied once its turns commit. */
interface PendingPrepend {
  readonly height: number;
  readonly top: number;
  readonly firstTurn: number | null;
}
/**
 * Render the Statistics table of the current conversation view target. The
 * table owns the viewport scroll: reaching the top asks the injected loader
 * for one older page while the already published turns stay in place.
 * @param props - composed conversation View props: the stats snapshot hook, the older-page loader, and the locale seat.
 * @returns the scrolling table, its empty state, and the expand/collapse footer.
 */
export const StatsView = defineComponent(
  (props: StatsViewProps) => {
    const useStats = computed(() => props.useStats);
    const t = computed(() => props.t);
    const loadOlder = computed(() => props.loadOlder);
    const loadImage = computed(() => props.loadImage);
    const useProjection = computed(() => props.useProjection);
    const cancel = computed(() => props.cancel);
    const snapshot = useStats.value((value) => value);
    const view = shallowRef<ViewState>(createViewState());
    const setView = (next: ViewState | ((previous: ViewState) => ViewState)) => {
      view.value = typeof next === "function" ? next(view.value) : next;
    };
    const now = shallowRef((() => Date.now())());
    const setNow = (
      next: typeof now.value | ((previous: typeof now.value) => typeof now.value),
    ) => {
      now.value = typeof next === "function" ? next(now.value) : next;
    };
    const loading = shallowRef(false);
    const setLoading = (
      next: typeof loading.value | ((previous: typeof loading.value) => typeof loading.value),
    ) => {
      loading.value = typeof next === "function" ? next(loading.value) : next;
    };
    const exhausted = shallowRef(false);
    const setExhausted = (
      next: typeof exhausted.value | ((previous: typeof exhausted.value) => typeof exhausted.value),
    ) => {
      exhausted.value = typeof next === "function" ? next(exhausted.value) : next;
    };
    const loadFailed = shallowRef(false);
    const setLoadFailed = (
      next:
        | typeof loadFailed.value
        | ((previous: typeof loadFailed.value) => typeof loadFailed.value),
    ) => {
      loadFailed.value = typeof next === "function" ? next(loadFailed.value) : next;
    };
    const visibleTurns = shallowRef<ReadonlySet<number>>((() => new Set())());
    const setVisibleTurns = (
      next: ReadonlySet<number> | ((previous: ReadonlySet<number>) => ReadonlySet<number>),
    ) => {
      visibleTurns.value = typeof next === "function" ? next(visibleTurns.value) : next;
    };
    const scrollRef = shallowRef<HTMLDivElement | null>(null);
    const loadingRef = shallowRef(false);
    const pendingPrepend = shallowRef<(PendingPrepend | null) | null>(null);
    const initialized = shallowRef(false);
    const autoLoaded = shallowRef(false);
    const turns = computed(() => snapshot.value.turns);
    const firstTurn = computed(() => turns.value[0]?.turn ?? null);
    const latestTurn = computed(() => turns.value.at(-1)?.turn ?? null);
    const isTurnOpen = (turnNumber: number): boolean =>
      view.value.openTurns[turnNumber] ??
      defaultTurnOpen(view.value.mode, turnNumber, latestTurn.value);
    const allOpen = computed(
      () => turns.value.length > 0 && turns.value.every((turn) => isTurnOpen(turn.turn)),
    );
    const hasRunning = computed(() =>
      turns.value.some(
        (turn) => isTimeRunning(turn) || turn.steps.some((step) => isTimeRunning(step)),
      ),
    );
    const projectionStats = useProjection.value("sessionStats");
    const projectionUsage = useProjection.value("tokenUsage");
    const fullTotals = computed(() =>
      view.value.showTotals
        ? totalsFromProjections(projectionStats.value, projectionUsage.value)
        : null,
    );
    const totals = computed(
      () =>
        fullTotals.value ??
        (view.value.showTotals && turns.value.length > 0 ? aggregateTotals(turns.value) : null),
    );
    const turnDeltas = computed(() => {
      const deltas = new Map<number, number>();
      if (view.value.showContextDelta) {
        let previous: number | null = null;
        for (const turn of turns.value) {
          const value = turnContext(turn, view.value.contextMode);
          if (isNumber(previous) && isNumber(value) && value !== previous)
            deltas.set(turn.turn, value - previous);
          if (isNumber(value)) previous = value;
        }
      }
      return deltas;
    });
    const scaleTurns = computed(() =>
      visibleTurns.value.size === 0
        ? turns.value
        : turns.value.filter((turn) => visibleTurns.value.has(turn.turn)),
    );
    const turnScale = computed(() =>
      scaleTurns.value.reduce((max, turn) => {
        const span = totalSpan(turn, now.value);
        return span !== null && span > max ? span : max;
      }, 0),
    );
    const toggleTurn = (turnNumber: number): void => {
      setView((current) => {
        const open =
          current.openTurns[turnNumber] ??
          defaultTurnOpen(current.mode, turnNumber, latestTurn.value);
        return { ...current, openTurns: { ...current.openTurns, [turnNumber]: !open } };
      });
    };
    const toggleAllTurns = (): void => {
      setView((current) => ({ ...current, openTurns: {}, mode: allOpen.value ? "none" : "all" }));
    };
    const toggleStepDetail = (turnNumber: number, stepNumber: number): void => {
      setView((current) => {
        const state = current.stepViews[turnNumber] ?? EMPTY_STEP_VIEW;
        const open = { ...(state.open ?? {}) };
        open[stepNumber] = open[stepNumber] !== true;
        return {
          ...current,
          stepViews: { ...current.stepViews, [turnNumber]: { ...state, open } },
        };
      });
    };
    const patchStepView = (turnNumber: number, patch: Partial<StepViewState>): void => {
      setView((current) => {
        const state = current.stepViews[turnNumber] ?? EMPTY_STEP_VIEW;
        return {
          ...current,
          stepViews: { ...current.stepViews, [turnNumber]: { ...state, ...patch } },
        };
      });
    };
    const requestOlder = async (): Promise<void> => {
      if (loadingRef.value || exhausted.value || turns.value.length === 0) return;
      const element = scrollRef.value;
      /* v8 ignore next -- the scrollport mounts with the first render, so a request never runs without it. */
      if (element === null) return;
      loadingRef.value = true;
      setLoading(true);
      setLoadFailed(false);
      const before: PendingPrepend = {
        height: element.scrollHeight,
        top: element.scrollTop,
        firstTurn: firstTurn.value,
      };
      let result: LoadOlderResult;
      try {
        result = await loadOlder.value();
      } catch {
        // Surface the failed page instead of looking like a silent no-op.
        loadingRef.value = false;
        setLoading(false);
        setLoadFailed(true);
        return;
      }
      if (result === "grew") {
        pendingPrepend.value = before;
      } else if (result === "exhausted") {
        pendingPrepend.value = null;
        setExhausted(true);
      } else {
        // Another view owns the in-flight page, or this page added no stats row.
        // Keep the trigger retryable without claiming exhaustion.
        pendingPrepend.value = null;
      }
      loadingRef.value = false;
      setLoading(false);
    };
    const handleScroll = (event: Event): void => {
      if (
        !(event.currentTarget instanceof HTMLDivElement) ||
        event.currentTarget.scrollTop > LOAD_OLDER_THRESHOLD
      )
        return;
      void requestOlder();
    };
    onMounted(() =>
      watch(
        [() => hasRunning.value],
        (_value, _previous, onCleanup) => {
          const cleanup = (() => {
            if (!hasRunning.value) return undefined;
            setNow(Date.now());
            const timer = setInterval(() => {
              setNow(Date.now());
            }, 1000);
            return () => {
              clearInterval(timer);
            };
          })();
          if (typeof cleanup === "function") onCleanup(cleanup);
        },
        { immediate: true, flush: "post" },
      ),
    );
    onMounted(() =>
      watch(
        [() => cancel.value],
        (_value, _previous, onCleanup) => {
          const cancelNow = cancel.value;
          const cleanup = () => {
            cancelNow();
          };
          if (typeof cleanup === "function") onCleanup(cleanup);
        },
        { immediate: true, flush: "post" },
      ),
    );
    const restoreScroll = () => {
      const element = scrollRef.value;
      /* v8 ignore next -- the scrollport mounts with the first render. */
      if (element === null) return;
      if (!initialized.value && turns.value.length > 0) {
        initialized.value = true;
        element.scrollTop = element.scrollHeight;
        // First open has no scroll gesture to trigger a page: pull one older page
        // when the scrollport has real layout (a jsdom test has none).
        if (!autoLoaded.value && element.clientHeight > 0) {
          autoLoaded.value = true;
          void requestOlder();
        }
        return;
      }
      const pending = pendingPrepend.value;
      if (pending === null || firstTurn.value === pending.firstTurn) return;
      pendingPrepend.value = null;
      element.scrollTop = pending.top + Math.max(0, element.scrollHeight - pending.height);
    };
    onMounted(restoreScroll);
    onUpdated(restoreScroll);
    onMounted(() =>
      watch(
        [() => turns.value.length],
        (_value, _previous, onCleanup) => {
          const cleanup = (() => {
            const element = scrollRef.value;
            /* v8 ignore next -- the scrollport mounts with the first render. */
            if (element === null || typeof IntersectionObserver === "undefined") return undefined;
            const visible = new Set<number>();
            const observer = new IntersectionObserver(
              (entries) => {
                let changed = false;
                for (const entry of entries) {
                  const turn = Number((entry.target as HTMLElement).dataset.turn);
                  const had = visible.has(turn);
                  if (entry.isIntersecting) visible.add(turn);
                  else visible.delete(turn);
                  if (had !== visible.has(turn)) changed = true;
                }
                if (changed) setVisibleTurns(new Set(visible));
              },
              { root: element },
            );
            for (const row of element.querySelectorAll<HTMLElement>("tr[data-turn]"))
              observer.observe(row);
            return () => {
              observer.disconnect();
            };
          })();
          if (typeof cleanup === "function") onCleanup(cleanup);
        },
        { immediate: true, flush: "post" },
      ),
    );
    return () =>
      h(
        "div",
        {
          class: css.root,
          "data-conversation-composer-overlay": "",
        },
        [
          h(
            "div",
            {
              ref: scrollRef,
              class: css.scroll,
              role: "region",
              "aria-label": t.value("view.stats"),
              tabIndex: 0,
              onScroll: handleScroll,
            },
            [
              turns.value.length === 0
                ? null
                : h(
                    "div",
                    {
                      class: css.older,
                    },
                    [
                      loading.value
                        ? h(
                            "span",
                            {
                              class: css.olderStatus,
                              role: "status",
                            },
                            [t.value("loadOlder.loading")],
                          )
                        : exhausted.value
                          ? h(
                              "span",
                              {
                                class: css.olderStatus,
                              },
                              [t.value("loadOlder.done")],
                            )
                          : loadFailed.value
                            ? h(
                                "button",
                                {
                                  type: "button",
                                  class: css.button,
                                  onClick: () => {
                                    void requestOlder();
                                  },
                                },
                                [t.value("loadOlder.failed")],
                              )
                            : h(
                                "button",
                                {
                                  type: "button",
                                  class: css.button,
                                  onClick: () => {
                                    void requestOlder();
                                  },
                                },
                                [t.value("loadOlder")],
                              ),
                    ],
                  ),
              turns.value.length === 0
                ? h(
                    "div",
                    {
                      class: css.empty,
                    },
                    [t.value("empty")],
                  )
                : h(
                    "table",
                    {
                      class: css.table,
                      "aria-label": t.value("view.stats"),
                    },
                    [
                      h("colgroup", null, [
                        h("col", null),
                        h("col", null),
                        h("col", null),
                        COLUMNS.map((name) =>
                          h("col", {
                            key: name,
                          }),
                        ),
                        h("col", null),
                      ]),
                      h("thead", null, [
                        h("tr", null, [
                          h(
                            "th",
                            {
                              class: css.thLeft,
                              title: t.value("column.scope.title"),
                            },
                            [t.value("column.scope")],
                          ),
                          h(
                            "th",
                            {
                              class: css.thLeft,
                              title: t.value("column.prompt.title"),
                            },
                            [t.value("column.prompt")],
                          ),
                          h(
                            "th",
                            {
                              class: css.thLeft,
                              title: t.value("column.did.title"),
                            },
                            [t.value("column.did")],
                          ),
                          COLUMNS.map((name) =>
                            h(
                              "th",
                              {
                                key: name,
                                class: css.th,
                                title: t.value(`column.${name}.title`),
                              },
                              [t.value(`column.${name}`)],
                            ),
                          ),
                          h(
                            "th",
                            {
                              class: css.th,
                              title: t.value("column.time.title"),
                            },
                            [t.value("column.time")],
                          ),
                        ]),
                      ]),
                      h("tbody", null, [
                        turns.value.flatMap((turn) =>
                          turnRows({
                            turn,
                            t: t.value,
                            loadImage: loadImage.value,
                            now: now.value,
                            open: isTurnOpen(turn.turn),
                            state: view.value.stepViews[turn.turn] ?? EMPTY_STEP_VIEW,
                            turnScale: turnScale.value,
                            contextMode: view.value.contextMode,
                            showEvents: view.value.showEvents,
                            showContextDelta: view.value.showContextDelta,
                            contextDelta: view.value.showContextDelta
                              ? (turnDeltas.value.get(turn.turn) ?? null)
                              : null,
                            onToggle: () => {
                              toggleTurn(turn.turn);
                            },
                            onToggleDetail: (stepNumber) => {
                              toggleStepDetail(turn.turn, stepNumber);
                            },
                            onControl: (patch) => {
                              patchStepView(turn.turn, patch);
                            },
                          }),
                        ),
                      ]),
                      totals.value === null
                        ? null
                        : h("tfoot", null, [
                            h(TotalsRow, {
                              totals: totals.value,
                              full: fullTotals.value !== null,
                              t: t.value,
                              now: now.value,
                            }),
                          ]),
                    ],
                  ),
            ],
          ),
          h(
            "div",
            {
              class: css.toolbar,
            },
            [
              h(
                "span",
                {
                  class: css.summary,
                },
                [
                  t.value("summary", {
                    turns: turns.value.length,
                    steps: snapshot.value.stepCount,
                  }),
                ],
              ),
              h(
                "div",
                {
                  class: css.controls,
                },
                [
                  h(
                    "span",
                    {
                      class: css.controlLabel,
                    },
                    [t.value("table.showTotals")],
                  ),
                  h(Switch, {
                    checked: view.value.showTotals,
                    onChange: (next) => {
                      setView((previous) => ({ ...previous, showTotals: next }));
                    },
                    label: t.value("table.showTotals"),
                  }),
                  h(
                    "span",
                    {
                      class: css.controlLabel,
                    },
                    [t.value("event.show")],
                  ),
                  h(Switch, {
                    checked: view.value.showEvents,
                    onChange: (next) => {
                      setView((previous) => ({ ...previous, showEvents: next }));
                    },
                    label: t.value("event.show"),
                  }),
                  h(
                    "span",
                    {
                      class: css.controlLabel,
                    },
                    [t.value("context.delta.show")],
                  ),
                  h(Switch, {
                    checked: view.value.showContextDelta,
                    onChange: (next) => {
                      setView((previous) => ({ ...previous, showContextDelta: next }));
                    },
                    label: t.value("context.delta.show"),
                    title: t.value("context.delta.title"),
                  }),
                  h(
                    "span",
                    {
                      class: css.controlLabel,
                    },
                    [t.value("contextMode.label")],
                  ),
                  h(SegmentedControl, {
                    id: "stats-context-mode",
                    value: view.value.contextMode,
                    options: [
                      {
                        value: "latest",
                        label: t.value("contextMode.latest"),
                        title: t.value("contextMode.latest.title"),
                      },
                      {
                        value: "cumulative",
                        label: t.value("contextMode.cumulative"),
                        title: t.value("contextMode.cumulative.title"),
                      },
                    ],
                    onChange: (next) => {
                      setView((previous) => ({
                        ...previous,
                        contextMode: next === "cumulative" ? "cumulative" : "latest",
                      }));
                    },
                    label: t.value("contextMode.label"),
                    className: css.contextMode,
                  }),
                ],
              ),
              h(TableButton, {
                caption: allOpen.value ? t.value("collapse.all") : t.value("expand.all"),
                enabled: turns.value.length > 0,
                onClick: toggleAllTurns,
              }),
            ],
          ),
        ],
      );
  },
  {
    props: ["useStats", "t", "loadOlder", "loadImage", "useProjection", "cancel"],
    inheritAttrs: false,
  },
);
