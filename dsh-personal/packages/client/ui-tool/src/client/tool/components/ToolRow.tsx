import { defineComponent, h, Fragment, type VNodeChild } from "vue";
import clsx from "clsx";
import {
  CodeBlock,
  DiffBlock,
  DisclosureRow,
  IconInspectOutlineRegular,
  ReadBlock,
  SearchBlock,
  TerminalBlock,
  TextShimmer,
  WebBlock,
  diffTotals,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type { ContextMenuTriggerProps } from "@deepseek-ai/dsh-client-ui-context-menu/client";
import type { PropsRenderSlots, TranslateNS } from "@deepseek-ai/dsh-client-ui-slots";
import type { OpenFileOptions, UseDisclosure } from "@deepseek-ai/dsh-client-ui-chat/client";
import type { MessageImageLoader } from "@deepseek-ai/dsh-client-ui-conversation/client";
import { CHAT_DIFF_MAX_LINES, type DiffCardModel } from "../models/diff-card-model.ts";
import { CHAT_READ_MAX_LINES, type ReadCardModel } from "../models/read-card-model.ts";
import type { ImageCardModel } from "../models/image-card-model.ts";
import { CHAT_SEARCH_MAX_LINES, type SearchCardModel } from "../models/search-card-model.ts";
import {
  localizeTerminalCardModel,
  terminalBlockLabels,
  terminalExitLabel,
  type TerminalCardModel,
} from "../models/terminal-card-model.ts";
import {
  codeToolbarLabels,
  diffBlockLabels,
  readBlockLabels,
  searchBlockLabels,
  webBlockLabels,
} from "../models/primitive-labels.ts";
import type { AskQuestionCardModel } from "../models/ask-question-card-model.ts";
import {
  FILE_TARGET_MOVE,
  FILE_TARGET_SEPARATOR,
  formatToolBody,
  type ToolRowFileTarget,
  type ToolRowState,
  type ToolRowVariant,
} from "../models/tool-call-model.ts";
import type { WebCardModelProps } from "../models/web-card-model.ts";
import { AskQuestionCard } from "./AskQuestionCard.tsx";
import { ToolDetails, type ToolDetailsModel } from "./ToolDetails.tsx";
import { ExitCodeBadge } from "./ExitCodeBadge.tsx";
import css from "./ToolRow.module.css";
export interface ToolRowProps {
  /** Subscribe here, where the row owns its expanded body. */
  useDisclosure: UseDisclosure;
  t: TranslateNS<"conversation">;
  variant: ToolRowVariant;
  /** Wire tool name for tool-owned styling layered over the generic variant. */
  toolName?: string | undefined;
  icon: VNodeChild;
  title: string;
  summary: string;
  /**
   * Trailing summary fragment rendered outside the ellipsized summary text, so
   * a narrow row clips the summary before this. Appears before diff totals
   * when both are present. null/absent omits this fragment. Error and stopped
   * rows omit both the suffix and diff totals.
   */
  summarySuffix?: string | null | undefined;
  /** Original argument JSON formatted only while the row is expanded. */
  bodyRaw?: string | null | undefined;
  /** Flattened result text for the expanded Output section; null/absent = no output section. */
  output?: string | null | undefined;
  /** Ask-user transcript card; card fields are mutually exclusive and replace text sections. */
  askQuestion?: AskQuestionCardModel | null | undefined;
  /**
   * First error line for rows without an exit status capsule; null/absent keeps
   * the ordinary summary. Rows with an exit capsule retain the command description.
   */
  errorSummary?: string | null | undefined;
  /** Terminal card; card fields are mutually exclusive and replace text sections. */
  terminal?: TerminalCardModel | null | undefined;
  /** Diff card with inline totals colored on header hover and while expanded. */
  diff?: DiffCardModel | null | undefined;
  read?: ReadCardModel | null | undefined;
  /**
   * Image-card material for a call whose result is an image (derived by
   * `imageCardModel`). Rendered through the `tool.call.images` slot, so the
   * tool layer never imports an attachment implementation nor handles URL
   * authorization.
   */
  image?: ImageCardModel | null | undefined;
  /**
   * Dispatch the image gallery through the tool-owned `tool.call.images`
   * slot, supplied by the toolview that owns this row together with the
   * Gateway-authorized loader.
   */
  renderSlot?: PropsRenderSlots<"tool.call.images">["renderSlot"] | undefined;
  /** Gateway-authorized image URL loader for the gallery slot. */
  loadImage?: MessageImageLoader | undefined;
  search?: SearchCardModel | null | undefined;
  web?: WebCardModelProps | null | undefined;
  /** Read-only fields/list card derived from a successful recorded result. */
  details?: ToolDetailsModel | null | undefined;
  state: ToolRowState;
  /**
   * Recorded file target or a supported argument fallback. With onOpenFile,
   * the summary opens that path through the owner's file-preview callback.
   */
  filePath?: string | undefined;
  /** 1-based line the call was about; absent = open the file at its beginning. */
  filePathLine?: number | undefined;
  /** Open the path (already cwd-resolved), landing on `filePathLine` when given. */
  onOpenFile?: ((path: string, options?: OpenFileOptions) => void) | undefined;
  /** File gesture bindings supplied by the owning tool view. */
  fileContextMenuProps?: ContextMenuTriggerProps | undefined;
  /**
   * Files a patch row names. When onOpenFile is set, the row state is `ok`, and
   * at least one target has a `filePath`, each such target renders as its own
   * link in place of the summary text; otherwise the row shows `summary`.
   */
  fileTargets?: readonly ToolRowFileTarget[] | undefined;
  /** File gesture bindings for one `fileTargets` path, supplied by the owning tool view. */
  fileTargetContextMenuProps?: ((path: string) => ContextMenuTriggerProps) | undefined;
  /** URL gesture bindings supplied by the owning tool view. */
  urlContextMenuProps?: ContextMenuTriggerProps | undefined;
  /** Safe http(s) URL from tool args; when set, the summary renders as a link that opens it in a new tab. */
  href?: string | undefined;
  /**
   * Jump to this call in the trajectory view: a hover-revealed Inspect pill
   * over the expanded body. Absent = no affordance.
   */
  inspect?: (() => void) | undefined;
}
/** Keep a summary link click from toggling the row; the browser still follows the link. */
function stopLinkClick(event: MouseEvent): void {
  event.stopPropagation();
}
interface FileTargetLinkProps {
  label: string;
  path: string;
  onOpenFile: (path: string, options?: OpenFileOptions) => void;
  contextMenuProps: ContextMenuTriggerProps | undefined;
  onLinkKeyDown: (event: KeyboardEvent) => void;
}
/** One openable file inside a multi-file summary; activating it never toggles the row. */
function FileTargetLink({
  label,
  path,
  onOpenFile,
  contextMenuProps,
  onLinkKeyDown,
}: FileTargetLinkProps) {
  return h(
    "button",
    {
      type: "button",
      class: css.fileTargetLink,
      ...contextMenuProps,
      onClick: (event) => {
        event.stopPropagation();
        onOpenFile(path);
      },
      onKeydown: (event) => {
        onLinkKeyDown(event);
        contextMenuProps?.onKeydown?.(event);
      },
    },
    [label],
  );
}
/** Visually hidden run-state label for color-only running and settlement cues. */
function stateStatus(state: ToolRowState, t: TranslateNS<"conversation">): string | null {
  switch (state) {
    case "preparing":
      return t("row.preparing");
    case "running":
      return t("row.running");
    case "error":
      return t("row.failed");
    case "stopped":
      return t("row.stopped");
    default:
      return null;
  }
}
/**
 * Render one localized tool summary and lazily mounted result card.
 * Preparation retains the icon, title, and optional tool-name summary without disclosure.
 * @param props - tool state, summary, output, and navigation callbacks.
 * @returns the tool disclosure.
 */
export const ToolRow = defineComponent(
  (props: ToolRowProps) => {
    const _seat0 = props.useDisclosure();
    return () => {
      const {
        t,
        variant,
        toolName,
        icon,
        title,
        summary,
        summarySuffix,
        bodyRaw,
        output,
        askQuestion,
        errorSummary,
        terminal,
        diff,
        read,
        image,
        renderSlot,
        loadImage,
        search,
        web,
        details,
        state,
        filePath,
        filePathLine,
        onOpenFile,
        fileContextMenuProps,
        urlContextMenuProps,
        fileTargets,
        fileTargetContextMenuProps,
        href,
        inspect,
      } = props;
      const expanded = _seat0.value.expanded;
      const toggleExpand = _seat0.value.toggle;
      const terminalLabels = (() => terminalBlockLabels(t))();
      const diffLabels = (() => diffBlockLabels(t))();
      const readLabels = (() => readBlockLabels(t))();
      const searchLabels = (() => searchBlockLabels(t))();
      const webLabels = (() => webBlockLabels(t))();
      const terminalBody = (() =>
        terminal === undefined || terminal === null
          ? null
          : localizeTerminalCardModel(terminal, t))();
      const diffBody = diff ?? null;
      const readBody = read ?? null;
      const imageBody =
        image !== undefined && image !== null && renderSlot !== undefined && loadImage !== undefined
          ? image
          : null;
      const searchBody = search ?? null;
      const webBody = web ?? null;
      const askQuestionBody = askQuestion ?? null;
      const detailsBody = details ?? null;
      const inputRaw = bodyRaw ?? null;
      const outputText = output ?? null;
      const card =
        askQuestionBody ??
        terminalBody ??
        diffBody ??
        readBody ??
        imageBody ??
        searchBody ??
        webBody ??
        detailsBody;
      const expandable =
        state !== "preparing" && (inputRaw !== null || outputText !== null || card !== null);
      const open = expanded && expandable;
      const bodyText = (() =>
        open && card === null && inputRaw !== null ? formatToolBody(variant, inputRaw) : null)();
      const status = stateStatus(state, t);
      const running = state === "running" || state === "preparing";
      const normalSummary =
        terminalBody?.description ?? (open ? (detailsBody?.expandedSummary ?? summary) : summary);
      const exitLabel = terminalExitLabel(terminal, t);
      // Generic failures retain their first result line; command exits keep their description.
      const failureLine =
        state === "error" && exitLabel === null ? (errorSummary ?? normalSummary) : null;
      const summaryText = failureLine ?? normalSummary;
      // Diff totals remain visible after the optional summary suffix.
      const diffStat = (() => (diffBody === null ? null : diffTotals(diffBody.card.diffs)))();
      const settledWithCue = state === "error" || state === "stopped";
      const suffix = settledWithCue ? null : (summarySuffix ?? null);
      const totals = settledWithCue ? null : diffStat;
      const openFile = (() =>
        filePath !== undefined && onOpenFile !== undefined && !settledWithCue
          ? (event: MouseEvent) => {
              event.stopPropagation();
              if (filePathLine === undefined) onOpenFile(filePath);
              else onOpenFile(filePath, { line: filePathLine });
            }
          : undefined)();
      const linkHref = settledWithCue ? undefined : href;
      // Per-file links appear only on a successful result: TextShimmer accepts no
      // buttons, so running and failed rows keep the plain summary text.
      const openTarget =
        state === "ok" && fileTargets?.some((target) => target.filePath !== undefined) === true
          ? onOpenFile
          : undefined;
      // Keep Enter/Space on the focused path or URL link from bubbling to the row's
      // keydown handler, which would preventDefault() the key and toggle expand
      // instead of activating the link — the keyboard analogue of the click
      // handlers' stopPropagation. Enter activates both links and Space activates
      // the path button; Space on a URL link does nothing.
      const summaryLinkKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Enter" || event.key === " ") event.stopPropagation();
      };
      // The code variant's program renders through CodeBlock (shiki), so only its
      // output joins the IN/OUT card; every other variant's input does too.
      const cardBody = variant === "code" ? null : bodyText;
      const collapsedContent = (() =>
        summaryText !== "" &&
        h(Fragment, null, [
          h(
            "span",
            { class: css.sep, "data-shimmer-decoration": true, "aria-hidden": true },
            undefined,
          ),
          exitLabel === null && fileTargets !== undefined && openTarget !== undefined
            ? h("span", { class: css.fileLinks }, [
                fileTargets.map((target, index) =>
                  h(Fragment, { key: target.id }, [
                    index > 0 && FILE_TARGET_SEPARATOR,
                    target.from !== undefined && `${target.from}${FILE_TARGET_MOVE}`,
                    target.filePath === undefined
                      ? target.label
                      : h(
                          FileTargetLink,
                          {
                            label: target.label,
                            path: target.filePath,
                            onOpenFile: openTarget,
                            contextMenuProps: fileTargetContextMenuProps?.(target.filePath),
                            onLinkKeyDown: summaryLinkKeyDown,
                          },
                          undefined,
                        ),
                  ]),
                ),
              ])
            : exitLabel === null && openFile !== undefined
              ? h(
                  "button",
                  {
                    type: "button",
                    class: css.fileLink,
                    ...fileContextMenuProps,
                    onClick: openFile,
                    onKeydown: (event) => {
                      summaryLinkKeyDown(event);
                      fileContextMenuProps?.onKeydown?.(event);
                    },
                  },
                  [h(TextShimmer, null, { default: () => [summaryText] })],
                )
              : exitLabel === null && linkHref !== undefined
                ? h(
                    "a",
                    {
                      class: css.fileLink,
                      href: linkHref,
                      ...urlContextMenuProps,
                      target: "_blank",
                      rel: "noopener noreferrer",
                      onClick: stopLinkClick,
                      onKeydown: (event) => {
                        summaryLinkKeyDown(event);
                        urlContextMenuProps?.onKeydown?.(event);
                      },
                    },
                    [h(TextShimmer, null, { default: () => [summaryText] })],
                  )
                : h(
                    "span",
                    {
                      class: clsx(
                        css.summary,
                        exitLabel === null && state === "error" && css.errorSummary,
                        exitLabel === null && state === "stopped" && css.stoppedSummary,
                      ),
                    },
                    [h(TextShimmer, null, { default: () => [summaryText] })],
                  ),
          exitLabel !== null && h(ExitCodeBadge, { label: exitLabel }, undefined),
          suffix !== null &&
            h(TextShimmer, { className: css.summarySuffix ?? "" }, { default: () => [suffix] }),
          totals !== null &&
            h(
              TextShimmer,
              { className: clsx(css.summarySuffix, css.diffStat) },
              {
                default: () => [
                  h("span", { class: css.diffAdded }, [`+${totals.added}`]),
                  " ",
                  h("span", { class: css.diffRemoved }, [`-${totals.removed}`]),
                ],
              },
            ),
        ]))();
      const expandedContent = (() =>
        open
          ? h("div", { class: clsx(css.bodyWrap, detailsBody !== null && css.detailsBodyWrap) }, [
              askQuestionBody !== null
                ? h(AskQuestionCard, { card: askQuestionBody }, undefined)
                : terminalBody !== null
                  ? h(
                      TerminalBlock,
                      {
                        ...terminalBody.card,
                        maxLines: Infinity,
                        labels: terminalLabels,
                        className: css.terminalBody ?? "",
                      },
                      undefined,
                    )
                  : diffBody !== null
                    ? h(Fragment, null, [
                        h(
                          DiffBlock,
                          {
                            ...diffBody.card,
                            labels: diffLabels,
                            maxLines: CHAT_DIFF_MAX_LINES,
                            className: css.diffBody ?? "",
                          },
                          undefined,
                        ),
                        state === "error" &&
                          outputText !== null &&
                          h("div", { class: css.ioCard }, [
                            h("div", { class: css.ioSection }, [
                              h("span", { class: css.ioLabel }, [t("row.output")]),
                              h("span", { class: css.ioText, "data-error": true }, [outputText]),
                            ]),
                          ]),
                      ])
                    : readBody !== null
                      ? h(
                          ReadBlock,
                          {
                            ...readBody,
                            labels: readLabels,
                            maxLines: CHAT_READ_MAX_LINES,
                            className: css.readBody ?? "",
                          },
                          undefined,
                        )
                      : imageBody !== null
                        ? h("div", { class: css.imageBody }, [
                            renderSlot !== undefined &&
                              loadImage !== undefined &&
                              renderSlot("tool.call.images", {
                                images: imageBody.images,
                                loadImage,
                                align: "start",
                              }),
                            h("div", { class: css.imageMeta }, [
                              h("div", null, [imageBody.path]),
                              imageBody.images.map(({ attachment }, index) =>
                                h("div", { key: index }, [
                                  attachment.originalDimensions === undefined
                                    ? t("row.imageSize", {
                                        width: attachment.width,
                                        height: attachment.height,
                                        bytes: attachment.bytes,
                                      })
                                    : t("row.imageSizeDownscaled", {
                                        width: attachment.width,
                                        height: attachment.height,
                                        originalWidth: attachment.originalDimensions.width,
                                        originalHeight: attachment.originalDimensions.height,
                                        bytes: attachment.bytes,
                                      }),
                                ]),
                              ),
                            ]),
                            imageBody.extraText !== null &&
                              h("div", { class: css.imageExtra }, [imageBody.extraText]),
                          ])
                        : searchBody !== null
                          ? h(Fragment, null, [
                              h(
                                SearchBlock,
                                {
                                  ...searchBody.card,
                                  labels: searchLabels,
                                  maxLines: CHAT_SEARCH_MAX_LINES,
                                  className: css.searchBody ?? "",
                                },
                                undefined,
                              ),
                              searchBody.recovery !== undefined &&
                                h("div", { class: css.searchRecovery }, [searchBody.recovery]),
                            ])
                          : webBody !== null
                            ? h(
                                WebBlock,
                                { ...webBody, labels: webLabels, className: css.webBody ?? "" },
                                undefined,
                              )
                            : detailsBody !== null
                              ? h(
                                  ToolDetails,
                                  {
                                    model: detailsBody,
                                    hasInspect: inspect !== undefined,
                                    t: t,
                                    onOpenFile: onOpenFile,
                                  },
                                  undefined,
                                )
                              : h(Fragment, null, [
                                  variant === "code" &&
                                    bodyText !== null &&
                                    h("div", { class: css.bodyScroll }, [
                                      h(
                                        CodeBlock,
                                        {
                                          code: bodyText,
                                          lang: "typescript",
                                          copyLabel: t("copy"),
                                          copiedLabel: t("copied"),
                                          toolbarLabels: codeToolbarLabels(t),
                                          className: css.codeBody ?? "",
                                        },
                                        undefined,
                                      ),
                                    ]),
                                  (cardBody !== null || outputText !== null) &&
                                    h("div", { class: css.ioCard }, [
                                      cardBody !== null &&
                                        h("div", { class: css.ioSection }, [
                                          h("span", { class: css.ioLabel }, [t("row.input")]),
                                          h("span", { class: css.ioText }, [cardBody]),
                                        ]),
                                      cardBody !== null &&
                                        outputText !== null &&
                                        h(
                                          "span",
                                          { class: css.ioDivider, "aria-hidden": true },
                                          undefined,
                                        ),
                                      outputText !== null &&
                                        h("div", { class: css.ioSection }, [
                                          h("span", { class: css.ioLabel }, [t("row.output")]),
                                          h(
                                            "span",
                                            {
                                              class: css.ioText,
                                              "data-error": state === "error" || undefined,
                                            },
                                            [outputText],
                                          ),
                                        ]),
                                    ]),
                                ]),
              inspect !== undefined &&
                h("button", { type: "button", class: css.inspectButton, onClick: inspect }, [
                  h(IconInspectOutlineRegular, null, undefined),
                  t("row.inspect"),
                ]),
            ])
          : undefined)();
      return h(
        "div",
        { class: css.root, "data-variant": variant, "data-tool": toolName, "data-state": state },
        [
          status !== null && h("span", { class: css.visuallyHidden }, [status]),
          h(
            DisclosureRow,
            {
              rowClassName: css.row,
              leadingClassName: css.leading,
              titleClassName: css.title,
              icon: icon,
              title: title,
              running: running,
              open: open,
              expandable: expandable,
              expandOnRowClick: true,
              keepContentWhenOpen: true,
              onToggle: toggleExpand,
              collapsedContent: collapsedContent,
            },
            { default: () => [expandedContent] },
          ),
        ],
      );
    };
  },
  {
    name: "ToolRow",
    inheritAttrs: false,
    props: [
      "useDisclosure",
      "t",
      "variant",
      "toolName",
      "icon",
      "title",
      "summary",
      "summarySuffix",
      "bodyRaw",
      "output",
      "askQuestion",
      "errorSummary",
      "terminal",
      "diff",
      "read",
      "image",
      "renderSlot",
      "loadImage",
      "search",
      "web",
      "details",
      "state",
      "filePath",
      "filePathLine",
      "onOpenFile",
      "fileContextMenuProps",
      "fileTargets",
      "fileTargetContextMenuProps",
      "urlContextMenuProps",
      "href",
      "inspect",
    ],
  },
);
