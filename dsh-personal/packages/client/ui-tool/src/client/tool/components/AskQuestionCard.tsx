import { h } from "vue";
/** Ask-user transcript rendering from validated plain card data. @module */
import type { AskQuestionCardModel } from "../models/ask-question-card-model.ts";
import css from "./AskQuestionCard.module.css";
/**
 * Render a validated ask-user transcript from plain card data.
 * @param props - Localized transcript card data.
 * @returns the readable answered or unanswered question list.
 */
export function AskQuestionCard({ card }: { card: AskQuestionCardModel }) {
  if (card.kind === "unanswered") {
    return h("div", { class: css.card }, [
      h("p", { class: css.verdict }, [card.verdict]),
      h("ul", { class: css.questionList }, [
        card.questions.map((question) =>
          h("li", { class: css.unansweredQuestion, key: question.id }, [question.question]),
        ),
      ]),
    ]);
  }
  return h("dl", { class: css.card }, [
    card.questions.map((question) =>
      h("div", { class: css.item, key: question.id }, [
        h("dt", { class: css.question }, [question.question]),
        h("dd", { class: css.answer }, [
          question.answers.length === 0
            ? h("span", { class: css.skipped }, [card.skippedLabel])
            : question.answers.map((answer, index) =>
                h("span", { class: css.answerLine, key: `${question.id}-${String(index)}` }, [
                  answer,
                ]),
              ),
        ]),
      ]),
    ),
  ]);
}
