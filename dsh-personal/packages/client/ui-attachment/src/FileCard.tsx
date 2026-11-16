import {
  fileExtension,
  FileTypeIcon,
  fileSizeText,
  IconCloseFillRegular,
} from "@deepseek-ai/dsh-client-ui-primitives";
import css from "./FileCard.module.css";
import { h } from "vue";
/** Localized strings consumed by one pending-file card. */
export interface FileCardLabels {
  /** Card body announcement, e.g. "Pending file {name}". */
  readonly label: string;
  /** Remove-button label. */
  readonly remove: string;
  /** Status line while the upload is in flight. */
  readonly uploading: string;
  /** Status line and retry affordance after a failed upload. */
  readonly failed: string;
  /** Retry-button label. */
  readonly retry: string;
}
/** Upload display state resolved by the owner. */
export type FileCardState = "uploading" | "ready" | "error";
/** One pending file card: type glyph, name, size or upload status, remove, retry. */
export function FileCard({
  name,
  bytes,
  state,
  progress,
  labels,
  onRemove,
  onRetry,
}: {
  name: string;
  bytes: number;
  state: FileCardState;
  progress?: number;
  labels: FileCardLabels;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const extension = fileExtension(name).toUpperCase().slice(0, 8);
  const meta =
    state === "uploading"
      ? labels.uploading
      : state === "error"
        ? labels.failed
        : [extension, fileSizeText(bytes)].filter((part) => part !== "").join(" ");
  const retryable = state === "error";
  return h("div", { class: `${css.card}${retryable ? ` ${css.failed}` : ""}`, title: name }, [
    h("span", { class: css.icon, "aria-hidden": true }, [
      state === "uploading"
        ? h("span", { class: css.spinner }, undefined)
        : h(FileTypeIcon, { path: name }, undefined),
    ]),
    retryable
      ? h(
          "button",
          {
            type: "button",
            class: `${css.body} ${css.retry}`,
            "aria-label": labels.retry,
            onClick: onRetry,
          },
          [
            h("span", { class: css.name }, [name]),
            h("span", { class: `${css.meta} ${css.metaFailed}` }, [meta]),
          ],
        )
      : h("span", { class: css.body, "aria-label": labels.label }, [
          h("span", { class: css.name }, [name]),
          h("span", { class: css.meta }, [meta]),
        ]),
    h(
      "button",
      {
        type: "button",
        class: retryable ? `${css.remove} ${css.removeFailed}` : css.remove,
        "aria-label": labels.remove,
        onClick: onRemove,
      },
      [h(IconCloseFillRegular, { size: 12 }, undefined)],
    ),
    state === "uploading" &&
      h("span", { class: css.progressTrack, "aria-hidden": true }, [
        h(
          "span",
          {
            class: css.progressBar,
            style:
              progress === undefined
                ? undefined
                : { width: `${String(Math.min(1, Math.max(0, progress)) * 100)}%` },
          },
          undefined,
        ),
      ]),
  ]);
}
