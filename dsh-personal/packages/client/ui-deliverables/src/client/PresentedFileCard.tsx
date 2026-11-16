import { defineComponent, h, computed, type VNodeChild } from "vue";
import type { ContextMenuTriggerProps } from "@deepseek-ai/dsh-client-ui-context-menu/client";
/** File identity, Sidebar preview, and contributed native actions for one delivery. */
import { resolveWorkspacePath } from "@deepseek-ai/dsh-util-workspace-path";
import { FileTypeIcon, fileExtension } from "@deepseek-ai/dsh-client-ui-primitives";
import type { PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import type { PresentedHost } from "../presented.ts";
import type { PresentedOpenPhase } from "./present-open.ts";
import { basename, type PresentedPath } from "./turn-deliverables.ts";
import type { NS } from "./locales.ts";
import css from "./Deliverables.module.css";
function cardDescription(description: string | undefined, fallback: string): string {
  const trimmed = description?.replace(/\s*(?:\([^()]*\)|（[^（）]*）)\s*$/u, "").trim();
  return trimmed === undefined || trimmed === "" ? fallback : trimmed;
}
export const PresentedFileCard = defineComponent(
  (
    props: {
      file: PresentedPath;
      cwd: string | undefined;
      phase: PresentedOpenPhase | undefined;
      host: PresentedHost | null;
      onPreview: () => void;
      contextMenuProps: ContextMenuTriggerProps;
      actions: VNodeChild;
    } & PropsLocale<typeof NS>,
  ) => {
    const reveal = computed(() => props.host?.fileManager ?? "directory");
    const name = computed(() => basename(props.file.path));
    const metadata = computed(
      () => fileExtension(name.value).toUpperCase() || props.t("presented.file"),
    );
    const status = computed(() =>
      props.phase === undefined
        ? cardDescription(props.file.description, metadata.value)
        : props.t(
            reveal.value === "directory" && props.phase === "revealing"
              ? "presented.directoryOpening"
              : reveal.value === "directory" && props.phase === "revealError"
                ? "presented.directoryError"
                : `presented.${props.phase}`,
          ),
    );
    return () => {
      return h(
        "div",
        {
          class: css.file,
          "data-presented-file": true,
        },
        [
          h("button", {
            type: "button",
            class: css.cardPreview,
            title: resolveWorkspacePath(props.cwd, props.file.path),
            "aria-label": props.t("presented.previewCard", { name: props.file.path }),
            onClick: props.onPreview,
            ...props.contextMenuProps,
          }),
          h(
            "span",
            {
              class: css.fileIcon,
            },
            [
              h(FileTypeIcon, {
                path: props.file.path,
                size: 20,
              }),
            ],
          ),
          h(
            "div",
            {
              class: css.fileBody,
            },
            [
              h(
                "div",
                {
                  class: css.details,
                },
                [
                  h(
                    "span",
                    {
                      class: css.fileName,
                    },
                    [name.value],
                  ),
                  h(
                    "span",
                    {
                      class: css.description,
                      "data-presented-description": true,
                      role: props.phase === undefined ? undefined : "status",
                      "data-error":
                        props.phase === "error" ||
                        props.phase === "revealError" ||
                        props.phase === "nativeUnavailable"
                          ? true
                          : undefined,
                    },
                    [
                      h(
                        "span",
                        {
                          class: css.secondaryText,
                        },
                        [status.value],
                      ),
                      h(
                        "span",
                        {
                          class: css.previewHint,
                        },
                        [props.t("presented.preview")],
                      ),
                    ],
                  ),
                ],
              ),
              h(
                "div",
                {
                  class: css.actions,
                },
                [props.actions],
              ),
            ],
          ),
        ],
      );
    };
  },
  {
    name: "PresentedFileCard",
    props: [
      "file",
      "cwd",
      "phase",
      "host",
      "onPreview",
      "contextMenuProps",
      "actions",
      "t",
    ] as const,
  },
);
