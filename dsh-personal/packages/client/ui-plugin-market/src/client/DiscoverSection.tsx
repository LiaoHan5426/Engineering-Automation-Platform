/** Discover: search one plugin market index, read an entry's page, and install or update a version. */
import {
  h,
  Fragment,
  shallowRef,
  defineComponent,
  watch,
  normalizeClass,
  type VNodeChild,
} from "vue";
import {
  Button,
  IconChevronDownOutlineRegular,
  IconPlusOutlineRegular,
  IconRefreshOutlineRegular,
  IconSearchOutlineRegular,
  IconSlidersTwoOutlineRegular,
  IconTrashOutlineRegular,
  IconWarningOutlineRegular,
  Input,
  Menu,
  Modal,
  Pill,
  PluginArtworkDefault,
  StateDot,
  Tag,
  Tooltip,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type { InjectFace, PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import type {
  MarketCompatibility,
  MarketListingEntry,
  MarketListingVersion,
  MarketSearchResult,
  MarketSort,
} from "@deepseek-ai/dsh-api-remotes/client";
import type {
  DiscoverFace,
  DiscoverState,
  ListingFailure,
  ListingState,
  SourceFailure,
} from "./market-store.ts";
import {
  displayDeclarations,
  indexLabel,
  presentedVersion,
  sourceFacts,
  withText,
  type DiscoverQuery,
  type DisplayDeclaration,
  type SourceFact,
} from "./presentation.ts";
import { PluginDetailSection } from "./PluginDetailSection.tsx";
import css from "./DiscoverSection.module.css";
/** Props of the Discover tab. */
export type DiscoverSectionProps = PropsRuntime<"plugins.tab"> &
  PropsLocale<"pluginMarket"> &
  InjectFace<DiscoverFace>;
type Translate = DiscoverSectionProps["t"];
/** The injected actions, without the reactive sources the renderer binds as hooks. */
type DiscoverActions = Omit<DiscoverFace, "hooks">;
/** Typing pause before the query text is sent. */
const TEXT_DELAY_MS = 250;
/** Artwork size inside the 48px icon frame, as on the Installed tab. */
const ICON = 36;
const FAILURE_KEYS = {
  fetch: "readFailed",
  invalid: "readInvalid",
  changed: "readChanged",
} as const satisfies Record<ListingFailure, string>;
const FACT_KEYS = {
  package: "factPackage",
  registry: "factRegistry",
  repository: "factRepository",
  commit: "factCommit",
  directory: "factDirectory",
} as const satisfies Record<SourceFact["kind"], string>;
const MarketIcon = defineComponent(
  (props: { readonly src: string | undefined; readonly size: number }) => {
    const failedRef = shallowRef<string>();
    const setFailed = (value: string | undefined) => {
      failedRef.value = value;
    };
    return () => {
      const { src, size } = props;
      const failed = failedRef.value;
      return src === undefined || src === failed
        ? h(PluginArtworkDefault, { size: size })
        : h("img", {
            class: css.image,
            src: src,
            width: size,
            height: size,
            alt: "",
            loading: "lazy",
            referrerPolicy: "no-referrer",
            onError: () => {
              setFailed(src);
            },
          });
    };
  },
  { inheritAttrs: false, props: ["src", "size"] },
);
function sourceFailureText(failure: SourceFailure, t: Translate): string {
  switch (failure.kind) {
    case "invalid":
      return t("sourceInvalid");
    case "duplicate":
      return t("sourceDuplicate");
    case "unavailable":
      return t("sourceUnavailable");
    case "other":
      return t("sourceFailed");
  }
}
function entryTitle(entry: MarketListingEntry, face: DiscoverActions): string {
  return entry.title === undefined ? entry.name : face.resolveText(entry.title);
}
/** A version chosen for installation, with the entry it belongs to. */
interface InstallChoice {
  readonly entry: MarketListingEntry;
  readonly version: MarketListingVersion;
}
/** Whether installation accepts a version: compatible, or covered by an exemption. */
function installable(compatibility: MarketCompatibility): boolean {
  return compatibility.compatible || compatibility.exempted;
}
/** Whether a version carries a SemVer prerelease suffix. */
function prerelease(version: string): boolean {
  return version.split("+")[0]?.includes("-") === true;
}
/** The version Update offers for an entry: the presented one when it updates the installed copy, else the newest stable update. */
function updateTarget(entry: MarketListingEntry): MarketListingVersion | undefined {
  const updates = (version: MarketListingVersion): boolean =>
    version.update && installable(version.compatibility);
  const presented = presentedVersion(entry);
  return updates(presented)
    ? presented
    : entry.versions.find((version) => updates(version) && !prerelease(version.version));
}
function formatDate(timestamp: number, language: string, style: "medium" | "long"): string {
  return new Intl.DateTimeFormat(language, { dateStyle: style }).format(new Date(timestamp * 1000));
}
/** What an entry's card and page do for its actions: install or update a version, or open the installed bundle. */
interface EntryCallbacks {
  readonly onInstall: (version: MarketListingVersion) => void;
  readonly onUpdate: (version: MarketListingVersion) => void;
  readonly onOpenInstalled: () => void;
}
/** The one action an entry offers in its current state; Install chooses its default version, and Update its update target. */
function EntryAction({
  entry,
  title,
  t,
  onInstall,
  onUpdate,
  onOpenInstalled,
}: {
  readonly entry: MarketListingEntry;
  readonly title: string;
  readonly t: Translate;
} & EntryCallbacks): VNodeChild {
  const { status } = entry.installation;
  const target = updateTarget(entry);
  if (target !== undefined) {
    return h(
      Button,
      {
        variant: "outline",
        size: "sm",
        "aria-label": t("updateTitle", { name: title, version: target.version }),
        onClick: () => {
          onUpdate(target);
        },
      },
      {
        default: () => t("update"),
      },
    );
  }
  const version = presentedVersion(entry);
  if (status !== "not-installed") {
    return h(
      Button,
      {
        variant: "ghost",
        size: "sm",
        "aria-label": t("openInstalled", { name: title }),
        onClick: onOpenInstalled,
      },
      {
        default: () =>
          t(
            status === "update-available"
              ? "statusUpdate"
              : status === "provided"
                ? "statusProvided"
                : "statusInstalled",
          ),
      },
    );
  }
  if (!version.compatibility.compatible && !version.compatibility.exempted) {
    return h(
      Tooltip,
      {
        label: t("noCompatibleVersion", { runtime: version.compatibility.runtimeVersion }),
        side: "bottom",
        portal: true,
        delayMs: 300,
      },
      {
        default: () =>
          h(
            Button,
            {
              variant: "outline",
              size: "sm",
              className: normalizeClass(css.blocked),
              "aria-disabled": "true",
              "aria-label": t("installTitle", { name: title }),
            },
            {
              default: () => t("install"),
            },
          ),
      },
    );
  }
  return h(
    Button,
    {
      variant: "outline",
      size: "sm",
      "aria-label": t("installTitle", { name: title }),
      onClick: () => {
        onInstall(version);
      },
    },
    {
      default: () => t("install"),
    },
  );
}
function EntryCard({
  entry,
  t,
  face,
  language,
  labels,
  onOpen,
  onInstall,
  onUpdate,
  onOpenInstalled,
}: {
  readonly entry: MarketListingEntry;
  readonly t: Translate;
  readonly face: DiscoverActions;
  readonly language: string;
  readonly labels: readonly DisplayDeclaration<unknown>[];
  readonly onOpen: () => void;
} & EntryCallbacks): VNodeChild {
  const title = entryTitle(entry, face);
  const version = presentedVersion(entry);
  const date = formatDate(version.publishTimestamp, language, "medium");
  return h("li", { class: css.card, "data-market-entry": entry.name }, [
    h(
      "span",
      { class: css.icon, "aria-hidden": "true" },
      h(MarketIcon, { src: entry.icon, size: ICON }),
    ),
    h("div", { class: css.main }, [
      h("div", { class: css.titleRow }, [
        h(
          "button",
          {
            type: "button",
            class: css.cardOpen,
            "aria-label": t("openEntry", { name: title }),
            onClick: onOpen,
          },
          title,
        ),
        labels
          .filter((label) => entry.metadata.labels.includes(label.id))
          .map((label) =>
            h(
              Tag,
              { key: label.id },
              {
                default: () => label.title,
              },
            ),
          ),
      ]),
      entry.description === undefined
        ? null
        : h("span", { class: css.description }, face.resolveText(entry.description)),
      h(
        "span",
        { class: css.meta },
        entry.author === undefined
          ? t("entryMeta", { version: version.version, date })
          : t("entryMetaAuthor", { version: version.version, author: entry.author, date }),
      ),
    ]),
    h(
      "div",
      { class: css.cardEnd },
      h(EntryAction, {
        entry: entry,
        title: title,
        t: t,
        onInstall: onInstall,
        onUpdate: onUpdate,
        onOpenInstalled: onOpenInstalled,
      }),
    ),
  ]);
}
/** One row of the version list: its state tags, and Update for a newer Git version of a Git copy or Install while nothing is installed. */
function VersionRow({
  entry,
  version,
  title,
  t,
  language,
  onInstall,
  onUpdate,
}: {
  readonly entry: MarketListingEntry;
  readonly version: MarketListingVersion;
  readonly title: string;
  readonly t: Translate;
  readonly language: string;
  readonly onInstall: (version: MarketListingVersion) => void;
  readonly onUpdate: (version: MarketListingVersion) => void;
}): VNodeChild {
  const current = entry.installation.installedVersion === version.version;
  const { compatibility } = version;
  const accepted = installable(compatibility);
  return h("li", { class: css.versionRow, "data-market-version": version.version }, [
    h("div", { class: css.main }, [
      h("div", { class: css.titleRow }, [
        h("span", { class: css.strong }, version.version),
        version.version === entry.defaultVersion
          ? h(
              Tag,
              { tone: "info" },
              {
                default: () => t("versionDefault"),
              },
            )
          : null,
        prerelease(version.version)
          ? h(
              Tag,
              { tone: "neutral" },
              {
                default: () => t("versionPrerelease"),
              },
            )
          : null,
        current
          ? h(
              Tag,
              { tone: "success" },
              {
                default: () => t("versionInstalled"),
              },
            )
          : null,
        compatibility.compatible
          ? null
          : h(
              Tag,
              { tone: "warning" },
              {
                default: () =>
                  t(compatibility.exempted ? "versionExempted" : "versionIncompatible"),
              },
            ),
      ]),
      h(
        "span",
        { class: css.meta },
        compatibility.compatible
          ? formatDate(version.publishTimestamp, language, "medium")
          : compatibility.exempted
            ? t("exempted")
            : t("incompatible", {
                runtime: compatibility.runtimeVersion,
                range: Object.values(compatibility.requirements).join(" "),
              }),
      ),
    ]),
    accepted && version.update
      ? h(
          Button,
          {
            variant: "ghost",
            size: "sm",
            "aria-label": t("updateTitle", { name: title, version: version.version }),
            onClick: () => {
              onUpdate(version);
            },
          },
          {
            default: () => t("update"),
          },
        )
      : null,
    accepted && entry.installation.status === "not-installed"
      ? h(
          Button,
          {
            variant: "ghost",
            size: "sm",
            "aria-label": t("installVersionTitle", { name: title, version: version.version }),
            onClick: () => {
              onInstall(version);
            },
          },
          {
            default: () => t("install"),
          },
        )
      : null,
  ]);
}
function EntryDetail({
  entry,
  listing,
  t,
  face,
  hooks,
  language,
  onBack,
  onInstall,
  onUpdate,
  onOpenInstalled,
}: {
  readonly entry: MarketListingEntry;
  readonly listing: MarketSearchResult;
  readonly t: Translate;
  readonly face: DiscoverActions;
  /** The detail section's bound hooks. */
  readonly hooks: Pick<DiscoverSectionProps, "useDetails" | "useLocale">;
  readonly language: string;
  readonly onBack: () => void;
} & EntryCallbacks): VNodeChild {
  const title = entryTitle(entry, face);
  const version = presentedVersion(entry);
  const date = formatDate(version.publishTimestamp, language, "long");
  const categoryId = entry.metadata.category;
  const category = categoryId === undefined ? undefined : listing.metadata.categories[categoryId];
  const labels = displayDeclarations(listing.metadata.labels, face.resolveText, language).filter(
    (label) => entry.metadata.labels.includes(label.id),
  );
  const { compatibility } = version;
  return h("div", { class: css.detail, "data-market-detail": entry.name }, [
    h("button", { type: "button", class: css.crumb, onClick: onBack }, [
      h(IconChevronDownOutlineRegular, {
        className: normalizeClass(css.crumbIcon),
        "aria-hidden": "true",
      }),
      h("span", null, t("backToList")),
    ]),
    h("div", { class: css.detailHead }, [
      h(
        "span",
        { class: css.icon, "aria-hidden": "true" },
        h(MarketIcon, { src: entry.icon, size: ICON }),
      ),
      h("div", { class: css.main }, [
        h("div", { class: css.titleRow }, [
          h("h3", { class: css.detailTitle }, title),
          h(
            Tag,
            { tone: "neutral" },
            {
              default: () => version.version,
            },
          ),
        ]),
        title === entry.name ? null : h("span", { class: css.meta }, entry.name),
      ]),
      h(EntryAction, {
        entry: entry,
        title: title,
        t: t,
        onInstall: onInstall,
        onUpdate: onUpdate,
        onOpenInstalled: onOpenInstalled,
      }),
    ]),
    entry.description === undefined
      ? null
      : h("p", { class: css.detailDescription }, face.resolveText(entry.description)),
    compatibility.compatible
      ? null
      : h("p", { class: css.notice, role: "note" }, [
          h(IconWarningOutlineRegular, { size: 14, "aria-hidden": "true" }),
          h(
            "span",
            null,
            compatibility.exempted
              ? t("exempted")
              : t("incompatible", {
                  runtime: compatibility.runtimeVersion,
                  range: Object.values(compatibility.requirements).join(" "),
                }),
          ),
        ]),
    h(
      "div",
      { class: css.detailDocument },
      h(PluginDetailSection, {
        request: {
          url: listing.url,
          name: entry.name,
          version: version.version,
          npm: version.source.type === "npm",
        },
        t: t,
        loadDetail: face.loadDetail,
        retryDetail: face.retryDetail,
        detailImage: face.detailImage,
        useDetails: hooks.useDetails,
        useLocale: hooks.useLocale,
      }),
    ),
    h("section", { class: css.detailSection }, [
      h("h4", { class: css.sectionTitle }, t("versionsTitle")),
      h(
        "ul",
        { class: css.versions, "aria-label": t("versionsLabel", { name: title }) },
        entry.versions.map((item) =>
          h(VersionRow, {
            key: item.version,
            entry: entry,
            version: item,
            title: title,
            t: t,
            language: language,
            onInstall: onInstall,
            onUpdate: onUpdate,
          }),
        ),
      ),
    ]),
    h("section", { class: css.detailSection }, [
      h("h4", { class: css.sectionTitle }, t("factSource")),
      h("dl", { class: css.facts }, [
        entry.author === undefined
          ? null
          : h("div", null, [h("dt", null, t("factAuthor")), h("dd", null, entry.author)]),
        entry.homepage === undefined
          ? null
          : h("div", null, [
              h("dt", null, t("factHomepage")),
              h(
                "dd",
                null,
                h(
                  "a",
                  {
                    class: css.link,
                    href: entry.homepage,
                    target: "_blank",
                    rel: "noopener noreferrer",
                  },
                  entry.homepage,
                ),
              ),
            ]),
        entry.repository === undefined
          ? null
          : h("div", null, [
              h("dt", null, t("factSourceCode")),
              h("dd", null, [
                h(
                  "a",
                  {
                    class: css.link,
                    href: entry.repository.url,
                    target: "_blank",
                    rel: "noopener noreferrer",
                  },
                  entry.repository.url,
                ),
                entry.repository.directory === undefined
                  ? null
                  : h(Fragment, null, [" ", h("code", null, entry.repository.directory)]),
              ]),
            ]),
        sourceFacts(entry.name, version).map((fact) =>
          h("div", { key: fact.kind }, [
            h("dt", null, t(FACT_KEYS[fact.kind])),
            h("dd", null, h("code", null, fact.value)),
          ]),
        ),
        h("div", null, [h("dt", null, t("factPublished")), h("dd", null, date)]),
        category === undefined
          ? null
          : h("div", null, [
              h("dt", null, t("factCategory")),
              h("dd", null, face.resolveText(category.title)),
            ]),
        labels.length === 0
          ? null
          : h("div", null, [
              h("dt", null, t("factLabels")),
              h(
                "dd",
                { class: css.tags },
                labels.map((label) =>
                  h(
                    Tag,
                    { key: label.id },
                    {
                      default: () => label.title,
                    },
                  ),
                ),
              ),
            ]),
        h("div", null, [
          h("dt", null, t("factMarket")),
          h("dd", null, face.resolveText(listing.title)),
        ]),
      ]),
    ]),
  ]);
}
function SourcesDialog({
  state,
  t,
  face,
}: {
  readonly state: DiscoverState;
  readonly t: Translate;
  readonly face: DiscoverActions;
}): VNodeChild {
  return h(
    Modal,
    {
      open: state.editing,
      onClose: face.toggleSources,
      title: t("sourcesTitle"),
      closeLabel: t("close"),
      description: t("sourcesDescription"),
      className: normalizeClass(css.dialog),
    },
    {
      default: () =>
        h("div", { class: css.dialogBody }, [
          state.indexes.length === 0
            ? null
            : h(
                "ul",
                { class: css.sourceList, "aria-label": t("sourcesLabel") },
                state.indexes.map((index) =>
                  h("li", { key: index.url, class: css.sourceRow }, [
                    h("div", { class: css.main }, [
                      h("span", { class: css.strong }, indexLabel(index, face.resolveText)),
                      h("span", { class: css.meta }, index.url),
                      index.error === undefined
                        ? null
                        : h("span", { class: css.sourceError }, index.error),
                    ]),
                    h(
                      Tooltip,
                      { label: t("removeSource"), side: "bottom", portal: true, delayMs: 300 },
                      {
                        default: () =>
                          h(
                            Button,
                            {
                              variant: "ghost",
                              size: "sm",
                              "aria-label": t("removeSourceNamed", { url: index.url }),
                              disabled: state.saving,
                              onClick: () => {
                                face.removeSource(index.url);
                              },
                            },
                            {
                              icon: () => h(IconTrashOutlineRegular, { size: 13 }),
                            },
                          ),
                      },
                    ),
                  ]),
                ),
              ),
          h(
            "form",
            {
              class: css.sourceForm,
              onSubmit: (event) => {
                event.preventDefault();
                face.addSource();
              },
            },
            [
              h(Input, {
                className: normalizeClass(css.grow),
                value: state.draft,
                placeholder: t("sourcePlaceholder"),
                "aria-label": t("sourceUrl"),
                "aria-invalid": state.sourceFailure !== null,
                "data-modal-autofocus": true,
                onInput: (event: Event) => {
                  if (event.target instanceof HTMLInputElement) face.editDraft(event.target.value);
                },
              }),
              h(
                Button,
                {
                  type: "submit",
                  variant: "primary",
                  size: "sm",
                  disabled: state.saving || state.draft.trim() === "",
                },
                {
                  icon: () => h(IconPlusOutlineRegular, { size: 13 }),
                  default: () => t("addSource"),
                },
              ),
            ],
          ),
          state.sourceFailure === null
            ? null
            : h(
                "p",
                { class: css.error, role: "alert" },
                sourceFailureText(state.sourceFailure, t),
              ),
          h("p", { class: css.notice, role: "note" }, [
            h(IconWarningOutlineRegular, { size: 14, "aria-hidden": "true" }),
            h("span", null, t("sourcesTrust")),
          ]),
        ]),
    },
  );
}
function ConfirmDialog({
  choice,
  t,
  face,
  onCancel,
  onConfirm,
}: {
  readonly choice: InstallChoice | null;
  readonly t: Translate;
  readonly face: DiscoverActions;
  readonly onCancel: () => void;
  readonly onConfirm: (choice: InstallChoice) => void;
}): VNodeChild {
  if (choice === null) return null;
  const { entry, version } = choice;
  const title = entryTitle(entry, face);
  return h(
    Modal,
    {
      open: true,
      onClose: onCancel,
      title: t("confirmTitle", { name: title }),
      closeLabel: t("close"),
      className: normalizeClass(css.dialog),
    },
    {
      footer: () =>
        h(Fragment, null, [
          h(
            Button,
            { variant: "outline", onClick: onCancel },
            {
              default: () => t("cancel"),
            },
          ),
          h(
            Button,
            {
              variant: "primary",
              autoFocus: true,
              onClick: () => {
                onConfirm(choice);
              },
            },
            {
              default: () => t("install"),
            },
          ),
        ]),
      default: () =>
        h("div", { class: css.dialogBody }, [
          h("div", { class: css.confirmHead }, [
            h(
              "span",
              { class: css.icon, "aria-hidden": "true" },
              h(MarketIcon, { src: entry.icon, size: ICON }),
            ),
            h("div", { class: css.main }, [
              h("span", { class: css.strong }, title),
              h("span", { class: css.meta }, version.version),
            ]),
          ]),
          h("dl", { class: css.facts }, [
            entry.author === undefined
              ? null
              : h("div", null, [h("dt", null, t("factAuthor")), h("dd", null, entry.author)]),
            sourceFacts(entry.name, version).map((fact) =>
              h("div", { key: fact.kind }, [
                h("dt", null, t(FACT_KEYS[fact.kind])),
                h("dd", null, h("code", null, fact.value)),
              ]),
            ),
          ]),
          version.compatibility.compatible
            ? null
            : h("p", { class: css.notice, role: "note" }, [
                h(IconWarningOutlineRegular, { size: 14, "aria-hidden": "true" }),
                h("span", null, t("exempted")),
              ]),
          h("p", { class: css.notice, role: "note" }, [
            h(IconWarningOutlineRegular, { size: 14, "aria-hidden": "true" }),
            h("span", null, t("installTrust")),
          ]),
        ]),
    },
  );
}
function ListSkeleton({ label }: { readonly label: string }): VNodeChild {
  return h(
    "ul",
    { class: css.cards, role: "status", "aria-label": label, "aria-busy": "true" },
    [0, 1, 2, 3].map((index) =>
      h("li", { key: index, class: css.card, "aria-hidden": "true" }, [
        h("span", { class: `${css.icon} ${css.skeletonFill}` }),
        h("div", { class: css.main }, [
          h("span", { class: `${css.skeletonBar} ${css.skeletonTitle} ${css.skeletonFill}` }),
          h("span", { class: `${css.skeletonBar} ${css.skeletonDescription} ${css.skeletonFill}` }),
        ]),
      ]),
    ),
  );
}
/** The toolbar menu that is open; at most one is. */
type OpenMenu = "market" | "sort" | "filter" | null;
/** The sort menu id of a sort. */
function sortMenuId(sort: MarketSort): string {
  return sort.kind === "key" ? `key:${sort.id}` : sort.kind;
}
/** Whether a query selects every plugin of the index. */
function unfiltered(query: DiscoverQuery): boolean {
  return query.text.trim() === "" && query.category === null && query.labels.length === 0;
}
const Browser = defineComponent(
  (props: {
    readonly state: DiscoverState;
    readonly listing: ListingState;
    readonly t: Translate;
    readonly face: DiscoverActions;
    readonly hooks: Pick<DiscoverSectionProps, "useDetails" | "useLocale">;
    readonly language: string;
    readonly onInstall: (choice: InstallChoice) => void;
    readonly onUpdate: (choice: InstallChoice) => void;
    readonly openPackage: (name: string) => void;
  }) => {
    const textRef = shallowRef(props.listing.query.text);
    const menuRef = shallowRef<OpenMenu>(null);
    const openedRef = shallowRef<MarketListingEntry | null>(null);
    const setText = (value: string) => {
      textRef.value = value;
    };
    const setMenu = (value: OpenMenu) => {
      menuRef.value = value;
    };
    const setOpened = (value: MarketListingEntry | null) => {
      openedRef.value = value;
    };
    watch(
      () => [textRef.value, props.listing.query, props.face] as const,
      ([text, query, face], _old, onCleanup) => {
        if (text === query.text) return;
        const timer = setTimeout(() => {
          face.search(withText(query, text));
        }, TEXT_DELAY_MS);
        onCleanup(() => {
          clearTimeout(timer);
        });
      },
    );
    return () => {
      const { state, listing, t, face, hooks, language, onInstall, onUpdate, openPackage } = props;
      const { query, value } = listing;
      const text = textRef.value,
        menu = menuRef.value,
        opened = openedRef.value;
      const declarations = {
        categories:
          value === null
            ? []
            : displayDeclarations(value.metadata.categories, face.resolveText, language),
        labels:
          value === null
            ? []
            : displayDeclarations(value.metadata.labels, face.resolveText, language),
        sortKeys:
          value === null
            ? []
            : displayDeclarations(value.metadata.sortKeys, face.resolveText, language),
      };
      // A reload keeps the opened plugin current while its page is loaded.
      const openEntry =
        opened === null
          ? undefined
          : (value?.entries.find((entry) => entry.name === opened.name) ?? opened);
      if (openEntry !== undefined && value !== null) {
        return h(EntryDetail, {
          entry: openEntry,
          listing: value,
          t: t,
          face: face,
          hooks: hooks,
          language: language,
          onBack: () => {
            setOpened(null);
          },
          onInstall: (version) => {
            onInstall({ entry: openEntry, version });
          },
          onUpdate: (version) => {
            onUpdate({ entry: openEntry, version });
          },
          onOpenInstalled: () => {
            openPackage(openEntry.name);
          },
        });
      }
      const selected = state.indexes.find((index) => index.url === listing.url) ?? {
        url: listing.url,
      };
      const market = indexLabel(selected, face.resolveText);
      const { sort } = query;
      const sortOptions = [
        ...(query.text.trim() === "" ? [] : [{ id: "relevance", label: t("sortRelevance") }]),
        { id: "index", label: t("sortDefault") },
        { id: "published", label: t("sortPublished") },
        ...declarations.sortKeys.map((item) => ({ id: `key:${item.id}`, label: item.title })),
      ];
      // The Controller drops a sort key the index no longer declares, and relevance follows the text.
      const sortName = (
        sortOptions.find((option) => option.id === sortMenuId(sort)) as {
          label: string;
        }
      ).label;
      const directed = sort.kind === "published" || sort.kind === "key";
      const chooseSort = (id: string): void => {
        setMenu(null);
        if (id === "direction" && directed) {
          face.search({
            ...query,
            sort: { ...sort, direction: sort.direction === "asc" ? "desc" : "asc" },
          });
          return;
        }
        if (id === "index" || id === "relevance") {
          face.search({ ...query, sort: { kind: id } });
          return;
        }
        if (id === "published") {
          face.search({ ...query, sort: { kind: "published", direction: "desc" } });
          return;
        }
        const key = declarations.sortKeys.find((item) => `key:${item.id}` === id);
        /* v8 ignore next -- every other menu id names a declared sort key */
        if (key !== undefined)
          face.search({
            ...query,
            sort: { kind: "key", id: key.id, direction: key.declaration.order },
          });
      };
      const toggleMenu = (name: Exclude<OpenMenu, null>): void => {
        setMenu(menu === name ? null : name);
      };
      const busy = listing.status === "loading" && value !== null;
      return h(Fragment, null, [
        h("div", { class: css.toolbar, "data-discover-toolbar": true }, [
          h(
            Menu,
            {
              open: menu === "market",
              onClose: () => {
                setMenu(null);
              },
              portal: true,
              autoFocus: true,
              selectedId: listing.url,
              items: state.indexes.map((index) => ({
                id: index.url,
                label: indexLabel(index, face.resolveText),
              })),
              footer: [
                {
                  id: "manage",
                  label: t("manageSources"),
                  icon: h(IconSlidersTwoOutlineRegular, { size: 14 }),
                },
              ],
              onSelect: (id) => {
                setMenu(null);
                if (id === "manage") face.toggleSources();
                else face.select(id);
              },
            },
            {
              anchor: () =>
                h(
                  Button,
                  {
                    variant: "ghost",
                    size: "sm",
                    className: normalizeClass(css.marketButton),
                    "aria-haspopup": "menu",
                    "aria-expanded": menu === "market",
                    "aria-label": t("marketMenu", { market }),
                    onClick: () => {
                      toggleMenu("market");
                    },
                  },
                  {
                    default: () => [
                      h("span", { class: css.marketName }, market),
                      h(IconChevronDownOutlineRegular, { size: 12, "aria-hidden": "true" }),
                    ],
                  },
                ),
            },
          ),
          h(
            Input,
            {
              className: normalizeClass(css.search),
              type: "search",
              value: text,
              placeholder: t("search"),
              "aria-label": t("search"),
              onInput: (event: Event) => {
                if (event.target instanceof HTMLInputElement) setText(event.target.value);
              },
            },
            {
              icon: () => h(IconSearchOutlineRegular, { size: 14 }),
            },
          ),
          declarations.labels.length === 0
            ? null
            : h(
                Menu,
                {
                  open: menu === "filter",
                  onClose: () => {
                    setMenu(null);
                  },
                  portal: true,
                  autoFocus: true,
                  align: "end",
                  selectedIds: query.labels,
                  items: declarations.labels.map((item) => ({ id: item.id, label: item.title })),
                  onSelect: (id) => {
                    const labels = query.labels.includes(id)
                      ? query.labels.filter((label) => label !== id)
                      : [...query.labels, id];
                    face.search({ ...query, labels });
                  },
                },
                {
                  anchor: () =>
                    h(
                      Button,
                      {
                        variant: "ghost",
                        size: "sm",
                        "aria-haspopup": "menu",
                        "aria-expanded": menu === "filter",
                        onClick: () => {
                          toggleMenu("filter");
                        },
                      },
                      {
                        icon: () => h(IconSlidersTwoOutlineRegular, { size: 13 }),
                        default: () =>
                          query.labels.length === 0
                            ? t("filter")
                            : t("filterCount", { count: String(query.labels.length) }),
                      },
                    ),
                },
              ),
          h(
            Menu,
            {
              open: menu === "sort",
              onClose: () => {
                setMenu(null);
              },
              portal: true,
              autoFocus: true,
              align: "end",
              selectedId: sortMenuId(sort),
              items: sortOptions,
              ...(directed
                ? {
                    footer: [
                      {
                        id: "direction",
                        label: t(
                          sort.direction === "asc" ? "switchToDescending" : "switchToAscending",
                        ),
                      },
                    ],
                  }
                : {}),
              onSelect: chooseSort,
            },
            {
              anchor: () =>
                h(
                  Button,
                  {
                    variant: "ghost",
                    size: "sm",
                    "aria-haspopup": "menu",
                    "aria-expanded": menu === "sort",
                    onClick: () => {
                      toggleMenu("sort");
                    },
                  },
                  {
                    default: () => [
                      t("sortBy", { sort: sortName }),
                      h(IconChevronDownOutlineRegular, { size: 12, "aria-hidden": "true" }),
                    ],
                  },
                ),
            },
          ),
          h(
            Tooltip,
            { label: t("refresh"), side: "bottom", portal: true, delayMs: 500, focusDelayMs: 500 },
            {
              default: () =>
                h(
                  Button,
                  {
                    variant: "ghost",
                    size: "sm",
                    "aria-label": t("refresh"),
                    disabled: listing.status === "loading",
                    onClick: face.refresh,
                  },
                  {
                    icon: () =>
                      busy
                        ? h(StateDot, { state: "ongoing" })
                        : h(IconRefreshOutlineRegular, { size: 14 }),
                  },
                ),
            },
          ),
        ]),
        declarations.categories.length === 0
          ? null
          : h("div", { class: css.categories, role: "group", "aria-label": t("categoriesLabel") }, [
              h(
                Pill,
                {
                  active: query.category === null,
                  "aria-pressed": query.category === null,
                  onClick: () => {
                    face.search({ ...query, category: null });
                  },
                },
                {
                  default: () => t("allCategories"),
                },
              ),
              declarations.categories.map((item) =>
                h(
                  Pill,
                  {
                    key: item.id,
                    active: query.category === item.id,
                    "aria-pressed": query.category === item.id,
                    onClick: () => {
                      face.search({ ...query, category: item.id });
                    },
                  },
                  {
                    default: () => item.title,
                  },
                ),
              ),
            ]),
        listing.failure === null
          ? null
          : h("div", { class: css.failure }, [
              h("p", { class: css.error, role: "alert" }, [
                h(StateDot, { state: "error" }),
                t(FAILURE_KEYS[listing.failure]),
              ]),
              h(
                Button,
                { variant: "outline", size: "sm", onClick: face.retry },
                {
                  default: () => t("retry"),
                },
              ),
            ]),
        value === null
          ? listing.status === "loading"
            ? h(ListSkeleton, { label: t("loading") })
            : null
          : value.total === 0
            ? h(
                "p",
                { class: css.muted },
                t(unfiltered(listing.answered as DiscoverQuery) ? "emptyIndex" : "noMatches"),
              )
            : h(Fragment, null, [
                h(
                  "ul",
                  { class: css.cards, "aria-busy": busy },
                  value.entries.map((entry) =>
                    h(EntryCard, {
                      key: entry.name,
                      entry: entry,
                      t: t,
                      face: face,
                      language: language,
                      labels: declarations.labels,
                      onOpen: () => {
                        setOpened(entry);
                      },
                      onInstall: (version) => {
                        onInstall({ entry, version });
                      },
                      onUpdate: (version) => {
                        onUpdate({ entry, version });
                      },
                      onOpenInstalled: () => {
                        openPackage(entry.name);
                      },
                    }),
                  ),
                ),
                value.nextOffset === null
                  ? null
                  : h(
                      Button,
                      {
                        variant: "outline",
                        size: "sm",
                        className: normalizeClass(css.more),
                        disabled: listing.status !== "ready",
                        onClick: face.more,
                      },
                      {
                        default: () => t("showMore"),
                      },
                    ),
              ]),
      ]);
    };
  },
  {
    inheritAttrs: false,
    props: [
      "state",
      "listing",
      "t",
      "face",
      "hooks",
      "language",
      "onInstall",
      "onUpdate",
      "openPackage",
    ],
  },
);
/** Render the Discover tab of the Plugins page. */
export const DiscoverSection = defineComponent(
  (props: DiscoverSectionProps) => {
    const stateRef = props.useDiscover((value) => value);
    const languageRef = props.useLocale((value) => value.active);
    const confirmingRef = shallowRef<InstallChoice | null>(null);
    const setConfirming = (value: InstallChoice | null) => {
      confirmingRef.value = value;
    };
    props.ensure();
    return () => {
      const { t, install, update, openPackage } = props;
      const face: DiscoverActions = props;
      const state = stateRef.value;
      const language = languageRef.value;
      const confirming = confirmingRef.value;
      let body: VNodeChild;
      if (state.status === "idle" || state.status === "loading") {
        body = h(ListSkeleton, { label: t("loading") });
      } else if (state.status === "error") {
        body = h("div", { class: css.failure }, [
          h("p", { class: css.error, role: "alert" }, [
            h(StateDot, { state: "error" }),
            t("sourcesFailed"),
          ]),
          h(
            Button,
            { variant: "outline", size: "sm", onClick: props.reload },
            {
              default: () => t("retry"),
            },
          ),
        ]);
      } else if (state.listing === null) {
        body = h("div", { class: css.empty }, [
          h(PluginArtworkDefault, { size: 48 }),
          h("p", { class: css.emptyTitle }, t("emptyTitle")),
          h("p", { class: css.muted }, t("emptyDescription")),
          h(
            Button,
            { variant: "primary", size: "sm", onClick: props.toggleSources },
            {
              icon: () => h(IconPlusOutlineRegular, { size: 13 }),
              default: () => t("addFirstSource"),
            },
          ),
        ]);
      } else {
        body = h(Browser, {
          key: state.listing.url,
          state: state,
          listing: state.listing,
          t: t,
          face: face,
          hooks: { useDetails: props.useDetails, useLocale: props.useLocale },
          language: language,
          onInstall: (choice) => {
            setConfirming(choice);
          },
          onUpdate: ({ entry, version }) => {
            update({
              packageName: entry.name,
              version: version.version,
              spec: version.install.spec,
            });
          },
          openPackage: openPackage,
        });
      }
      return h("div", { class: css.section, "data-plugin-tab": "discover" }, [
        body,
        h(SourcesDialog, { state: state, t: t, face: face }),
        h(ConfirmDialog, {
          choice: confirming,
          t: t,
          face: face,
          onCancel: () => {
            setConfirming(null);
          },
          onConfirm: ({ entry, version }) => {
            setConfirming(null);
            install({
              ...version.install,
              title: entryTitle(entry, face),
              version: version.version,
            });
          },
        }),
      ]);
    };
  },
  {
    inheritAttrs: false,
    props: [
      "t",
      "useDiscover",
      "useLocale",
      "useDetails",
      "ensure",
      "install",
      "update",
      "openPackage",
      "reload",
      "toggleSources",
      "editDraft",
      "addSource",
      "removeSource",
      "resolveText",
      "select",
      "search",
      "refresh",
      "retry",
      "more",
      "loadDetail",
      "retryDetail",
      "detailImage",
    ],
  },
);
