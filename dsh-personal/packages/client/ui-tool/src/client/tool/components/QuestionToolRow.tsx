import { defineComponent, h, Fragment } from "vue";
/** Question-owned summary action and transcript disclosure. */
import {
  DisclosureRow,
  IconInspectOutlineRegular,
  IconQuestionOutlineRegular,
  TextShimmer,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type { ToolRowProps } from "./ToolRow.tsx";
import { formatToolBody } from "../models/tool-call-model.ts";
import { AskQuestionCard } from "./AskQuestionCard.tsx";
import css from "./ToolRow.module.css";
import questionCss from "./QuestionToolRow.module.css";
type QuestionToolRowProps = Pick<
  ToolRowProps,
  "useDisclosure" | "t" | "summary" | "bodyRaw" | "output" | "askQuestion" | "state" | "inspect"
> & {
  readonly openPanel: () => boolean;
  readonly panelLabel: string;
};
/**
 * Render a question with its answer-panel entry point.
 * @param props - Question transcript, panel action, and disclosure state.
 * @returns The question's summary and optional expanded record.
 */
export const QuestionToolRow = defineComponent(
  (props: QuestionToolRowProps) => {
    const _seat0 = props.useDisclosure();
    return () => {
      const { t, summary, bodyRaw, output, askQuestion, state, inspect, openPanel, panelLabel } =
        props;
      const expanded = _seat0.value.expanded;
      const toggle = _seat0.value.toggle;
      const expandable = bodyRaw != null || output != null || askQuestion != null;
      const open = expanded && expandable;
      return h(
        "div",
        {
          class: css.root,
          "data-variant": "others",
          "data-tool": "ask_user_question",
          "data-state": state,
        },
        [
          state === "running" && h("span", { class: css.visuallyHidden }, [t("row.running")]),
          h(
            DisclosureRow,
            {
              rowClassName: css.row,
              leadingClassName: css.leading,
              titleClassName: css.title,
              chevronClassName: css.chevron,
              icon: h(IconQuestionOutlineRegular, null, undefined),
              title: t("ask.rowTitle"),
              running: state === "running",
              open: open,
              expandable: expandable,
              keepContentWhenOpen: true,
              onToggle: toggle,
              collapsedContent: h(Fragment, null, [
                summary !== "" &&
                  h(Fragment, null, [
                    h("span", { class: css.sep, "aria-hidden": true }, undefined),
                    h("span", { class: css.summary }, [
                      h(TextShimmer, { active: state === "running" }, { default: () => [summary] }),
                    ]),
                  ]),
                h(
                  "button",
                  {
                    type: "button",
                    class: questionCss.panelButton,
                    onClick: (event) => {
                      event.stopPropagation();
                      if (!openPanel()) toggle();
                    },
                    onKeydown: (event) => {
                      if (event.key === "Enter" || event.key === " ") event.stopPropagation();
                    },
                  },
                  [h(IconQuestionOutlineRegular, null, undefined), panelLabel],
                ),
              ]),
            },
            {
              default: () => [
                open &&
                  h("div", { class: css.bodyWrap }, [
                    askQuestion != null
                      ? h(AskQuestionCard, { card: askQuestion }, undefined)
                      : h("div", { class: css.ioCard }, [
                          bodyRaw != null &&
                            h("div", { class: css.ioSection }, [
                              h("span", { class: css.ioLabel }, [t("row.input")]),
                              h("span", { class: css.ioText }, [formatToolBody("others", bodyRaw)]),
                            ]),
                          bodyRaw != null &&
                            output != null &&
                            h("span", { class: css.ioDivider, "aria-hidden": true }, undefined),
                          output != null &&
                            h("div", { class: css.ioSection }, [
                              h("span", { class: css.ioLabel }, [t("row.output")]),
                              h("span", { class: css.ioText }, [output]),
                            ]),
                        ]),
                    inspect !== undefined &&
                      h("button", { type: "button", class: css.inspectButton, onClick: inspect }, [
                        h(IconInspectOutlineRegular, null, undefined),
                        t("row.inspect"),
                      ]),
                  ]),
              ],
            },
          ),
        ],
      );
    };
  },
  {
    name: "QuestionToolRow",
    inheritAttrs: false,
    props: [
      "t",
      "state",
      "output",
      "summary",
      "useDisclosure",
      "inspect",
      "bodyRaw",
      "askQuestion",
      "openPanel",
      "panelLabel",
    ],
  },
);
