import {
  onScopeDispose,
  defineComponent,
  h,
  computed,
  shallowRef,
  watch,
  onMounted,
  type VNodeChild,
} from "vue";
/** Plain-text comment editor for a frozen selection in either review tab. */
import clsx from "clsx";
import {
  Button,
  IconChevronDownOutlineRegular,
  Menu,
  MenuItemButton,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type { PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import type { ReviewQueue } from "./review-queue.ts";
import { reviewRange, type ReviewSelection, type ReviewSource } from "./review.ts";
import type { NS } from "./locales.ts";
import type { ForgeCommentActionsProps } from "./slots.ts";
import css from "./ReviewComposer.module.css";
/** Actions supplied by the owning changes tab. */
export interface ReviewActions {
  /** The source currently displayed; selecting a range freezes it. */
  readonly source: ReviewSource;
  /** Browser records shared by the changes tab. */
  readonly records?: ReviewQueue;
  /** Whether the signed-in user has a pending review on the code host that the next comment joins. */
  readonly reviewStarted?: boolean;
  /** Open the confirmed publication URL. */
  readonly openLink?: (url: string) => void;
  /** A write is running or its outcome still needs confirmation. */
  readonly publishingBlocked?: boolean;
  /** Append an atomic quote without sending the Agent a message. */
  readonly addToInput: (selection: ReviewSelection) => boolean;
  /** Retain a new comment after its quote was accepted. */
  readonly onQuoted?: (selection: ReviewSelection) => void;
  /** Publish one comment; an error string preserves the editor. */
  readonly publish?: (selection: ReviewSelection) => Promise<string | undefined>;
  /** Add one comment to the pending review on the code host, starting one when needed; an error string preserves the editor. */
  readonly queue?: (selection: ReviewSelection) => Promise<string | undefined>;
  /** Draw the buttons plugins add to the form through `forge.diff.comment.actions`. */
  readonly renderActions?: (owner: Omit<ForgeCommentActionsProps, "target">) => VNodeChild;
}
export const SplitAction = defineComponent(
  (props: {
    readonly disabled: boolean;
    readonly label: string;
    readonly run: () => void;
    readonly menuLabel: string;
    readonly other: string | undefined;
    readonly menu: () => void;
  }) => {
    const open = shallowRef(false);
    return () => {
      const capture0 = open.value;
      const renderOpen = capture0;
      return h(
        "div",
        {
          class: css.gitAction,
        },
        [
          h(
            Button,
            {
              size: "sm",
              variant: "primary",
              className: clsx(props.other !== undefined && css.gitMain),
              disabled: props.disabled,
              onClick: props.run,
            },
            { default: () => [props.label] },
          ),
          props.other !== undefined &&
            h(
              Menu,
              {
                open: renderOpen && !props.disabled,
                portal: true,
                dense: true,
                align: "end",
                autoFocus: true,
                onClose: () => {
                  open.value = false;
                },
              },
              {
                anchor: () =>
                  h(
                    Button,
                    {
                      size: "sm",
                      variant: "primary",
                      className: clsx(css.gitArrow),
                      disabled: props.disabled,
                      "aria-haspopup": "menu",
                      "aria-expanded": renderOpen && !props.disabled,
                      "aria-label": props.menuLabel,
                      onClick: () => {
                        open.value = ((value) => !value)(renderOpen);
                      },
                    },
                    {
                      default: () => [
                        h(IconChevronDownOutlineRegular, {
                          size: 14,
                        }),
                      ],
                    },
                  ),
                default: () => [
                  h(
                    MenuItemButton,
                    {
                      onSelect: () => {
                        open.value = false;
                        props.menu();
                      },
                    },
                    { default: () => [props.other] },
                  ),
                ],
              },
            ),
        ],
      );
    };
  },
  {
    name: "SplitAction",
    props: ["disabled", "label", "run", "menuLabel", "other", "menu"] as const,
  },
);
export const ReviewComposer = defineComponent(
  (
    props: PropsLocale<typeof NS> & {
      readonly visible?: boolean;
      readonly selection: ReviewSelection;
      readonly actions: ReviewActions;
      readonly close: () => void;
    },
  ) => {
    let active = true;
    onScopeDispose(() => {
      active = false;
    });
    const body = shallowRef(props.selection.comment.body);
    const empty = shallowRef(body.value.trim() === "");
    const busy = shallowRef(false);
    const error = shallowRef<string | null>(null);
    const running = shallowRef(false);
    const input = shallowRef<HTMLTextAreaElement | null>(null);
    onMounted(() => {
      watch(
        () => [],
        (_next, _previous, _onCleanup) => {
          input.value?.focus();
        },
        { immediate: true, flush: "post" },
      );
    });
    const comment = (): ReviewSelection => ({
      ...props.selection,
      comment: { ...props.selection.comment, body: body.value },
    });
    const range = computed(() => reviewRange(props.selection.comment));
    const send = async (
      destination: ((selection: ReviewSelection) => Promise<string | undefined>) | undefined,
    ): Promise<void> => {
      if (!active || running.value || destination === undefined) return;
      running.value = true;
      busy.value = true;
      error.value = null;
      try {
        const failure = await destination(comment());
        if (!active) return;
        if (failure === undefined) props.close();
        else error.value = failure;
      } catch (_error) {
        if (active) error.value = props.t("review.unknown");
      } finally {
        if (active) {
          running.value = false;
          busy.value = false;
        }
        /** Retain a new comment after its quote was accepted. */
      }
    };
    return () => {
      const capture1 = empty.value;
      const capture2 = busy.value;
      const capture3 = error.value;
      const capture4 = range.value;
      const renderEmpty = capture1;
      const renderBusy = capture2;
      const renderError = capture3;
      const renderRange = capture4;
      return h(
        "section",
        {
          class: css.root,
          "aria-label": props.t("review.range", { range: renderRange }),
          "data-forge-comment": `${props.selection.comment.side}${props.selection.comment.startLine}-${props.selection.comment.endLine}`,
        },
        [
          h(
            "div",
            {
              class: css.title,
            },
            [props.t("review.range", { range: renderRange })],
          ),
          h("textarea", {
            ref: input,
            class: css.input,
            rows: 3,
            defaultValue: props.selection.comment.body,
            disabled: renderBusy,
            "aria-label": props.t("review.comment"),
            placeholder: props.t("review.comment"),
            onInput: (event) => {
              if (
                !(
                  event.target instanceof HTMLInputElement ||
                  event.target instanceof HTMLTextAreaElement
                )
              )
                return;
              body.value = event.target.value;
              const nextEmpty = body.value.trim() === "";
              if (nextEmpty !== renderEmpty) empty.value = nextEmpty;
              if (renderError !== null) error.value = null;
            },
          }),
          renderError !== null &&
            h(
              "div",
              {
                class: css.error,
                role: "alert",
              },
              [renderError],
            ),
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
                  className: clsx(css.cancel),
                  disabled: renderBusy,
                  onClick: props.close,
                },
                { default: () => [props.t("review.cancel")] },
              ),
              h(
                Button,
                {
                  size: "sm",
                  variant: props.actions.queue === undefined ? "primary" : "outline",
                  disabled: renderBusy || renderEmpty,
                  onClick: () => {
                    const selected = comment();
                    if (props.actions.addToInput(selected)) {
                      props.actions.onQuoted?.(selected);
                      props.close();
                    } else error.value = props.t("review.inputFailed");
                  },
                },
                { default: () => [props.t("review.addToInput")] },
              ),
              props.actions.renderActions?.({
                selection: {
                  path: props.selection.comment.path,
                  side: props.selection.comment.side,
                  startLine: props.selection.comment.startLine,
                  endLine: props.selection.comment.endLine,
                },
                empty: renderEmpty,
                busy: renderBusy,
                send: (deliver) => {
                  void send(async () => await deliver(body.value));
                },
              }),
              (props.visible ?? true) &&
                props.actions.queue !== undefined &&
                h(SplitAction, {
                  disabled: renderBusy || props.actions.publishingBlocked === true || renderEmpty,
                  label: props.t(
                    renderBusy
                      ? "review.publishing"
                      : props.actions.reviewStarted === true
                        ? "review.queue"
                        : "review.startReview",
                  ),
                  run: () => {
                    void send(props.actions.queue);
                  },
                  menuLabel: props.t("review.githubActions"),
                  other:
                    props.actions.publish === undefined ? undefined : props.t("review.publish"),
                  menu: () => {
                    void send(props.actions.publish);
                  },
                }),
              props.actions.queue === undefined &&
                props.actions.publish !== undefined &&
                h(
                  Button,
                  {
                    size: "sm",
                    variant: "primary",
                    disabled: renderBusy || props.actions.publishingBlocked === true || renderEmpty,
                    onClick: () => {
                      void send(props.actions.publish);
                    },
                  },
                  { default: () => [props.t("review.publish")] },
                ),
            ],
          ),
        ],
      );
    };
  },
  { name: "ReviewComposer", props: ["t", "visible", "selection", "actions", "close"] as const },
);
