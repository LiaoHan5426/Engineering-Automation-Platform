/** Pure native Vue body of a model-owned command decorator. */
import { h, type VNode } from "vue";
import clsx from "clsx";
import css from "./ReferenceChip.module.css";
import referenceCss from "./composer-editor.module.css";

/** Display input of the claimed command chip. */
export interface CommandChipProps {
  readonly token: string;
}

/** @param props - claimed command text. @returns the chip body. */
export function CommandChip({ token }: CommandChipProps): VNode {
  return h(
    "span",
    { class: clsx(referenceCss.reference, css.chip) },
    h("span", { class: css.label }, token),
  );
}
