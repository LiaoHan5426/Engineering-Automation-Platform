/** Render model-evaluated JSON business nodes through native Vue slots. */
import { computed, defineComponent, Fragment, h, watch } from "vue";
import type { FactoryComponentPropsOf } from "@deepseek-ai/dsh-client-ui-slots";
import { HoverCardGroup, ReferenceChip, UserTextRun } from "@deepseek-ai/dsh-client-ui-primitives";
import type { UserTextNodeProps } from "../contract/slots.ts";
import type { UserTextNode } from "../contract/user-text.ts";
import css from "./UserText.module.css";

type UserTextProps = FactoryComponentPropsOf<"conversation.user.text">;
type UserTextOwner = Parameters<UserTextProps["renderSlot"]>[1];

/** Evaluate current facts and rules; preserve all raw text on a failed transform. */
export const UserText = defineComponent(
  (props: UserTextProps) => {
    const revision = props.useUserTextRevision((value) => value);
    const evaluate = computed(() => props.createUserTextEvaluator());
    const result = computed((): { nodes: readonly UserTextNode[] | undefined; error?: unknown } => {
      // The rule model remains authoritative; this seat only invalidates evaluation.
      void revision.value;
      try {
        return { nodes: evaluate.value({ text: props.text, facts: props.facts }) };
      } catch (error: unknown) {
        return { nodes: undefined, error };
      }
    });
    watch(
      [
        () => result.value.nodes === undefined,
        () => result.value.error,
        () => props.reportTransformFailure,
      ] as const,
      ([failed, error, report]) => {
        if (failed) report(error);
      },
      { immediate: true, flush: "post" },
    );
    return () => {
      const { text, interactive = false, ellipsis = false, renderSlot } = props;
      const nodes = result.value.nodes;
      const content =
        nodes === undefined
          ? h(UserTextRun, { text })
          : h(
              Fragment,
              null,
              nodes.map((node) => {
                const raw = text.slice(node.start, node.end);
                // Node ID discriminates its payload; the enclosing slot owner is not distributive.
                const owner = { node, raw, interactive } as UserTextOwner;
                return h(Fragment, { key: `${node.id}:${node.start}` }, [
                  renderSlot("conversation.user.text.node", owner, {
                    entryKey: node.id,
                    fallback: h(UserTextRun, {
                      text: node.id === "text" ? (node.data.display ?? raw) : raw,
                    }),
                  }),
                ]);
              }),
            );
      return h(
        HoverCardGroup,
        { as: "span", className: (ellipsis ? css.ellipsis : css.root) ?? "" },
        { default: () => content },
      );
    };
  },
  {
    props: [
      "text",
      "facts",
      "interactive",
      "ellipsis",
      "useUserTextRevision",
      "createUserTextEvaluator",
      "reportTransformFailure",
      "renderSlot",
    ],
    inheritAttrs: false,
  },
);

/** Display a parser-produced plain-text node. */
export function PlainUserText({ node }: UserTextNodeProps<"text">) {
  return h(UserTextRun, { text: node.data.display ?? node.data.text });
}

/** Display a confirmed Session label with its existing non-interactive chip. */
export function SessionReference({ node, raw }: UserTextNodeProps<"session">) {
  return h(ReferenceChip, { appearance: "session", label: node.data.label, title: raw });
}
