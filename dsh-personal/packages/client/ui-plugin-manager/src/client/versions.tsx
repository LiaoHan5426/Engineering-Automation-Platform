import {
  VNodeChild,
  defineComponent,
  computed,
  shallowRef,
  watch,
  h,
  Fragment,
  onMounted,
} from "vue";
import type {
  IncompatiblePlugin,
  PluginUpdateResult,
  PluginUpdateStep,
  PluginVersion,
  PluginVersionList,
  Registry,
  RegistryAttempt,
} from "@deepseek-ai/dsh-api-remotes/client";
import {
  Button,
  Checkbox,
  IconCheckOutlineRegular,
  IconChevronDownOutlineRegular,
  IconChevronRightOutlineRegular,
  IconCloseOutlineRegular,
  IconDownloadOutlineRegular,
  IconRefreshOutlineRegular,
  IconWarningOutlineRegular,
  Modal,
  StateDot,
  Tag,
  Tooltip,
} from "@deepseek-ai/dsh-client-ui-primitives";
import {
  installable,
  updateCandidate,
  type PackageView,
  type UpdateSource,
  type UpdateState,
  type VersionCheck,
} from "./manager-store.ts";
import { managementText, registryText, restartText, type Translate } from "./presentation.ts";
import css from "./PluginManagerPage.module.css";
/** The tone of a summary or outcome glyph. */
type Tone = "info" | "success" | "warn" | "error" | "neutral";
/** Two digits of a date or time field. */
function pad(value: number): string {
  return String(value).padStart(2, "0");
}
/** A version's local publication day as `YYYY-MM-DD`, which reads the same in every UI language. */
function publishedDate(version: PluginVersion): string | undefined {
  if (version.publishedAt === undefined) return undefined;
  const day = new Date(version.publishedAt);
  return `${String(day.getFullYear())}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}
/** The local time of day a check arrived, as 24-hour `HH:MM`. */
function checkedTime(checkedAt: number): string {
  const time = new Date(checkedAt);
  return `${pad(time.getHours())}:${pad(time.getMinutes())}`;
}
/** The registry by name: npm's own and the mainland mirror by theirs, pnpm's own configuration as the default, any other by host. */
function registryName(registry: Registry, t: Translate): string {
  return registryText(registry, t, null).name;
}
/** Where an update installs from: the registry by name, or a pinned Git spec's repository as host and path. */
function sourceName(source: UpdateSource, t: Translate): string {
  if (source.kind === "registry") return registryName(source.registry, t);
  return source.spec
    .replace(/^git\+/i, "")
    .replace(/#.*$/s, "")
    .replace(/^[a-z]+:\/\//i, "")
    .replace(/\.git$/i, "");
}
/** The DSH requirements an incompatible version states, as one phrase: `engines.dsh` or DSH peer ranges. */
function peersText(incompatible: IncompatiblePlugin): string {
  return Object.entries(incompatible.requirements)
    .map(([name, range]) => `${name} ${range}`)
    .join(", ");
}
const PROBLEM_KEYS = {
  network: "versionsProblemNetwork",
  "not-found": "versionsProblemNotFound",
  unknown: "versionsProblemUnknown",
} as const;
function Glyph(
  {
    tone,
    children,
  }: {
    readonly tone: Tone;
    readonly children?: VNodeChild;
  },
  {
    slots,
  }: {
    slots: import("vue").Slots;
  },
): VNodeChild {
  return h(
    "span",
    {
      class: css.versionGlyph,
      "data-tone": tone,
      "aria-hidden": "true",
    },
    [children ?? slots.default?.()],
  );
}
/** The summary row's glyph, title, the line under it, and how many newer versions it unfolds into. */
interface Summary {
  tone: Tone;
  glyph: VNodeChild;
  title: string;
  sub?: string;
  newer: number;
}
function summaryOf(check: VersionCheck | undefined, t: Translate): Summary {
  if (check === undefined || check.phase === "checking") {
    return {
      tone: "neutral",
      glyph: h(StateDot, {
        state: "ongoing",
        size: 14,
      }),
      title: t("versionsChecking"),
      newer: 0,
    };
  }
  const { list } = check;
  if (list.status === "refused") {
    const failed = list.attempts.at(-1);
    return {
      tone: "error",
      glyph: h(IconCloseOutlineRegular, {
        size: 14,
      }),
      title: t(list.problem === "network" ? "versionsFailedNetwork" : "versionsFailedOther"),
      // A check the transport lost asked no registry the page knows of; its words stand alone.
      sub:
        failed?.problem === undefined
          ? list.reason
          : `${registryName(failed.registry, t)} ${t(PROBLEM_KEYS[failed.problem])}`,
      newer: 0,
    };
  }
  const candidate = updateCandidate(list);
  if (candidate !== undefined) {
    const date = publishedDate(candidate);
    return {
      tone: "info",
      glyph: h(IconDownloadOutlineRegular, {
        size: 14,
      }),
      title: t("versionsAvailable", { version: candidate.version }),
      ...(date === undefined ? {} : { sub: t("versionsPublished", { date }) }),
      newer: list.versions.length,
    };
  }
  if (list.versions.length === 0) {
    return {
      tone: "success",
      glyph: h(IconCheckOutlineRegular, {
        size: 14,
      }),
      title: t("versionsLatest"),
      sub: t("versionsCheckedAt", { time: checkedTime(check.checkedAt) }),
      newer: 0,
    };
  }
  const blocked = list.versions.find(
    (version) => !version.prerelease && version.incompatible !== undefined,
  )?.incompatible;
  return blocked === undefined
    ? {
        tone: "warn",
        glyph: h(IconWarningOutlineRegular, {
          size: 14,
        }),
        title: t("versionsNoneInstallable"),
        sub: t("versionsNoneInstallableDetail"),
        newer: list.versions.length,
      }
    : {
        tone: "warn",
        glyph: h(IconWarningOutlineRegular, {
          size: 14,
        }),
        title: t("versionsBlocked"),
        newer: list.versions.length,
        sub: t("versionsBlockedDetail", {
          version: blocked.version,
          peers: peersText(blocked),
          runtime: blocked.runtimeVersion,
        }),
      };
}
/** One version row: its number and tags, why it cannot or should not be installed, its date, and its update action. */
function VersionRow({
  version,
  installed,
  t,
  busy,
  onUpdate,
}: {
  readonly version:
    | PluginVersion
    | {
        readonly version: string;
        readonly installedRow: true;
      };
  readonly installed: string;
  readonly t: Translate;
  readonly busy: boolean;
  readonly onUpdate: (version: string) => void;
}): VNodeChild {
  if ("installedRow" in version) {
    return h(
      "li",
      {
        class: css.versionRow,
        "data-plugin-version": version.version,
      },
      [
        h(
          "div",
          {
            class: css.versionMain,
          },
          [
            h(
              "div",
              {
                class: css.versionTitle,
              },
              [
                h(
                  "span",
                  {
                    class: css.versionNumber,
                  },
                  [version.version],
                ),
                h(
                  Tag,
                  {
                    className: css.statusTag ?? "",
                    tone: "neutral",
                  },
                  {
                    default: () => [t("versionsInstalledTag")],
                  },
                ),
              ],
            ),
          ],
        ),
      ],
    );
  }
  const usable = installable(version);
  const note =
    version.incompatible !== undefined
      ? t("versionsNeedsDsh", { peers: peersText(version.incompatible) })
      : !version.bundle
        ? t("versionsNotBundle")
        : version.deprecated;
  const date = publishedDate(version);
  return h(
    "li",
    {
      class: css.versionRow,
      "data-plugin-version": version.version,
      ...(usable ? {} : { "data-blocked": "" }),
    },
    [
      h(
        "div",
        {
          class: css.versionMain,
        },
        [
          h(
            "div",
            {
              class: css.versionTitle,
            },
            [
              h(
                "span",
                {
                  class: css.versionNumber,
                },
                [version.version],
              ),
              version.tags.map((tag) =>
                h(
                  Tag,
                  {
                    key: tag,
                    className: css.statusTag ?? "",
                    tone: "outline",
                  },
                  {
                    default: () => [tag],
                  },
                ),
              ),
              version.prerelease
                ? h(
                    Tag,
                    {
                      className: css.statusTag ?? "",
                      tone: "outline",
                    },
                    {
                      default: () => [t("versionsPrereleaseTag")],
                    },
                  )
                : null,
              version.deprecated === undefined
                ? null
                : h(
                    Tag,
                    {
                      className: css.statusTag ?? "",
                      tone: "warning",
                    },
                    {
                      default: () => [t("versionsDeprecatedTag")],
                    },
                  ),
            ],
          ),
          note === undefined
            ? null
            : h(
                "span",
                {
                  class: css.versionNote,
                  "data-tone": usable && version.deprecated !== undefined ? "warn" : undefined,
                },
                [note],
              ),
        ],
      ),
      date === undefined
        ? null
        : h(
            "span",
            {
              class: css.versionDate,
            },
            [date],
          ),
      h(
        "span",
        {
          class: css.versionAction,
        },
        [
          usable && version.version !== installed
            ? h(
                Button,
                {
                  variant:
                    version.deprecated === undefined && !version.prerelease ? "outline" : "ghost",
                  size: "sm",
                  disabled: busy,
                  "aria-label": t("versionsUpdateLabel", { version: version.version }),
                  onClick: () => {
                    onUpdate(version.version);
                  },
                },
                {
                  default: () => [t("update")],
                },
              )
            : null,
        ],
      ),
    ],
  );
}
/** The registries a refused check asked, each with what it answered. */
function AttemptRows({
  attempts,
  t,
}: {
  readonly attempts: readonly RegistryAttempt[];
  readonly t: Translate;
}): VNodeChild {
  return h(
    "ul",
    {
      class: css.versionRows,
    },
    [
      attempts.map((attempt, index) =>
        h(
          "li",
          {
            key: `${String(attempt.registry)}:${String(index)}`,
            class: css.versionRow,
          },
          [
            h(
              "div",
              {
                class: css.versionMain,
              },
              [
                h(
                  "div",
                  {
                    class: css.versionTitle,
                  },
                  [
                    h(
                      "span",
                      {
                        class: css.versionNumber,
                      },
                      [registryName(attempt.registry, t)],
                    ),
                    h(
                      Tag,
                      {
                        className: css.statusTag ?? "",
                        tone: "outline",
                      },
                      {
                        default: () => [
                          t(index === 0 ? "versionsPrimaryTag" : "versionsFallbackTag"),
                        ],
                      },
                    ),
                    attempt.problem === undefined
                      ? null
                      : h(
                          Tag,
                          {
                            className: css.statusTag ?? "",
                            tone: "danger",
                          },
                          {
                            default: () => [t(PROBLEM_KEYS[attempt.problem!])],
                          },
                        ),
                  ],
                ),
                attempt.reason === undefined
                  ? null
                  : h(
                      "code",
                      {
                        class: css.versionLog,
                      },
                      [attempt.reason],
                    ),
              ],
            ),
          ],
        ),
      ),
    ],
  );
}
const VersionList = defineComponent(
  (props: {
    readonly list: Extract<
      PluginVersionList,
      {
        status: "listed";
      }
    >;
    readonly checkedAt: number;
    readonly t: Translate;
    readonly busy: boolean;
    readonly onUpdate: (version: string) => void;
  }) => {
    const list = computed(() => props.list);
    const checkedAt = computed(() => props.checkedAt);
    const t = computed(() => props.t);
    const busy = computed(() => props.busy);
    const onUpdate = computed(() => props.onUpdate);
    const prereleases = shallowRef(false);
    const setPrereleases = (
      next:
        | typeof prereleases.value
        | ((previous: typeof prereleases.value) => typeof prereleases.value),
    ) => {
      prereleases.value = typeof next === "function" ? next(prereleases.value) : next;
    };
    const shown = computed(() =>
      list.value.versions.filter((version) => prereleases.value || !version.prerelease),
    );
    const fallback = computed(() =>
      list.value.attempts.length > 1 ? list.value.attempts[0] : undefined,
    );
    return () =>
      h(
        "div",
        {
          class: css.versionBody,
        },
        [
          h(
            "ul",
            {
              class: css.versionRows,
            },
            [
              shown.value.map((version) =>
                h(VersionRow, {
                  key: version.version,
                  version: version,
                  installed: list.value.installed,
                  t: t.value,
                  busy: busy.value,
                  onUpdate: onUpdate.value,
                }),
              ),
              h(VersionRow, {
                version: { version: list.value.installed, installedRow: true },
                installed: list.value.installed,
                t: t.value,
                busy: busy.value,
                onUpdate: onUpdate.value,
              }),
            ],
          ),
          list.value.omitted > 0
            ? h(
                "p",
                {
                  class: css.versionNote,
                },
                [t.value("versionsOmitted", { count: String(list.value.omitted) })],
              )
            : null,
          h(
            "div",
            {
              class: css.versionMeta,
            },
            [
              h(
                "dl",
                {
                  class: css.versionFact,
                },
                [
                  h("dt", null, [t.value("versionsRegistry")]),
                  h("dd", null, [
                    registryName(list.value.registry, t.value),
                    fallback.value === undefined
                      ? null
                      : h(
                          Tooltip,
                          {
                            label: t.value("versionsFallbackHint", {
                              registry: registryName(fallback.value.registry, t.value),
                            }),
                            side: "top",
                            portal: true,
                          },
                          {
                            default: () => [
                              h(
                                "span",
                                {
                                  class: css.versionHint,
                                  tabIndex: 0,
                                },
                                [
                                  h(
                                    Tag,
                                    {
                                      className: css.statusTag ?? "",
                                      tone: "outline",
                                    },
                                    {
                                      default: () => [t.value("versionsFallbackTag")],
                                    },
                                  ),
                                ],
                              ),
                            ],
                          },
                        ),
                  ]),
                ],
              ),
              h(
                "dl",
                {
                  class: css.versionFact,
                },
                [
                  h("dt", null, [t.value("versionsCheckedAtLabel")]),
                  h("dd", null, [checkedTime(checkedAt.value)]),
                ],
              ),
              h("span", {
                class: css.versionSpacer,
              }),
              list.value.versions.some((version) => version.prerelease)
                ? h(Checkbox, {
                    checked: prereleases.value,
                    onChange: setPrereleases,
                    label: t.value("versionsShowPrerelease"),
                  })
                : null,
            ],
          ),
        ],
      );
  },
  {
    props: ["list", "checkedAt", "t", "busy", "onUpdate"],
    inheritAttrs: false,
  },
);
/**
 * The Versions section of a registry bundle's page. It checks once when the page opens and folds the newer versions
 * behind a summary row.
 */
export const VersionSection = defineComponent(
  (props: {
    readonly pkg: PackageView;
    readonly check: VersionCheck | undefined;
    readonly t: Translate;
    readonly busy: boolean;
    /** Check a package's versions unless a check already started. */
    readonly onEnsure: (packageName: string) => void;
    readonly onCheck: () => void;
    readonly onUpdate: (version: string) => void;
  }) => {
    const pkg = computed(() => props.pkg);
    const check = computed(() => props.check);
    const t = computed(() => props.t);
    const busy = computed(() => props.busy);
    const onEnsure = computed(() => props.onEnsure);
    const onCheck = computed(() => props.onCheck);
    const onUpdate = computed(() => props.onUpdate);
    const open = shallowRef(false);
    const setOpen = (
      next: typeof open.value | ((previous: typeof open.value) => typeof open.value),
    ) => {
      open.value = typeof next === "function" ? next(open.value) : next;
    };
    const projection1 = computed(() => pkg.value);
    const name = computed(() => projection1.value.name);
    const listsVersions = computed(() => pkg.value.update === "registry");
    const done = computed(() => (check.value?.phase === "done" ? check.value : undefined));
    const summary = computed(() => summaryOf(check.value, t.value));
    const refused = computed(() =>
      done.value?.list.status === "refused" ? done.value.list : undefined,
    );
    const listed = computed(() =>
      done.value?.list.status === "listed" ? done.value.list : undefined,
    );
    const unfolds = computed(
      () =>
        summary.value.newer > 0 ||
        (refused.value !== undefined && refused.value.attempts.length > 0),
    );
    const expanded = computed(() => open.value && unfolds.value);
    const text = computed(() =>
      h(
        "span",
        {
          class: css.versionSummaryText,
        },
        [
          h(
            "span",
            {
              class: css.versionSummaryTitle,
            },
            [summary.value.title],
          ),
          summary.value.sub === undefined
            ? null
            : h(
                "span",
                {
                  class: css.versionSummarySub,
                },
                [summary.value.sub],
              ),
        ],
      ),
    );
    onMounted(() =>
      watch(
        [() => name.value, () => listsVersions.value, () => onEnsure.value],
        (_value, _previous, onCleanup) => {
          const cleanup = (() => {
            if (listsVersions.value) onEnsure.value(name.value);
          })();
          if (typeof cleanup === "function") onCleanup(cleanup);
        },
        { immediate: true, flush: "post" },
      ),
    );
    return () => {
      if (!listsVersions.value) return null;
      return h(
        "section",
        {
          class: css.detailSection,
          "data-plugin-versions": true,
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
                [t.value("versionsTitle")],
              ),
              h("span", {
                class: css.versionSpacer,
              }),
              refused.value === undefined
                ? h(
                    Button,
                    {
                      variant: "ghost",
                      size: "sm",
                      disabled: check.value?.phase !== "done",
                      onClick: onCheck.value,
                    },
                    {
                      default: () => [t.value("versionsRecheck")],
                      icon: () =>
                        h(IconRefreshOutlineRegular, {
                          size: 13,
                        }),
                    },
                  )
                : null,
            ],
          ),
          h(
            "div",
            {
              class: css.versionPanel,
            },
            [
              listed.value !== undefined && summary.value.newer > 0
                ? h(
                    "button",
                    {
                      type: "button",
                      class: css.versionSummary,
                      "aria-expanded": expanded.value,
                      onClick: () => {
                        setOpen(!open.value);
                      },
                    },
                    [
                      h(
                        Glyph,
                        {
                          tone: summary.value.tone,
                        },
                        {
                          default: () => [summary.value.glyph],
                        },
                      ),
                      text.value,
                      h(
                        "span",
                        {
                          class: css.versionSummaryEnd,
                        },
                        [
                          expanded.value
                            ? t.value("versionsCollapse")
                            : t.value("versionsNewerCount", { count: String(summary.value.newer) }),
                          h(IconChevronDownOutlineRegular, {
                            className: css.detailsChevron ?? "",
                            "aria-hidden": "true",
                          }),
                        ],
                      ),
                    ],
                  )
                : h(
                    "div",
                    {
                      class: css.versionSummary,
                      role: "status",
                    },
                    [
                      h(
                        Glyph,
                        {
                          tone: summary.value.tone,
                        },
                        {
                          default: () => [summary.value.glyph],
                        },
                      ),
                      text.value,
                      refused.value === undefined
                        ? null
                        : h(
                            "span",
                            {
                              class: css.versionSummaryEnd,
                            },
                            [
                              unfolds.value
                                ? h(
                                    "button",
                                    {
                                      type: "button",
                                      class: css.detailsToggle,
                                      "aria-expanded": expanded.value,
                                      onClick: () => {
                                        setOpen(!open.value);
                                      },
                                    },
                                    [
                                      t.value("versionsDetails"),
                                      h(IconChevronDownOutlineRegular, {
                                        className: css.detailsChevron ?? "",
                                        "aria-hidden": "true",
                                      }),
                                    ],
                                  )
                                : null,
                              h(
                                Button,
                                {
                                  variant: "outline",
                                  size: "sm",
                                  onClick: onCheck.value,
                                },
                                {
                                  default: () => [t.value("retry")],
                                },
                              ),
                            ],
                          ),
                    ],
                  ),
              expanded.value && listed.value !== undefined && done.value !== undefined
                ? h(VersionList, {
                    list: listed.value,
                    checkedAt: done.value.checkedAt,
                    t: t.value,
                    busy: busy.value,
                    onUpdate: onUpdate.value,
                  })
                : null,
              expanded.value && refused.value !== undefined
                ? h(
                    "div",
                    {
                      class: css.versionBody,
                    },
                    [
                      h(AttemptRows, {
                        attempts: refused.value.attempts,
                        t: t.value,
                      }),
                    ],
                  )
                : null,
            ],
          ),
        ],
      );
    };
  },
  {
    props: ["pkg", "check", "t", "busy", "onEnsure", "onCheck", "onUpdate"],
    inheritAttrs: false,
  },
);
/** The step labels of an update; the Host announces each step as it starts. */
function stepLabel(step: PluginUpdateStep, update: UpdateState, t: Translate): string {
  switch (step) {
    case "checking":
      return t("updateStepChecking", { version: update.to });
    case "removing":
      return t("updateStepRemoving", { version: update.from });
    case "installing":
      return t("updateStepInstalling", {
        version: update.to,
        source: sourceName(update.source, t),
      });
    case "restoring":
      return t("updateStepRestoring", { version: update.from });
  }
}
/** Whether a change result left its operation undone. */
function failed(application: PluginUpdateResult["result"]["application"]): boolean {
  return application === "failed" || application === "cancelled";
}
/** The steps in the order the Host runs them. */
const STEP_ORDER: readonly PluginUpdateStep[] = ["checking", "removing", "installing", "restoring"];
/** The steps an answer implies, joined with the announced ones, so a lost announcement does not drop a step that ran. */
function settledSteps(
  announced: readonly PluginUpdateStep[],
  result: PluginUpdateResult,
): PluginUpdateStep[] {
  const implied = new Set<PluginUpdateStep>(["checking", ...announced]);
  if (result.step === "remove") implied.add("removing");
  if (result.step === "install") implied.add("installing");
  if (result.restore !== undefined) implied.add("restoring");
  return STEP_ORDER.filter((step) => implied.has(step));
}
/** How one step ended, or that it still runs. */
function stepState(
  step: PluginUpdateStep,
  update: UpdateState,
  last: boolean,
): "running" | "done" | "failed" | "unknown" {
  const result = update.result;
  if (update.phase === "running") return last ? "running" : "done";
  if (result === null) return last ? "unknown" : "done";
  switch (step) {
    case "checking":
      return result.step === "check" ? "failed" : "done";
    case "removing":
      return result.step === "remove" ? "failed" : "done";
    case "installing":
      return failed(result.result.application) ? "failed" : "done";
    case "restoring":
      return result.restore !== undefined && failed(result.restore.application) ? "failed" : "done";
  }
}
const STEP_GLYPHS = {
  running: h(StateDot, {
    state: "ongoing",
    size: 12,
  }),
  done: h(IconCheckOutlineRegular, {
    size: 12,
  }),
  failed: h(IconCloseOutlineRegular, {
    size: 12,
  }),
  unknown: null,
} as const;
/** What the update's outcome reads as: its glyph, title, and the sentence under it. */
function outcomeOf(
  update: UpdateState,
  title: string,
  t: Translate,
): Omit<Summary, "sub" | "newer"> & {
  detail: string;
} {
  const error = {
    tone: "error" as const,
    glyph: h(IconCloseOutlineRegular, {
      size: 14,
    }),
  };
  const result = update.result;
  // A finished update without the Host's answer carries the transport's words.
  if (result === null)
    return {
      ...error,
      title: t("updateLost"),
      detail: t("updateLostDetail", { reason: String(update.lost) }),
    };
  // A failed step always carries the Host's refusal; an absent one reads as the generic operation error.
  const reason = (change: PluginUpdateResult["result"]): string =>
    managementText({ code: "operation-error", ...change.error, installing: true }, t);
  if (result.step === "check")
    return {
      ...error,
      title: t("updateRefused", { version: update.to }),
      detail: reason(result.result),
    };
  if (result.step === "remove")
    return {
      ...error,
      title: t("updateRemoveFailed", { version: update.from }),
      detail: reason(result.result),
    };
  if (!failed(result.result.application)) {
    return result.result.application === "restart-required"
      ? {
          tone: "warn",
          glyph: h(IconWarningOutlineRegular, {
            size: 14,
          }),
          title: t("updateRestart", { version: update.to }),
          detail: restartText("restartNotice", result.result.restartReason, t),
        }
      : {
          tone: "success",
          glyph: h(IconCheckOutlineRegular, {
            size: 14,
          }),
          title: t("updateDone", { version: update.to }),
          detail: t("updateDoneDetail"),
        };
  }
  // Without a reinstallation nothing was removed: the installation went over the running version and was rolled back.
  if (result.restore === undefined) {
    return {
      ...error,
      title: t("updateKept", { version: update.to }),
      detail: t("updateKeptDetail", { from: update.from, reason: reason(result.result) }),
    };
  }
  return failed(result.restore.application)
    ? {
        ...error,
        title: t("updateBroken"),
        detail: t("updateBrokenDetail", { from: update.from, to: update.to, name: title }),
      }
    : {
        ...error,
        title: t("updateRestored", { version: update.from }),
        // A typed refusal says why the target failed; pnpm's own words stay behind the output toggle.
        detail: [
          t("updateRestoredDetail", { from: update.from, to: update.to }),
          ...(result.result.error === undefined || result.result.error.code === "operation-error"
            ? []
            : [reason(result.result)]),
        ].join(t("sentenceSeparator")),
      };
}
/** The update dialog: confirmation, then the Host's steps, then the outcome. */
export function UpdateDialog({
  update,
  title,
  t,
  onRun,
  onClose,
  onToggleOutput,
}: {
  readonly update: UpdateState;
  /** The package's display title. */
  readonly title: string;
  readonly t: Translate;
  readonly onRun: () => void;
  readonly onClose: () => void;
  readonly onToggleOutput: () => void;
}): VNodeChild {
  const running = update.phase === "running";
  const steps = update.result === null ? update.steps : settledSteps(update.steps, update.result);
  const outcome = update.phase === "done" ? outcomeOf(update, title, t) : undefined;
  // The failed run's own output: the target's installation, else the removal or the reinstallation.
  const output = [update.result?.result, update.result?.restore]
    .map((change) =>
      change !== undefined && failed(change.application) ? change.packageResult?.output : undefined,
    )
    .find((text) => text !== undefined && text !== "");
  return h(
    Modal,
    {
      open: true,
      onClose: () => {
        if (!running) onClose();
      },
      title: t("updateTitle", { name: title }),
      closeLabel: t("close"),
      className: css.updateDialog as string,
    },
    {
      default: () => [
        h(
          "div",
          {
            class: css.updateBody,
            "data-plugin-update": update.phase,
          },
          [
            update.phase === "confirm"
              ? h(Fragment, null, [
                  h(
                    "div",
                    {
                      class: css.updateVersions,
                    },
                    [
                      h(
                        "span",
                        {
                          class: css.versionNumber,
                          "data-old": "",
                        },
                        [update.from],
                      ),
                      h(IconChevronRightOutlineRegular, {
                        size: 14,
                        "aria-hidden": "true",
                      }),
                      h(
                        "span",
                        {
                          class: css.versionNumber,
                        },
                        [update.to],
                      ),
                    ],
                  ),
                  h(
                    "dl",
                    {
                      class: css.versionFact,
                    },
                    [
                      h("dt", null, [t("updateSource")]),
                      h("dd", null, [sourceName(update.source, t)]),
                    ],
                  ),
                  h(
                    "p",
                    {
                      class: css.updateText,
                    },
                    [t("updateDescription", { from: update.from, to: update.to })],
                  ),
                ])
              : h(Fragment, null, [
                  outcome === undefined
                    ? null
                    : h(
                        "div",
                        {
                          class: css.updateOutcome,
                          role: "status",
                        },
                        [
                          h(
                            Glyph,
                            {
                              tone: outcome.tone,
                            },
                            {
                              default: () => [outcome.glyph],
                            },
                          ),
                          h(
                            "span",
                            {
                              class: css.versionSummaryText,
                            },
                            [
                              h(
                                "span",
                                {
                                  class: css.versionSummaryTitle,
                                },
                                [outcome.title],
                              ),
                              h(
                                "span",
                                {
                                  class: css.versionSummarySub,
                                },
                                [outcome.detail],
                              ),
                            ],
                          ),
                        ],
                      ),
                  output === undefined
                    ? null
                    : h(Fragment, null, [
                        h(
                          "button",
                          {
                            type: "button",
                            class: css.detailsToggle,
                            "aria-expanded": update.outputOpen,
                            onClick: onToggleOutput,
                          },
                          [
                            t("updateOutput"),
                            h(IconChevronDownOutlineRegular, {
                              className: css.detailsChevron ?? "",
                              "aria-hidden": "true",
                            }),
                          ],
                        ),
                        update.outputOpen
                          ? h(
                              "pre",
                              {
                                class: css.updateOutput,
                              },
                              [output],
                            )
                          : null,
                      ]),
                  h(
                    "ol",
                    {
                      class: css.updateSteps,
                    },
                    [
                      steps.map((step, index) => {
                        const state = stepState(step, update, index === steps.length - 1);
                        return h(
                          "li",
                          {
                            key: step,
                            class: css.updateStep,
                            "data-state": state,
                          },
                          [
                            h(
                              "span",
                              {
                                class: css.updateStepDot,
                                "aria-hidden": "true",
                              },
                              [STEP_GLYPHS[state]],
                            ),
                            h("span", null, [stepLabel(step, update, t)]),
                          ],
                        );
                      }),
                    ],
                  ),
                ]),
          ],
        ),
      ],
      footer: () =>
        update.phase === "confirm"
          ? h(Fragment, null, [
              h(
                Button,
                {
                  variant: "outline",
                  onClick: onClose,
                },
                {
                  default: () => [t("cancel")],
                },
              ),
              h(
                Button,
                {
                  variant: "primary",
                  onClick: onRun,
                },
                {
                  default: () => [t("update")],
                },
              ),
            ])
          : running
            ? h(
                Button,
                {
                  variant: "outline",
                  disabled: true,
                },
                {
                  default: () => [t("updateRunning")],
                },
              )
            : h(
                Button,
                {
                  variant: "primary",
                  onClick: onClose,
                },
                {
                  default: () => [t("updateFinish")],
                },
              ),
    },
  );
}

Glyph.inheritAttrs = false;

VersionRow.inheritAttrs = false;

AttemptRows.inheritAttrs = false;

UpdateDialog.inheritAttrs = false;
