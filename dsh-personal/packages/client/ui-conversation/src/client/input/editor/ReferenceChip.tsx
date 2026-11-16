/** Pure native Vue body of a model-owned inline reference decorator. */
import { h, type VNode } from "vue";
import clsx from "clsx";
import { ReferenceIconRegular } from "@deepseek-ai/dsh-client-ui-primitives";
import type { ReferenceIconKind } from "@deepseek-ai/dsh-client-ui-primitives";
import css from "./ReferenceChip.module.css";
import referenceCss from "./composer-editor.module.css";

/** Cached owner projections displayed by one chip. */
export interface ReferenceChipProps {
  readonly label: string;
  readonly appearance?: ReferenceIconKind | undefined;
  readonly invalid: boolean;
}

/** @param props - cached display values. @returns the inline chip body. */
export function ReferenceChip({ label, appearance, invalid }: ReferenceChipProps): VNode {
  return h(
    "span",
    {
      class: clsx(
        referenceCss.reference,
        css.chip,
        appearance === "file" && !invalid && referenceCss.openable,
        invalid && css.invalid,
      ),
      title: label,
    },
    [
      appearance === undefined
        ? h("span", { class: css.marker, "aria-hidden": "true" }, "@")
        : h(ReferenceIconRegular, { kind: appearance, size: 14, className: css.icon }),
      h("span", { class: css.label }, label),
    ],
  );
}
