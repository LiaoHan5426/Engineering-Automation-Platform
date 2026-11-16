import {
  computed,
  defineComponent,
  Fragment,
  h,
  ref,
  shallowRef,
  useId,
  watch,
  type VNodeChild,
} from "vue";
import type { ClientEntryState } from "@deepseek-ai/dsh-client-modules/client";
import type { ObservableSnapshot } from "@deepseek-ai/dsh-client-store";
import type { PluginInventorySnapshot } from "@deepseek-ai/dsh-api-remotes/client";
import type { LocalizedText } from "@deepseek-ai/dsh-package-manifest";
import {
  IconChevronDownOutlineRegular,
  IconSearchOutlineRegular,
  Menu,
  StateDot,
  Tag,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type { StateDotState, TagTone } from "@deepseek-ai/dsh-client-ui-primitives";
import type { InjectFace, PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import {
  localizedValues,
  TextSearchIndex,
  type SearchKeys,
} from "@deepseek-ai/dsh-util-text-search";
import type { PluginInventoryLocaleKey } from "./locales.ts";
import css from "./PluginInventorySettingsTab.module.css";
type PluginInventoryEntry = PluginInventorySnapshot["entries"][number];
type AgentPresetGroup = NonNullable<PluginInventorySnapshot["agentPresets"]>[number];
type AgentPresetRow = AgentPresetGroup["rows"][number];
/** Registration-side Remote face used by the section. */
export interface PluginInventorySettingsTabInjected {
  /** Resolve local package text in the current Client locale at render time. */
  resolveText: (text: LocalizedText) => string;
  /** Page-local module synchronization, independent from the Host inventory. */
  hooks: {
    clientSync: ObservableSnapshot<ClientEntryState>;
  };
  /** Retry the latest client graph without changing the Host composition. */
  retryClient: () => void;
  /** Read a current Host inventory snapshot. */
  list: () => Promise<PluginInventorySnapshot>;
  /**
   * Display name for one preset: shipped presets resolve through the
   * agent-preset dictionaries, user-authored ones keep their own metadata.
   */
  presetName: (preset: AgentPresetGroup) => string;
}
type PluginFiberPhase = PluginInventoryEntry["fiberPhase"];
/** Full component props assembled by the Settings slot renderer. */
export type PluginInventorySettingsTabProps = PropsRuntime<"settings.plugins.tab"> &
  PropsLocale<"settings.pluginInventory"> &
  InjectFace<PluginInventorySettingsTabInjected>;
type Translate = PluginInventorySettingsTabProps["t"];
type ViewState =
  | {
      readonly status: "loading";
    }
  | {
      readonly status: "error";
    }
  | {
      readonly status: "ready";
      readonly snapshot: PluginInventorySnapshot;
    };
const PHASE_KEYS = {
  pending: "pending",
  loading: "loadingPhase",
  active: "active",
  failed: "failed",
  unloading: "unloading",
} satisfies Record<Exclude<PluginFiberPhase, null>, PluginInventoryLocaleKey>;
/** Placeholder cards the loading skeleton lays out in the cards grid. */
const SKELETON_CARDS = [0, 1, 2, 3] as const;
/** Localized accessible label for one root Fiber phase. */
function phaseLabel(phase: PluginFiberPhase, t: Translate): string {
  return phase === null ? t("unobserved") : t(PHASE_KEYS[phase]);
}
/** Compact technical names for Settings without changing their module identity. */
function moduleShortName(moduleName: string): string {
  const unscoped = moduleName.startsWith("@")
    ? moduleName.slice(moduleName.indexOf("/") + 1)
    : moduleName;
  return unscoped
    .replace(/^cordis:/, "")
    .replace(/^cordis-plugin-/, "")
    .replace(/^dsh-(?:host-|client-)?/, "");
}
/** Display an entry identity without the composition-only `include:` marker. */
function entrySubtitle(entryId: string): string {
  return entryId.replace(/^include:/, "");
}
/** Whether a card shows its entry id: the id exists and, without its `include:` marker, differs from the title. */
function idAddsToTitle(entryId: string | null, title: string): entryId is string {
  return entryId !== null && entrySubtitle(entryId) !== title;
}
/** Accessible card name: the title, the complete entry id when the card shows one, then the enablement state. */
function cardLabel(title: string, entryId: string | null, state: string): string {
  return idAddsToTitle(entryId, title) ? `${title}, ${entryId}, ${state}` : `${title}, ${state}`;
}
/** Preserve translated titles and shorten literal package or module name fallbacks in Settings. */
function pluginText(
  row: PluginInventoryEntry | AgentPresetRow,
  resolveText: PluginInventorySettingsTabInjected["resolveText"],
) {
  const title = row.meta?.title;
  return {
    title:
      typeof title === "object" ? resolveText(title) : moduleShortName(title ?? row.moduleName),
    description:
      row.meta?.description === undefined
        ? undefined
        : resolveText(row.meta.description) || undefined,
  };
}
/** Search text of one row: its module and entry identities and every language of its title and description. */
function searchKeys(row: PluginInventoryEntry | AgentPresetRow): SearchKeys {
  return {
    fuzzy: [row.moduleName, row.entryId ?? undefined, ...localizedValues(row.meta?.title)],
    substring: localizedValues(row.meta?.description),
  };
}
/** The roster row shown when the preset switcher has no explicit choice. */
function fallbackPreset(presets: readonly AgentPresetGroup[]): AgentPresetGroup | undefined {
  return presets.find((preset) => preset.isDefault) ?? presets[0];
}
/** The switcher's display label for one preset. */
function presetLabel(
  preset: AgentPresetGroup,
  t: Translate,
  presetName: (preset: AgentPresetGroup) => string,
): string {
  const name = presetName(preset);
  if (preset.broken !== undefined) return t("presetOptionBroken", { name });
  if (preset.isDefault) return t("presetOptionDefault", { name });
  return name;
}
/** One expandable plugin card; the caller owns the trailing status content. */
const PluginCard = defineComponent(
  (
    props: {
      readonly rowKey: string;
      readonly moduleName: string;
      readonly title: string;
      readonly description: string | undefined;
      readonly metadataError: string | undefined;
      readonly entryId: string | null;
      readonly trailing: VNodeChild;
      readonly ariaLabel: string;
      readonly failed: boolean;
      readonly expanded: string | null;
      readonly onToggle: (key: string) => void;
    },
    { slots },
  ) => {
    const descriptionId = useId();
    return () => {
      const {
        rowKey,
        moduleName,
        title,
        description,
        metadataError,
        entryId,
        trailing,
        ariaLabel,
        failed,
        expanded,
        onToggle,
      } = props;
      const open = expanded === rowKey;
      const detailId = `plugin-details-${encodeURIComponent(rowKey)}`;
      return h(
        "li",
        {
          class: css.card,
          "data-plugin-entry": entryId ?? undefined,
          "data-plugin-module": moduleName,
          "data-failed": failed ? "true" : undefined,
          "data-open": open ? "true" : undefined,
        },
        [
          h(
            "button",
            {
              class: css.cardContent,
              type: "button",
              "aria-expanded": open,
              "aria-controls": detailId,
              "aria-label": ariaLabel,
              "aria-describedby": description === undefined ? undefined : descriptionId,
              onClick: () => {
                onToggle(rowKey);
              },
            },
            [
              h(
                "span",
                {
                  class: css.cardMainRow,
                },
                [
                  h(
                    "strong",
                    {
                      class: css.cardTitle,
                      title: moduleName,
                    },
                    [title],
                  ),
                  h(
                    "span",
                    {
                      class: css.cardTrailing,
                    },
                    [
                      trailing,
                      h(IconChevronDownOutlineRegular, {
                        class: css.chevron,
                        size: 12,
                        "aria-hidden": "true",
                      }),
                    ],
                  ),
                ],
              ),
              description === undefined
                ? null
                : h(
                    "span",
                    {
                      class: css.cardDescription,
                      id: descriptionId,
                    },
                    [description],
                  ),
              idAddsToTitle(entryId, title)
                ? h(
                    "span",
                    {
                      class: css.cardMeta,
                    },
                    [
                      h(
                        "code",
                        {
                          class: css.cardIdentity,
                          title: entryId,
                        },
                        [entrySubtitle(entryId)],
                      ),
                    ],
                  )
                : null,
            ],
          ),
          metadataError === undefined
            ? null
            : h(
                "p",
                {
                  class: css.brokenNote,
                  role: "status",
                  "data-package-meta-error": true,
                },
                [metadataError],
              ),
          open
            ? h(
                "div",
                {
                  class: css.cardDetails,
                  id: detailId,
                },
                [slots.default?.()],
              )
            : null,
        ],
      );
    };
  },
  {
    name: "PluginCard",
    props: [
      "rowKey",
      "moduleName",
      "title",
      "description",
      "metadataError",
      "entryId",
      "trailing",
      "ariaLabel",
      "failed",
      "expanded",
      "onToggle",
    ],
  },
);
/** Detail rows shared by every card: the Loader identity, then labeled facts. */
function CardFacts({
  moduleName,
  moduleLabel,
  entryId,
  facts,
}: {
  readonly moduleName: string;
  readonly moduleLabel: string;
  readonly entryId: string | null;
  readonly facts: readonly (readonly [label: string, value: VNodeChild])[];
}): VNodeChild {
  return h(Fragment, null, [
    entryId === null
      ? null
      : h(
          "code",
          {
            class: css.entryValue,
            "data-loader-entry": true,
          },
          [entryId],
        ),
    h(
      "dl",
      {
        class: css.details,
      },
      [
        h("div", {}, [h("dt", {}, [moduleLabel]), h("dd", {}, [moduleName])]),
        facts.map(([label, value]) =>
          h(
            "div",
            {
              key: label,
            },
            [h("dt", {}, [label]), h("dd", {}, [value])],
          ),
        ),
      ],
    ),
  ]);
}
/* `pending` is the only dotted phase with no work under way. `loading` and
 * `unloading` are both live transitions the Host is running — an async
 * disposer can hold `unloading` for a while — so both animate. `active` and
 * `failed` carry no dot: a settled enabled row needs no marker, and a failed
 * row has the failure tag. */
const PHASE_DOT_STATES = {
  pending: "idle",
  loading: "ongoing",
  unloading: "ongoing",
} as const satisfies Partial<Record<NonNullable<PluginFiberPhase>, StateDotState>>;
/** A live root-fiber phase the row marks with a dot. */
type DotPhase = keyof typeof PHASE_DOT_STATES;
/** Whether a live root-fiber phase carries a dot of its own. */
function showsPhaseDot(phase: PluginFiberPhase): phase is DotPhase {
  return phase === "pending" || phase === "loading" || phase === "unloading";
}
/** Status dot naming a live root-fiber phase; rows without a dotted phase show none. */
function PhaseDot({ phase, t }: { readonly phase: DotPhase; readonly t: Translate }): VNodeChild {
  const status = phaseLabel(phase, t);
  /* StateDot is aria-hidden, so the phase name lives on this wrapper. */
  return h(
    "span",
    {
      class: css.phaseDot,
      role: "img",
      "aria-label": status,
      title: status,
    },
    [
      h(StateDot, {
        state: PHASE_DOT_STATES[phase],
      }),
    ],
  );
}
/** Enablement states one inventory row can report. */
type EnablementKind = "enabled" | "disabled" | "conditional" | "preset" | "failed";
const TAG_TONES = {
  disabled: "neutral",
  conditional: "warning",
  preset: "info",
  failed: "danger",
} as const satisfies Record<Exclude<EnablementKind, "enabled">, TagTone>;
/** Enablement tag for the states that depart from the default; a plainly enabled row carries none. */
function StateTag({
  kind,
  label,
}: {
  readonly kind: EnablementKind;
  readonly label: string;
}): VNodeChild {
  return kind === "enabled"
    ? null
    : h(
        Tag,
        {
          tone: TAG_TONES[kind],
        },
        { default: () => [label] },
      );
}
/** Render the read-only plugin inventory: agent presets first, then the global plane. */
export const PluginInventorySettingsTab = defineComponent(
  (props: PluginInventorySettingsTabProps) => {
    const clientSyncState = props.useClientSync((snapshot) => snapshot);
    const sectionId = useId();
    const request = ref(0);
    const query = ref("");
    const expanded = ref<string | null>(null);
    const chosenPreset = ref<string | null>(null);
    const switcherOpen = ref(false);
    const presetOpen = ref<boolean | null>(null);
    const globalOpen = ref<boolean | null>(null);
    const state = shallowRef<ViewState>({ status: "loading" });
    watch(
      [() => props.list, request],
      ([list], _previous, onCleanup) => {
        let current = true;
        onCleanup(() => {
          current = false;
        });
        void Promise.resolve()
          .then(() => list())
          .then(
            (snapshot) => {
              if (current) state.value = { status: "ready", snapshot };
            },
            () => {
              if (current) state.value = { status: "error" };
            },
          );
      },
      { immediate: true },
    );
    /** Presets that actually enable a module, keyed by module name. */
    const enabledIn = computed(() => {
      const presets =
        state.value.status === "ready" ? (state.value.snapshot.agentPresets ?? []) : [];
      const found = new Map<string, [AgentPresetGroup, ...AgentPresetGroup[]]>();
      for (const preset of presets) {
        for (const row of preset.rows) {
          if (row.enabled !== true) continue;
          const groups = found.get(row.moduleName);
          if (groups === undefined) found.set(row.moduleName, [preset]);
          else if (!groups.includes(preset)) groups.push(preset);
        }
      }
      return found;
    });
    const indexes = computed(() => {
      const snapshot = state.value.status === "ready" ? state.value.snapshot : undefined;
      const failed: PluginInventoryEntry[] = [];
      const regular: PluginInventoryEntry[] = [];
      for (const entry of snapshot?.entries ?? []) {
        if (entry.fiberPhase === "failed") failed.push(entry);
        else regular.push(entry);
      }
      return {
        failed: new TextSearchIndex(failed, searchKeys),
        regular: new TextSearchIndex(regular, searchKeys),
        presets: (snapshot?.agentPresets ?? []).map((preset) => ({
          preset,
          index: new TextSearchIndex(preset.rows, searchKeys),
        })),
      };
    });
    return () => {
      const { presetName, resolveText, t, retryClient } = props;
      const clientSync = clientSyncState.value;
      const searching = query.value.trim().length > 0;
      const snapshot = state.value.status === "ready" ? state.value.snapshot : undefined;
      const presets = snapshot?.agentPresets ?? [];
      const selected =
        presets.find((preset) => preset.id === chosenPreset.value) ?? fallbackPreset(presets);
      const entries = snapshot?.entries ?? [];
      // One index per list, built when the snapshot changes; typing only searches them.
      const filteredFailed = indexes.value.failed.search(query.value);
      const filteredRegular = indexes.value.regular.search(query.value);
      const globalCount = filteredFailed.length + filteredRegular.length;
      const selectedRows =
        indexes.value.presets
          .find(({ preset }) => preset === selected)
          ?.index.search(query.value) ?? [];
      const otherMatches = searching
        ? indexes.value.presets
            .flatMap(({ preset, index }) =>
              preset === selected ? [] : [{ preset, count: index.search(query.value).length }],
            )
            .filter((match) => match.count > 0)
        : [];
      const otherPresetMatches = otherMatches.map((match) => match.preset);
      const otherMatchCount = otherMatches.reduce((total, match) => total + match.count, 0);
      // The preset group starts open and the larger global plane folded; a search opens both for as long as it lasts.
      const presetEffectiveOpen = searching || (presetOpen.value ?? true);
      const globalEffectiveOpen = searching || (globalOpen.value ?? false);
      const nothingMatches =
        searching &&
        globalCount === 0 &&
        selectedRows.length === 0 &&
        otherPresetMatches.length === 0;
      const retry = (): void => {
        state.value = { status: "loading" };
        request.value++;
      };
      const toggleRow = (key: string): void => {
        expanded.value = expanded.value === key ? null : key;
      };
      /** Trailing status and detail facts for one row of the selected preset. */
      const presetRowCard = (
        preset: AgentPresetGroup,
        row: AgentPresetRow,
        index: number,
      ): VNodeChild => {
        const key = `preset:${preset.id}:${String(index)}`;
        const { title, description } = pluginText(row, resolveText);
        const failed = row.fiberPhase === "failed";
        const stateText = failed
          ? t("failedTag")
          : row.enabled === true
            ? t("enabledTag")
            : row.enabled === false
              ? t("disabledTag")
              : t("conditionalTag");
        const kind = failed
          ? "failed"
          : row.enabled === true
            ? "enabled"
            : row.enabled === false
              ? "disabled"
              : "conditional";
        return h(
          PluginCard,
          {
            key: key,
            rowKey: key,
            moduleName: row.moduleName,
            title: title,
            description: description,
            metadataError:
              row.meta?.error === undefined
                ? undefined
                : t("metadataError", { error: row.meta.error }),
            entryId: row.entryId,
            failed: failed,
            expanded: expanded.value,
            onToggle: toggleRow,
            ariaLabel: cardLabel(title, row.entryId, stateText),
            trailing: h(Fragment, null, [
              row.enabled === true && showsPhaseDot(row.fiberPhase)
                ? h(PhaseDot, {
                    phase: row.fiberPhase,
                    t: t,
                  })
                : null,
              h(StateTag, {
                kind: kind,
                label: stateText,
              }),
            ]),
          },
          {
            default: () => [
              h(CardFacts, {
                moduleName: row.moduleName,
                moduleLabel: t("moduleLabel"),
                entryId: row.entryId,
                facts: [
                  [t("fromPreset"), presetName(preset)],
                  [t("configuration"), stateText],
                  ...(row.fiberPhase === null
                    ? []
                    : [[t("runtime"), phaseLabel(row.fiberPhase, t)] as const]),
                  ...(row.condition === undefined
                    ? []
                    : [
                        [
                          t("condition"),
                          h(
                            "code",
                            {
                              key: "condition",
                            },
                            [row.condition],
                          ),
                        ] as const,
                      ]),
                ],
              }),
            ],
          },
        );
      };
      /** One global-plane row; a preset-provided row carries the presets that enable it. */
      const globalRowCard = (
        entry: PluginInventoryEntry,
        providers?: readonly [AgentPresetGroup, ...AgentPresetGroup[]],
      ): VNodeChild => {
        const key = `global:${entry.entryId}`;
        const { title, description } = pluginText(entry, resolveText);
        const failed = entry.fiberPhase === "failed";
        const stateText = failed
          ? t("failedTag")
          : providers !== undefined
            ? t("presetEnabledTag")
            : t(entry.enabled ? "enabledTag" : "disabledTag");
        const kind = failed
          ? "failed"
          : providers !== undefined
            ? "preset"
            : entry.enabled
              ? "enabled"
              : "disabled";
        return h(
          PluginCard,
          {
            key: key,
            rowKey: key,
            moduleName: entry.moduleName,
            title: title,
            description: description,
            metadataError:
              entry.meta?.error === undefined
                ? undefined
                : t("metadataError", { error: entry.meta.error }),
            entryId: entry.entryId,
            failed: failed,
            expanded: expanded.value,
            onToggle: toggleRow,
            ariaLabel: cardLabel(title, entry.entryId, stateText),
            trailing: h(Fragment, null, [
              entry.enabled && showsPhaseDot(entry.fiberPhase)
                ? h(PhaseDot, {
                    phase: entry.fiberPhase,
                    t: t,
                  })
                : null,
              h(StateTag, {
                kind: kind,
                label: stateText,
              }),
            ]),
          },
          {
            default: () => [
              h(CardFacts, {
                moduleName: entry.moduleName,
                moduleLabel: t("moduleLabel"),
                entryId: entry.entryId,
                facts:
                  providers !== undefined
                    ? [
                        [t("configuration"), t("presetProvidedDetail")],
                        [t("enabledIn"), providers.map((preset) => presetName(preset)).join(" · ")],
                      ]
                    : [
                        [t("configuration"), t(entry.enabled ? "enabledTag" : "disabledTag")],
                        ...(entry.enabled
                          ? [[t("runtime"), phaseLabel(entry.fiberPhase, t)] as const]
                          : []),
                      ],
              }),
            ],
          },
        );
      };
      return h(
        "div",
        {
          class: css.section,
          "aria-busy": state.value.status === "loading",
        },
        [
          clientSync.syncing
            ? h(
                "p",
                {
                  class: `${css.status} ${css.statusWithDot}`,
                  role: "status",
                },
                [
                  h(StateDot, {
                    state: "ongoing",
                  }),
                  t("clientSyncing"),
                ],
              )
            : null,
          clientSync.failures.length === 0
            ? null
            : h(
                "div",
                {
                  class: css.failure,
                  "data-client-sync-failure": true,
                },
                [
                  h(
                    "p",
                    {
                      class: css.statusWithDot,
                      role: "alert",
                    },
                    [
                      h(StateDot, {
                        state: "error",
                      }),
                      t("clientSyncFailed"),
                    ],
                  ),
                  h("ul", {}, [
                    clientSync.failures.map((failure) =>
                      h(
                        "li",
                        {
                          key: failure.id,
                        },
                        [failure.id, ": ", failure.message],
                      ),
                    ),
                  ]),
                  h(
                    "button",
                    {
                      type: "button",
                      disabled: clientSync.syncing,
                      onClick: retryClient,
                    },
                    [t("clientSyncRetry")],
                  ),
                ],
              ),
          state.value.status === "loading"
            ? h(
                "div",
                {
                  class: css.cards,
                  role: "status",
                },
                [
                  h(
                    "span",
                    {
                      class: css.visuallyHidden,
                    },
                    [t("loading")],
                  ),
                  SKELETON_CARDS.map((slot) =>
                    h(
                      "div",
                      {
                        key: slot,
                        class: css.skeletonCard,
                        "aria-hidden": "true",
                      },
                      [
                        h("span", {
                          class: css.skeletonBar,
                        }),
                        h("span", {
                          class: css.skeletonBar,
                        }),
                      ],
                    ),
                  ),
                ],
              )
            : null,
          state.value.status === "error"
            ? h(
                "div",
                {
                  class: css.failure,
                },
                [
                  h(
                    "p",
                    {
                      class: css.statusWithDot,
                      role: "alert",
                    },
                    [
                      h(StateDot, {
                        state: "error",
                      }),
                      t("error"),
                    ],
                  ),
                  h(
                    "button",
                    {
                      type: "button",
                      onClick: retry,
                    },
                    [t("retry")],
                  ),
                ],
              )
            : null,
          snapshot !== undefined
            ? h(
                "div",
                {
                  class: css.catalog,
                },
                [
                  h(
                    "label",
                    {
                      class: css.search,
                    },
                    [
                      h(IconSearchOutlineRegular, {
                        "aria-hidden": "true",
                      }),
                      h(
                        "span",
                        {
                          class: css.visuallyHidden,
                        },
                        [t("search")],
                      ),
                      h("input", {
                        type: "search",
                        value: query.value,
                        placeholder: t("search"),
                        "aria-label": t("search"),
                        onInput: (event: Event) => {
                          if (event.currentTarget instanceof HTMLInputElement)
                            query.value = event.currentTarget.value;
                        },
                      }),
                    ],
                  ),
                  entries.length === 0 && presets.length === 0
                    ? h(
                        "p",
                        {
                          class: css.status,
                        },
                        [t("empty")],
                      )
                    : null,
                  nothingMatches
                    ? h(
                        "p",
                        {
                          class: css.status,
                        },
                        [t("emptySearch")],
                      )
                    : null,
                  selected !== undefined
                    ? h(
                        "section",
                        {
                          class: css.group,
                          "data-plugin-scope": "preset",
                          "data-preset-id": selected.id,
                        },
                        [
                          h(
                            "div",
                            {
                              class: css.groupTitleRow,
                            },
                            [
                              h(
                                "button",
                                {
                                  type: "button",
                                  class: css.groupToggle,
                                  "aria-expanded": presetEffectiveOpen,
                                  "aria-controls": `${sectionId}-preset`,
                                  onClick: () => {
                                    presetOpen.value = !presetEffectiveOpen;
                                  },
                                },
                                [
                                  h(IconChevronDownOutlineRegular, {
                                    class: css.chevron,
                                    size: 12,
                                    "aria-hidden": "true",
                                  }),
                                  h(
                                    "span",
                                    {
                                      class: css.groupTitle,
                                    },
                                    [t("presetTitle")],
                                  ),
                                ],
                              ),
                              h(
                                "div",
                                {
                                  class: css.headerEnd,
                                },
                                [
                                  h(
                                    Menu,
                                    {
                                      open: switcherOpen.value,
                                      onClose: () => {
                                        switcherOpen.value = false;
                                      },
                                      items: presets.map((preset) => ({
                                        id: preset.id,
                                        label: presetLabel(preset, t, presetName),
                                      })),
                                      selectedId: selected.id,
                                      onSelect: (id) => {
                                        switcherOpen.value = false;
                                        chosenPreset.value = id;
                                      },
                                      align: "end",
                                      portal: true,
                                    },
                                    {
                                      anchor: () =>
                                        h(
                                          "button",
                                          {
                                            type: "button",
                                            class: css.switcher,
                                            "aria-haspopup": "menu",
                                            "aria-expanded": switcherOpen.value,
                                            "aria-label": t("switcherLabel"),
                                            onClick: () => {
                                              switcherOpen.value = !switcherOpen.value;
                                            },
                                          },
                                          [
                                            h(
                                              "span",
                                              {
                                                class: css.switcherLabel,
                                              },
                                              [presetLabel(selected, t, presetName)],
                                            ),
                                            h(IconChevronDownOutlineRegular, {
                                              class: css.chevron,
                                              "aria-hidden": "true",
                                            }),
                                          ],
                                        ),
                                    },
                                  ),
                                ],
                              ),
                            ],
                          ),
                          h(
                            "p",
                            {
                              class: css.groupSub,
                            },
                            [t("presetSubtitle")],
                          ),
                          presetEffectiveOpen
                            ? h(
                                "div",
                                {
                                  id: `${sectionId}-preset`,
                                  class: css.groupBody,
                                },
                                [
                                  selected.broken !== undefined
                                    ? h(
                                        "p",
                                        {
                                          class: css.brokenNote,
                                          role: "alert",
                                        },
                                        [selected.broken],
                                      )
                                    : null,
                                  selectedRows.length > 0
                                    ? h(
                                        "ul",
                                        {
                                          class: css.cards,
                                        },
                                        [
                                          selectedRows.map((row, index) =>
                                            presetRowCard(selected, row, index),
                                          ),
                                        ],
                                      )
                                    : null,
                                  otherMatchCount > 0
                                    ? h(
                                        "p",
                                        {
                                          class: css.hint,
                                        },
                                        [
                                          t("matchesInOtherPresets", {
                                            count: String(otherMatchCount),
                                          }),
                                          otherPresetMatches.map((preset) =>
                                            h(
                                              "button",
                                              {
                                                key: preset.id,
                                                type: "button",
                                                class: css.jumpLink,
                                                onClick: () => {
                                                  chosenPreset.value = preset.id;
                                                },
                                              },
                                              [presetName(preset)],
                                            ),
                                          ),
                                        ],
                                      )
                                    : null,
                                ],
                              )
                            : null,
                        ],
                      )
                    : null,
                  entries.length > 0
                    ? h(
                        "section",
                        {
                          class: css.group,
                          "data-plugin-scope": "global",
                        },
                        [
                          h(
                            "div",
                            {
                              class: css.groupTitleRow,
                            },
                            [
                              h(
                                "button",
                                {
                                  type: "button",
                                  class: css.groupToggle,
                                  "aria-expanded": globalEffectiveOpen,
                                  "aria-controls": `${sectionId}-global`,
                                  onClick: () => {
                                    globalOpen.value = !globalEffectiveOpen;
                                  },
                                },
                                [
                                  h(IconChevronDownOutlineRegular, {
                                    class: css.chevron,
                                    size: 12,
                                    "aria-hidden": "true",
                                  }),
                                  h(
                                    "span",
                                    {
                                      class: css.groupTitle,
                                    },
                                    [t("globalTitle")],
                                  ),
                                ],
                              ),
                            ],
                          ),
                          h(
                            "p",
                            {
                              class: css.groupSub,
                            },
                            [t("globalSubtitle")],
                          ),
                          globalEffectiveOpen && globalCount > 0
                            ? h(
                                "ul",
                                {
                                  class: css.cards,
                                  id: `${sectionId}-global`,
                                },
                                [
                                  filteredFailed.map((entry) => globalRowCard(entry)),
                                  filteredRegular.map((entry) =>
                                    globalRowCard(
                                      entry,
                                      entry.enabled
                                        ? undefined
                                        : enabledIn.value.get(entry.moduleName),
                                    ),
                                  ),
                                ],
                              )
                            : null,
                        ],
                      )
                    : null,
                ],
              )
            : null,
        ],
      );
    };
  },
  {
    name: "PluginInventorySettingsTab",
    props: ["list", "presetName", "resolveText", "t", "useClientSync", "retryClient"],
  },
);
