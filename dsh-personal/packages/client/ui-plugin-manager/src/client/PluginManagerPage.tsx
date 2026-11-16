import {
  type VNodeChild,
  Teleport,
  defineComponent,
  computed,
  shallowRef,
  watch,
  h,
  Fragment,
  useId,
  onMounted,
} from "vue";
import type { PluginInstallFailureKind, Registry } from "@deepseek-ai/dsh-api-remotes/client";
import {
  Button,
  IconCheckCircleFillRegular,
  IconChevronDownOutlineRegular,
  IconChevronLeftOutlineMedium,
  IconChevronRightOutlineRegular,
  IconCloseOutlineMedium,
  IconDownloadOutlineRegular,
  IconInfoOutlineRegular,
  IconPlusOutlineRegular,
  IconRefreshOutlineRegular,
  IconTrashOutlineRegular,
  IconWarningOutlineRegular,
  Input,
  Menu,
  MenuItemButton,
  Modal,
  pointerModality,
  PluginArtworkDefault,
  PluginArtworkLoop,
  PluginArtworkSearch,
  PluginArtworkSubagent,
  PluginArtworkTerminal,
  SegmentedTabs,
  StateDot,
  Switch,
  Tag,
  TerminalBlock,
  Toast,
  Tooltip,
  useDismissOnOutsidePointer,
  type StateDotState,
  type TerminalBlockLabels,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type {
  InjectFace,
  PropsLocale,
  PropsRenderSlots,
  PropsRuntime,
  PropsStore,
} from "@deepseek-ai/dsh-client-ui-slots";
import { EXTENSION_BUNDLES, HIDDEN_BUNDLES, MORE_BUNDLES } from "@deepseek-ai/dsh-official-bundles";
import { localizedValues, TextSearchIndex } from "@deepseek-ai/dsh-util-text-search";
import type { createNavigationStore } from "./navigation-store.ts";
import type { PluginHeaderLayoutFace } from "./header-scroll.ts";
import { rowConfigKey, type OfficialItem } from "./config-ledger.ts";
import {
  INSTALL_GIT_EXAMPLE,
  INSTALL_PATH_EXAMPLE,
  type PluginManagerLocaleKey,
} from "./locales.ts";
import {
  bundleBusy,
  asksMirror,
  githubRecoveryRegistry,
  isInstallPending,
  offeredRegistries,
  rowKey,
  updateCandidate,
  type InstallInputError,
  type InstallState,
  type InstallSubject,
  type PackageRow,
  type PackageView,
  type PluginManagerFace,
  type PluginManagerState,
  type RegistryChoice,
  type VersionCheck,
} from "./manager-store.ts";
import {
  managementText,
  noticeText,
  packageText,
  registryText,
  restartText,
  rowText,
  type Translate,
} from "./presentation.ts";
import type { PluginPackageRef, PluginRowRef, PluginsSubject } from "./slot-contract.ts";
import type { ConfigPageForm } from "./slot-contract.ts";
import { UpdateDialog, VersionSection } from "./versions.tsx";
import { BundleDetailSection } from "./BundleDetailSection.tsx";
import css from "./PluginManagerPage.module.css";
/** Full component props assembled by the main slot renderer. */
export type PluginManagerPageProps = PropsRuntime<"main"> &
  PropsLocale<"pluginManager"> &
  PropsRenderSlots<
    | "plugins.item"
    | "plugins.bundle.config"
    | "plugins.row.config"
    | "plugins.bundle.activation"
    | "plugins.add.actions"
    | "plugins.tab"
    | "plugins.detail.actions"
    | "plugins.detail.badge"
    | "plugins.detail.section"
  > &
  InjectFace<PluginManagerFace & PluginHeaderLayoutFace> &
  PropsStore<ReturnType<typeof createNavigationStore>>;
/** The page's slot renderer, narrowed to the configuration slots. */
type RenderConfig = PluginManagerPageProps["renderSlot"];
type ResolveText = PluginManagerFace["resolveText"];
type RowPhase = NonNullable<PackageRow["phase"]>;
const AddPluginMenu = defineComponent(
  (props: {
    readonly t: Translate;
    readonly disabled: boolean;
    readonly openInstall: () => void;
    readonly renderSlot: RenderConfig;
  }) => {
    const t = computed(() => props.t);
    const disabled = computed(() => props.disabled);
    const openInstall = computed(() => props.openInstall);
    const renderSlot = computed(() => props.renderSlot);
    const open = shallowRef(false);
    const setOpen = (
      next: typeof open.value | ((previous: typeof open.value) => typeof open.value),
    ) => {
      open.value = typeof next === "function" ? next(open.value) : next;
    };
    const onDismiss = (): void => {
      setOpen(false);
    };
    return () =>
      h(
        "span",
        {
          class: css.addGroup,
          role: "group",
          "aria-label": t.value("addPlugin"),
        },
        [
          h(
            Tooltip,
            {
              label: t.value("addPlugin"),
              side: "bottom",
              delayMs: 500,
              focusDelayMs: 500,
              portal: true,
              disabled: disabled.value,
            },
            {
              default: () => [
                h(
                  Button,
                  {
                    variant: "primary",
                    size: "sm",
                    className: css.addPrimary ?? "",
                    "aria-label": t.value("addPlugin"),
                    disabled: disabled.value,
                    onClick: () => {
                      onDismiss();
                      openInstall.value();
                    },
                  },
                  {
                    default: () => [
                      h(
                        "span",
                        {
                          class: css.toolbarLabel,
                        },
                        [t.value("addPlugin")],
                      ),
                    ],
                    icon: () =>
                      h(IconPlusOutlineRegular, {
                        size: 13,
                      }),
                  },
                ),
              ],
            },
          ),
          h(
            Menu,
            {
              open: open.value,
              onClose: onDismiss,
              align: "end",
              portal: true,
              autoFocus: true,
              listClassName: css.addMenu ?? "",
            },
            {
              default: () => [
                h(
                  MenuItemButton,
                  {
                    icon: h(IconDownloadOutlineRegular, {
                      size: 14,
                    }),
                    onSelect: () => {
                      onDismiss();
                      openInstall.value();
                    },
                  },
                  {
                    default: () => [
                      h(
                        "span",
                        {
                          class: css.addMenuItem,
                        },
                        [
                          h("span", null, [t.value("installExisting")]),
                          h(
                            "span",
                            {
                              class: css.addMenuDescription,
                            },
                            [t.value("installExistingDescription")],
                          ),
                        ],
                      ),
                    ],
                  },
                ),
                renderSlot.value("plugins.add.actions", { onDismiss }),
              ],
              anchor: () =>
                h(
                  Button,
                  {
                    variant: "primary",
                    size: "sm",
                    className: css.addMore ?? "",
                    disabled: disabled.value,
                    "aria-label": t.value("chooseAddMethod"),
                    "aria-haspopup": "menu",
                    "aria-expanded": open.value,
                    onClick: () => {
                      setOpen((value) => !value);
                    },
                    onKeydown: (event: KeyboardEvent) => {
                      if (!open.value && event.key === "ArrowDown") {
                        event.preventDefault();
                        setOpen(true);
                      }
                    },
                  },
                  {
                    default: () => [
                      h(IconChevronDownOutlineRegular, {
                        size: 12,
                        "aria-hidden": "true",
                      }),
                    ],
                  },
                ),
            },
          ),
        ],
      );
  },
  {
    props: ["t", "disabled", "openInstall", "renderSlot"],
    inheritAttrs: false,
  },
);
/** How long the list marks a package an install just enabled. */
const HIGHLIGHT_MS = 2400;
/**
 * Whether any plugin row this bundle's patch declares is running.
 *
 * A default-hidden bundle's rows may run without the profile selecting it, for example through
 * `cordis.patch.yml`; that run state is the effective enablement the lists offer.
 * @param pkg - the bundle as the Host reports it.
 * @returns whether at least one declared row runs.
 */
function rowsRunning(pkg: PackageView): boolean {
  return pkg.rows.some((row) => row.enabled);
}
/**
 * Whether the main list shows an official optional bundle: any bundle outside `MORE_BUNDLES`, and any held-back one the profile enabled.
 * @param pkg - the official bundle as the Host reports it.
 * @returns whether the main list shows it.
 */
function pinnedToMainList(pkg: PackageView): boolean {
  return !MORE_BUNDLES.includes(pkg.name) || pkg.enabled;
}
/**
 * Where an optional bundle sits on both lists: the `EXTENSION_BUNDLES` in their order, then the bundles neither list
 * ranks, then the held-back ones in theirs, so Codex and Claude Code stay last on the More list.
 * @param name - the bundle's package name.
 * @returns the rank; bundles of equal rank keep the order the Host reported.
 */
function optionalBundleRank(name: string): number {
  const ranked = EXTENSION_BUNDLES.indexOf(name);
  if (ranked >= 0) return ranked;
  const heldBack = MORE_BUNDLES.indexOf(name);
  return heldBack < 0 ? EXTENSION_BUNDLES.length : EXTENSION_BUNDLES.length + 1 + heldBack;
}
/**
 * Order the official optional bundles as both lists show them, so a bundle the profile picks from the More list
 * keeps its place among the neighbours the main list already holds.
 * @param packages - the official bundles the Host offers.
 * @returns the bundles in display order.
 */
function orderOptionalBundles(packages: readonly PackageView[]): PackageView[] {
  return [...packages].sort((a, b) => optionalBundleRank(a.name) - optionalBundleRank(b.name));
}
/** How long a toast holds: long enough to read a failure that names what broke. */
function toastHoldMs(text: string): number {
  return Math.min(8000, Math.max(3000, text.length * 80));
}
const PHASE_KEYS = {
  pending: "rowPhasePending",
  loading: "rowPhaseLoading",
  active: "rowPhaseActive",
  failed: "rowPhaseFailed",
  unloading: "rowPhaseUnloading",
} satisfies Record<RowPhase, PluginManagerLocaleKey>;
/** Status dot naming a root-fiber phase; loading and unloading are live transitions. */
const PHASE_STATES = {
  pending: "idle",
  loading: "ongoing",
  active: "done",
  failed: "error",
  unloading: "ongoing",
} satisfies Record<RowPhase, StateDotState>;
/** The count line over a pack's components: the total, then only the states that occur. */
function partsSummary(rows: readonly PackageRow[], t: Translate): string {
  const failed = rows.filter((row) => row.phase === "failed").length;
  const off = rows.filter((row) => !row.enabled).length;
  const running = rows.filter((row) => row.enabled && row.phase === "active").length;
  return [
    t("partsCountTotal", { count: String(rows.length) }),
    ...(running > 0 ? [t("partsCountRunning", { count: String(running) })] : []),
    ...(off > 0 ? [t("partsCountOff", { count: String(off) })] : []),
    ...(failed > 0 ? [t("partsCountFailed", { count: String(failed) })] : []),
  ].join(" · ");
}
/** Switching for a pack's rows: which rows have a write in flight, and the write. */
interface RowToggles {
  readonly busy: (row: PackageRow) => boolean;
  readonly onSetEnabled: (row: PackageRow, enabled: boolean) => void;
}
/** Configuration for a pack's rows: which rows registered a page of their own, and opening it. */
interface RowConfigure {
  readonly has: (row: PackageRow) => boolean;
  readonly open: (row: PackageRow) => void;
}
/** Rows beyond this count get a filter box above the list. */
const ROW_FILTER_THRESHOLD = 10;
/** The size the 36-viewBox plugin artwork renders at inside a card's 48px frame. */
const CARD_ARTWORK_SIZE = 36;
/** The size the artwork renders at inside a row's 40px frame. */
const ROW_ARTWORK_SIZE = 30;
/** The artwork of the official plugins that registered their configuration, by registration id. */
const ITEM_ARTWORK = new Map<string, typeof PluginArtworkDefault>([
  ["shell", PluginArtworkTerminal],
  ["agent-loop", PluginArtworkLoop],
  ["subagent", PluginArtworkSubagent],
  ["web-search", PluginArtworkSearch],
]);
/** An official plugin's card and page artwork; plugins without their own get the default. */
function itemArtwork(id: string): VNodeChild {
  const Artwork = ITEM_ARTWORK.get(id) ?? PluginArtworkDefault;
  return h(Artwork, {
    size: CARD_ARTWORK_SIZE,
  });
}
const PackageArtwork = defineComponent(
  (props: { readonly src: string | undefined; readonly row?: boolean; readonly size?: number }) => {
    const src = computed(() => props.src);
    const row = computed(() => props.row ?? false);
    const size = computed(() => props.size ?? (row.value ? ROW_ARTWORK_SIZE : CARD_ARTWORK_SIZE));
    const failedSource = shallowRef<string | undefined>();
    const setFailedSource = (
      next: string | undefined | ((previous: string | undefined) => string | undefined),
    ) => {
      failedSource.value = typeof next === "function" ? next(failedSource.value) : next;
    };
    const Fallback = computed(() => (row.value ? PluginArtworkSubagent : PluginArtworkDefault));
    return () =>
      src.value === undefined || src.value === failedSource.value
        ? h(Fallback.value, {
            size: size.value,
          })
        : h("img", {
            class: css.packageImage,
            src: src.value,
            width: size.value,
            height: size.value,
            alt: "",
            onError: () => {
              setFailedSource(src.value);
            },
          });
  },
  {
    props: ["src", "row", "size"],
    inheritAttrs: false,
  },
);
/** A row's switch: locked, saying why, when the Host refuses to address the row through the profile patch. */
function RowSwitch({
  row,
  title,
  t,
  busy,
  onChange,
}: {
  readonly row: PackageRow;
  readonly title: string;
  readonly t: Translate;
  readonly busy: boolean;
  readonly onChange: (enabled: boolean) => void;
}): VNodeChild {
  const locked = row.readOnlyReason !== undefined || row.entryId === undefined;
  return h(Switch, {
    checked: row.enabled,
    label: t("partToggle", { name: title }),
    disabled: busy || locked,
    ...(row.readOnlyReason === undefined
      ? {}
      : { title: managementText({ code: row.readOnlyReason }, t) }),
    onChange: onChange,
  });
}
/** What a row's state line says: off, or the phase its fiber is in. */
function rowStateText(row: PackageRow, t: Translate): string {
  if (!row.enabled) return t("partOff");
  return row.phase === null ? t("rowStateIdle") : t(PHASE_KEYS[row.phase]);
}
/** The dot beside a row: its fiber phase, or idle. */
function rowDotState(row: PackageRow): StateDotState {
  if (!row.enabled || row.phase === null) return "idle";
  return PHASE_STATES[row.phase];
}
/** A Host metadata diagnostic does not change the package's management permissions. */
function MetadataError({
  error,
  t,
}: {
  readonly error: string | undefined;
  readonly t: Translate;
}): VNodeChild {
  return error === undefined
    ? null
    : h(
        "p",
        {
          class: css.reason,
          role: "status",
          "data-package-meta-error": true,
        },
        [t("metadataError", { error })],
      );
}
/** A failed component keeps its current Host diagnostic beside its controls. */
function RuntimeError({
  error,
  t,
}: {
  readonly error: string | undefined;
  readonly t: Translate;
}): VNodeChild {
  return error === undefined
    ? null
    : h(
        "p",
        {
          class: css.reason,
          role: "status",
          "data-plugin-runtime-error": true,
        },
        [t("reasonLabel"), ": ", error],
      );
}
const RowsSection = defineComponent(
  (props: {
    readonly rows: readonly PackageRow[];
    readonly t: Translate;
    readonly resolveText: ResolveText;
    readonly toggle?: RowToggles | undefined;
    readonly configure?: RowConfigure | undefined;
  }) => {
    const rows = computed(() => props.rows);
    const t = computed(() => props.t);
    const resolveText = computed(() => props.resolveText);
    const toggle = computed(() => props.toggle);
    const configure = computed(() => props.configure);
    const filter = shallowRef("");
    const setFilter = (
      next: typeof filter.value | ((previous: typeof filter.value) => typeof filter.value),
    ) => {
      filter.value = typeof next === "function" ? next(filter.value) : next;
    };
    const rowIndex = computed(
      () =>
        new TextSearchIndex(rows.value, (row) => ({
          fuzzy: [row.rowId, row.moduleName, ...localizedValues(row.meta?.title)],
          substring: localizedValues(row.meta?.description),
        })),
    );
    const shown = computed(() =>
      rowIndex.value
        .search(filter.value)
        .map((row) => ({ row, ...rowText(row, resolveText.value) })),
    );
    return () =>
      h(
        "section",
        {
          class: css.detailSection,
          "data-plugin-rows": true,
        },
        [
          h(
            "div",
            {
              class: css.sectionHead,
            },
            [
              h(
                "h4",
                {
                  class: css.sectionTitle,
                },
                [t.value("partsLabel")],
              ),
              rows.value.length === 0
                ? null
                : h(
                    "span",
                    {
                      class: css.sectionCount,
                    },
                    [partsSummary(rows.value, t.value)],
                  ),
            ],
          ),
          rows.value.length === 0
            ? h(
                "p",
                {
                  class: css.status,
                },
                [t.value("partsEmpty")],
              )
            : null,
          rows.value.length > ROW_FILTER_THRESHOLD
            ? h(Input, {
                type: "search",
                className: css.partsFilter as string,
                placeholder: t.value("partsFilter"),
                "aria-label": t.value("partsFilter"),
                value: filter.value,
                onInput: (event: Event) => {
                  if (event.target instanceof HTMLInputElement) setFilter(event.target.value);
                },
              })
            : null,
          rows.value.length > 0 && shown.value.length === 0
            ? h(
                "p",
                {
                  class: css.status,
                },
                [t.value("partsFilterEmpty")],
              )
            : null,
          shown.value.length === 0
            ? null
            : h(
                "ul",
                {
                  class: css.rows,
                },
                [
                  shown.value.map(({ row, title, description }) =>
                    h(
                      "li",
                      {
                        key: row.rowId,
                        class: css.row,
                        "data-plugin-row": row.entryId ?? row.rowId,
                        ...(row.phase === "failed"
                          ? { "data-state": "failed" }
                          : row.enabled
                            ? {}
                            : { "data-state": "off" }),
                      },
                      [
                        h(
                          "div",
                          {
                            class: css.rowLine,
                          },
                          [
                            h(
                              "span",
                              {
                                class: css.rowIcon,
                                "aria-hidden": "true",
                              },
                              [
                                h(PackageArtwork, {
                                  ...(row.meta?.icon === undefined ? {} : { key: row.meta.icon }),
                                  src: row.meta?.icon,
                                  row: true,
                                }),
                              ],
                            ),
                            h(
                              "div",
                              {
                                class: css.rowMain,
                              },
                              [
                                configure.value?.has(row) === true
                                  ? h(
                                      "button",
                                      {
                                        type: "button",
                                        class: css.rowOpen,
                                        "aria-label": t.value("configureRow", { name: title }),
                                        onClick: () => {
                                          configure.value?.open(row);
                                        },
                                      },
                                      [
                                        h(
                                          "span",
                                          {
                                            class: css.rowId,
                                          },
                                          [title],
                                        ),
                                        h(IconChevronRightOutlineRegular, {
                                          className: css.rowOpenIcon ?? "",
                                          "aria-hidden": "true",
                                        }),
                                      ],
                                    )
                                  : h(
                                      "span",
                                      {
                                        class: css.rowId,
                                      },
                                      [title],
                                    ),
                                description === undefined
                                  ? null
                                  : h(
                                      "span",
                                      {
                                        class: css.rowModule,
                                      },
                                      [description],
                                    ),
                                title === row.rowId
                                  ? null
                                  : h(
                                      "code",
                                      {
                                        class: css.rowModule,
                                      },
                                      [row.rowId],
                                    ),
                                title === row.moduleName
                                  ? null
                                  : h(
                                      "code",
                                      {
                                        class: css.rowModule,
                                      },
                                      [row.moduleName],
                                    ),
                              ],
                            ),
                            h(
                              "span",
                              {
                                class: css.rowState,
                              },
                              [
                                h(StateDot, {
                                  state: rowDotState(row),
                                }),
                                rowStateText(row, t.value),
                              ],
                            ),
                            toggle.value === undefined
                              ? null
                              : h(RowSwitch, {
                                  row: row,
                                  title: title,
                                  t: t.value,
                                  busy: toggle.value.busy(row),
                                  onChange: (enabled) => {
                                    toggle.value?.onSetEnabled(row, enabled);
                                  },
                                }),
                          ],
                        ),
                        h(MetadataError, {
                          error: row.meta?.error,
                          t: t.value,
                        }),
                        h(RuntimeError, {
                          error: row.diagnostic,
                          t: t.value,
                        }),
                      ],
                    ),
                  ),
                ],
              ),
        ],
      );
  },
  {
    props: ["rows", "t", "resolveText", "toggle", "configure"],
    inheritAttrs: false,
  },
);
/** Declared install source and versions; unavailable files retain their recorded dependency spec. */
function SourceSection({
  pkg,
  t,
}: {
  readonly pkg: PackageView;
  readonly t: Translate;
}): VNodeChild {
  if (
    pkg.source === undefined &&
    !pkg.installed &&
    pkg.availability === "installation" &&
    !pkg.optional
  )
    return null;
  return h(
    "section",
    {
      class: css.detailSection,
      "data-plugin-source": true,
    },
    [
      h(
        "h4",
        {
          class: css.sectionTitle,
        },
        [t("sourceTitle")],
      ),
      h(
        "dl",
        {
          class: css.facts,
        },
        [
          h("div", null, [
            h("dt", null, [t("sourceSpec")]),
            h("dd", null, [
              pkg.source !== undefined
                ? h("code", null, [pkg.source])
                : pkg.availability === "missing"
                  ? t(pkg.installed ? "statusMissingFiles" : "sourceNotInstalled")
                  : t("sourceBuiltIn"),
            ]),
          ]),
          pkg.version === undefined
            ? null
            : h("div", null, [h("dt", null, [t("sourceVersion")]), h("dd", null, [pkg.version])]),
          pkg.installTarget === undefined
            ? null
            : h(Fragment, null, [
                h("div", null, [
                  h("dt", null, [t("sourceTargetSpec")]),
                  h("dd", null, [h("code", null, [pkg.installTarget.spec])]),
                ]),
                h("div", null, [
                  h("dt", null, [t("sourceTargetVersion")]),
                  h("dd", null, [pkg.installTarget.version]),
                ]),
              ]),
        ],
      ),
    ],
  );
}
/**
 * A bundle's enable switch on its card and its page: locked, saying why, for
 * one the Host protects; off and locked for one it cannot read.
 */
function EnableSwitch({
  pkg,
  title,
  t,
  busy,
  onSetEnabled,
}: {
  readonly pkg: PackageView;
  readonly title: string;
  readonly t: Translate;
  readonly busy: boolean;
  readonly onSetEnabled: (enabled: boolean) => void;
}): VNodeChild {
  return h(
    "span",
    {
      class: css.bundleToggle,
    },
    [
      h(
        "span",
        {
          class: css.toggleProgress,
          role: "status",
        },
        [
          h(
            "span",
            {
              class: css.progressAnnouncement,
            },
            [busy ? t("applyingChange", { name: title }) : ""],
          ),
          busy
            ? h(StateDot, {
                state: "ongoing",
              })
            : null,
        ],
      ),
      h(Switch, {
        checked: pkg.enabled,
        label: t("enableToggle", { name: title }),
        disabled:
          busy ||
          pkg.readOnlyReason !== undefined ||
          (!pkg.enabled &&
            pkg.error !== undefined &&
            (pkg.error.code === "unsupported-platform" ||
              !(pkg.availability === "missing" && pkg.installTarget !== undefined))),
        ...(pkg.readOnlyReason === undefined
          ? {}
          : { title: managementText({ code: pkg.readOnlyReason }, t) }),
        onChange: onSetEnabled,
      }),
    ],
  );
}
/** The status one card carries: running, off, not running because the Host skipped a selected bundle's layer, or another problem. */
type PackageStatus = "running" | "disabled" | "not-running" | "problem";
/** The tag each status shows beside the title on a card and on its page; running and off show none. */
const STATUS_TAG_KEYS = {
  running: undefined,
  disabled: undefined,
  "not-running": "statusNotRunning",
  problem: "statusProblem",
} satisfies Record<PackageStatus, PluginManagerLocaleKey | undefined>;
/** A selected bundle the Host reports an error for is not running when none of its rows has a live entry. */
function packageStatus(pkg: PackageView): PackageStatus {
  if (pkg.enabled && pkg.error !== undefined && pkg.rows.every((row) => row.entryId === undefined))
    return "not-running";
  if (pkg.error !== undefined || (pkg.enabled && pkg.rows.some((row) => row.phase === "failed")))
    return "problem";
  return pkg.enabled ? "running" : "disabled";
}
/** The danger tag a status carries. */
function StatusTag({
  status,
  t,
}: {
  readonly status: PackageStatus;
  readonly t: Translate;
}): VNodeChild {
  const key = STATUS_TAG_KEYS[status];
  return key === undefined
    ? null
    : h(
        Tag,
        {
          className: css.statusTag ?? "",
          tone: "danger",
        },
        {
          default: () => [t(key)],
        },
      );
}
const CardHead = defineComponent(
  (props: {
    readonly title: string;
    readonly t: Translate;
    readonly onOpen: () => void;
    readonly icon: VNodeChild;
    readonly tags?: VNodeChild;
    readonly description: VNodeChild;
    readonly end?: VNodeChild;
  }) => {
    const title = computed(() => props.title);
    const t = computed(() => props.t);
    const onOpen = computed(() => props.onOpen);
    const icon = computed(() => props.icon);
    const tags = computed(() => props.tags);
    const description = computed(() => props.description);
    const end = computed(() => props.end);
    const descriptionId = useId();
    return () =>
      h(
        "div",
        {
          class: css.cardHead,
        },
        [
          h(
            "span",
            {
              class: css.cardIcon,
              "aria-hidden": "true",
            },
            [icon.value],
          ),
          h(
            "div",
            {
              class: css.cardMain,
            },
            [
              h(
                "div",
                {
                  class: css.titleRow,
                },
                [
                  h(
                    "button",
                    {
                      type: "button",
                      class: `${css.cardTitle} ${css.cardOpen}`,
                      "aria-label": t.value("openDetail", { name: title.value }),
                      "aria-describedby":
                        description.value === undefined ? undefined : descriptionId,
                      onClick: onOpen.value,
                    },
                    [title.value],
                  ),
                  tags.value,
                ],
              ),
              description.value === undefined
                ? null
                : h(
                    "span",
                    {
                      class: css.cardDesc,
                      id: descriptionId,
                    },
                    [description.value],
                  ),
            ],
          ),
          end.value === undefined
            ? null
            : h(
                "div",
                {
                  class: css.cardEnd,
                },
                [end.value],
              ),
        ],
      );
  },
  {
    props: ["title", "t", "onOpen", "icon", "tags", "description", "end"],
    inheritAttrs: false,
  },
);
/** First-read placeholders share the core configuration group's card and text-line layout. */
function ListSkeleton({ label }: { readonly label: string }): VNodeChild {
  return h(
    "section",
    {
      class: css.group,
      role: "status",
      "aria-label": label,
      "data-plugin-loading": true,
    },
    [
      h(
        "div",
        {
          class: css.groupHead,
          "aria-hidden": "true",
        },
        [
          h(
            "span",
            {
              class: `${css.groupTitle} ${css.skeletonText} ${css.skeletonHeading}`,
            },
            [
              h("span", {
                class: `${css.skeletonFill} ${css.skeletonBar}`,
              }),
            ],
          ),
        ],
      ),
      h(
        "ul",
        {
          class: css.cards,
          "aria-hidden": "true",
        },
        [
          [0, 1, 2, 3].map((index) =>
            h(
              "li",
              {
                key: index,
                class: css.card,
              },
              [
                h(
                  "div",
                  {
                    class: css.cardHead,
                  },
                  [
                    h("span", {
                      class: `${css.cardIcon} ${css.skeletonFill} ${css.skeletonIcon}`,
                    }),
                    h(
                      "div",
                      {
                        class: css.cardMain,
                      },
                      [
                        h(
                          "div",
                          {
                            class: css.titleRow,
                          },
                          [
                            h(
                              "span",
                              {
                                class: `${css.cardTitle} ${css.skeletonText} ${css.skeletonTitle}`,
                              },
                              [
                                h("span", {
                                  class: `${css.skeletonFill} ${css.skeletonBar}`,
                                }),
                              ],
                            ),
                          ],
                        ),
                        h(
                          "span",
                          {
                            class: `${css.cardDesc} ${css.skeletonText} ${css.skeletonDescription}`,
                          },
                          [
                            h("span", {
                              class: `${css.skeletonFill} ${css.skeletonBar}`,
                            }),
                          ],
                        ),
                      ],
                    ),
                    h("div", {
                      class: `${css.cardEnd} ${css.skeletonActions}`,
                    }),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    ],
  );
}
/** The top every page shares: the crumb that leads back, then the icon with the page's actions at its right. */
function DetailTop({
  crumbLabel,
  crumbText,
  onBack,
  icon,
  actions,
}: {
  readonly crumbLabel: string;
  readonly crumbText: string;
  readonly onBack: () => void;
  readonly icon: VNodeChild;
  readonly actions?: VNodeChild;
}): VNodeChild {
  return h(
    "div",
    {
      class: css.detailTop,
      "data-window-drag": true,
    },
    [
      h(
        "button",
        {
          type: "button",
          class: css.crumb,
          "aria-label": crumbLabel,
          onClick: onBack,
        },
        [
          h(IconChevronDownOutlineRegular, {
            className: css.crumbIcon ?? "",
            "aria-hidden": "true",
          }),
          h("span", null, [crumbText]),
        ],
      ),
      h(
        "div",
        {
          class: css.detailHead,
        },
        [
          h(
            "span",
            {
              class: css.cardIcon,
              "aria-hidden": "true",
            },
            [icon],
          ),
          actions,
        ],
      ),
    ],
  );
}
/** The registry version a finished version check offers for a package, when it offers one. */
function versionUpdate(check: VersionCheck | undefined): string | undefined {
  return check?.phase === "done" ? updateCandidate(check.list)?.version : undefined;
}
/** The list toolbar's sentence about the last update check of every registry package. */
function updatesNote(
  packages: readonly PackageView[],
  versions: PluginManagerState["versions"],
  t: Translate,
):
  | {
      text: string;
      tone?: "info" | "error";
    }
  | undefined {
  const checks = packages
    .filter((pkg) => pkg.update === "registry")
    .map((pkg) => versions[pkg.name]);
  if (
    checks.length === 0 ||
    checks.some((check) => check === undefined || check.phase === "checking")
  )
    return undefined;
  const available = checks.filter((check) => versionUpdate(check) !== undefined).length;
  if (available > 0)
    return { text: t("updatesAvailable", { count: String(available) }), tone: "info" };
  if (checks.some((check) => check?.phase === "done" && check.list.status === "refused"))
    return { text: t("updatesFailed"), tone: "error" };
  return { text: t("updatesNone") };
}
function updateAvailable(pkg: PackageView): boolean {
  const target = pkg.installTarget;
  // An update removes the installed package first, so a package that cannot be removed offers none.
  if (
    !pkg.installed ||
    !pkg.removable ||
    pkg.availability === "installation" ||
    target === undefined
  )
    return false;
  return (
    pkg.version !== target.version ||
    ((target.spec.startsWith("link:") || pkg.source?.startsWith("link:") === true) &&
      pkg.source !== target.spec)
  );
}
/**
 * One package as a card that opens its page: its name, its one-liner, its tags, its bundle switch, and why the Host
 * skipped it or does not support its platform.
 */
function PackageCard({
  pkg,
  t,
  resolveText,
  busy,
  highlighted,
  newer,
  onOpen,
  onSetEnabled,
}: {
  readonly pkg: PackageView;
  /** The newer registry version a version check offers. */
  readonly newer: string | undefined;
  readonly t: Translate;
  readonly resolveText: ResolveText;
  readonly busy: boolean;
  readonly highlighted: boolean;
  readonly onOpen: () => void;
  readonly onSetEnabled: (enabled: boolean) => void;
}): VNodeChild {
  const { title, description, beta } = packageText(pkg, resolveText);
  const status = packageStatus(pkg);
  return h(
    "li",
    {
      class: `${css.card} ${css.cardLink}`,
      "data-plugin-package": pkg.name,
      "data-plugin-status": status,
      ...(highlighted ? { "data-plugin-highlight": "" } : {}),
    },
    [
      h(CardHead, {
        title: title,
        t: t,
        onOpen: onOpen,
        icon: h(PackageArtwork, {
          ...(pkg.meta?.icon === undefined ? {} : { key: pkg.meta.icon }),
          src: pkg.meta?.icon,
        }),
        tags: h(Fragment, null, [
          beta
            ? h(
                Tag,
                {
                  className: css.statusTag ?? "",
                  tone: "info",
                },
                {
                  default: () => [t("statusBeta")],
                },
              )
            : null,
          h(StatusTag, {
            status: status,
            t: t,
          }),
          pkg.availability === "missing"
            ? h(
                Tag,
                {
                  className: css.statusTag ?? "",
                },
                {
                  default: () => [t(pkg.installed ? "statusMissingFiles" : "statusNotInstalled")],
                },
              )
            : null,
          updateAvailable(pkg) || newer !== undefined
            ? h(
                Tag,
                {
                  className: css.statusTag ?? "",
                  tone: "info",
                },
                {
                  default: () => [t("statusUpdateAvailable")],
                },
              )
            : null,
        ]),
        description: description,
        end: h(EnableSwitch, {
          pkg: pkg,
          title: title,
          t: t,
          busy: busy,
          onSetEnabled: onSetEnabled,
        }),
      }),
      h(MetadataError, {
        error: pkg.meta?.error,
        t: t,
      }),
      pkg.error !== undefined &&
      (status === "not-running" || pkg.error.code === "unsupported-platform")
        ? h(
            "p",
            {
              class: css.reason,
              role: "status",
            },
            [managementText({ ...pkg.error, incompatible: [] }, t)],
          )
        : null,
    ],
  );
}
/**
 * One official plugin as a card that opens its page: its icon, its title from
 * the registration, and the one-liner the entry renders in its summary view.
 */
function ItemCard({
  item,
  t,
  onOpen,
  renderSlot,
}: {
  readonly item: OfficialItem;
  readonly t: Translate;
  readonly onOpen: () => void;
  readonly renderSlot: RenderConfig;
}): VNodeChild {
  return h(
    "li",
    {
      class: `${css.card} ${css.cardLink}`,
      "data-plugin-item": item.id,
    },
    [
      h(CardHead, {
        title: item.label,
        t: t,
        onOpen: onOpen,
        icon: itemArtwork(item.id),
        description: renderSlot("plugins.item", { view: "summary" }, { only: item.id }),
      }),
    ],
  );
}
/** One row as the detail slots see it. */
function rowRef(row: PackageRow): PluginRowRef {
  return { rowId: row.rowId, moduleName: row.moduleName, enabled: row.enabled };
}
/** One bundle as the detail slots see it. */
function packageRef(pkg: PackageView): PluginPackageRef {
  return {
    name: pkg.name,
    ...(pkg.version === undefined ? {} : { version: pkg.version }),
    installed: pkg.installed,
    availability: pkg.availability,
    official: pkg.official,
    enabled: pkg.enabled,
    rows: pkg.rows.map(rowRef),
  };
}
/**
 * An official plugin's page: the crumb back to the cards, its icon with the
 * contributed actions, its title with the contributed badges over its
 * one-liner, the form the entry renders, and the contributed sections.
 */
function ItemDetail({
  item,
  t,
  onBack,
  renderSlot,
  form,
}: {
  readonly item: OfficialItem;
  readonly t: Translate;
  readonly onBack: () => void;
  readonly renderSlot: RenderConfig;
  readonly form: ConfigPageForm | undefined;
}): VNodeChild {
  const subject: PluginsSubject = { kind: "item", id: item.id };
  return h(
    "div",
    {
      class: css.detail,
      "data-plugin-item-detail": item.id,
    },
    [
      h(DetailTop, {
        crumbLabel: t("backToList"),
        crumbText: t("crumbRoot"),
        onBack: onBack,
        icon: itemArtwork(item.id),
        actions: h(
          "div",
          {
            class: css.detailActions,
          },
          [renderSlot("plugins.detail.actions", { subject })],
        ),
      }),
      h(
        "div",
        {
          class: css.detailMain,
        },
        [
          h(
            "div",
            {
              class: css.titleRow,
            },
            [
              h(
                "h3",
                {
                  class: css.detailTitle,
                },
                [item.label],
              ),
              renderSlot("plugins.detail.badge", { subject }),
            ],
          ),
          h(
            "p",
            {
              class: css.detailDesc,
            },
            [renderSlot("plugins.item", { view: "summary" }, { only: item.id })],
          ),
        ],
      ),
      h(
        "div",
        {
          class: css.detailSections,
        },
        [
          h(
            "section",
            {
              class: css.detailSection,
              "data-plugin-config": true,
            },
            [renderSlot("plugins.item", { view: "page", form }, { only: item.id })],
          ),
          renderSlot("plugins.detail.section", { subject }),
        ],
      ),
    ],
  );
}
/**
 * A row's configuration page keeps its technical identity beside local package
 * text and the form supplied by its configuration entry.
 */
function RowDetail({
  pkg,
  row,
  t,
  resolveText,
  onBack,
  renderSlot,
  form,
}: {
  readonly pkg: PackageView;
  readonly row: PackageRow;
  readonly t: Translate;
  readonly resolveText: ResolveText;
  readonly onBack: () => void;
  readonly renderSlot: RenderConfig;
  readonly form: ConfigPageForm | undefined;
}): VNodeChild {
  const { title } = packageText(pkg, resolveText);
  const { title: rowTitle, description } = rowText(row, resolveText);
  const key = rowConfigKey(pkg.name, row.rowId);
  const subject: PluginsSubject = { kind: "row", pkg: packageRef(pkg), row: rowRef(row) };
  return h(
    "div",
    {
      class: css.detail,
      "data-plugin-row-detail": key,
    },
    [
      h(DetailTop, {
        crumbLabel: t("backToPackage", { name: title }),
        crumbText: title,
        onBack: onBack,
        icon: h(PackageArtwork, {
          ...(row.meta?.icon === undefined ? {} : { key: row.meta.icon }),
          src: row.meta?.icon,
          row: true,
          size: CARD_ARTWORK_SIZE,
        }),
        actions: h(
          "div",
          {
            class: css.detailActions,
          },
          [renderSlot("plugins.detail.actions", { subject })],
        ),
      }),
      h(
        "div",
        {
          class: css.detailMain,
        },
        [
          h(
            "div",
            {
              class: css.titleRow,
            },
            [
              h(
                "h3",
                {
                  class: css.detailTitle,
                },
                [rowTitle],
              ),
              renderSlot("plugins.detail.badge", { subject }),
            ],
          ),
          rowTitle === row.rowId
            ? null
            : h(
                "p",
                {
                  class: css.detailName,
                },
                [h("code", null, [row.rowId])],
              ),
          h(
            "p",
            {
              class: css.detailName,
            },
            [h("code", null, [row.moduleName])],
          ),
          h(
            "p",
            {
              class: css.detailDesc,
            },
            [
              description ??
                renderSlot("plugins.row.config", { view: "summary" }, { entryKey: key }),
            ],
          ),
        ],
      ),
      h(MetadataError, {
        error: row.meta?.error,
        t: t,
      }),
      h(RuntimeError, {
        error: row.diagnostic,
        t: t,
      }),
      h(
        "div",
        {
          class: css.detailSections,
          "data-plugin-config": true,
        },
        [
          renderSlot("plugins.row.config", { view: "page", form }, { entryKey: key }),
          renderSlot("plugins.detail.section", { subject }),
        ],
      ),
    ],
  );
}
/**
 * One package's page: the crumb back to the list; its icon with its switch
 * and, for a package the profile installed or a selection the Host can remove, uninstall; its title beside its
 * version tag, its beta tag, and its problem or not-running tag; the package name the title
 * stands for; its one-liner; the Host's problem when it reports one; the
 * configuration the bundle registered for itself; its rows with their switches
 * and configure controls, unless the Host reports an error and no rows; and where it comes from.
 */
function PackageDetail({
  pkg,
  t,
  resolveText,
  busy,
  rowBusy,
  configured,
  configure,
  renderSlot,
  inMore,
  versions,
  detail,
  onBack,
  onSetEnabled,
  onUninstall,
  onUpdate,
  onSetRowEnabled,
  onEnsureVersions,
  onCheckVersions,
  onUpdateVersion,
}: {
  readonly pkg: PackageView;
  /** The package's version check, when one started. */
  readonly versions: VersionCheck | undefined;
  /** The bundle's detail document section, shown first among the page's sections. */
  readonly detail: VNodeChild;
  readonly t: Translate;
  readonly resolveText: ResolveText;
  readonly busy: boolean;
  /** Whether a row has a write in flight. */
  readonly rowBusy: (row: PackageRow) => boolean;
  /** Whether the bundle registered a configuration of its own. */
  readonly configured: boolean;
  readonly configure: RowConfigure;
  readonly renderSlot: RenderConfig;
  readonly inMore: boolean;
  readonly onBack: () => void;
  readonly onSetEnabled: (enabled: boolean) => void;
  readonly onUninstall: () => void;
  readonly onUpdate: () => void;
  readonly onSetRowEnabled: (row: PackageRow, enabled: boolean) => void;
  /** Check a package's versions unless a check already started. */
  readonly onEnsureVersions: (packageName: string) => void;
  readonly onCheckVersions: () => void;
  /** Ask before installing one listed newer version. */
  readonly onUpdateVersion: (version: string) => void;
}): VNodeChild {
  const { title, description, beta } = packageText(pkg, resolveText);
  const newer = versionUpdate(versions);
  const status = packageStatus(pkg);
  const subject: PluginsSubject = { kind: "bundle", pkg: packageRef(pkg) };
  return h(
    "div",
    {
      class: css.detail,
      "data-plugin-detail": pkg.name,
    },
    [
      h(DetailTop, {
        crumbLabel: inMore ? t("backToPackage", { name: t("moreTitle") }) : t("backToList"),
        crumbText: t(inMore ? "moreTitle" : "crumbRoot"),
        onBack: onBack,
        icon: h(PackageArtwork, {
          ...(pkg.meta?.icon === undefined ? {} : { key: pkg.meta.icon }),
          src: pkg.meta?.icon,
        }),
        actions: h(
          "div",
          {
            class: css.detailActions,
          },
          [
            renderSlot("plugins.detail.actions", { subject }),
            updateAvailable(pkg)
              ? h(
                  Button,
                  {
                    variant: "outline",
                    size: "sm",
                    disabled: busy,
                    "aria-label": t("updateLabel", { name: title }),
                    onClick: onUpdate,
                  },
                  {
                    default: () => [t("update")],
                    icon: () =>
                      h(IconRefreshOutlineRegular, {
                        size: 13,
                      }),
                  },
                )
              : null,
            newer === undefined
              ? null
              : h(
                  Button,
                  {
                    variant: "primary",
                    size: "sm",
                    disabled: busy,
                    "aria-label": t("versionsUpdateLabel", { version: newer }),
                    onClick: () => {
                      onUpdateVersion(newer);
                    },
                  },
                  {
                    default: () => [t("versionsUpdateLabel", { version: newer })],
                    icon: () =>
                      h(IconRefreshOutlineRegular, {
                        size: 13,
                      }),
                  },
                ),
            pkg.installed || pkg.removable
              ? h(
                  Button,
                  {
                    variant: "outline",
                    size: "sm",
                    className: css.danger ?? "",
                    "aria-label": t("uninstallLabel", { name: title }),
                    disabled: busy || !pkg.removable || pkg.readOnlyReason !== undefined,
                    onClick: onUninstall,
                  },
                  {
                    default: () => [t("uninstall")],
                    icon: () =>
                      h(IconTrashOutlineRegular, {
                        size: 13,
                      }),
                  },
                )
              : null,
            h(EnableSwitch, {
              pkg: pkg,
              title: title,
              t: t,
              busy: busy,
              onSetEnabled: onSetEnabled,
            }),
          ],
        ),
      }),
      h(
        "div",
        {
          class: css.detailMain,
        },
        [
          h(
            "div",
            {
              class: css.titleRow,
            },
            [
              h(
                "h3",
                {
                  class: css.detailTitle,
                },
                [title],
              ),
              pkg.version === undefined
                ? null
                : h(
                    Tag,
                    {
                      className: css.versionTag ?? "",
                      tone: "neutral",
                    },
                    {
                      default: () => [t("versionTag", { version: pkg.version })],
                    },
                  ),
              beta
                ? h(
                    Tag,
                    {
                      className: css.statusTag ?? "",
                      tone: "info",
                    },
                    {
                      default: () => [t("statusBeta")],
                    },
                  )
                : null,
              h(StatusTag, {
                status: status,
                t: t,
              }),
              pkg.availability === "missing"
                ? h(
                    Tag,
                    {
                      className: css.statusTag ?? "",
                    },
                    {
                      default: () => [
                        t(pkg.installed ? "statusMissingFiles" : "statusNotInstalled"),
                      ],
                    },
                  )
                : null,
              updateAvailable(pkg) || newer !== undefined
                ? h(
                    Tag,
                    {
                      className: css.statusTag ?? "",
                      tone: "info",
                    },
                    {
                      default: () => [t("statusUpdateAvailable")],
                    },
                  )
                : null,
              renderSlot("plugins.detail.badge", { subject }),
            ],
          ),
          h(
            "p",
            {
              class: css.detailName,
            },
            [
              h(
                "code",
                {
                  "data-plugin-name": true,
                },
                [pkg.name],
              ),
            ],
          ),
          description === undefined
            ? null
            : h(
                "p",
                {
                  class: css.detailDesc,
                },
                [description],
              ),
        ],
      ),
      h(MetadataError, {
        error: pkg.meta?.error,
        t: t,
      }),
      pkg.error === undefined
        ? null
        : h(
            "p",
            {
              class: css.reason,
              role: "status",
            },
            [t("reasonLabel"), ": ", managementText(pkg.error, t)],
          ),
      pkg.readOnlyReason === undefined
        ? null
        : h(
            "p",
            {
              class: css.reason,
              role: "status",
            },
            [managementText({ code: pkg.readOnlyReason }, t)],
          ),
      h(
        "div",
        {
          class: css.detailSections,
        },
        [
          detail,
          configured
            ? h(
                "section",
                {
                  class: css.detailSection,
                  "data-plugin-config": true,
                },
                [renderSlot("plugins.bundle.config", { view: "page" }, { entryKey: pkg.name })],
              )
            : null,
          pkg.availability === "missing" || (pkg.error !== undefined && pkg.rows.length === 0)
            ? null
            : h(RowsSection, {
                rows: pkg.rows,
                t: t,
                resolveText: resolveText,
                toggle: pkg.enabled
                  ? { busy: (row) => busy || rowBusy(row), onSetEnabled: onSetRowEnabled }
                  : undefined,
                configure: configure,
              }),
          h(VersionSection, {
            pkg: pkg,
            check: versions,
            t: t,
            busy: busy,
            onEnsure: onEnsureVersions,
            onCheck: onCheckVersions,
            onUpdate: onUpdateVersion,
          }),
          h(SourceSection, {
            pkg: pkg,
            t: t,
          }),
          renderSlot("plugins.detail.section", { subject }),
        ],
      ),
    ],
  );
}
/** Output lines an install run's terminal shows before its middle folds: the first and last six of a long pnpm log. */
const INSTALL_TERMINAL_LINES = 12;
/** The install terminal's display copy, from the tab's dictionary. */
function terminalLabels(t: Translate): TerminalBlockLabels {
  return {
    commandLine: (line) => t("terminalCommandLine", { n: String(line) }),
    /* v8 ignore next -- the Host reports a killed pnpm as a null exit code, never a signal name; the label interface needs one */
    signal: (signal) => t("terminalSignal", { signal }),
    exitCode: (code) => t("terminalExitCode", { code: String(code) }),
    noExitCode: t("terminalNoExitCode"),
    running: t("terminalRunning"),
    failed: t("terminalFailed"),
    done: t("terminalDone"),
    copy: t("terminalCopy"),
    copied: t("terminalCopied"),
    noOutput: t("terminalNoOutput"),
    collapseAria: t("terminalCollapseAria"),
    collapse: t("terminalCollapse"),
    expandAria: (hidden) => t("terminalExpandAria", { n: String(hidden) }),
    expand: (hidden) => t("terminalExpand", { n: String(hidden) }),
  };
}
/** The sentence under the field for a spec the check refused. */
const INPUT_PROBLEM_KEYS = {
  "invalid-spec": "installProblemInvalid",
  "already-installed": "installProblemInstalled",
  shipped: "installProblemShipped",
  "not-found": "installProblemNotFound",
  "not-a-package": "installProblemNotPackage",
  "not-a-bundle": "installProblemNotBundle",
  network: "installProblemNetwork",
  unknown: "installProblemUnknown",
} satisfies Record<InstallInputError["problem"], PluginManagerLocaleKey>;
/** One row of the install guide: a spec form's title, its example, and where the person finds it. */
interface GuideExample {
  readonly key: string;
  readonly titleKey: PluginManagerLocaleKey;
  readonly exampleKey: PluginManagerLocaleKey;
  readonly hintKey: PluginManagerLocaleKey;
}
/** The spec form the install guide shows, with an example the person can drop into the field. */
const GUIDE_EXAMPLES = [
  {
    key: "id",
    titleKey: "installGuideIdTitle",
    exampleKey: "installGuideIdExample",
    hintKey: "installGuideIdHint",
  },
] as const satisfies readonly GuideExample[];
/** The one-line reading of a classified pnpm failure. */
const FAILURE_KIND_KEYS = {
  "pnpm-missing": "installFailurePnpmMissing",
  timeout: "installFailureTimeout",
  "not-found": "installFailureNotFound",
  "no-matching-version": "installFailureNoMatchingVersion",
  network: "installFailureNetwork",
  "disk-full": "installFailureDiskFull",
  permission: "installFailurePermission",
  "build-blocked": "installFailureBuildBlocked",
  integrity: "installFailureIntegrity",
  unknown: "installFailureGeneric",
} satisfies Record<PluginInstallFailureKind, PluginManagerLocaleKey>;
/** The navigation value of the page's own tab; contributed tabs use their registration ids. */
const INSTALLED_TAB = "installed";
/** The heading of each screen past the spec. */
const SCREEN_TITLE_KEYS = {
  starting: "installStarting",
  running: "installingTitle",
  cancelling: "installCancelling",
  applying: "installApplying",
  unconfirmed: "installUnconfirmedTitle",
  unknown: "installUnknownTitle",
  done: "installedTitle",
  failed: "installFailedTitle",
} satisfies Record<Exclude<InstallState["phase"], "idle" | "checking">, PluginManagerLocaleKey>;
/** What the spec's kind reads as when the package carries no description of its own. */
const SUBJECT_KIND_KEYS = {
  registry: undefined,
  path: "installSubjectPath",
  git: "installSubjectGit",
  tarball: "installSubjectTarball",
} satisfies Record<InstallSubject["kind"], PluginManagerLocaleKey | undefined>;
/** A check no registry answered names every registry asked; any other refusal reads by its problem. */
function inputProblemSentence(
  problem: InstallInputError,
  t: Translate,
  resolved: string | null,
): string {
  const asked = problem.registries ?? [];
  return problem.problem === "network" && asked.length > 1
    ? t("installProblemNetworkAll", { registries: registryList(asked, t, resolved) })
    : t(INPUT_PROBLEM_KEYS[problem.problem], { reason: problem.reason });
}
/** The registries asked, by name, in the dictionary's list form. */
function registryList(
  registries: readonly Registry[],
  t: Translate,
  resolved: string | null,
): string {
  return registries
    .map((registry) => registryText(registry, t, resolved).name)
    .join(t("registryListSeparator"));
}
/** An option's name with its host in tertiary text, unless the host is the name. */
function registryOption(registry: Registry, t: Translate, resolved: string | null): VNodeChild {
  const { name, host } = registryText(registry, t, resolved);
  return name === host
    ? name
    : h(Fragment, null, [
        name,
        " ",
        h(
          "span",
          {
            class: css.registryHint,
          },
          [host],
        ),
      ]);
}
/**
 * The failed screen's one line: a pnpm failure by its kind, a refusal by its
 * code, any other failure in the Host's words; the run's output stays behind the details.
 * A run the Host laid at the spec's own host says so; one it laid at a registry
 * names every registry asked when there were several.
 */
function failureText(
  failure: InstallState["failure"],
  t: Translate,
  install?: Pick<InstallState, "attempts" | "subject" | "registries">,
): string {
  if (failure === null) return t("installFailureGeneric");
  // A compatibility refusal is the package's own answer, whatever pnpm's exit classified the run as.
  if (failure.code === "incompatible-version") {
    const incompatible =
      failure.incompatible === undefined ? {} : { incompatible: failure.incompatible };
    return managementText({ code: failure.code, installing: true, ...incompatible }, t);
  }
  // Blocked scripts the Host could not name leave the person to allow them in the profile's pnpm settings by hand.
  if (failure.kind === "build-blocked" && !failure.pendingBuilds?.length)
    return t("installFailureBuildBlockedManual");
  const host = install?.subject?.host;
  if (failure.failedAt === "spec-host" && host !== undefined)
    return t("installFailureNetworkHost", { host });
  const asked = install?.attempts?.registries ?? [];
  if (
    failure.failedAt === "registry" &&
    (failure.kind === "network" || failure.kind === "timeout") &&
    asked.length > 1
  ) {
    return t("installFailureNetworkAll", {
      registries: registryList(asked, t, install?.registries?.resolved ?? null),
    });
  }
  if (failure.kind !== undefined) return t(FAILURE_KIND_KEYS[failure.kind]);
  if (failure.code !== undefined)
    return managementText({ code: failure.code, diagnostic: failure.reason }, t);
  if (failure.reason !== "") return failure.reason;
  // An enabled install that failed applying the bundle names that step, never the install command it already finished.
  return failure.stage === "enable" && failure.enabled === true
    ? t("installFailedEnabling")
    : t("installFailureGeneric");
}
interface SubjectLines {
  readonly spec: string;
  readonly title: string;
  readonly description?: string | undefined;
  readonly version?: string | undefined;
  /** A confirmed version is named by its tab, so the spec follows as reference text. */
  readonly showSpec: boolean;
}
/** The package an install is about: its name, one-liner, version, and, when `showSpec` is set, its spec. */
function SubjectBlock({
  lines,
  t,
}: {
  readonly lines: SubjectLines;
  readonly t: Translate;
}): VNodeChild {
  return h(
    "div",
    {
      class: css.subject,
      "data-install-subject": lines.spec,
    },
    [
      h(
        "p",
        {
          class: css.subjectName,
        },
        [lines.title],
      ),
      lines.description === undefined
        ? null
        : h(
            "p",
            {
              class: css.subjectDesc,
            },
            [lines.description],
          ),
      lines.version === undefined
        ? null
        : h(
            "p",
            {
              class: css.subjectMeta,
            },
            [t("installVersion", { version: lines.version })],
          ),
      lines.showSpec
        ? h(
            "p",
            {
              class: css.subjectSpec,
            },
            [lines.spec],
          )
        : null,
    ],
  );
}
/** The checked package as the Host read it before installing; a confirmed version keeps its tab's name and version. */
function SubjectCard({
  subject,
  confirmed,
  t,
}: {
  readonly subject: InstallSubject;
  readonly confirmed: InstallState["confirmed"];
  readonly t: Translate;
}): VNodeChild {
  const kindKey = SUBJECT_KIND_KEYS[subject.kind];
  return h(SubjectBlock, {
    t: t,
    lines: {
      spec: subject.spec,
      title: confirmed?.title ?? subject.name ?? subject.spec,
      description: subject.description ?? (kindKey === undefined ? undefined : t(kindKey)),
      version: subject.version ?? confirmed?.version,
      showSpec: confirmed !== undefined,
    },
  });
}
/** Track one install field's composition, including Safari's 10ms post-composition Enter window. */
function useInstallComposition(active: () => boolean) {
  let composition = { active: false, until: 0 };
  watch(active, () => {
    composition = { active: false, until: 0 };
  });
  return {
    onCompositionStart: () => {
      composition.active = true;
    },
    onCompositionEnd: () => {
      composition = { active: false, until: Date.now() + 10 };
    },
    onBlur: () => {
      composition = { active: false, until: 0 };
    },
    isComposing: (event: KeyboardEvent) =>
      event.isComposing ||
      Reflect.get(event, "keyCode") === 229 ||
      composition.active ||
      Date.now() < composition.until,
  };
}
const InstallDialog = defineComponent(
  (props: {
    readonly install: InstallState;
    readonly t: Translate;
    readonly onClose: () => void;
    readonly onEditSpec: (text: string) => void;
    readonly onRun: () => void;
    readonly onCancel: () => void;
    readonly onReconcile: () => void;
    readonly onToggleDetails: () => void;
    readonly onEnableNow: () => void;
    readonly onApproveBuilds: () => void;
    readonly onToggleRegistry: () => void;
    readonly onChooseRegistry: (choice: RegistryChoice) => void;
    /** From the failed screen: back to the spec with the registry options unfolded. */
    readonly onChangeRegistry: () => void;
    readonly onUseGithubMirror: () => void;
  }) => {
    const install = computed(() => props.install);
    const t = computed(() => props.t);
    const onClose = computed(() => props.onClose);
    const onEditSpec = computed(() => props.onEditSpec);
    const onRun = computed(() => props.onRun);
    const onCancel = computed(() => props.onCancel);
    const onReconcile = computed(() => props.onReconcile);
    const onToggleDetails = computed(() => props.onToggleDetails);
    const onEnableNow = computed(() => props.onEnableNow);
    const onApproveBuilds = computed(() => props.onApproveBuilds);
    const onToggleRegistry = computed(() => props.onToggleRegistry);
    const onChooseRegistry = computed(() => props.onChooseRegistry);
    const onChangeRegistry = computed(() => props.onChangeRegistry);
    const onUseGithubMirror = computed(() => props.onUseGithubMirror);
    const errorId = useId();
    const templateHintId = useId();
    const guideId = useId();
    const approvalId = useId();
    const registryId = useId();
    const registryErrorId = useId();
    const guideOpen = shallowRef(false);
    const setGuideOpen = (
      next: typeof guideOpen.value | ((previous: typeof guideOpen.value) => typeof guideOpen.value),
    ) => {
      guideOpen.value = typeof next === "function" ? next(guideOpen.value) : next;
    };
    const customRegistryDraft = shallowRef("");
    const setCustomRegistryDraft = (
      next:
        | typeof customRegistryDraft.value
        | ((previous: typeof customRegistryDraft.value) => typeof customRegistryDraft.value),
    ) => {
      customRegistryDraft.value =
        typeof next === "function" ? next(customRegistryDraft.value) : next;
    };
    const projection1 = computed(() => install.value);
    const phase = computed(() => projection1.value.phase);
    const registryToggleRef = shallowRef<(HTMLButtonElement | null) | null>(null);
    const registryPanelRef = shallowRef<(HTMLFieldSetElement | null) | null>(null);
    const registryCustomRef = shallowRef<(HTMLInputElement | null) | null>(null);
    const registryShown = computed(() => install.value.registryOpen && phase.value === "idle");
    const specComposition = useInstallComposition(
      () => install.value.open && phase.value === "idle",
    );
    const registryComposition = useInstallComposition(
      () => install.value.open && registryShown.value,
    );
    const registryAnchorName = computed(() => `--dsh-registry-${registryId.replaceAll(":", "")}`);
    // The hook only ever asks to close.
    useDismissOnOutsidePointer(
      registryToggleRef,
      () => registryShown.value,
      () => onToggleRegistry.value(),
      registryPanelRef,
    );
    onMounted(() =>
      watch(
        [() => registryShown.value, () => install.value.registryError],
        (_value, _previous, onCleanup) => {
          const cleanup = (() => {
            if (registryShown.value && install.value.registryError)
              registryCustomRef.value?.focus();
          })();
          if (typeof cleanup === "function") onCleanup(cleanup);
        },
        { immediate: true, flush: "post" },
      ),
    );
    onMounted(() =>
      watch(
        [() => registryShown.value, () => onToggleRegistry.value],
        (_value, _previous, onCleanup) => {
          const cleanup = (() => {
            if (!registryShown.value) return;
            // Escape folds the options and goes no further: the dialog under them listens for the same key.
            const onKeyDown = (event: KeyboardEvent): void => {
              if (event.key !== "Escape") return;
              event.stopPropagation();
              onToggleRegistry.value();
            };
            document.addEventListener("keydown", onKeyDown, true);
            return () => {
              document.removeEventListener("keydown", onKeyDown, true);
            };
          })();
          if (typeof cleanup === "function") onCleanup(cleanup);
        },
        { immediate: true, flush: "post" },
      ),
    );
    return () => {
      if (githubRecoveryRegistry(install.value) !== undefined) {
        const anotherWay = asksMirror(install.value);
        return h(
          Modal,
          {
            key: "install-recovery",
            open: install.value.open,
            onClose: onClose.value,
            title: t.value(
              install.value.failure?.kind === "timeout"
                ? "installGithubTimeoutTitle"
                : "installGithubFailedTitle",
            ),
            closeLabel: t.value("close"),
            description: t.value("installGithubFailedDescription"),
          },
          {
            footer: () =>
              h(Fragment, null, [
                h(
                  Button,
                  {
                    variant: "outline",
                    onClick: onClose.value,
                  },
                  {
                    default: () => [t.value("cancel")],
                  },
                ),
                h(
                  Button,
                  {
                    variant: "primary",
                    autoFocus: true,
                    onClick: () => {
                      // The mirror is already asked, so the form opens with the package-name guide.
                      if (anotherWay) setGuideOpen(true);
                      onUseGithubMirror.value();
                    },
                  },
                  {
                    default: () => [
                      t.value(anotherWay ? "installTryAnotherWay" : "installUseGithubMirror"),
                    ],
                  },
                ),
              ]),
          },
        );
      }
      if (
        (phase.value === "idle" || phase.value === "checking") &&
        install.value.confirmed !== undefined
      ) {
        // A confirmed spec has no form to return to: the dialog names the plugin and version above the spec, with its
        // check, a refusal with a retry, or, after a cancelled run, Install.
        const checking = phase.value === "checking";
        const problem = install.value.inputError;
        return h(
          Modal,
          {
            open: install.value.open,
            onClose: onClose.value,
            title: t.value(problem === null ? "installConfirmedTitle" : "installConfirmedRefused"),
            closeLabel: t.value("close"),
            className: css.installDialog as string,
          },
          {
            default: () => [
              h(
                "div",
                {
                  class: css.installBody,
                  "data-install-phase": phase.value,
                },
                [
                  h(SubjectBlock, {
                    t: t.value,
                    lines: {
                      spec: install.value.spec,
                      ...install.value.confirmed!,
                      showSpec: true,
                    },
                  }),
                  checking
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
                          t.value("installChecking"),
                        ],
                      )
                    : problem === null
                      ? null
                      : h(
                          "p",
                          {
                            class: css.inputError,
                            role: "alert",
                          },
                          [
                            inputProblemSentence(
                              problem,
                              t.value,
                              install.value.registries?.resolved ?? null,
                            ),
                          ],
                        ),
                ],
              ),
            ],
            footer: () =>
              checking
                ? undefined
                : h(Fragment, null, [
                    h(
                      Button,
                      {
                        variant: "outline",
                        onClick: onClose.value,
                      },
                      {
                        default: () => [t.value("close")],
                      },
                    ),
                    h(
                      Button,
                      {
                        variant: "primary",
                        autoFocus: true,
                        onClick: onRun.value,
                      },
                      {
                        default: () => [t.value(problem === null ? "installRun" : "retry")],
                      },
                    ),
                  ]),
          },
        );
      }
      if (phase.value === "idle" || phase.value === "checking") {
        const checking = phase.value === "checking";
        const empty = install.value.spec.trim() === "";
        const choice = install.value.registry;
        const resolved = install.value.registries?.resolved ?? null;
        const chosenTitle =
          choice.kind === "custom"
            ? t.value("registryCustom")
            : registryText(choice.registry, t.value, resolved).name;
        const inputSentence =
          install.value.inputError === null
            ? null
            : inputProblemSentence(install.value.inputError, t.value, resolved);
        const templateHint =
          install.value.spec === INSTALL_GIT_EXAMPLE
            ? t.value("installGitTemplateHint")
            : install.value.spec === INSTALL_PATH_EXAMPLE
              ? t.value("installPathTemplateHint")
              : null;
        return h(
          Modal,
          {
            key: "install-input",
            open: install.value.open,
            onClose: onClose.value,
            title: t.value("installTitle"),
            closeLabel: t.value("close"),
            ...(install.value.mirrorRecovery ? {} : { description: t.value("installDescription") }),
            className: css.installDialog as string,
            contentClassName: css.installContent as string,
          },
          {
            default: () => [
              h(
                "div",
                {
                  class: css.installBody,
                },
                [
                  h(
                    "div",
                    {
                      class: css.installField,
                    },
                    [
                      h("input", {
                        type: "text",
                        autoFocus: install.value.mirrorRecovery === true,
                        "data-modal-autofocus": true,
                        value: install.value.spec,
                        placeholder: t.value("installSpecPlaceholder"),
                        disabled: checking,
                        "aria-label": t.value(
                          install.value.mirrorRecovery ? "installPackageLabel" : "installSpecLabel",
                        ),
                        "aria-invalid": install.value.inputError !== null,
                        "aria-describedby":
                          inputSentence !== null
                            ? errorId
                            : templateHint !== null
                              ? templateHintId
                              : undefined,
                        onInput: (event: Event) => {
                          if (event.currentTarget instanceof HTMLInputElement)
                            onEditSpec.value(event.currentTarget.value);
                        },
                        onCompositionstart: specComposition.onCompositionStart,
                        onCompositionend: specComposition.onCompositionEnd,
                        onBlur: specComposition.onBlur,
                        onKeydown: (event) => {
                          if (specComposition.isComposing(event)) return;
                          if (event.key === "Enter" && !empty && !checking) onRun.value();
                        },
                      }),
                    ],
                  ),
                  inputSentence === null
                    ? null
                    : h(
                        "p",
                        {
                          id: errorId,
                          class: css.inputError,
                          role: "alert",
                        },
                        [inputSentence],
                      ),
                  inputSentence === null && templateHint !== null
                    ? h(
                        "p",
                        {
                          id: templateHintId,
                          class: css.templateHint,
                          role: "status",
                        },
                        [templateHint],
                      )
                    : null,
                  h(
                    "div",
                    {
                      class: css.optionsRow,
                    },
                    [
                      h(
                        "button",
                        {
                          type: "button",
                          class: css.guideToggle,
                          "aria-expanded": guideOpen.value,
                          "aria-controls": guideId,
                          onClick: () => {
                            setGuideOpen((open) => !open);
                          },
                        },
                        [
                          h(IconChevronDownOutlineRegular, {
                            className: css.guideChevron ?? "",
                            "aria-hidden": "true",
                          }),
                          h("span", null, [
                            t.value(guideOpen.value ? "installGuideHide" : "installGuideToggle"),
                          ]),
                        ],
                      ),
                      h(
                        "button",
                        {
                          ref: registryToggleRef,
                          style: { anchorName: registryAnchorName.value },
                          type: "button",
                          class: css.registryToggle,
                          "aria-expanded": install.value.registryOpen,
                          "aria-controls": registryId,
                          "aria-haspopup": "dialog",
                          disabled: checking,
                          onClick: onToggleRegistry.value,
                        },
                        [
                          h("span", null, [t.value("registryToggle")]),
                          " ",
                          h(
                            "span",
                            {
                              class: css.registryChosen,
                            },
                            [chosenTitle],
                          ),
                          h(IconChevronDownOutlineRegular, {
                            className: css.guideChevron ?? "",
                            "aria-hidden": "true",
                          }),
                        ],
                      ),
                    ],
                  ),
                  guideOpen.value
                    ? h(
                        "div",
                        {
                          id: guideId,
                          class: css.guide,
                          "data-install-guide": true,
                        },
                        [
                          h(
                            "ol",
                            {
                              class: css.guideList,
                            },
                            [
                              GUIDE_EXAMPLES.map(({ key, titleKey, exampleKey, hintKey }) =>
                                h(
                                  "li",
                                  {
                                    key: key,
                                    class: css.guideItem,
                                  },
                                  [
                                    h(
                                      "div",
                                      {
                                        class: css.guideMain,
                                      },
                                      [
                                        h(
                                          "span",
                                          {
                                            class: css.guideTitle,
                                          },
                                          [t.value(titleKey)],
                                        ),
                                        h(
                                          "span",
                                          {
                                            class: css.guideHint,
                                          },
                                          [t.value(hintKey)],
                                        ),
                                        h(
                                          "span",
                                          {
                                            class: css.guideExample,
                                          },
                                          [
                                            h(
                                              "span",
                                              {
                                                class: css.guideExampleLabel,
                                              },
                                              [t.value("installGuideExampleLabel")],
                                            ),
                                            h("code", null, [t.value(exampleKey)]),
                                          ],
                                        ),
                                      ],
                                    ),
                                    h(
                                      Button,
                                      {
                                        variant: "outline",
                                        size: "sm",
                                        "aria-label": t.value("installGuideFillAria", {
                                          example: t.value(exampleKey),
                                        }),
                                        disabled: checking,
                                        onClick: () => {
                                          onEditSpec.value(t.value(exampleKey));
                                        },
                                      },
                                      {
                                        default: () => [t.value("installGuideFill")],
                                      },
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ],
                      )
                    : null,
                  registryShown.value
                    ? h(Teleport, { to: document.body }, [
                        h(
                          "fieldset",
                          {
                            ref: registryPanelRef,
                            id: registryId,
                            class: css.registry,
                            style: { positionAnchor: registryAnchorName.value },
                            "data-install-registry": true,
                            "aria-label": t.value("registryLegend"),
                            onKeydown: (event) => {
                              if (
                                event.key !== "Tab" ||
                                event.ctrlKey ||
                                event.altKey ||
                                event.metaKey ||
                                event.isComposing
                              )
                                return;
                              event.preventDefault();
                              event.stopPropagation();
                              if (!(event.currentTarget instanceof HTMLFieldSetElement)) return;
                              const radio = event.currentTarget.querySelector<HTMLInputElement>(
                                'input[type="radio"]:checked',
                              );
                              const field = registryCustomRef.value;
                              if (event.shiftKey && event.target === field) radio?.focus();
                              else if (!event.shiftKey && event.target !== field) field?.focus();
                              else {
                                onToggleRegistry.value();
                                registryToggleRef.value?.focus();
                              }
                            },
                          },
                          [
                            offeredRegistries(install.value.registries).map((registry) => {
                              const checked =
                                choice.kind === "offered" && choice.registry === registry;
                              return h(
                                "label",
                                {
                                  key: registry ?? "",
                                  class: css.registryOption,
                                  "data-checked": checked,
                                },
                                [
                                  h("input", {
                                    type: "radio",
                                    name: registryId,
                                    checked: checked,
                                    onChange: () => {
                                      if (choice.kind === "custom")
                                        setCustomRegistryDraft(choice.url);
                                      onChooseRegistry.value({ kind: "offered", registry });
                                    },
                                  }),
                                  h(
                                    "span",
                                    {
                                      class: css.registryTitle,
                                    },
                                    [registryOption(registry, t.value, resolved)],
                                  ),
                                ],
                              );
                            }),
                            h(
                              "div",
                              {
                                class: css.registryOption,
                                "data-checked": choice.kind === "custom",
                                onClick: (event) => {
                                  // Keep label activation from moving focus back to the radio.
                                  if (!(event.target instanceof HTMLInputElement))
                                    event.preventDefault();
                                  registryCustomRef.value?.focus();
                                },
                              },
                              [
                                h(
                                  "label",
                                  {
                                    class: css.registryCustomPick,
                                  },
                                  [
                                    h("input", {
                                      type: "radio",
                                      name: registryId,
                                      checked: choice.kind === "custom",
                                      onChange: () => {
                                        onChooseRegistry.value({
                                          kind: "custom",
                                          url: customRegistryDraft.value,
                                        });
                                        registryCustomRef.value?.focus();
                                      },
                                    }),
                                    h(
                                      "span",
                                      {
                                        class: css.registryTitle,
                                      },
                                      [h("span", null, [t.value("registryCustom")])],
                                    ),
                                  ],
                                ),
                                h("input", {
                                  ref: registryCustomRef,
                                  type: "text",
                                  class: css.registryCustomField,
                                  "aria-label": t.value("registryCustom"),
                                  placeholder: t.value("registryCustomPlaceholder"),
                                  value:
                                    choice.kind === "custom"
                                      ? choice.url
                                      : customRegistryDraft.value,
                                  "aria-invalid": install.value.registryError,
                                  "aria-describedby": install.value.registryError
                                    ? registryErrorId
                                    : undefined,
                                  onFocus: () => {
                                    if (pointerModality() && choice.kind !== "custom")
                                      onChooseRegistry.value({
                                        kind: "custom",
                                        url: customRegistryDraft.value,
                                      });
                                  },
                                  onInput: (event: Event) => {
                                    if (event.currentTarget instanceof HTMLInputElement)
                                      onChooseRegistry.value({
                                        kind: "custom",
                                        url: event.currentTarget.value,
                                      });
                                  },
                                  onCompositionstart: registryComposition.onCompositionStart,
                                  onCompositionend: registryComposition.onCompositionEnd,
                                  onBlur: registryComposition.onBlur,
                                  onKeydown: (event) => {
                                    if (registryComposition.isComposing(event)) return;
                                    if (event.key === "Enter" && !empty) onRun.value();
                                  },
                                }),
                                install.value.registryError
                                  ? h(
                                      "p",
                                      {
                                        id: registryErrorId,
                                        class: css.inputError,
                                        role: "alert",
                                      },
                                      [t.value("registryCustomInvalid")],
                                    )
                                  : null,
                                h(
                                  "span",
                                  {
                                    class: css.registryHint,
                                  },
                                  [t.value("registryCustomHint")],
                                ),
                              ],
                            ),
                          ],
                        ),
                      ])
                    : null,
                ],
              ),
            ],
            footer: () =>
              h(
                "div",
                {
                  class: css.installFooter,
                },
                [
                  h(
                    "p",
                    {
                      class: css.installSafety,
                      role: "note",
                    },
                    [
                      h(IconWarningOutlineRegular, {
                        size: 14,
                        "aria-hidden": "true",
                      }),
                      h(
                        "span",
                        {
                          class: css.installSafetyText,
                        },
                        [
                          h("span", null, [t.value("installGuideSafety")]),
                          h("span", null, [t.value("installUpgradeNotice")]),
                        ],
                      ),
                    ],
                  ),
                  h(
                    Button,
                    {
                      variant: "primary",
                      className: css.wide ?? "",
                      disabled: checking || empty,
                      "aria-busy": checking,
                      onClick: onRun.value,
                    },
                    {
                      default: () => [
                        checking
                          ? h(StateDot, {
                              state: "ongoing",
                            })
                          : null,
                        t.value(checking ? "installChecking" : "installRun"),
                      ],
                    },
                  ),
                ],
              ),
          },
        );
      }
      const heading = t.value(
        phase.value === "done" && install.value.subject?.bundled
          ? "installBundledTitle"
          : SCREEN_TITLE_KEYS[phase.value],
      );
      const pending = isInstallPending(phase.value);
      // A settled screen whose install never reported a run can say the details received no terminal output.
      const settledDetails =
        phase.value === "failed" || phase.value === "done" || phase.value === "unknown";
      const cancellable =
        phase.value === "starting" || phase.value === "running" || phase.value === "unconfirmed";
      const stoppable = cancellable || phase.value === "failed" || phase.value === "unknown";
      const failure = install.value.failure;
      const uncertainty = failure?.uncertainty;
      const uncertaintyText =
        failure?.uncertainty === undefined
          ? null
          : t.value(
              (
                {
                  result: "installResultUnconfirmed",
                  cancellation:
                    phase.value === "applying"
                      ? "installApplyingCancellationError"
                      : "installCancelUnconfirmed",
                  acceptance: "installAwaitingAcceptance",
                } as const
              )[failure.uncertainty],
              { reason: failure.reason },
            );
      const pendingBuilds =
        phase.value === "failed" ? (install.value.failure?.pendingBuilds ?? []) : [];
      const approvable = pendingBuilds.length > 0;
      const firstRun = install.value.runs[0];
      // The registries the Host asked, once there is more than one: the attempt under way while it runs, a badge on each run.
      const asked =
        install.value.attempts !== null && install.value.attempts.registries.length > 1
          ? install.value.attempts
          : null;
      const current = asked === null ? undefined : asked.registries.at(-1);
      const previous = asked === null ? undefined : asked.registries.at(-2);
      const resolved = install.value.registries?.resolved ?? null;
      const attemptLine =
        pending && asked !== null && current !== undefined && previous !== undefined
          ? t.value("installAttempt", {
              previous: registryText(previous, t.value, resolved).name,
              registry: registryText(current, t.value, resolved).name,
              index: String(asked.registries.length),
              total: String(asked.total),
            })
          : null;
      // Another registry is worth offering only for a failure the Host laid at the one it asked.
      const changeable =
        phase.value === "failed" &&
        !approvable &&
        install.value.failure?.failedAt === "registry" &&
        install.value.confirmed === undefined;
      const subject = install.value.subject;
      return h(
        Modal,
        {
          open: install.value.open,
          onClose: onClose.value,
          title: heading,
          headless: true,
          className: css.installDialog as string,
        },
        {
          default: () => [
            h(
              "div",
              {
                class: css.wizard,
                "data-install-phase": phase.value,
              },
              [
                h(
                  "div",
                  {
                    class: css.wizardHead,
                  },
                  [
                    phase.value === "done" || (install.value.confirmed !== undefined && !pending)
                      ? h("span", null)
                      : h(
                          "button",
                          {
                            type: "button",
                            class: css.wizardBack,
                            "aria-label": t.value(
                              install.value.confirmed !== undefined
                                ? "cancel"
                                : pending
                                  ? "installCancelAndEdit"
                                  : "installEditAria",
                            ),
                            disabled: !stoppable,
                            onClick: onCancel.value,
                          },
                          [
                            h(IconChevronLeftOutlineMedium, {
                              "aria-hidden": "true",
                            }),
                            h("span", null, [
                              t.value(
                                install.value.confirmed !== undefined
                                  ? "cancel"
                                  : pending
                                    ? "installCancelAndEdit"
                                    : "installEdit",
                              ),
                            ]),
                          ],
                        ),
                    h(
                      "button",
                      {
                        type: "button",
                        class: css.wizardClose,
                        "aria-label": t.value(cancellable ? "installCloseCancels" : "close"),
                        onClick: onClose.value,
                      },
                      [
                        h(IconCloseOutlineMedium, {
                          size: 14,
                        }),
                      ],
                    ),
                  ],
                ),
                h(
                  "div",
                  {
                    class: css.wizardScroll,
                  },
                  [
                    h(
                      "div",
                      {
                        class: css.wizardHero,
                      },
                      [
                        h(
                          "span",
                          {
                            class: css.wizardIcon,
                            "data-state": pending
                              ? "ongoing"
                              : phase.value === "done"
                                ? "done"
                                : "error",
                            "aria-hidden": "true",
                          },
                          [
                            pending
                              ? h(StateDot, {
                                  state: "ongoing",
                                  size: 28,
                                })
                              : phase.value === "done"
                                ? h(IconCheckCircleFillRegular, {
                                    size: 28,
                                  })
                                : h(IconWarningOutlineRegular, {
                                    size: 28,
                                  }),
                          ],
                        ),
                        h(
                          "h2",
                          {
                            class: css.wizardTitle,
                            role: phase.value === "failed" ? "alert" : "status",
                          },
                          [heading],
                        ),
                        phase.value === "done" && subject?.bundled
                          ? h(
                              "p",
                              {
                                class: css.wizardSub,
                              },
                              [t.value("installBundledDescription")],
                            )
                          : null,
                        phase.value === "failed"
                          ? h(
                              "p",
                              {
                                class: css.wizardSub,
                              },
                              [failureText(install.value.failure, t.value, install.value)],
                            )
                          : null,
                        phase.value === "failed" &&
                        failure?.stage === "enable" &&
                        failure.enabled === true &&
                        (failure.code !== undefined || failure.reason !== "")
                          ? h(
                              "p",
                              {
                                class: css.wizardSub,
                              },
                              [t.value("installFailedEnabling")],
                            )
                          : null,
                        attemptLine === null
                          ? null
                          : h(
                              "p",
                              {
                                class: css.wizardSub,
                              },
                              [attemptLine],
                            ),
                        uncertaintyText === null
                          ? null
                          : h(
                              "p",
                              {
                                class: css.wizardSub,
                                role: "alert",
                              },
                              [uncertaintyText],
                            ),
                        phase.value === "unknown"
                          ? h(
                              "p",
                              {
                                class: css.wizardSub,
                              },
                              [t.value("installUnknownDescription")],
                            )
                          : null,
                      ],
                    ),
                    subject === null
                      ? null
                      : h(SubjectCard, {
                          subject:
                            phase.value === "done" && install.value.installedVersion !== null
                              ? { ...subject, version: install.value.installedVersion }
                              : subject,
                          confirmed: install.value.confirmed,
                          t: t.value,
                        }),
                    approvable
                      ? h(
                          "section",
                          {
                            class: css.approval,
                            role: "group",
                            "aria-labelledby": approvalId,
                            "data-install-approval": true,
                          },
                          [
                            h(
                              "h3",
                              {
                                id: approvalId,
                                class: css.approvalTitle,
                              },
                              [t.value("installApprovalTitle")],
                            ),
                            h(
                              "p",
                              {
                                class: css.approvalText,
                              },
                              [t.value("installApprovalDescription")],
                            ),
                            h(
                              "ul",
                              {
                                class: css.approvalList,
                              },
                              [
                                pendingBuilds.map((name) =>
                                  h(
                                    "li",
                                    {
                                      key: name,
                                    },
                                    [h("code", null, [name])],
                                  ),
                                ),
                              ],
                            ),
                            h(
                              "p",
                              {
                                class: css.approvalText,
                              },
                              [t.value("installApprovalConsequence")],
                            ),
                            h(
                              "p",
                              {
                                class: css.approvalCaution,
                              },
                              [t.value("installApprovalCaution")],
                            ),
                            h(
                              Button,
                              {
                                variant: "primary",
                                className: css.wide ?? "",
                                onClick: onApproveBuilds.value,
                              },
                              {
                                default: () => [t.value("installApproveAndRetry")],
                              },
                            ),
                          ],
                        )
                      : null,
                    phase.value === "done" && install.value.installed === null
                      ? h(
                          "p",
                          {
                            class: css.result,
                            role: "status",
                          },
                          [t.value("installDoneNothing")],
                        )
                      : null,
                    phase.value === "done" && install.value.restartRequired
                      ? h(
                          "p",
                          {
                            class: css.resultWarn,
                            role: "status",
                          },
                          [restartText("installDoneRestart", install.value.restartReason, t.value)],
                        )
                      : null,
                    phase.value === "done" &&
                    subject?.kind === "registry" &&
                    subject.name !== undefined &&
                    subject.version !== undefined &&
                    install.value.installedVersion !== null &&
                    install.value.installedVersion !== subject.version &&
                    // A fallback registry can serve another release than the one inspected, so only a single-registry run is explained.
                    (install.value.attempts?.registries.length ?? 1) === 1
                      ? h(
                          "p",
                          {
                            class: css.resultWarn,
                            role: "status",
                          },
                          [
                            t.value("installDoneOtherVersion", {
                              installed: install.value.installedVersion,
                              version: subject.version,
                              exact: `${subject.name}@${subject.version}`,
                            }),
                          ],
                        )
                      : null,
                    phase.value === "done" && install.value.approvedBuilds.length > 0
                      ? h(
                          "p",
                          {
                            class: css.result,
                            role: "status",
                          },
                          [
                            t.value("installDoneApproved", {
                              names: install.value.approvedBuilds.join(", "),
                            }),
                          ],
                        )
                      : null,
                    h(
                      "div",
                      {
                        class: css.wizardFoot,
                      },
                      [
                        subject?.bundled
                          ? null
                          : h(
                              "button",
                              {
                                type: "button",
                                class: css.detailsToggle,
                                "aria-expanded": install.value.detailsOpen,
                                onClick: onToggleDetails.value,
                              },
                              [
                                h("span", null, [
                                  t.value(
                                    install.value.detailsOpen
                                      ? "installDetailsHide"
                                      : "installDetailsShow",
                                  ),
                                ]),
                                h(IconChevronDownOutlineRegular, {
                                  className: css.detailsChevron ?? "",
                                  "aria-hidden": "true",
                                }),
                              ],
                            ),
                        uncertainty === "result"
                          ? h(
                              Button,
                              {
                                variant: "outline",
                                size: "sm",
                                className: css.footAction ?? "",
                                onClick: onReconcile.value,
                              },
                              {
                                default: () => [t.value("installReconcile")],
                              },
                            )
                          : null,
                        pending
                          ? h(
                              Button,
                              {
                                variant: "outline",
                                size: "sm",
                                className: css.footAction ?? "",
                                disabled: !cancellable,
                                onClick: onCancel.value,
                              },
                              {
                                default: () => [
                                  t.value(
                                    phase.value === "cancelling"
                                      ? "installCancelling"
                                      : "installCancel",
                                  ),
                                ],
                              },
                            )
                          : null,
                        phase.value === "failed" && !approvable
                          ? h(
                              "span",
                              {
                                class: css.wizardActions,
                              },
                              [
                                changeable
                                  ? h(
                                      Button,
                                      {
                                        variant: "outline",
                                        size: "sm",
                                        className: css.footAction ?? "",
                                        onClick: onChangeRegistry.value,
                                      },
                                      {
                                        default: () => [t.value("installChangeRegistry")],
                                      },
                                    )
                                  : null,
                                h(
                                  Button,
                                  {
                                    variant: "primary",
                                    size: "sm",
                                    className: css.footAction ?? "",
                                    onClick: onRun.value,
                                  },
                                  {
                                    default: () => [t.value("installRetry")],
                                  },
                                ),
                              ],
                            )
                          : null,
                      ],
                    ),
                    install.value.detailsOpen
                      ? h(
                          "div",
                          {
                            class: css.detailsBody,
                          },
                          [
                            firstRun !== undefined
                              ? h(
                                  "p",
                                  {
                                    class: css.installLocation,
                                  },
                                  [t.value("installLocation", { dir: firstRun.cwd })],
                                )
                              : settledDetails
                                ? h(
                                    "p",
                                    {
                                      class: css.installLocation,
                                    },
                                    [t.value("installDetailsNoOutput")],
                                  )
                                : null,
                            install.value.runs.map((run, index) => {
                              const registry = asked?.registries[index];
                              return h(
                                "div",
                                {
                                  key: run.jobId,
                                  class: css.run,
                                },
                                [
                                  registry === undefined
                                    ? null
                                    : h(
                                        "p",
                                        {
                                          class: css.attemptBadge,
                                        },
                                        [
                                          t.value("installAttemptBadge", {
                                            index: String(index + 1),
                                            registry: registryText(registry, t.value, resolved)
                                              .name,
                                          }),
                                        ],
                                      ),
                                  h(TerminalBlock, {
                                    command: run.command,
                                    output: run.output,
                                    running: run.exitCode === undefined,
                                    exitCode: run.exitCode,
                                    maxLines: INSTALL_TERMINAL_LINES,
                                    labels: {
                                      ...terminalLabels(t.value),
                                      ...(phase.value === "cancelling"
                                        ? { failed: t.value("installCancelledShort") }
                                        : {}),
                                    },
                                    className: css.terminal ?? "",
                                  }),
                                ],
                              );
                            }),
                            install.value.logPath === null
                              ? null
                              : h(
                                  "p",
                                  {
                                    class: css.installLocation,
                                  },
                                  [t.value("installLogPath", { path: install.value.logPath })],
                                ),
                          ],
                        )
                      : null,
                    phase.value !== "done"
                      ? null
                      : install.value.installed !== null &&
                          install.value.subject?.selection === undefined
                        ? h(
                            Button,
                            {
                              variant: "primary",
                              className: css.wide ?? "",
                              disabled: install.value.enabling,
                              "aria-busy": install.value.enabling,
                              onClick: onEnableNow.value,
                            },
                            {
                              default: () => [t.value("installEnableNow")],
                            },
                          )
                        : h(
                            Button,
                            {
                              variant: "primary",
                              className: css.wide ?? "",
                              onClick: onClose.value,
                            },
                            {
                              default: () => [t.value("installClose")],
                            },
                          ),
                  ],
                ),
              ],
            ),
          ],
        },
      );
    };
  },
  {
    props: [
      "install",
      "t",
      "onClose",
      "onEditSpec",
      "onRun",
      "onCancel",
      "onReconcile",
      "onToggleDetails",
      "onEnableNow",
      "onApproveBuilds",
      "onToggleRegistry",
      "onChooseRegistry",
      "onChangeRegistry",
      "onUseGithubMirror",
    ],
    inheritAttrs: false,
  },
);
/** The confirmation an uninstall waits on. */
function ConfirmDialog({
  name,
  t,
  onConfirm,
  onCancel,
}: {
  readonly name: string;
  readonly t: Translate;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}): VNodeChild {
  return h(
    Modal,
    {
      open: true,
      onClose: onCancel,
      title: t("confirmUninstallTitle", { name }),
      closeLabel: t("close"),
      description: t("confirmUninstallDescription"),
    },
    {
      footer: () =>
        h(Fragment, null, [
          h(
            Button,
            {
              variant: "outline",
              onClick: onCancel,
            },
            {
              default: () => [t("cancel")],
            },
          ),
          h(
            Button,
            {
              variant: "primary",
              className: css.dangerButton ?? "",
              onClick: onConfirm,
            },
            {
              default: () => [t("confirmUninstall")],
            },
          ),
        ]),
    },
  );
}
/** Render the plugin manager: the official plugins and installed bundles, their pages, the install dialog, and the confirmation. */
export const PluginManagerPage = defineComponent(
  (props: PluginManagerPageProps) => {
    const t = computed(() => props.t);
    const ensure = computed(() => props.ensure);
    const renderSlot = computed(() => props.renderSlot);
    const resolveText = computed(() => {
      language.value;
      return (text: Parameters<ResolveText>[0]) => props.resolveText(text);
    });
    const configurations = props.useConfigurations((snapshot) => snapshot.view?.namespaces);
    const formFor = (id: string): ConfigPageForm | undefined => {
      if (!configurations.value?.some((view) => view.ns === id)) return undefined;
      const form = props.configForm<Record<string, unknown>>(id);
      return { state: form.getSnapshot(), mutate: (ops, revision) => form.mutate(ops, revision) };
    };
    const state = props.usePluginManager((snapshot) => snapshot);
    const ledger = props.useConfigLedger((snapshot) => snapshot);
    const view = props.useStore((snapshot) => snapshot.view);
    const projection1 = computed(() => props.actions);
    const setView = computed(() => projection1.value.setView);
    const setTab = computed(() => projection1.value.setTab);
    const tabs = props.usePluginTabs((snapshot) => snapshot);
    const bundleDetails = props.useBundleDetails((snapshot) => snapshot);
    const language = props.useLocale((snapshot) => snapshot.active);
    const selectedTab = props.useStore((snapshot) => snapshot.tab);
    const tab = computed(() =>
      tabs.value.some((item) => item.id === selectedTab.value) ? selectedTab.value : INSTALLED_TAB,
    );
    const tabsId = useId();
    const activation = shallowRef<string | null>(null);
    const setActivation = (
      next: (string | null) | ((previous: string | null) => string | null),
    ) => {
      activation.value = typeof next === "function" ? next(activation.value) : next;
    };
    const headerRef = props.createHeaderRef();
    const setHeaderRef = (value: Element | import("vue").ComponentPublicInstance | null) => {
      headerRef(value instanceof HTMLDivElement ? value : null);
    };
    const projection2 = computed(() => ({
      highlight: state.value.highlight,
      clearHighlight: props.clearHighlight,
    }));
    const highlight = computed(() => projection2.value.highlight);
    const clearHighlight = computed(() => projection2.value.clearHighlight);
    const noticeLine = computed(() =>
      state.value.notice === null || state.value.notice.kind === "refresh-failed"
        ? null
        : noticeText(state.value.notice, t.value),
    );
    const listed = computed(() =>
      state.value.packages.filter(
        (pkg) =>
          !HIDDEN_BUNDLES.has(pkg.name) &&
          (pkg.listedByDefault !== false || pkg.enabled || pkg.installed || rowsRunning(pkg)) &&
          (pkg.installed || pkg.official || pkg.error !== undefined),
      ),
    );
    const mine = computed(() => listed.value.filter((pkg) => !pkg.official));
    const official = computed(() => listed.value.filter((pkg) => pkg.official));
    const ordered = computed(() => orderOptionalBundles(official.value));
    const pinned = computed(
      () => new Set(official.value.filter(pinnedToMainList).map((pkg) => pkg.name)),
    );
    const extensions = computed(() => ordered.value.filter((pkg) => pinned.value.has(pkg.name)));
    const more = computed(() => ordered.value);
    const loaded = computed(() => state.value.status === "ready" || state.value.status === "error");
    const refreshing = computed(() => state.value.refreshStatus === "refreshing");
    const openPkg = computed(() => {
      const current = view.value;
      return current.kind === "package" || current.kind === "row"
        ? listed.value.find((pkg) => pkg.name === current.name)
        : undefined;
    });
    const openItem = computed(() => {
      const current = view.value;
      return current.kind === "item"
        ? ledger.value.items.find((item) => item.id === current.id)
        : undefined;
    });
    const openRow = computed(() => {
      const current = view.value;
      const pkg = openPkg.value;
      return current.kind === "row" && pkg !== undefined
        ? pkg.rows.find((row) => row.rowId === current.rowId)
        : undefined;
    });
    const onInstalled = computed(() => tab.value === INSTALLED_TAB);
    const showsCards = computed(
      () => !onInstalled.value || (openPkg.value === undefined && openItem.value === undefined),
    );
    const detailFromMore = computed(
      () =>
        (view.value.kind === "package" || view.value.kind === "row") &&
        (view.value.from === "more" ||
          (openPkg.value !== undefined &&
            MORE_BUNDLES.includes(view.value.name) &&
            !pinned.value.has(view.value.name))),
    );
    const showsMoreList = computed(
      () =>
        onInstalled.value &&
        showsCards.value &&
        (view.value.kind === "more" || detailFromMore.value),
    );
    const showsMainList = computed(() => showsCards.value && !showsMoreList.value);
    const installedCards = computed(() => onInstalled.value && showsCards.value);
    const openPkgInMore = computed(
      () => openPkg.value !== undefined && openPkg.value.official && detailFromMore.value,
    );
    const returnTab = computed(() =>
      view.value.kind === "package" || view.value.kind === "row" ? view.value.returnTab : undefined,
    );
    const backToMore = computed(() => openPkgInMore.value && returnTab.value === undefined);
    const pkgOrigin = computed(() =>
      returnTab.value !== undefined
        ? { returnTab: returnTab.value }
        : backToMore.value
          ? { from: "more" as const }
          : {},
    );
    const installedPanel = computed(() =>
      tabs.value.length === 0 || showsMoreList.value
        ? {}
        : {
            role: "tabpanel",
            id: `${tabsId}-${INSTALLED_TAB}-panel`,
            "aria-labelledby": `${tabsId}-${INSTALLED_TAB}`,
          },
    );
    const activated = computed(() =>
      listed.value.find(
        (pkg) =>
          pkg.name === activation.value && pkg.enabled && !state.value.busy.includes(pkg.name),
      ),
    );
    const setBundleEnabled = (name: string, enabled: boolean): void => {
      setActivation(enabled ? name : null);
      props.setEnabled(name, enabled);
    };
    const setRowEnabled = (row: PackageRow, enabled: boolean): void => {
      /* v8 ignore next -- a row without a live entry has its switch disabled */
      if (row.entryId !== undefined) props.setRowEnabled(row.entryId, enabled);
    };
    const configure = (pkg: PackageView): RowConfigure => ({
      has: (row) => ledger.value.rows.has(rowConfigKey(pkg.name, row.rowId)),
      open: (row) => {
        setView.value({ kind: "row", name: pkg.name, rowId: row.rowId, ...pkgOrigin.value });
      },
    });
    const updates = computed(() => updatesNote(mine.value, state.value.versions, t.value));
    const updatePkg = computed(() =>
      state.value.update === null
        ? undefined
        : state.value.packages.find((pkg) => pkg.name === state.value.update?.packageName),
    );
    const packageBusy = (pkg: PackageView): boolean => bundleBusy(state.value, pkg.name);
    const packageCard = (pkg: PackageView): VNodeChild =>
      h(PackageCard, {
        key: pkg.name,
        pkg: pkg,
        t: t.value,
        resolveText: resolveText.value,
        busy: packageBusy(pkg),
        highlighted: state.value.highlight === pkg.name,
        newer: versionUpdate(state.value.versions[pkg.name]),
        onOpen: () => {
          setActivation(null);
          setView.value({
            kind: "package",
            name: pkg.name,
            ...(showsMoreList.value ? { from: "more" } : {}),
          });
        },
        onSetEnabled: (enabled) => {
          setBundleEnabled(pkg.name, enabled);
        },
      });
    const basicItemCard = (item: OfficialItem): VNodeChild =>
      h(ItemCard, {
        key: `item:${item.id}`,
        item: item,
        t: t.value,
        renderSlot: renderSlot.value,
        onOpen: () => {
          setView.value({ kind: "item", id: item.id });
        },
      });
    const renderGroup = (
      id: "basic" | "extensions" | "bundles",
      heading: string,
      cards: VNodeChild[],
    ): VNodeChild => {
      const offersMore = id === "extensions" && more.value.length > 0;
      if (cards.length === 0 && !offersMore) return null;
      return h(
        "section",
        {
          class: css.group,
          "data-plugin-scope": "global",
          "data-plugin-group": id,
        },
        [
          h(
            "div",
            {
              class: css.groupHead,
            },
            [
              h(
                "h3",
                {
                  class: css.groupTitle,
                },
                [heading],
              ),
              offersMore
                ? h(
                    Button,
                    {
                      size: "sm",
                      className: css.groupMore ?? "",
                      onClick: () => {
                        setView.value({ kind: "more" });
                      },
                    },
                    {
                      default: () => [
                        t.value("moreAction"),
                        h(IconChevronRightOutlineRegular, {
                          size: 14,
                          "aria-hidden": "true",
                        }),
                      ],
                    },
                  )
                : null,
            ],
          ),
          cards.length > 0
            ? h(
                "ul",
                {
                  class: css.cards,
                },
                [cards],
              )
            : null,
        ],
      );
    };
    onMounted(() =>
      watch(
        [() => tab.value, () => selectedTab.value, () => setTab.value],
        (_value, _previous, onCleanup) => {
          const cleanup = (() => {
            if (tab.value !== selectedTab.value) setTab.value(tab.value);
          })();
          if (typeof cleanup === "function") onCleanup(cleanup);
        },
        { immediate: true, flush: "post" },
      ),
    );
    onMounted(() =>
      watch(
        [() => ensure.value],
        (_value, _previous, onCleanup) => {
          const cleanup = (() => {
            ensure.value();
          })();
          if (typeof cleanup === "function") onCleanup(cleanup);
        },
        { immediate: true, flush: "post" },
      ),
    );
    onMounted(() =>
      watch(
        [() => highlight.value, () => clearHighlight.value],
        (_value, _previous, onCleanup) => {
          const cleanup = (() => {
            if (highlight.value === null) return;
            const card = document.querySelector(`[data-plugin-package="${highlight.value}"]`);
            if (card !== null && typeof card.scrollIntoView === "function")
              card.scrollIntoView({ block: "center", behavior: "smooth" });
            const timer = setTimeout(clearHighlight.value, HIGHLIGHT_MS);
            return () => {
              clearTimeout(timer);
            };
          })();
          if (typeof cleanup === "function") onCleanup(cleanup);
        },
        { immediate: true, flush: "post" },
      ),
    );
    return () => {
      const packageNow = openPkg.value;
      return h(
        "section",
        {
          class: css.page,
          "data-plugin-panel": true,
          "aria-busy": state.value.status === "loading" || refreshing.value,
        },
        [
          showsMoreList.value
            ? h(
                "header",
                {
                  class: css.moreHead,
                  "data-window-drag": true,
                },
                [
                  h(
                    Button,
                    {
                      size: "sm",
                      className: css.moreBack ?? "",
                      "aria-label": t.value("backToList"),
                      onClick: () => {
                        setView.value({ kind: "list" });
                      },
                    },
                    {
                      default: () => [
                        h(IconChevronLeftOutlineMedium, {
                          size: 20,
                          "aria-hidden": "true",
                        }),
                      ],
                    },
                  ),
                  h(
                    "h1",
                    {
                      class: css.pageTitle,
                    },
                    [t.value("moreTitle")],
                  ),
                ],
              )
            : null,
          h(
            "div",
            {
              class: css.pageBody,
              "data-plugin-body": true,
            },
            [
              showsMainList.value
                ? h(
                    "div",
                    {
                      class: `${css.pageBar}${tabs.value.length > 0 ? ` ${css.pageBarWithTabs}` : ""}`,
                      "data-plugin-bar": true,
                      ref: setHeaderRef,
                    },
                    [
                      h(
                        "header",
                        {
                          class: css.pageHead,
                          "data-window-drag": true,
                        },
                        [
                          h(
                            "div",
                            {
                              class: css.pageHeading,
                            },
                            [
                              h(
                                "h1",
                                {
                                  class: css.pageTitle,
                                  "data-plugin-header-part": "title",
                                },
                                [t.value("title")],
                              ),
                              h(
                                "div",
                                {
                                  class: css.pageIntro,
                                  "data-plugin-header-part": "intro",
                                },
                                [
                                  h("span", null, [t.value("intro")]),
                                  h(
                                    Tooltip,
                                    {
                                      label: t.value("infoDescription"),
                                      side: "bottom",
                                      delayMs: 300,
                                      maxWidth: 300,
                                      portal: true,
                                      openOnClick: true,
                                    },
                                    {
                                      default: () => [
                                        h(
                                          Button,
                                          {
                                            variant: "ghost",
                                            size: "sm",
                                            className: css.infoButton ?? "",
                                            "aria-label": t.value("infoLabel"),
                                          },
                                          {
                                            default: () => [
                                              h(IconInfoOutlineRegular, {
                                                size: 11,
                                                "aria-hidden": "true",
                                              }),
                                            ],
                                          },
                                        ),
                                      ],
                                    },
                                  ),
                                ],
                              ),
                            ],
                          ),
                          h(
                            "div",
                            {
                              class: css.toolbar,
                              "data-plugin-toolbar": true,
                              "data-plugin-header-part": "toolbar",
                              hidden: !onInstalled.value,
                            },
                            [
                              updates.value === undefined
                                ? null
                                : h(
                                    "span",
                                    {
                                      class: css.updatesNote,
                                      "data-tone": updates.value.tone,
                                    },
                                    [updates.value.text],
                                  ),
                              h(
                                Tooltip,
                                {
                                  label: t.value("refresh"),
                                  delayMs: 500,
                                  focusDelayMs: 500,
                                  side: "bottom",
                                  portal: true,
                                  disabled: !loaded.value || refreshing.value,
                                },
                                {
                                  default: () => [
                                    h(
                                      Button,
                                      {
                                        variant: "outline",
                                        size: "sm",
                                        className: css.addButton ?? "",
                                        "aria-label": t.value("refresh"),
                                        "aria-busy": refreshing.value,
                                        disabled: !loaded.value || refreshing.value,
                                        onClick: () => {
                                          if (loaded.value && !refreshing.value) props.refresh();
                                        },
                                      },
                                      {
                                        default: () => [
                                          h(
                                            "span",
                                            {
                                              class: css.toolbarLabel,
                                            },
                                            [t.value("refresh")],
                                          ),
                                        ],
                                        icon: () =>
                                          refreshing.value
                                            ? h(StateDot, {
                                                state: "ongoing",
                                                size: 13,
                                              })
                                            : h(IconRefreshOutlineRegular, {
                                                size: 13,
                                              }),
                                      },
                                    ),
                                  ],
                                },
                              ),
                              state.value.install.requestId === undefined
                                ? h(AddPluginMenu, {
                                    t: t.value,
                                    disabled: !loaded.value,
                                    openInstall: props.openInstall,
                                    renderSlot: renderSlot.value,
                                  })
                                : h(
                                    Tooltip,
                                    {
                                      label: t.value("installViewTask"),
                                      side: "bottom",
                                      delayMs: 500,
                                      focusDelayMs: 500,
                                      portal: true,
                                      disabled: !loaded.value,
                                    },
                                    {
                                      default: () => [
                                        h(
                                          Button,
                                          {
                                            variant: "primary",
                                            size: "sm",
                                            className: css.addButton ?? "",
                                            "aria-label": t.value("installViewTask"),
                                            disabled: !loaded.value,
                                            onClick: props.openInstall,
                                          },
                                          {
                                            default: () => [
                                              h(
                                                "span",
                                                {
                                                  class: css.toolbarLabel,
                                                },
                                                [t.value("installViewTask")],
                                              ),
                                            ],
                                            icon: () =>
                                              h(IconPlusOutlineRegular, {
                                                size: 13,
                                              }),
                                          },
                                        ),
                                      ],
                                    },
                                  ),
                            ],
                          ),
                          tabs.value.length > 0
                            ? h(
                                "div",
                                {
                                  class: css.pageTabs,
                                  "data-plugin-header-part": "tabs",
                                },
                                [
                                  h(SegmentedTabs, {
                                    size: "sm",
                                    className: css.pageTabList ?? "",
                                    label: t.value("tabsLabel"),
                                    value: tab.value,
                                    onChange: (next) => {
                                      setTab.value(next);
                                    },
                                    items: [
                                      {
                                        value: INSTALLED_TAB,
                                        label: t.value("installedTab"),
                                        id: `${tabsId}-${INSTALLED_TAB}`,
                                        panelId: `${tabsId}-${INSTALLED_TAB}-panel`,
                                      },
                                      ...tabs.value.map((item) => ({
                                        value: item.id,
                                        label: item.label,
                                        id: `${tabsId}-${item.id}`,
                                        panelId: `${tabsId}-${item.id}-panel`,
                                      })),
                                    ],
                                  }),
                                ],
                              )
                            : null,
                        ],
                      ),
                    ],
                  )
                : null,
              !onInstalled.value
                ? h(
                    "div",
                    {
                      role: "tabpanel",
                      id: `${tabsId}-${tab.value}-panel`,
                      "aria-labelledby": `${tabsId}-${tab.value}`,
                      class: css.tabPanel,
                    },
                    [
                      renderSlot.value(
                        "plugins.tab",
                        {
                          install: props.installFrom,
                          update: props.openGitUpdate,
                          openPackage: (name) => {
                            const origin = tab.value;
                            setTab.value(INSTALLED_TAB);
                            setView.value({ kind: "package", name, returnTab: origin });
                          },
                        },
                        { only: tab.value },
                      ),
                    ],
                  )
                : null,
              installedCards.value && !loaded.value
                ? h(
                    "div",
                    {
                      class: css.installedPanel,
                      ...installedPanel.value,
                    },
                    [
                      state.value.status === "loading"
                        ? h(ListSkeleton, {
                            label: t.value("loading"),
                          })
                        : null,
                      state.value.status === "unavailable"
                        ? h(
                            "p",
                            {
                              class: `${css.status} ${css.statusWithDot}`,
                              role: "status",
                            },
                            [
                              h(StateDot, {
                                state: "idle",
                              }),
                              t.value("unavailable"),
                            ],
                          )
                        : null,
                    ],
                  )
                : null,
              state.value.notice === null || noticeLine.value === null
                ? null
                : h(Toast, {
                    key: state.value.notice.seq,
                    text: noticeLine.value,
                    icon: h(IconWarningOutlineRegular, null),
                    holdMs: toastHoldMs(noticeLine.value),
                    onDone: props.dismissNotice,
                  }),
              !showsCards.value && state.value.status === "error" && !refreshing.value
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
                          t.value(
                            state.value.refreshStatus === "failed" ? "refreshError" : "error",
                          ),
                        ],
                      ),
                      h(
                        Button,
                        {
                          variant: "outline",
                          size: "sm",
                          onClick: () => {
                            if (loaded.value && !refreshing.value) props.refresh();
                          },
                        },
                        {
                          default: () => [t.value("retry")],
                        },
                      ),
                    ],
                  )
                : null,
              onInstalled.value &&
              loaded.value &&
              packageNow !== undefined &&
              openRow.value !== undefined
                ? h(RowDetail, {
                    pkg: packageNow,
                    row: openRow.value,
                    form: formFor(openRow.value.rowId),
                    t: t.value,
                    resolveText: resolveText.value,
                    renderSlot: renderSlot.value,
                    onBack: () => {
                      setView.value({ kind: "package", name: packageNow.name, ...pkgOrigin.value });
                    },
                  })
                : null,
              onInstalled.value &&
              loaded.value &&
              packageNow !== undefined &&
              openRow.value === undefined
                ? h(PackageDetail, {
                    pkg: packageNow,
                    t: t.value,
                    resolveText: resolveText.value,
                    busy: packageBusy(packageNow),
                    rowBusy: (row) =>
                      row.entryId !== undefined && state.value.busy.includes(rowKey(row.entryId)),
                    configured: ledger.value.bundles.has(packageNow.name),
                    configure: configure(packageNow),
                    renderSlot: renderSlot.value,
                    inMore: backToMore.value,
                    detail: h(BundleDetailSection, {
                      name: packageNow.name,
                      version: packageNow.version,
                      fromNpm: packageNow.availability === "missing",
                      language: language.value,
                      details: bundleDetails.value,
                      t: t.value,
                      load: props.loadDetail,
                      retry: props.retryDetail,
                      image: props.detailImage,
                    }),
                    onBack: () => {
                      const origin = returnTab.value;
                      const more = backToMore.value;
                      setView.value({ kind: more ? "more" : "list" });
                      if (origin !== undefined) setTab.value(origin);
                    },
                    onSetEnabled: (enabled) => {
                      setBundleEnabled(packageNow.name, enabled);
                    },
                    onUninstall: () => {
                      props.uninstall(packageNow.name);
                    },
                    onUpdate: () => {
                      props.update(packageNow.name);
                    },
                    onSetRowEnabled: setRowEnabled,
                    versions: state.value.versions[packageNow.name],
                    onEnsureVersions: props.ensureVersions,
                    onCheckVersions: () => {
                      props.checkVersions(packageNow.name);
                    },
                    onUpdateVersion: (version) => {
                      props.openUpdate(packageNow.name, version);
                    },
                  })
                : null,
              onInstalled.value && loaded.value && openItem.value !== undefined
                ? h(ItemDetail, {
                    form: formFor(openItem.value.id),
                    item: openItem.value,
                    t: t.value,
                    renderSlot: renderSlot.value,
                    onBack: () => {
                      setView.value({ kind: "list" });
                    },
                  })
                : null,
              loaded.value && installedCards.value
                ? ledger.value.items.length === 0 &&
                  official.value.length === 0 &&
                  mine.value.length === 0 &&
                  state.value.status !== "error"
                  ? h(
                      "div",
                      {
                        class: css.installedPanel,
                        ...installedPanel.value,
                      },
                      [
                        h(
                          "p",
                          {
                            class: css.empty,
                          },
                          [t.value("empty")],
                        ),
                      ],
                    )
                  : h(
                      "div",
                      {
                        class: css.installedPanel,
                        ...installedPanel.value,
                      },
                      [
                        showsMoreList.value
                          ? h(
                              "section",
                              {
                                class: css.group,
                                "data-plugin-scope": "global",
                                "data-plugin-group": "more",
                              },
                              [
                                h(
                                  "ul",
                                  {
                                    class: css.cards,
                                  },
                                  [more.value.map(packageCard)],
                                ),
                              ],
                            )
                          : h(Fragment, null, [
                              renderGroup(
                                "basic",
                                t.value("basicTitle"),
                                ledger.value.items.map(basicItemCard),
                              ),
                              renderGroup(
                                "extensions",
                                t.value("extensionsTitle"),
                                extensions.value.map(packageCard),
                              ),
                              renderGroup(
                                "bundles",
                                t.value("bundlesTitle"),
                                mine.value.map(packageCard),
                              ),
                            ]),
                        state.value.status === "error" && !refreshing.value
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
                                    t.value(
                                      state.value.refreshStatus === "failed"
                                        ? "refreshError"
                                        : "error",
                                    ),
                                  ],
                                ),
                                h(
                                  Button,
                                  {
                                    variant: "outline",
                                    size: "sm",
                                    onClick: () => {
                                      if (loaded.value && !refreshing.value) props.refresh();
                                    },
                                  },
                                  {
                                    default: () => [t.value("retry")],
                                  },
                                ),
                              ],
                            )
                          : null,
                      ],
                    )
                : null,
              onInstalled.value && activated.value !== undefined && !state.value.install.open
                ? renderSlot.value(
                    "plugins.bundle.activation",
                    {
                      packageName: activated.value.name,
                      onDismiss: () => {
                        setActivation(null);
                      },
                      onOpenDetails: () => {
                        const name = activated.value?.name;
                        if (name === undefined) return;
                        setActivation(null);
                        setView.value({
                          kind: "package",
                          name,
                          ...(showsMoreList.value ? { from: "more" } : {}),
                        });
                      },
                    },
                    { entryKey: activated.value.name },
                  )
                : null,
            ],
          ),
          state.value.update === null
            ? null
            : h(UpdateDialog, {
                update: state.value.update,
                title:
                  updatePkg.value === undefined
                    ? state.value.update.packageName
                    : packageText(updatePkg.value, resolveText.value).title,
                t: t.value,
                onRun: props.runUpdate,
                onClose: props.closeUpdate,
                onToggleOutput: props.toggleUpdateOutput,
              }),
          h(InstallDialog, {
            install: state.value.install,
            t: t.value,
            onClose: props.closeInstall,
            onEditSpec: props.editInstallSpec,
            onRun: props.runInstall,
            onCancel: props.cancelInstall,
            onReconcile: props.reconcileInstall,
            onToggleDetails: props.toggleInstallDetails,
            onEnableNow: () => {
              setActivation(state.value.install.installed);
              props.enableInstalled();
            },
            onApproveBuilds: props.approveBuildsAndRetry,
            onToggleRegistry: props.toggleRegistryOptions,
            onChooseRegistry: props.chooseRegistry,
            onChangeRegistry: props.changeRegistry,
            onUseGithubMirror: props.useGithubMirror,
          }),
          state.value.confirm === null
            ? null
            : h(ConfirmDialog, {
                name: packageText(
                  state.value.packages.find(
                    (pkg) => pkg.name === state.value.confirm?.packageName,
                  ) ?? { name: state.value.confirm.packageName },
                  resolveText.value,
                ).title,
                t: t.value,
                onConfirm: props.confirm,
                onCancel: props.cancelConfirm,
              }),
        ],
      );
    };
  },
  {
    props: [
      "t",
      "ensure",
      "renderSlot",
      "resolveText",
      "useConfigurations",
      "configForm",
      "usePluginManager",
      "useConfigLedger",
      "useStore",
      "actions",
      "usePluginTabs",
      "useBundleDetails",
      "useLocale",
      "createHeaderRef",
      "clearHighlight",
      "setEnabled",
      "setRowEnabled",
      "refresh",
      "openInstall",
      "installFrom",
      "openGitUpdate",
      "dismissNotice",
      "loadDetail",
      "retryDetail",
      "detailImage",
      "uninstall",
      "update",
      "ensureVersions",
      "checkVersions",
      "openUpdate",
      "runUpdate",
      "closeUpdate",
      "toggleUpdateOutput",
      "closeInstall",
      "editInstallSpec",
      "runInstall",
      "cancelInstall",
      "reconcileInstall",
      "toggleInstallDetails",
      "enableInstalled",
      "approveBuildsAndRetry",
      "toggleRegistryOptions",
      "chooseRegistry",
      "changeRegistry",
      "useGithubMirror",
      "confirm",
      "cancelConfirm",
    ],
    inheritAttrs: false,
  },
);

RowSwitch.inheritAttrs = false;

MetadataError.inheritAttrs = false;

RuntimeError.inheritAttrs = false;

SourceSection.inheritAttrs = false;

EnableSwitch.inheritAttrs = false;

StatusTag.inheritAttrs = false;

ListSkeleton.inheritAttrs = false;

DetailTop.inheritAttrs = false;

PackageCard.inheritAttrs = false;

ItemCard.inheritAttrs = false;

ItemDetail.inheritAttrs = false;

RowDetail.inheritAttrs = false;

PackageDetail.inheritAttrs = false;

SubjectBlock.inheritAttrs = false;

SubjectCard.inheritAttrs = false;

ConfirmDialog.inheritAttrs = false;
