import { h, Fragment, useId, defineComponent, computed, shallowRef, type VNodeChild } from "vue";
import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import type {
  HostObservable,
  InjectFace,
  PropsLocale,
  PropsRuntime,
  Translate,
} from "@deepseek-ai/dsh-client-ui-slots";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
import type { ToolCallId } from "@deepseek-ai/dsh-llm/types";
import type {
  ActionCardDecision,
  ActionCardFields,
  ActionCardProposal,
  ActionCardResult,
  ActionCardView,
} from "@deepseek-ai/dsh-action-cards/types";
import type {} from "@deepseek-ai/dsh-client-ui-chat/client";
import type { ActionCardKey } from "./locales.ts";
import type { FoldedTextProps, RegisteredBody } from "./registry.ts";
import css from "./Card.module.css";
/** Session-bound actions and registered bodies, without a service in the component. */
export interface TailInjected {
  /**
   * Send one user action for a card of the displayed Session.
   * @param callId - the card's call id.
   * @param verb - `dismiss` or one of the kind's verbs.
   * @param payload - kind-defined fields.
   * @returns the Host result, or undefined when the reply was lost.
   */
  act: (
    callId: ToolCallId,
    verb: string,
    payload?: ActionCardFields,
  ) => Promise<ActionCardResult | undefined>;
  /**
   * Bind a body's own locale namespace.
   * @param locale - namespace the body declared.
   * @returns its translator.
   */
  bind: (locale: string) => Translate;
  hooks: {
    bodies: HostObservable<ReadonlyMap<string, RegisteredBody>>;
  };
  sessionId: SessionId;
}
type TailProps = Pick<PropsRuntime<"conversation.chat.turnTail">, "turn" | "useProjection"> &
  PropsLocale<"actionCards"> &
  InjectFace<TailInjected>;
/** Graphemes drawn about twice as wide as a Latin letter: CJK scripts, CJK punctuation and fullwidth forms. */
const WIDE_GRAPHEME =
  /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}　-〿＀-｠￠-￦]/u;
/** Preview budget in Latin-letter widths, about two card lines at desktop width. */
const FOLD_WIDTH = 260;
/**
 * Fold omitted text without measuring layout; a wide grapheme counts twice so Chinese and English fold near the
 * same line. The full text is never altered.
 * @param props - text and its localized toggle labels.
 * @returns the paragraph and, when text was omitted, its toggle.
 */
export const FoldedText = defineComponent(
  (props: FoldedTextProps) => {
    const id = useId();
    const expanded = shallowRef(false);
    const preview = computed(() => {
      const compact = props.text.replace(/\s+/g, " ").trim();
      const characters = Array.from(
        new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(compact),
        (part) => part.segment,
      );
      let width = 0;
      for (const [index, character] of characters.entries()) {
        width += WIDE_GRAPHEME.test(character) ? 2 : 1;
        if (width > FOLD_WIDTH) return characters.slice(0, index).join("").trimEnd() + "…";
      }
      return undefined;
    });
    return () => {
      return h(Fragment, {}, [
        h("p", { id: id, class: css.text }, [
          expanded.value || preview.value === undefined ? props.text : preview.value,
        ]),
        preview.value !== undefined &&
          h(
            Button,
            {
              variant: "ghost",
              size: "sm",
              className: css.toggle!,
              "aria-expanded": expanded.value,
              "aria-controls": id,
              onClick: () => {
                expanded.value = ((value) => !value)(expanded.value);
              },
            },
            { default: () => [expanded.value ? props.collapseLabel : props.expandLabel] },
          ),
      ]);
    };
  },
  { props: ["text", "expandLabel", "collapseLabel"] },
);
/** The projection admits at most one card per turn; should several exist, the lowest call id is shown. */
function proposalOf(
  view: ActionCardView | undefined,
  turn: number,
): ActionCardProposal | undefined {
  let found: ActionCardProposal | undefined;
  for (const proposal of Object.values(view?.proposals ?? {})) {
    if (proposal.turn === turn && (found === undefined || proposal.callId < found.callId))
      found = proposal;
  }
  return found;
}
function decisionOf(
  view: ActionCardView | undefined,
  callId: string,
): ActionCardDecision | undefined {
  return view !== undefined && Object.hasOwn(view.decisions, callId)
    ? view.decisions[callId]
    : undefined;
}
/**
 * Place the card admitted in a turn after that turn's final answer, once the turn has ended with one.
 * @param props - Turn location, projection reader, registered bodies and Session-bound actions.
 * @returns the card, or null while the turn is open or when it ended without answer text.
 */
export const ActionCardTail = defineComponent(
  (props: TailProps) => {
    const view = props.useProjection("actionCards");
    const proposal = computed(() => proposalOf(view.value, props.turn.turn));
    return () => {
      return proposal.value === undefined ||
        props.turn.end === undefined ||
        props.turn.data.get("turn-tail")?.closing == null
        ? null
        : h(ActionCard, {
            ...props,
            proposal: proposal.value,
            decision: decisionOf(view.value, proposal.value.callId),
          });
    };
  },
  { props: ["turn", "useProjection", "t", "act", "bind", "sessionId", "useBodies"] },
);
/**
 * Render the frame around one card.
 * @param props - the card, its state, registered bodies and actions.
 * @returns the card section.
 */
export const ActionCard = defineComponent(
  (
    props: {
      proposal: ActionCardProposal;
      decision: ActionCardDecision | undefined;
    } & InjectFace<TailInjected> &
      PropsLocale<"actionCards">,
  ) => {
    const body = props.useBodies((bodies) => bodies.get(props.proposal.action));
    const send = (verb: string, payload?: ActionCardFields) =>
      props.act(props.proposal.callId, verb, payload);
    const summary = computed(() =>
      h(Fragment, {}, [
        h("strong", { class: css.title }, [props.proposal.title]),
        h(FoldedText, {
          text: props.proposal.brief,
          expandLabel: props.t("expandBrief"),
          collapseLabel: props.t("collapseBrief"),
        }),
      ]),
    );
    // The frame re-renders on a locale change and hands the body a new summary, so the body re-renders with it.
    const content = computed(() =>
      body.value === undefined
        ? h(FallbackBody, {
            summary: summary.value,
            decision: props.decision,
            act: send,
            t: props.t,
          })
        : body.value.render(
            {
              proposal: props.proposal,
              decision: props.decision,
              sessionId: props.sessionId,
              summary: summary.value,
              Folded: FoldedText,
              act: send,
            },
            props.bind(body.value.locale),
          ),
    );
    return () => {
      return h(
        "section",
        {
          class: css.card,
          "aria-label": props.proposal.title,
          "data-action-card": props.proposal.callId,
          "data-action": props.proposal.action,
        },
        [content.value],
      );
    };
  },
  { props: ["proposal", "decision", "act", "bind", "sessionId", "useBodies", "t"] },
);
/** Phases the fallback can name; other kind phases leave only the summary. */
const NAMED_PHASES: Readonly<Record<string, ActionCardKey>> = {
  dismissed: "dismissed",
  replaced: "replaced",
};
const FallbackBody = defineComponent(
  (
    props: {
      summary: VNodeChild;
      decision: ActionCardDecision | undefined;
      act: (verb: string) => Promise<ActionCardResult | undefined>;
    } & PropsLocale<"actionCards">,
  ) => {
    const pending = shallowRef(false);
    const error = shallowRef<ActionCardKey>();
    const phase = computed(() =>
      props.decision === undefined || !Object.hasOwn(NAMED_PHASES, props.decision.phase)
        ? undefined
        : NAMED_PHASES[props.decision.phase],
    );
    const dismiss = async () => {
      pending.value = true;
      error.value = undefined;
      try {
        const result = await props.act("dismiss");
        if (result === undefined) error.value = "transport";
        else if (result.status === "refused" || result.status === "unconfirmed")
          error.value = "unavailable";
      } catch {
        // A lost reply does not prove failure; replay supplies the durable decision.
        error.value = "transport";
      } finally {
        pending.value = false;
      }
    };
    return () => {
      return h("div", { class: css.body }, [
        props.summary,
        phase.value !== undefined &&
          h("p", { role: "status", class: css.status }, [props.t(phase.value)]),
        error.value !== undefined &&
          h("p", { role: "alert", class: css.status }, [props.t(error.value)]),
        props.decision === undefined &&
          h("footer", { class: css.footer }, [
            h(
              Button,
              {
                variant: "ghost",
                size: "sm",
                disabled: pending.value,
                onClick: () => {
                  void dismiss();
                },
              },
              { default: () => [props.t("dismiss")] },
            ),
          ]),
      ]);
    };
  },
  { props: ["summary", "decision", "act", "t"] },
);
