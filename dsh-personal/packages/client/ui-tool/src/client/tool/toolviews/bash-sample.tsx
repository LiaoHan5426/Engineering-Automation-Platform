import { defineComponent, h, Fragment } from "vue";
import type { Context } from "@deepseek-ai/cordis";
import clsx from "clsx";
import {
  IconApiOutlineRegular,
  IconChevronDownOutlineRegular,
  IconChevronUpOutlineRegular,
  IconInspectOutlineRegular,
  CommandText,
  TerminalBlock,
  TextShimmer,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type { PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import type { ToolCallViewProps } from "../../contract/slots.ts";
import {
  isBackgroundShellCall,
  isSettledPersistentShellCall,
  isSpilledShellCall,
  localizeTerminalCardModel,
  terminalBlockLabels,
  terminalCardModel,
  terminalFailed,
  terminalExitLabel,
} from "../models/terminal-card-model.ts";
import { formatToolBody, toolRowModel, type ToolRowState } from "../models/tool-call-model.ts";
import { CONVERSATION_NS as NS } from "../../locale.ts";
import { ExitCodeBadge } from "../components/ExitCodeBadge.tsx";
import css from "./bash-sample.module.css";
type BashRowProps = ToolCallViewProps & PropsLocale<"conversation">;
const BASH_ICON = h(IconApiOutlineRegular, { size: 14 }, undefined);
/** Visually hidden status for the color-only running sweep and error tone. */
function stateStatus(state: ToolRowState, t: BashRowProps["t"]): string | null {
  switch (state) {
    case "preparing":
      return t("row.preparing");
    case "running":
      return t("bash.running");
    case "error":
      return t("bash.failed");
    case "stopped":
      return t("bash.stopped");
    default:
      return null;
  }
}
/**
 * Render expandable Bash output with an accessible lifecycle label. While the
 * call is preparing the row shows the description streamed so far and cannot expand.
 * @param props - tool call, Session sources, locale, and inspection callback.
 * @returns the Bash output row.
 */
export const BashRow = defineComponent(
  (props: BashRowProps) => {
    const _seat0 = props.useSessions((list) => list.byId[props.sessionId]?.cwd);
    const _seat1 = props.useDisclosure();
    return () => {
      const { toolName, block, inspect, t } = props;
      const model = (() => toolRowModel(toolName, block))();
      const cwd = _seat0.value;
      const terminalModel = (() => terminalCardModel(block, cwd))();
      const terminal = (() =>
        terminalModel === null ? null : localizeTerminalCardModel(terminalModel, t))();
      const labels = (() => terminalBlockLabels(t))();
      // Exit failures are result data even when the tool call itself succeeds.
      const state =
        model.state === "ok" && terminalModel !== null && terminalFailed(terminalModel)
          ? "error"
          : model.state;
      const status = stateStatus(state, t);
      const expanded = _seat1.value.expanded;
      const toggleExpand = _seat1.value.toggle;
      const background = isBackgroundShellCall(block);
      // Failed or interrupted background launches retain raw input/output, as do
      // other execution failures, persistent results, and spill previews.
      const genericBody =
        terminal === null &&
        (model.state === "error" ||
          isSettledPersistentShellCall(block) ||
          isSpilledShellCall(block) ||
          background) &&
        (model.bodyRaw !== null || model.output !== null);
      const expandable = terminal !== null || genericBody;
      const open = expanded && expandable;
      const body = (() =>
        open && genericBody && model.bodyRaw !== null
          ? formatToolBody(model.variant, model.bodyRaw)
          : null)();
      const normalSummary = terminal?.description ?? model.summary;
      const exitLabel = terminalExitLabel(terminalModel, t);
      const settlementLine =
        exitLabel !== null
          ? null
          : state === "error"
            ? (model.errorSummary ?? normalSummary)
            : state === "stopped"
              ? t("bash.stopped")
              : null;
      const running = state === "running" || state === "preparing";
      const toggleFromKeyboard = (event: KeyboardEvent) => {
        if (!expandable || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        toggleExpand();
      };
      const leading = open
        ? h(IconChevronUpOutlineRegular, { className: css.chevron ?? "" }, undefined)
        : expandable
          ? h(Fragment, null, [
              h("span", { class: css.iconIdle }, [BASH_ICON]),
              h(
                IconChevronDownOutlineRegular,
                { className: clsx(css.chevron, css.chevronHover) },
                undefined,
              ),
            ])
          : BASH_ICON;
      return h("div", { class: css.card }, [
        h(
          "div",
          {
            class: css.root,
            "data-sample": "bash",
            "data-variant": "bash",
            "data-state": state,
            "data-expandable": expandable || undefined,
            role: expandable ? "button" : undefined,
            tabIndex: expandable ? 0 : undefined,
            "aria-expanded": expandable ? open : undefined,
            onClick: expandable ? toggleExpand : undefined,
            onKeydown: expandable ? toggleFromKeyboard : undefined,
          },
          [
            h("span", { class: css.leading }, [leading]),
            status !== null && h("span", { class: css.visuallyHidden }, [status]),
            h(
              TextShimmer,
              { active: running },
              {
                default: () => [
                  h(
                    TextShimmer,
                    { className: css.title ?? "" },
                    { default: () => [t(model.titleKey)] },
                  ),
                  h(
                    "span",
                    { class: css.sep, "data-shimmer-decoration": true, "aria-hidden": true },
                    undefined,
                  ),
                  h(
                    "span",
                    {
                      class: clsx(
                        css.summary,
                        exitLabel === null && state === "error" && css.errorSummary,
                        exitLabel === null && state === "stopped" && css.stoppedSummary,
                      ),
                    },
                    [h(TextShimmer, null, { default: () => [settlementLine ?? normalSummary] })],
                  ),
                  exitLabel !== null && h(ExitCodeBadge, { label: exitLabel }, undefined),
                ],
              },
            ),
          ],
        ),
        open &&
          h("div", { class: css.bodyWrap }, [
            terminal !== null
              ? h(
                  TerminalBlock,
                  {
                    ...terminal.card,
                    maxLines: Infinity,
                    labels: labels,
                    className: css.terminal ?? "",
                  },
                  undefined,
                )
              : h("div", { class: css.ioCard }, [
                  body !== null &&
                    h("div", { class: css.ioSection }, [
                      h("span", { class: css.ioLabel }, [t("row.input")]),
                      background
                        ? h(
                            CommandText,
                            {
                              className: css.commandInput ?? "",
                              text: body,
                              label: t("row.commandArguments"),
                            },
                            undefined,
                          )
                        : h("span", { class: css.ioText }, [body]),
                    ]),
                  body !== null &&
                    model.output !== null &&
                    h("span", { class: css.ioDivider, "aria-hidden": true }, undefined),
                  model.output !== null &&
                    h("div", { class: css.ioSection }, [
                      h("span", { class: css.ioLabel }, [t("row.output")]),
                      h(
                        "span",
                        { class: css.ioText, "data-error": state === "error" || undefined },
                        [model.output],
                      ),
                    ]),
                ]),
            inspect !== undefined &&
              h("button", { type: "button", class: css.inspectButton, onClick: inspect }, [
                h(IconInspectOutlineRegular, null, undefined),
                t("row.inspect"),
              ]),
          ]),
      ]);
    };
  },
  {
    name: "BashRow",
    inheritAttrs: false,
    props: [
      "useDisclosure",
      "callId",
      "toolName",
      "cwd",
      "home",
      "openFile",
      "loadImage",
      "inspect",
      "phase",
      "block",
      "useSession",
      "sessionId",
      "useProjection",
      "useAccess",
      "useConversation",
      "useInput",
      "inputActions",
      "useChat",
      "useRemoteAccess",
      "useSessions",
      "useSessionRetainInfo",
      "useSessionAccess",
      "useContextMenu",
      "useWorkspaces",
      "t",
    ],
  },
);
/** Registers the standalone Bash conversation-row sample. */
export const bashToolviewSample = {
  name: "bash-toolview-sample",
  inject: ["slots"],
  apply(ctx: Context): void {
    ctx.slots.inject("tool.call.toolview", () =>
      ctx.slots.register({ name: "tool.call.toolview", key: "bash", locale: NS }, BashRow),
    );
  },
};
