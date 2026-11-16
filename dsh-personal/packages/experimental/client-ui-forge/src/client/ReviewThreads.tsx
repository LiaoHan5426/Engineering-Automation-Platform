import {
  defineComponent,
  h,
  Fragment,
  computed,
  shallowRef,
  watch,
  onMounted,
  useSlots,
  onScopeDispose,
  type SlotsType,
  type VNodeChild,
} from "vue";
/**
 * Review threads of a change request inside the changes view: a thread card at its lines or at the top of its file, a
 * resolved thread folded into one row, and the outdated threads of a file in a section after its lines. A card offers
 * the writes the signed-in user may make: a reply, published at once or added to the pending review, resolving or
 * unresolving the thread, and editing or deleting the user's own comments.
 */
import clsx from "clsx";
import {
  Button,
  IconCheckOutlineRegular,
  IconChevronDownOutlineRegular,
  IconEllipsisOutlineRegular,
  IconRightUpOutlineRegular,
  MarkdownText,
  Menu,
  Tag,
  Tooltip,
  type MarkdownLabels,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type { PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import type {
  ForgeReviewComment,
  ForgeReviewThread,
  ForgeReviewWrite,
  ForgeThreadId,
} from "@deepseek-ai/dsh-experimental-forge/types";
import type { RemoteResult } from "@deepseek-ai/dsh-typert-protocol";
import { formatAgo } from "./format.ts";
import { anchorRange, hunkExcerpt, type ThreadPlace } from "./review-threads.ts";
import { SplitAction } from "./ReviewComposer.tsx";
import type { NS } from "./locales.ts";
import css from "./ReviewThreads.module.css";
import composerCss from "./ReviewComposer.module.css";
type Translate = PropsLocale<typeof NS>["t"];
/** Each member of a union without its `headSha`. */
type WithoutHead<T> = T extends unknown ? Omit<T, "headSha"> : never;
/** A write to one thread or its comments, without the head commit the changes view adds. */
export type ThreadWrite = WithoutHead<
  Extract<
    ForgeReviewWrite,
    {
      readonly kind: "reply" | "resolve" | "edit-comment" | "delete-comment";
    }
  >
>;
/** Writes the signed-in user can make to the threads of one changes view. */
export interface ThreadWrites {
  /** Send a write; resolves to the message to show, or undefined once the code host took it. */
  readonly write: (write: ThreadWrite) => Promise<string | undefined>;
  /** Whether the user has a pending review, which every reply then joins. */
  readonly reviewStarted: boolean;
  /** Whether the user can add a reply to a pending review, starting one when needed. */
  readonly canReview: boolean;
}
/** Reads, actions, and identities every thread card of one changes view shares. */
export interface ThreadActions {
  /** Login of the change request's author, or null when the host hides it. */
  readonly author: string | null;
  /** Quote the whole thread in the main input without sending it; false when the input refused it. */
  readonly addToInput: (thread: ForgeReviewThread, range: string | null) => boolean;
  /** Open a URL outside the app. */
  readonly openLink: (url: string) => void;
  /** Read a file of the change request's repository at a commit. */
  readonly readText: (commit: string, path: string) => Promise<RemoteResult<string>>;
  /** Report that the input refused a thread. */
  readonly inputFailed: () => void;
  /** The latest jump to a thread, which unfolds that thread and its section until the reader folds them again; null before any. */
  readonly focused: ThreadFocus | null;
  /** Writes the user can make, or null when the code host takes none from this view. */
  readonly writes: ThreadWrites | null;
}
/** One jump to a thread; each jump has its own revision, so a jump to the same thread unfolds it again. */
export interface ThreadFocus {
  readonly id: ForgeThreadId;
  readonly revision: number;
}
/** A host thread shown on lines of one side. */
export interface LineThread {
  readonly thread: ForgeReviewThread;
  readonly place: Extract<
    ThreadPlace,
    {
      readonly kind: "line";
    }
  >;
}
/** Host threads of one file and the actions their cards share. */
export interface FileThreads {
  /** Threads on lines, which follow the row of their last line. */
  readonly lines: readonly LineThread[];
  /** Threads on the whole file, shown above its lines. */
  readonly file: readonly ForgeReviewThread[];
  /** Threads no longer on the head's lines, shown after them. */
  readonly outdated: readonly ForgeReviewThread[];
  /** Unresolved threads of the file in every place, including threads the chosen commits do not show. */
  readonly unresolved: number;
  /** Reads, actions, and identities shared by the cards. */
  readonly actions: ThreadActions;
}
/** The commit a thread was written on, abbreviated, or null for a file thread. */
function writtenOn(thread: ForgeReviewThread): string | null {
  return thread.original === null ? null : thread.original.commit.slice(0, 7);
}
/**
 * Build the Markdown chrome copy of comment bodies.
 * @param t - forge panel copy.
 * @returns labels for code fences and footnotes.
 */
export function useMarkdownLabels(readTranslate: () => Translate) {
  return computed((): MarkdownLabels => {
    const t = readTranslate();
    return {
      code: {
        copyLabel: t("thread.copy"),
        copiedLabel: t("thread.copied"),
        toolbarLabels: {
          codeLabel: t("thread.codeBlock"),
          wrapLabel: t("thread.wrap"),
          unwrapLabel: t("thread.unwrap"),
        },
      },
      footnotes: t("thread.footnotes"),
    };
  });
}
export const Avatar = defineComponent(
  (props: { readonly author: ForgeReviewComment["author"]; readonly size?: number }) => {
    const failed = shallowRef(false);
    const login = computed(() => props.author?.login ?? "?");
    return () => {
      const capture0 = failed.value;
      const capture1 = login.value;
      const renderFailed = capture0;
      const renderLogin = capture1;
      return h(
        "span",
        {
          class: css.avatar,
          style: {
            width: `${props.size ?? 20}px`,
            height: `${props.size ?? 20}px`,
            fontSize: `${Math.round((props.size ?? 20) * 0.45)}px`,
          },
          "aria-hidden": "true",
        },
        [
          props.author?.avatarUrl != null && !renderFailed
            ? h("img", {
                src: props.author.avatarUrl,
                alt: "",
                width: props.size ?? 20,
                height: props.size ?? 20,
                referrerPolicy: "no-referrer",
                onError: () => {
                  failed.value = true;
                },
              })
            : renderLogin.slice(0, 1).toUpperCase(),
        ],
      );
    };
  },
  { name: "Avatar", props: ["author", "size"] as const },
);
/** Run one write at a time for a card section, keeping its error until the next attempt. */
function useWriting(readTranslate: () => Translate) {
  const busy = shallowRef(false);
  const error = shallowRef<string | null>(null);
  let running = false;
  let active = true;
  onScopeDispose(() => {
    active = false;
  });
  const run = async (send: () => Promise<string | undefined>): Promise<boolean> => {
    if (!active || running) return false;
    running = true;
    busy.value = true;
    error.value = null;
    try {
      const failure = await send();
      if (!active) return false;
      error.value = failure ?? null;
      return failure === undefined;
    } catch (_error) {
      if (!active) return false;
      error.value = readTranslate()("thread.writeUnknown");
      return false;
    } finally {
      running = false;
      if (active) busy.value = false;
    }
  };
  return computed(() => ({ busy: busy.value, error: error.value, run }));
}
const TextForm = defineComponent(
  (props: {
    readonly label: string;
    readonly initial: string;
    readonly busy: boolean;
    readonly error: string | null;
    readonly cancel: {
      readonly label: string;
      readonly run: () => void;
    };
  }) => {
    const slots = useSlots();
    const text = shallowRef(props.initial);
    return () => {
      const capture2 = text.value;
      const renderText = capture2;
      return h(
        "div",
        {
          class: css.form,
        },
        [
          h("textarea", {
            autoFocus: true,
            class: composerCss.input,
            rows: 3,
            value: renderText,
            disabled: props.busy,
            "aria-label": props.label,
            placeholder: props.label,
            onInput: (event) => {
              if (
                !(
                  event.target instanceof HTMLInputElement ||
                  event.target instanceof HTMLTextAreaElement
                )
              )
                return;
              text.value = event.target.value;
            },
          }),
          props.error !== null &&
            h(
              "div",
              {
                class: composerCss.error,
                role: "alert",
              },
              [props.error],
            ),
          h(
            "div",
            {
              class: css.formActions,
            },
            [
              h(
                Button,
                {
                  size: "sm",
                  className: clsx(composerCss.cancel),
                  disabled: props.busy,
                  onClick: props.cancel.run,
                },
                { default: () => [props.cancel.label] },
              ),
              slots.default?.({ text: renderText, blank: renderText.trim() === "" }),
            ],
          ),
        ],
      );
    };
  },
  {
    name: "TextForm",
    props: ["label", "initial", "busy", "error", "cancel"] as const,
    slots: Object as SlotsType<{
      default: (context: { text: string; blank: boolean }) => VNodeChild;
    }>,
  },
);
/** Tells the card which of its forms hold text the reader is writing, so it does not fold them away. */
type Drafting = (form: string, active: boolean) => void;
const Comment = defineComponent(
  (props: {
    readonly comment: ForgeReviewComment;
    readonly drafting: Drafting;
    readonly last: boolean;
    readonly actions: ThreadActions;
    readonly labels: MarkdownLabels;
    readonly now: number;
    readonly t: Translate;
  }) => {
    const mode = shallowRef<"view" | "edit" | "delete">("view");
    onMounted(() => {
      watch(
        [() => props.drafting, () => props.comment.id, () => mode.value],
        (_next, _previous, onCleanup) => {
          const capture3 = mode.value;
          const generation0 = props.drafting;
          const generation1 = props.comment.id;
          const generation2 = capture3;
          generation0(generation1, generation2 === "edit");
          onCleanup(() => {
            generation0(generation1, false);
          });
        },
        { immediate: true, flush: "post" },
      );
    });
    const menu = shallowRef(false);
    const writing = useWriting(() => props.t);
    const writes = computed(() => props.actions.writes);
    const login = computed(() => props.comment.author?.login ?? null);
    const editable = computed(() => writes.value !== null && props.comment.viewerCanEdit);
    const deletable = computed(() => writes.value !== null && props.comment.viewerCanDelete);
    const menuLabel = computed(() =>
      props.t("thread.commentActions", { author: login.value ?? props.t("thread.deletedAuthor") }),
    );
    const send = async (write: ThreadWrite): Promise<void> => {
      const capture4 = writes.value;
      if (capture4 !== null && (await writing.value.run(() => capture4.write(write))))
        mode.value = "view";
    };
    return () => {
      const capture5 = mode.value;
      const capture6 = menu.value;
      const capture7 = login.value;
      const capture8 = editable.value;
      const capture9 = deletable.value;
      const capture10 = menuLabel.value;
      const renderMode = capture5;
      const renderMenu = capture6;
      const renderWriting = writing.value;
      const renderLogin = capture7;
      const renderEditable = capture8;
      const renderDeletable = capture9;
      const renderMenuLabel = capture10;
      return h(
        "div",
        {
          class: css.comment,
          "data-forge-thread-comment": props.comment.id,
        },
        [
          h(Avatar, {
            author: props.comment.author,
          }),
          h(
            "div",
            {
              class: css.commentMain,
            },
            [
              h(
                "div",
                {
                  class: css.commentHeader,
                },
                [
                  h(
                    "span",
                    {
                      class: css.login,
                    },
                    [renderLogin ?? props.t("thread.deletedAuthor")],
                  ),
                  h(
                    "span",
                    {
                      class: css.time,
                      title: props.comment.createdAt,
                    },
                    [
                      formatAgo(props.comment.createdAt, props.now, props.t) ??
                        props.comment.createdAt,
                    ],
                  ),
                  renderLogin !== null &&
                    renderLogin === props.actions.author &&
                    h(
                      Tag,
                      {
                        tone: "outline",
                      },
                      { default: () => [props.t("thread.author")] },
                    ),
                  props.comment.author?.bot === true &&
                    h(
                      Tag,
                      {
                        tone: "outline",
                      },
                      { default: () => [props.t("thread.bot")] },
                    ),
                  props.comment.pending &&
                    h(
                      Tag,
                      {
                        tone: "warning",
                      },
                      { default: () => [props.t("review.pending")] },
                    ),
                  (renderEditable || renderDeletable) &&
                    renderMode === "view" &&
                    h(Fragment, null, [
                      h("span", {
                        class: css.spacer,
                      }),
                      h(
                        Menu,
                        {
                          open: renderMenu,
                          portal: true,
                          dense: true,
                          align: "end",
                          autoFocus: true,
                          onClose: () => {
                            menu.value = false;
                          },
                          items: [
                            ...(renderEditable
                              ? [{ id: "edit", label: props.t("review.edit") }]
                              : []),
                            ...(renderDeletable
                              ? [{ id: "delete", label: props.t("review.remove") }]
                              : []),
                          ],
                          onSelect: (id) => {
                            menu.value = false;
                            mode.value = id === "edit" ? "edit" : "delete";
                          },
                        },
                        {
                          anchor: () =>
                            h(
                              "span",
                              {
                                class: css.menuAnchor,
                              },
                              [
                                h(
                                  Tooltip,
                                  {
                                    label: renderMenuLabel,
                                    side: "bottom",
                                  },
                                  {
                                    default: () => [
                                      h(
                                        "button",
                                        {
                                          type: "button",
                                          class: css.icon,
                                          "aria-label": renderMenuLabel,
                                          "aria-haspopup": "menu",
                                          "aria-expanded": renderMenu,
                                          onClick: () => {
                                            menu.value = ((value) => !value)(renderMenu);
                                          },
                                        },
                                        [
                                          h(IconEllipsisOutlineRegular, {
                                            size: 14,
                                          }),
                                        ],
                                      ),
                                    ],
                                  },
                                ),
                              ],
                            ),
                        },
                      ),
                    ]),
                ],
              ),
              renderMode === "edit"
                ? h(
                    TextForm,
                    {
                      label: props.t("thread.editAria"),
                      initial: props.comment.body,
                      busy: renderWriting.busy,
                      error: renderWriting.error,
                      cancel: {
                        label: props.t("review.cancel"),
                        run: () => {
                          mode.value = "view";
                        },
                      },
                    },
                    {
                      default: ({ text, blank }: { text: string; blank: boolean }) =>
                        h(
                          Button,
                          {
                            size: "sm",
                            variant: "primary",
                            disabled: renderWriting.busy || blank || text === props.comment.body,
                            onClick: () => {
                              void send({
                                kind: "edit-comment",
                                comment: props.comment.id,
                                body: text,
                              });
                            },
                          },
                          {
                            default: () => [
                              props.t(renderWriting.busy ? "thread.saving" : "thread.save"),
                            ],
                          },
                        ),
                    },
                  )
                : h(
                    "div",
                    {
                      class: css.body,
                    },
                    [
                      h(MarkdownText, {
                        text: props.comment.body,
                        labels: props.labels,
                        variant: "body",
                        omitHtml: true,
                      }),
                    ],
                  ),
              renderMode === "delete" &&
                h(
                  "div",
                  {
                    class: css.confirm,
                    role: "group",
                    "aria-label": props.t(
                      props.last ? "thread.deleteLast" : "thread.deleteConfirm",
                    ),
                  },
                  [
                    h(
                      "span",
                      {
                        class: css.confirmText,
                      },
                      [props.t(props.last ? "thread.deleteLast" : "thread.deleteConfirm")],
                    ),
                    h(
                      Button,
                      {
                        size: "sm",
                        disabled: renderWriting.busy,
                        onClick: () => {
                          mode.value = "view";
                        },
                      },
                      { default: () => [props.t("review.cancel")] },
                    ),
                    h(
                      Button,
                      {
                        size: "sm",
                        variant: "primary",
                        disabled: renderWriting.busy,
                        onClick: () => {
                          void send({ kind: "delete-comment", comment: props.comment.id });
                        },
                      },
                      {
                        default: () => [
                          props.t(renderWriting.busy ? "thread.deleting" : "review.remove"),
                        ],
                      },
                    ),
                    renderWriting.error !== null &&
                      h(
                        "div",
                        {
                          class: clsx(composerCss.error, css.confirmError),
                          role: "alert",
                        },
                        [renderWriting.error],
                      ),
                  ],
                ),
            ],
          ),
        ],
      );
    };
  },
  {
    name: "Comment",
    props: ["comment", "drafting", "last", "actions", "labels", "now", "t"] as const,
  },
);
const Reply = defineComponent(
  (
    props: PropsLocale<typeof NS> & {
      readonly thread: ForgeReviewThread;
      readonly writes: ThreadWrites;
      readonly drafting: Drafting;
    },
  ) => {
    const open = shallowRef(false);
    onMounted(() => {
      watch(
        [() => props.drafting, () => open.value],
        (_next, _previous, onCleanup) => {
          const capture11 = open.value;
          const generation0 = props.drafting;
          const generation1 = capture11;
          generation0("reply", generation1);
          onCleanup(() => {
            generation0("reply", false);
          });
        },
        { immediate: true, flush: "post" },
      );
    });
    const writing = useWriting(() => props.t);
    const send = async (text: string, pending: boolean): Promise<void> => {
      if (
        await writing.value.run(() =>
          props.writes.write({ kind: "reply", thread: props.thread.id, body: text, pending }),
        )
      )
        open.value = false;
    };
    return () => {
      const capture12 = open.value;
      const renderOpen = capture12;
      const renderWriting = writing.value;
      if (!renderOpen) {
        return h(
          "button",
          {
            type: "button",
            class: css.replyPrompt,
            onClick: () => {
              open.value = true;
            },
          },
          [props.t("thread.replyPlaceholder")],
        );
      }
      return h(
        TextForm,
        {
          label: props.t("thread.replyPlaceholder"),
          initial: "",
          busy: renderWriting.busy,
          error: renderWriting.error,
          cancel: {
            label: props.t("review.cancel"),
            run: () => {
              open.value = false;
            },
          },
        },
        {
          default: ({ text, blank }: { text: string; blank: boolean }) =>
            props.writes.reviewStarted
              ? h(
                  Button,
                  {
                    size: "sm",
                    variant: "primary",
                    disabled: renderWriting.busy || blank,
                    onClick: () => {
                      void send(text, true);
                    },
                  },
                  {
                    default: () => [
                      props.t(renderWriting.busy ? "review.publishing" : "review.queue"),
                    ],
                  },
                )
              : h(SplitAction, {
                  disabled: renderWriting.busy || blank,
                  label: props.t(renderWriting.busy ? "review.publishing" : "thread.reply"),
                  run: () => {
                    void send(text, false);
                  },
                  menuLabel: props.t("thread.replyActions"),
                  other: props.writes.canReview ? props.t("review.startReview") : undefined,
                  menu: () => {
                    void send(text, true);
                  },
                }),
        },
      );
    };
  },
  { name: "Reply", props: ["t", "thread", "writes", "drafting"] as const },
);
const Resolution = defineComponent(
  (
    props: PropsLocale<typeof NS> & {
      readonly thread: ForgeReviewThread;
      readonly writes: ThreadWrites;
    },
  ) => {
    const writing = useWriting(() => props.t);
    return () => {
      const renderWriting = writing.value;
      return h(Fragment, null, [
        h(
          Button,
          {
            size: "sm",
            disabled: renderWriting.busy,
            onClick: () => {
              void renderWriting.run(() =>
                props.writes.write({
                  kind: "resolve",
                  thread: props.thread.id,
                  resolved: !props.thread.resolved,
                }),
              );
            },
          },
          {
            default: () => [props.t(props.thread.resolved ? "thread.unresolve" : "thread.resolve")],
          },
        ),
        renderWriting.error !== null &&
          h(
            "div",
            {
              class: clsx(composerCss.error, css.actionError),
              role: "alert",
            },
            [renderWriting.error],
          ),
      ]);
    };
  },
  { name: "Resolution", props: ["t", "thread", "writes"] as const },
);
export const ThreadCard = defineComponent(
  (
    props: PropsLocale<typeof NS> & {
      readonly thread: ForgeReviewThread;
      readonly place: ThreadPlace;
      readonly actions: ThreadActions;
    },
  ) => {
    const open = shallowRef(false);
    const foldedAt = shallowRef<number | null>(null);
    const labels = useMarkdownLabels(() => props.t);
    const now = () => Date.now();
    const focused = computed(
      () =>
        props.actions.focused?.id === props.thread.id &&
        props.actions.focused.revision !== foldedAt.value,
    );
    const drafts = shallowRef<ReadonlySet<string>>((() => new Set())());
    const drafting: Drafting = (form, active) => {
      const capture13 = drafts.value;
      drafts.value = ((value) => {
        if (value.has(form) === active) return value;
        const next = new Set(value);
        if (active) next.add(form);
        else next.delete(form);
        return next;
      })(capture13);
    };
    const unfolded = computed(
      () => open.value || !props.thread.resolved || focused.value || drafts.value.size > 0,
    );
    const side = computed(() =>
      props.place.kind === "line" ? props.place.side : props.thread.side,
    );
    const original = computed(() =>
      props.place.kind === "outdated" && props.thread.original !== null
        ? props.thread.original
        : null,
    );
    const range = computed(() =>
      props.place.kind === "line"
        ? anchorRange(props.place.side, props.place)
        : original.value !== null
          ? anchorRange(props.thread.side, original.value)
          : null,
    );
    const commit = computed(() => writtenOn(props.thread));
    const first = computed(() => props.thread.comments[0]);
    const url = computed(() => first.value?.url ?? null);
    const writes = computed(() => props.actions.writes);
    const label = computed(() =>
      original.value !== null
        ? props.t("thread.originally", { range: anchorRange(props.thread.side, original.value) })
        : (range.value ?? props.t("thread.fileLevel")),
    );
    return () => {
      const capture15 = now();
      const capture16 = unfolded.value;
      const capture17 = side.value;
      const capture18 = original.value;
      const capture19 = range.value;
      const capture20 = commit.value;
      const capture21 = first.value;
      const capture22 = url.value;
      const capture23 = writes.value;
      const capture24 = label.value;
      const renderLabels = labels.value;
      const renderNow = capture15;
      const renderUnfolded = capture16;
      const renderSide = capture17;
      const renderOriginal = capture18;
      const renderRange = capture19;
      const renderCommit = capture20;
      const renderFirst = capture21;
      const renderUrl = capture22;
      const renderWrites = capture23;
      const renderLabel = capture24;
      if (!renderUnfolded) {
        return h(
          "div",
          {
            class: css.folded,
            "data-forge-thread": props.thread.id,
            "data-side": renderSide,
          },
          [
            h(IconCheckOutlineRegular, {
              size: 14,
            }),
            h(
              "span",
              {
                class: css.foldedText,
              },
              [
                props.t("thread.resolvedRow", {
                  author: renderFirst?.author?.login ?? props.t("thread.deletedAuthor"),
                }),
              ],
            ),
            h(
              "button",
              {
                type: "button",
                class: css.link,
                "aria-expanded": false,
                onClick: () => {
                  open.value = true;
                },
              },
              [props.t("thread.expand")],
            ),
          ],
        );
      }
      return h(
        "section",
        {
          class: css.card,
          "data-forge-thread": props.thread.id,
          "data-side": renderSide,
          "data-resolved": props.thread.resolved ? "" : undefined,
          "aria-label": renderLabel,
          tabindex: -1,
        },
        [
          h(
            "div",
            {
              class: css.header,
            },
            [
              h(
                "span",
                {
                  class: css.place,
                },
                [
                  renderLabel,
                  renderCommit !== null &&
                    h(Fragment, null, [
                      " · ",
                      props.t("thread.onCommit", { commit: renderCommit }),
                    ]),
                ],
              ),
              props.place.kind === "outdated" &&
                h(
                  Tag,
                  {
                    tone: "warning",
                  },
                  { default: () => [props.t("thread.outdatedTag")] },
                ),
              props.thread.resolved &&
                h(
                  Tag,
                  {
                    tone: "success",
                  },
                  { default: () => [props.t("thread.filter.resolved")] },
                ),
              h("span", {
                class: css.spacer,
              }),
              props.thread.resolved &&
                h(
                  "button",
                  {
                    type: "button",
                    class: css.link,
                    "aria-expanded": true,
                    onClick: () => {
                      open.value = false;
                      foldedAt.value = props.actions.focused?.revision ?? null;
                    },
                  },
                  [props.t("thread.collapse")],
                ),
              renderOriginal !== null &&
                props.thread.side === "R" &&
                h(OriginalFile, {
                  thread: props.thread,
                  commit: renderOriginal.commit,
                  actions: props.actions,
                  t: props.t,
                }),
            ],
          ),
          props.place.kind === "outdated" &&
            props.thread.diffHunk !== null &&
            renderOriginal !== null &&
            h(Excerpt, {
              hunk: props.thread.diffHunk,
              side: props.thread.side,
              lines: renderOriginal.endLine - renderOriginal.startLine + 1,
            }),
          h(
            "div",
            {
              class: css.comments,
            },
            [
              props.thread.comments.map((comment) =>
                h(Comment, {
                  key: comment.id,
                  comment: comment,
                  last: props.thread.comments.length === 1,
                  actions: props.actions,
                  labels: renderLabels,
                  now: renderNow,
                  drafting: drafting,
                  t: props.t,
                }),
              ),
            ],
          ),
          renderWrites !== null &&
            props.thread.viewerCanReply &&
            h(Reply, {
              thread: props.thread,
              writes: renderWrites,
              drafting: drafting,
              t: props.t,
            }),
          h(
            "div",
            {
              class: css.actions,
            },
            [
              h(
                Button,
                {
                  size: "sm",
                  onClick: () => {
                    if (!props.actions.addToInput(props.thread, renderRange))
                      props.actions.inputFailed();
                  },
                },
                { default: () => [props.t("review.addToInput")] },
              ),
              renderUrl !== null &&
                h(
                  Button,
                  {
                    size: "sm",
                    onClick: () => {
                      props.actions.openLink(renderUrl);
                    },
                  },
                  {
                    default: () => [
                      h(IconRightUpOutlineRegular, {
                        size: 14,
                      }),
                      props.t("thread.openOnHost"),
                    ],
                  },
                ),
              renderWrites !== null &&
                props.thread.viewerCanResolve &&
                h(Resolution, {
                  thread: props.thread,
                  writes: renderWrites,
                  t: props.t,
                }),
            ],
          ),
        ],
      );
    };
  },
  { name: "ThreadCard", props: ["t", "thread", "place", "actions"] as const },
);
const Excerpt = defineComponent(
  (props: { readonly hunk: string; readonly side: "L" | "R"; readonly lines: number }) => {
    const excerpt = computed(() => hunkExcerpt(props.hunk, props.side, props.lines));
    return () => {
      const capture25 = excerpt.value;
      const renderExcerpt = capture25;
      return h(
        "div",
        {
          class: css.excerpt,
        },
        [
          renderExcerpt.header !== null &&
            h(
              "div",
              {
                class: clsx(css.excerptLine, css.excerptHeader),
              },
              [renderExcerpt.header],
            ),
          renderExcerpt.lines.map((line, index) =>
            h(
              "div",
              {
                key: index,
                class: clsx(
                  css.excerptLine,
                  line.startsWith("+") && css.added,
                  line.startsWith("-") && css.deleted,
                ),
              },
              [line],
            ),
          ),
        ],
      );
    };
  },
  { name: "Excerpt", props: ["hunk", "side", "lines"] as const },
);
const OriginalFile = defineComponent(
  (
    props: PropsLocale<typeof NS> & {
      readonly thread: ForgeReviewThread;
      readonly commit: string;
      readonly actions: ThreadActions;
    },
  ) => {
    const state = shallowRef<
      | {
          readonly lines: readonly string[];
        }
      | "closed"
      | "loading"
      | {
          readonly failed: string;
        }
    >("closed");
    const marked = shallowRef<HTMLDivElement | null>(null);
    let active = true;
    onScopeDispose(() => {
      active = false;
    });
    onMounted(() => {
      watch(
        () => state.value,
        () => {
          marked.value?.scrollIntoView({ block: "center" });
        },
        { immediate: true, flush: "post" },
      );
    });
    const toggle = (): void => {
      const capture27 = state.value;
      if (capture27 !== "closed" && capture27 !== "loading") {
        state.value = "closed";
        return;
      }
      state.value = "loading";
      void props.actions.readText(props.commit, props.thread.path).then((result) => {
        if (!active) return;
        state.value = result.ok
          ? { lines: result.value.split("\n") }
          : { failed: result.error.message };
      });
    };
    const open = computed(() => state.value !== "closed");
    const range = computed(() => props.thread.original);
    return () => {
      const capture28 = state.value;
      const capture29 = open.value;
      const capture30 = range.value;
      const renderState = capture28;
      const renderOpen = capture29;
      const renderRange = capture30;
      return h(Fragment, null, [
        h(
          "button",
          {
            type: "button",
            class: css.link,
            "aria-expanded": renderOpen,
            disabled: renderState === "loading",
            onClick: toggle,
          },
          [props.t(renderOpen ? "thread.hideOriginal" : "thread.viewOriginal")],
        ),
        renderOpen &&
          h(
            "div",
            {
              class: css.original,
              role: "region",
              "aria-label": props.t("thread.viewOriginal"),
            },
            [
              renderState === "loading"
                ? h(
                    "div",
                    {
                      class: css.originalNote,
                    },
                    [props.t("thread.originalLoading")],
                  )
                : typeof renderState === "object" && "failed" in renderState
                  ? h(
                      "div",
                      {
                        class: css.originalNote,
                        role: "alert",
                      },
                      [props.t("thread.originalFailed", { message: renderState.failed })],
                    )
                  : typeof renderState === "object" && "lines" in renderState
                    ? renderState.lines.map((line, index) => {
                        const number = index + 1;
                        const inside =
                          renderRange !== null &&
                          number >= renderRange.startLine &&
                          number <= renderRange.endLine;
                        return h(
                          "div",
                          {
                            key: index,
                            ...(inside && number === renderRange.startLine ? { ref: marked } : {}),
                            class: clsx(css.originalLine, inside && css.marked),
                          },
                          [
                            h(
                              "span",
                              {
                                class: css.originalNumber,
                              },
                              [number],
                            ),
                            h("span", {}, [line]),
                          ],
                        );
                      })
                    : null,
            ],
          ),
      ]);
    };
  },
  { name: "OriginalFile", props: ["t", "thread", "commit", "actions"] as const },
);
export const OutdatedThreads = defineComponent(
  (
    props: PropsLocale<typeof NS> & {
      readonly threads: readonly ForgeReviewThread[];
      readonly actions: ThreadActions;
    },
  ) => {
    const folded = shallowRef<number | null>(null);
    const jump = computed(() => props.actions.focused);
    const open = computed(() => {
      const current = jump.value;
      return (
        folded.value === null ||
        (current !== null &&
          current.revision !== folded.value &&
          props.threads.some((thread) => thread.id === current.id))
      );
    });
    return () => {
      const capture31 = jump.value;
      const capture32 = open.value;
      const renderJump = capture31;
      const renderOpen = capture32;
      if (props.threads.length === 0) return null;
      return h(
        "section",
        {
          class: css.outdated,
          "data-forge-outdated-threads": "",
        },
        [
          h(
            "div",
            {
              class: css.outdatedHeader,
            },
            [
              h("span", {}, [props.t("thread.outdatedSection", { count: props.threads.length })]),
              h("span", {
                class: css.spacer,
              }),
              h(
                "button",
                {
                  type: "button",
                  class: css.link,
                  "aria-expanded": renderOpen,
                  onClick: () => {
                    folded.value = renderOpen ? (renderJump?.revision ?? -1) : null;
                  },
                },
                [
                  props.t(renderOpen ? "thread.collapse" : "thread.expand"),
                  h(IconChevronDownOutlineRegular, {
                    size: 12,
                    className: clsx(!renderOpen && css.turned),
                  }),
                ],
              ),
            ],
          ),
          renderOpen &&
            props.threads.map((thread) =>
              h(ThreadCard, {
                key: thread.id,
                thread: thread,
                place: { kind: "outdated" },
                actions: props.actions,
                t: props.t,
              }),
            ),
        ],
      );
    };
  },
  { name: "OutdatedThreads", props: ["t", "threads", "actions"] as const },
);
