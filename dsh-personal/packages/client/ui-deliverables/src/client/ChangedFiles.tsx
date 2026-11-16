import { defineComponent, h, Fragment, computed, ref, shallowRef, watchEffect, useId } from "vue";
/** Turn changes use a compact single-file card or a header with a folded file list. */
import { resolveWorkspacePath } from "@deepseek-ai/dsh-util-workspace-path";
import {
  FileTypeIcon,
  HoverCard,
  IconChevronDownOutlineRegular,
  IconChevronUpOutlineRegular,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type {
  InjectFace,
  PropsLocale,
  SessionStandardProps,
} from "@deepseek-ai/dsh-client-ui-slots";
import { changesDiffUrl, type ChangesSummary } from "../changes.ts";
import type { DeliverablesInjected } from "./Deliverables.tsx";
import { FileDiff } from "./FileDiff.tsx";
import diffCss from "./FileDiff.module.css";
import { basename } from "./turn-deliverables.ts";
import type { NS } from "./locales.ts";
import css from "./ChangedFiles.module.css";
type PreviewProps = Pick<InjectFace<DeliverablesInjected>, "useChangesDiff" | "loadChangesDiff"> &
  Pick<SessionStandardProps, "sessionId">;
/** Rows shown before the fold; the design's summary height for a closing message. */
const COLLAPSED_ROWS = 4;
const GROUPED = new Intl.NumberFormat("en-US");
const Counts = defineComponent(
  (
    props: {
      added: number;
      deleted: number;
    } & PropsLocale<typeof NS>,
  ) => {
    return (
      /** Turn changes use a compact single-file card or a header with a folded file list. */
    ) => {
      return h(Fragment, null, [
        h(
          "span",
          {
            class: css.added,
          },
          [props.t("changes.added", { count: GROUPED.format(props.added) })],
        ),
        h(
          "span",
          {
            class: css.deleted,
          },
          [props.t("changes.deleted", { count: GROUPED.format(props.deleted) })],
        ),
      ]);
    };
  },
  { name: "Counts", props: ["added", "deleted", "t"] as const },
);
export const ChangedFiles = defineComponent(
  (
    props: {
      changes: Pick<ChangesSummary, "files" | "total" | "added" | "deleted"> & {
        seq: number;
      };
      cwd: string | undefined;
      openReview: (index: number) => void;
    } & PropsLocale<typeof NS> &
      PreviewProps,
  ) => {
    const cardRef = shallowRef<HTMLDivElement | null>(null);
    const pathDescriptionId = useId();
    const expanded = ref(false);
    const singleFile = computed(() =>
      props.changes.total === 1 ? props.changes.files[0] : undefined,
    );
    const foldable = computed(() => props.changes.files.length > COLLAPSED_ROWS);
    const rows = computed(() =>
      foldable.value && !expanded.value
        ? props.changes.files.slice(0, COLLAPSED_ROWS)
        : props.changes.files,
    );
    const header = computed(() =>
      h(
        "button",
        {
          type: "button",
          class: css.header,
          "aria-label":
            singleFile.value === undefined
              ? props.t("changes.openReview")
              : props.t("changes.viewDiff", { name: singleFile.value.display }),
          "aria-describedby": singleFile.value === undefined ? undefined : pathDescriptionId,
          onClick: () => {
            props.openReview(0);
          },
        },
        [
          h(
            "span",
            {
              class: css.tile,
            },
            [
              singleFile.value === undefined
                ? h(FileTypeIcon, {
                    kind: "code",
                    size: 20,
                  })
                : h(FileTypeIcon, {
                    path: singleFile.value.path,
                    size: 20,
                  }),
            ],
          ),
          h(
            "span",
            {
              class: css.titles,
            },
            [
              h(
                "span",
                {
                  class: css.title,
                },
                [
                  singleFile.value === undefined
                    ? props.t("changes.title", { count: String(props.changes.total) })
                    : props.t("changes.singleTitle", { name: basename(singleFile.value.path) }),
                ],
              ),
              h(
                "span",
                {
                  class: css.stat,
                },
                [
                  h(
                    "span",
                    {
                      class: css.statCounts,
                    },
                    [
                      singleFile.value?.binary === true
                        ? props.t("changes.binary")
                        : singleFile.value?.oversized === true
                          ? props.t("changes.oversized")
                          : h(Counts, {
                              t: props.t,
                              added: props.changes.added,
                              deleted: props.changes.deleted,
                            }),
                    ],
                  ),
                  h(
                    "span",
                    {
                      class: css.previewHint,
                    },
                    [props.t("presented.preview")],
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
    return () => {
      const currentSingle = singleFile.value;
      return h(
        "div",
        {
          ref: cardRef,
          class: css.card,
          "data-changed-files": true,
          "data-single": currentSingle !== undefined || undefined,
        },
        [
          currentSingle === undefined
            ? header.value
            : h(Fragment, null, [
                h(
                  HoverCard,
                  {
                    variant: "preview",
                    widthAnchorRef: cardRef,
                    openDelayMs: 500,
                  },
                  {
                    anchor: () => header.value,
                    default: () =>
                      h(ChangedFilePreview, {
                        sessionId: props.sessionId,
                        seq: props.changes.seq,
                        index: 0,
                        display: resolveWorkspacePath(props.cwd, currentSingle.path),
                        useChangesDiff: props.useChangesDiff,
                        loadChangesDiff: props.loadChangesDiff,
                        t: props.t,
                      }),
                  },
                ),
                h(
                  "span",
                  {
                    id: pathDescriptionId,
                    hidden: true,
                  },
                  [resolveWorkspacePath(props.cwd, currentSingle.path)],
                ),
              ]),
          currentSingle === undefined &&
            h(
              "ul",
              {
                class: css.list,
              },
              [
                rows.value.map((file, index) =>
                  h(
                    "li",
                    {
                      key: file.display,
                    },
                    [
                      h(
                        HoverCard,
                        {
                          variant: "preview",
                          widthAnchorRef: cardRef,
                          openDelayMs: 500,
                        },
                        {
                          default: () =>
                            h(ChangedFilePreview, {
                              sessionId: props.sessionId,
                              seq: props.changes.seq,
                              index: index,
                              display: resolveWorkspacePath(props.cwd, file.path),
                              useChangesDiff: props.useChangesDiff,
                              loadChangesDiff: props.loadChangesDiff,
                              t: props.t,
                            }),
                          anchor: () =>
                            h(
                              "button",
                              {
                                type: "button",
                                class: css.row,
                                "aria-label": props.t("changes.viewDiff", { name: file.display }),
                                "aria-describedby": `${pathDescriptionId}-${index}`,
                                onClick: () => {
                                  props.openReview(index);
                                },
                              },
                              [
                                h(
                                  "span",
                                  {
                                    class: css.path,
                                  },
                                  [file.display],
                                ),
                                h(
                                  "span",
                                  {
                                    class: css.counts,
                                  },
                                  [
                                    file.binary === true
                                      ? props.t("changes.binary")
                                      : file.oversized === true
                                        ? props.t("changes.oversized")
                                        : h(Counts, {
                                            t: props.t,
                                            added: file.added,
                                            deleted: file.deleted,
                                          }),
                                  ],
                                ),
                              ],
                            ),
                        },
                      ),
                      h(
                        "span",
                        {
                          id: `${pathDescriptionId}-${index}`,
                          hidden: true,
                        },
                        [resolveWorkspacePath(props.cwd, file.path)],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          foldable.value &&
            h(
              "button",
              {
                type: "button",
                class: css.toggle,
                "aria-expanded": expanded.value,
                "aria-label": props.t(
                  expanded.value ? "changes.collapseAria" : "changes.expandAria",
                  { count: String(props.changes.files.length) },
                ),
                onClick: () => {
                  expanded.value = ((value) => !value)(expanded.value);
                },
              },
              [
                h("span", {}, [
                  props.t(expanded.value ? "changes.collapse" : "changes.all", {
                    count: String(props.changes.files.length),
                  }),
                ]),
                expanded.value
                  ? h(IconChevronUpOutlineRegular, {})
                  : h(IconChevronDownOutlineRegular, {}),
              ],
            ),
        ],
      );
    };
  },
  {
    name: "ChangedFiles",
    props: [
      "changes",
      "cwd",
      "openReview",
      "t",
      "loadChangesDiff",
      "useChangesDiff",
      "sessionId",
    ] as const,
  },
);
const ChangedFilePreview = defineComponent(
  (
    props: PreviewProps & {
      seq: number;
      index: number;
      display: string;
    } & PropsLocale<typeof NS>,
  ) => {
    const state = props.useChangesDiff(
      (value) => value[changesDiffUrl(props.sessionId, props.seq, props.index)],
    );
    watchEffect(() => {
      if (state.value === undefined)
        void props.loadChangesDiff(props.sessionId, props.seq, props.index);
    });
    return () => {
      return h(
        "div",
        {
          class: `${diffCss.root} ${css.preview}`,
          "data-changes-hover-preview": true,
        },
        [
          h(
            "div",
            {
              class: diffCss.header,
            },
            [
              h(
                "span",
                {
                  class: css.previewPath,
                  "data-changes-preview-path": true,
                },
                [props.display],
              ),
            ],
          ),
          h(FileDiff, {
            state: state.value,
            split: false,
            wrap: false,
            t: props.t,
            retry: () => {
              void props.loadChangesDiff(props.sessionId, props.seq, props.index);
            },
          }),
        ],
      );
    };
  },
  {
    name: "ChangedFilePreview",
    props: [
      "loadChangesDiff",
      "useChangesDiff",
      "sessionId",
      "seq",
      "index",
      "display",
      "t",
    ] as const,
  },
);
