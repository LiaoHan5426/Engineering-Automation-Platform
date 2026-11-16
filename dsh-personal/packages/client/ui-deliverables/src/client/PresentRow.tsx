import { defineComponent, h, ref } from "vue";
/** Present call status and expandable durable result text. */
import { DisclosureRow, IconDeliverDocRegular } from "@deepseek-ai/dsh-client-ui-primitives";
import type { ToolCallViewProps } from "@deepseek-ai/dsh-client-ui-tool/client";
import type { PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import type { NS } from "./locales.ts";
import css from "./PresentRow.module.css";
type PresentRowProps = ToolCallViewProps & PropsLocale<typeof NS>;
/* v8 ignore next -- Non-expandable rows never invoke DisclosureRow's required toggle callback. */
const noop = (): void => undefined;
/** Raw arguments can be partial while a call is streaming. */
function fileNames(raw: string): string {
  let args: unknown;
  try {
    args = JSON.parse(raw);
  } catch {
    return raw;
  } // Truncated tool JSON remains visible until the call completes.
  if (typeof args !== "object" || args === null || !("files" in args) || !Array.isArray(args.files))
    return raw;
  return args.files
    .flatMap((file: unknown) =>
      typeof file === "object" && file !== null && "path" in file && typeof file.path === "string"
        ? [file.path]
        : [],
    )
    .join(", ");
}
export const PresentRow = defineComponent(
  (props: PresentRowProps) => {
    return () => {
      return props.phase === "preparing"
        ? h(PreparingPresentRow, {
            ...props,
          })
        : h(StartedPresentRow, {
            ...props,
          });
    };
  },
  {
    name: "PresentRow",
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
      "usePanelInfo",
      "useContextMenu",
      "useWorkspaces",
      "t",
    ] as const,
  },
);
const PreparingPresentRow = defineComponent(
  (
    props: Extract<
      PresentRowProps,
      {
        phase: "preparing";
      }
    >,
  ) => {
    return () => {
      return h(
        "div",
        {
          "data-tool": "present",
          "data-state": "preparing",
          "aria-label": props.t("row.preparing"),
        },
        [
          h(DisclosureRow, {
            icon: h(IconDeliverDocRegular, { size: 14 }),
            title: props.t("row.title"),
            open: false,
            expandable: false,
            onToggle: noop,
            running: true,
          }),
        ],
      );
    };
  },
  {
    name: "PreparingPresentRow",
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
      "usePanelInfo",
      "useContextMenu",
      "useWorkspaces",
      "t",
    ] as const,
  },
);
const StartedPresentRow = defineComponent(
  (
    props: Exclude<
      PresentRowProps,
      {
        phase: "preparing";
      }
    >,
  ) => {
    const expanded = ref(false);
    return () => {
      const block = props.block;
      const settled = "kind" in block;
      const state = !settled
        ? "running"
        : block.error?.code === "interrupted"
          ? "stopped"
          : block.isError
            ? "error"
            : "ok";
      const args = (settled ? block.call?.argsRaw : block.argsRaw) ?? "";
      const output = settled
        ? block.content
            .map((item) => (item.type === "text" ? item.text : JSON.stringify(item)))
            .join("\n")
        : "";
      const details =
        output || (settled && block.error ? `${block.error.name}: ${block.error.code}` : "");
      return h(
        "div",
        {
          "data-tool": "present",
          "data-state": state,
        },
        [
          h(
            DisclosureRow,
            {
              icon: h(IconDeliverDocRegular, { size: 14 }),
              title: props.t("row.title"),
              open: expanded.value && details !== "",
              expandable: details !== "",
              expandOnRowClick: true,
              keepContentWhenOpen: true,
              onToggle: () => {
                expanded.value = !expanded.value;
              },
              collapsedContent: h("span", { class: css.summary }, [
                h("span", {}, [props.t(`row.${state}`)]),
                h("span", { class: css.paths }, [fileNames(args)]),
              ]),
            },
            {
              default: () => [
                h(
                  "pre",
                  {
                    class: css.output,
                  },
                  [details],
                ),
                props.inspect &&
                  h(
                    "button",
                    {
                      type: "button",
                      class: css.inspect,
                      onClick: props.inspect,
                    },
                    [props.t("row.inspect")],
                  ),
              ],
            },
          ),
        ],
      );
    };
  },
  {
    name: "StartedPresentRow",
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
      "usePanelInfo",
      "useContextMenu",
      "useWorkspaces",
      "t",
    ] as const,
  },
);
