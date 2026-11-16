/** Searchable editable shortcut reference and its General Settings row. */
import {
  computed,
  defineComponent,
  Fragment,
  h,
  onScopeDispose,
  ref,
  shallowRef,
  watch,
} from "vue";
import type { ShortcutRevision } from "@deepseek-ai/dsh-client-shortcuts/protocol";
import {
  Button,
  IconCloseOutlineRegular,
  IconRefreshOutlineRegular,
  Modal,
  ShortcutKeys,
  Tooltip,
  Toast,
  focusWithoutRing,
  isBehindModal,
} from "@deepseek-ai/dsh-client-ui-primitives";
import { TextSearchIndex } from "@deepseek-ai/dsh-util-text-search";
import type { InjectFace, PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import type { ObservableSnapshot, PropsStore } from "@deepseek-ai/dsh-client-store";
import type {
  ShortcutCatalogEntry,
  ShortcutPlatform,
  Shortcuts,
} from "@deepseek-ai/dsh-client-shortcuts/client";
import { ShortcutEditor } from "./Editor.tsx";
import { ShortcutIcon } from "./Icons.tsx";
import { shortcutFailure, shortcutReadFailure } from "./feedback.ts";
import type { createShortcutsStore } from "./store.ts";
import css from "./Reference.module.css";

/** Catalog and device labels delivered through renderer-bound hooks. */
export interface ReferenceInjected {
  platform: ShortcutPlatform;
  runtime: Shortcuts["runtime"];
  edit: Shortcuts["edit"];
  recording: Shortcuts["recording"];
  describeBinding: Shortcuts["describeBinding"];
  hooks: {
    catalog: ObservableSnapshot<readonly ShortcutCatalogEntry[]>;
    config: Shortcuts["config"];
    fixedCatalog: Shortcuts["fixedCatalog"];
  };
}
type Store = PropsStore<ReturnType<typeof createShortcutsStore>>;
type Locale = PropsLocale<"shortcuts">;

/** Core reference positions are independent of labels and plugin registration order. */
const coreActionOrder = new Map<string, number>(
  [
    "shortcuts.open",
    "session.new",
    "sidebar.left.toggle",
    "session.search",
    "workspace.add",
    "session.rename",
    "session.fork",
    "session.archive",
    "settings.open",
    "fontSize.increase",
    "fontSize.decrease",
    "workspace.openLocal",
    "sidebar.right.toggle",
    "workspace.files",
    "browser.new",
    "terminal.new",
    "pane.split",
    "pane.fullscreen.toggle",
    "page.refresh",
    "page.close",
  ].map((id, index) => [id, index]),
);

/** General Settings shortcut reference action. */
export const ShortcutsRow = defineComponent(
  (
    props: Pick<
      PropsRuntime<"settings.general.item"> & Store & Locale & InjectFace<ReferenceInjected>,
      "actions" | "t" | "useCatalog"
    >,
  ) => {
    const shortcut = props.useCatalog((rows) => rows.find((row) => row.id === "shortcuts.open"));
    return () => {
      return h(
        "div",
        {
          class: css.setting,
        },
        [
          h(
            "div",
            {
              class: css.settingText,
            },
            [
              h(
                "div",
                {
                  class: css.settingTitle,
                },
                [props.t("settings")],
              ),
              h(
                "p",
                {
                  class: css.settingDescription,
                },
                [props.t("description")],
              ),
            ],
          ),
          h(
            Tooltip,
            {
              disabled: !shortcut.value?.keys.length,
              label: props.t("global-hint"),
              shortcutKeys: shortcut.value?.keys ?? [],
            },
            {
              default: () => [
                h(
                  "button",
                  {
                    class: css.button,
                    type: "button",
                    "aria-label": props.t("view"),
                    "aria-keyshortcuts": shortcut.value?.aria,
                    onClick: () => {
                      props.actions.open();
                    },
                  },
                  [props.t("view")],
                ),
              ],
            },
          ),
        ],
      );
    };
  },
  { name: "ShortcutsRow", inheritAttrs: false, props: ["actions", "t", "useCatalog"] },
);

/** Own the reference's editor, confirmation and notices while preserving its store. */
export const ShortcutReference = defineComponent(
  (
    props: Pick<
      PropsRuntime<"shell.overlay"> & Store & Locale & InjectFace<ReferenceInjected>,
      | "useStore"
      | "actions"
      | "useCatalog"
      | "useConfig"
      | "useFixedCatalog"
      | "platform"
      | "runtime"
      | "edit"
      | "recording"
      | "describeBinding"
      | "t"
    >,
  ) => {
    const state = props.useStore((value) => value);
    const open = computed(() => state.value.open);
    const query = computed(() => state.value.query);
    const focusRequest = computed(() => state.value.focusRequest);
    const catalog = props.useCatalog((value) => value);
    const config = props.useConfig((value) => value);
    const fixedCatalog = props.useFixedCatalog((value) => value);
    const target = shallowRef<ShortcutCatalogEntry | null>(null);
    const resetRevision = shallowRef<ShortcutRevision | null>(null);
    const busy = ref(false);
    const toast = shallowRef<{ text: string; error: boolean; seq: number } | null>(null);
    const search = shallowRef<HTMLInputElement | null>(null);
    let alive = true;
    onScopeDispose(() => {
      alive = false;
    });
    const dismissToast = () => {
      toast.value = null;
    };
    const notify = (text: string, error = false): void => {
      const previous = toast.value;
      if (error && previous?.error && previous.text === text) return;
      toast.value = { text, error, seq: (previous?.seq ?? 0) + 1 };
    };
    watch(
      [open, config, () => props.runtime, () => props.t],
      () => {
        if (open.value && config.value.status === "unreadable")
          notify(shortcutReadFailure(config.value, props.runtime, props.t), true);
      },
      { immediate: true },
    );
    const closeEditor = (): void => {
      target.value = null;
      const dialog = search.value?.closest<HTMLElement>('[role="dialog"]');
      if (dialog != null) focusWithoutRing(dialog, { preventScroll: true });
    };
    const closeReference = (): void => {
      if (busy.value) return;
      if (resetRevision.value !== null) resetRevision.value = null;
      else if (target.value !== null) closeEditor();
      else props.actions.close();
    };
    watch(
      open,
      (value) => {
        if (!value) resetRevision.value = null;
      },
      { immediate: true },
    );
    const persist: ReferenceInjected["edit"] = async (...args) => {
      busy.value = true;
      const result = await props.edit(...args);
      if (alive) busy.value = false;
      return result;
    };
    const resetAll = async (): Promise<void> => {
      if (resetRevision.value === null || busy.value) return;
      const result = await persist({ type: "reset-all" }, resetRevision.value);
      if (!alive) return;
      if (result.status === "saved" || result.status === "stale") resetRevision.value = null;
      notify(
        result.status === "saved"
          ? props.t("reset-saved")
          : result.status === "write-failed"
            ? props.t("reset-failed")
            : shortcutFailure(result, catalog.value, props.t, props.runtime),
        result.status !== "saved",
      );
    };
    watch(
      [open, focusRequest],
      ([active], [wasOpen]) => {
        const input = search.value;
        // Initial entry belongs to Modal so it captures the invoking control first.
        if (active && wasOpen && input !== null && !isBehindModal(input)) focusWithoutRing(input);
      },
      { immediate: true, flush: "post" },
    );
    const entryIndex = computed(
      () =>
        new TextSearchIndex(
          [
            ...catalog.value.map((row) => ({
              ...row,
              names: [
                ...row.aliases,
                row.keys.filter((key) => key !== "+").join("+"),
                row.keys.filter((key) => key !== "+").join(""),
                row.aria ?? "",
                row.aria?.replace("Meta", "Cmd") ?? "",
              ],
              group: "application" as const,
            })),
            ...fixedCatalog.value.map((row) => ({ ...row, names: [row.id, row.keys.join(" ")] })),
          ].sort(
            (left, right) =>
              Number(left.id === "response.stop") - Number(right.id === "response.stop") ||
              (coreActionOrder.get(left.id) ?? coreActionOrder.size) -
                (coreActionOrder.get(right.id) ?? coreActionOrder.size) ||
              Number(left.id > right.id) - Number(left.id < right.id),
          ),
          (row) => ({ fuzzy: [row.label, ...row.names] }),
        ),
    );
    const matches = computed(() => entryIndex.value.search(query.value));
    const modifiedCount = computed(
      () =>
        Object.keys(config.value.document.profiles[`${props.runtime}:${props.platform}`] ?? {})
          .length,
    );
    watch(
      [open, resetRevision, modifiedCount],
      () => {
        const input = search.value;
        if (
          open.value &&
          resetRevision.value === null &&
          modifiedCount.value === 0 &&
          document.activeElement === document.body &&
          input !== null
        )
          focusWithoutRing(input);
      },
      { immediate: true, flush: "post" },
    );
    return () => {
      const editorProps = {
        useCatalog: props.useCatalog,
        useConfig: props.useConfig,
        useFixedCatalog: props.useFixedCatalog,
        platform: props.platform,
        runtime: props.runtime,
        edit: persist,
        recording: props.recording,
        describeBinding: props.describeBinding,
        t: props.t,
        onClose: closeEditor,
        onSaved: () => {
          notify(props.t("saved"));
          closeEditor();
        },
        onError: (message: string) => {
          notify(message, true);
        },
      };
      return h(Fragment, null, [
        h(
          Modal,
          {
            open: open.value,
            onClose: closeReference,
            title: props.t("title"),
            headless: true,
            shortcutModal: "shortcuts",
            className: css.dialog as string,
          },
          {
            default: () => [
              h(
                "div",
                {
                  class: css.contents,
                  onPointerdownCapture: (event: PointerEvent) => {
                    if (
                      target.value === null ||
                      busy.value ||
                      !(event.target instanceof Element) ||
                      event.target.closest(
                        'button, input, a, [contenteditable="true"], [role="group"]',
                      ) !== null
                    )
                      return;
                    event.preventDefault();
                    closeEditor();
                  },
                },
                [
                  h(
                    "header",
                    {
                      class: css.header,
                    },
                    [
                      h(
                        "h2",
                        {
                          class: css.title,
                        },
                        [props.t("title")],
                      ),
                      h(
                        "button",
                        {
                          type: "button",
                          class: css.close,
                          "aria-label": props.t("close"),
                          disabled: busy.value,
                          onClick: closeReference,
                        },
                        [
                          h(IconCloseOutlineRegular, {
                            size: 14,
                          }),
                        ],
                      ),
                    ],
                  ),
                  h(
                    "div",
                    {
                      class: css.searchRow,
                    },
                    [
                      h(
                        "div",
                        {
                          class: css.searchField,
                          role: "search",
                          "aria-label": props.t("search"),
                        },
                        [
                          h(
                            "svg",
                            {
                              class: css.searchIcon,
                              width: "14",
                              height: "14",
                              viewBox: "0 0 14 14",
                              fill: "none",
                              "aria-hidden": "true",
                            },
                            [
                              h("path", {
                                d: "M10.28 5.86536C10.28 3.41381 8.29245 1.42644 5.84094 1.42627C3.38929 1.42627 1.40186 3.4137 1.40186 5.86536C1.40203 8.31686 3.38939 10.3044 5.84094 10.3044C8.29234 10.3043 10.2799 8.31676 10.28 5.86536ZM11.4174 5.86536C11.4172 8.94498 8.92057 11.4416 5.84094 11.4418C2.76117 11.4418 0.263843 8.94509 0.263672 5.86536C0.263672 2.78548 2.76106 0.288086 5.84094 0.288086C8.92067 0.288258 11.4174 2.78559 11.4174 5.86536Z",
                                fill: "currentColor",
                              }),
                              h("path", {
                                d: "M13.7372 12.9078L12.9323 13.7127L9.9732 10.7536L10.7781 9.94867L13.7372 12.9078Z",
                                fill: "currentColor",
                              }),
                            ],
                          ),
                          h("input", {
                            ref: search,
                            "data-modal-autofocus": true,
                            class: css.search,
                            type: "search",
                            "aria-label": props.t("search"),
                            placeholder: props.t("search"),
                            value: query.value,
                            onInput: (event) => {
                              event.currentTarget instanceof HTMLInputElement &&
                                props.actions.search(event.currentTarget.value);
                            },
                          }),
                          query.value !== "" &&
                            h(
                              "button",
                              {
                                type: "button",
                                class: css.clearSearch,
                                "aria-label": props.t("clear-search"),
                                onClick: () => {
                                  props.actions.search("");
                                  search.value?.focus();
                                },
                              },
                              [
                                h(IconCloseOutlineRegular, {
                                  size: 10,
                                }),
                              ],
                            ),
                        ],
                      ),
                    ],
                  ),
                  h(
                    "div",
                    {
                      class: css.list,
                      "aria-busy": config.value.status === "loading",
                    },
                    [
                      (["application", "input", "menus", "approval"] as const).map((group) => {
                        const rows = matches.value.filter((row) => row.group === group);
                        if (rows.length === 0) return null;
                        return h(
                          "section",
                          {
                            key: group,
                            "aria-label": props.t(group),
                          },
                          [
                            group !== "application" &&
                              h(
                                "h3",
                                {
                                  class: css.group,
                                },
                                [props.t(group)],
                              ),
                            h(
                              "ul",
                              {
                                class: css.rows,
                              },
                              [
                                rows.map((row) =>
                                  h(
                                    "li",
                                    {
                                      key: row.id,
                                      class: css.row,
                                    },
                                    [
                                      "modified" in row &&
                                        target.value?.id !== row.id &&
                                        h("button", {
                                          type: "button",
                                          class: css.rowButton,
                                          "aria-label": props.t("edit-label", {
                                            command: row.label,
                                          }),
                                          disabled: busy.value || config.value.status !== "ready",
                                          onClick: () => {
                                            target.value = row;
                                          },
                                        }),
                                      h(
                                        "span",
                                        {
                                          class: css.commandLabel,
                                        },
                                        [row.label],
                                      ),
                                      h(
                                        "span",
                                        {
                                          class: css.binding,
                                        },
                                        [
                                          "modified" in row
                                            ? target.value?.id === row.id
                                              ? h(ShortcutEditor, {
                                                  key: row.id,
                                                  target: row,
                                                  ...editorProps,
                                                })
                                              : h(Fragment, null, [
                                                  h(
                                                    "span",
                                                    {
                                                      class: css.rowActions,
                                                    },
                                                    [
                                                      h(ShortcutIcon, {
                                                        kind: "edit",
                                                      }),
                                                    ],
                                                  ),
                                                  row.keys.length === 0
                                                    ? h(
                                                        "span",
                                                        {
                                                          class: css.unbound,
                                                        },
                                                        [props.t("unbound")],
                                                      )
                                                    : h(ShortcutKeys, {
                                                        keys: row.keys,
                                                        className: css.keyBadge,
                                                      }),
                                                ])
                                            : h(ShortcutKeys, {
                                                keys: row.keys,
                                                className: css.fixedKeyBadge,
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
                      }),
                      matches.value.length === 0 &&
                        h(
                          "p",
                          {
                            class: css.hint,
                            role: "status",
                          },
                          [props.t("empty")],
                        ),
                    ],
                  ),
                  h(
                    "footer",
                    {
                      class: css.footer,
                    },
                    [
                      h(
                        "button",
                        {
                          type: "button",
                          class: css.resetAll,
                          disabled:
                            busy.value ||
                            config.value.status !== "ready" ||
                            modifiedCount.value === 0,
                          onClick: (event: MouseEvent) => {
                            if (
                              busy.value ||
                              config.value.status !== "ready" ||
                              modifiedCount.value === 0
                            )
                              return;
                            if (event.currentTarget instanceof HTMLElement)
                              event.currentTarget.focus();
                            target.value = null;
                            resetRevision.value = config.value.revision;
                          },
                        },
                        [
                          h(IconRefreshOutlineRegular, {
                            size: 12,
                          }),
                          props.t("reset-all"),
                        ],
                      ),
                      modifiedCount.value > 0 &&
                        h(
                          "span",
                          {
                            class: css.modifiedCount,
                          },
                          [props.t("modified-count", { count: modifiedCount.value })],
                        ),
                    ],
                  ),
                ],
              ),
            ],
          },
        ),
        h(
          Modal,
          {
            open: open.value && resetRevision.value !== null,
            title: props.t("reset-title"),
            description: props.t("reset-description"),
            closeLabel: props.t("close-confirmation"),
            onClose: () => {
              if (!busy.value) resetRevision.value = null;
            },
          },
          {
            footer: () =>
              h(Fragment, null, [
                h(
                  Button,
                  {
                    "data-modal-autofocus": true,
                    disabled: busy.value,
                    onClick: () => {
                      resetRevision.value = null;
                    },
                  },
                  {
                    default: () => [props.t("cancel")],
                  },
                ),
                h(
                  Button,
                  {
                    variant: "primary",
                    disabled: busy.value || config.value.status !== "ready",
                    onClick: () => {
                      void resetAll();
                    },
                  },
                  {
                    default: () => [props.t("reset")],
                  },
                ),
              ]),
          },
        ),
        toast.value !== null &&
          h(Toast, {
            key: toast.value.seq,
            text: toast.value.text,
            onDone: dismissToast,
            icon: h(ShortcutIcon, {
              kind: toast.value.error ? "error" : "success",
              className: toast.value.error ? css.toastError : css.toastSuccess,
            }),
          }),
      ]);
    };
  },
  {
    name: "ShortcutReference",
    inheritAttrs: false,
    props: [
      "useStore",
      "actions",
      "useCatalog",
      "useConfig",
      "useFixedCatalog",
      "platform",
      "runtime",
      "edit",
      "recording",
      "describeBinding",
      "t",
    ],
  },
);
