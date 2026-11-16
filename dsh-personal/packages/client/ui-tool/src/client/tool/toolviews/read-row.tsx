import { defineComponent } from "vue";
import type { ToolFileInjected } from "../file-menu.ts";
import { toolFileInject } from "../file-menu.ts";
import type { Context } from "@deepseek-ai/cordis";
import type { PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import type { ToolCallViewProps } from "../../contract/slots.ts";
import { readCallLine, readCardModel } from "../models/read-card-model.ts";
import { readFamilyRow } from "./read-family-row.tsx";
import { CONVERSATION_NS as NS } from "../../locale.ts";
type ReadRowProps = ToolCallViewProps & ToolFileInjected & PropsLocale<"conversation">;
/**
 * Lets users expand a completed read result and open its reported path at the
 * line the call started from.
 */
export const ReadRow = defineComponent(
  (props: ReadRowProps) => {
    const _seat0 = props.useContextMenu();
    return () => {
      const { block, cwd, home } = props;
      const { getTriggerProps } = _seat0;
      return readFamilyRow(
        props,
        {
          read: readCardModel(block, cwd, home),
          filePathLine: readCallLine(block),
        },
        getTriggerProps,
      );
    };
  },
  {
    name: "ReadRow",
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
      "resolveFilePath",
      "t",
    ],
  },
);
/** Registers the read tool's conversation row. */
export const readToolview = {
  name: "read-toolview",
  inject: ["slots", "sessions"],
  apply(ctx: Context): void {
    ctx.slots.inject("tool.call.toolview", () =>
      ctx.slots.register(
        { name: "tool.call.toolview", key: "read", locale: NS, inject: toolFileInject(ctx) },
        ReadRow,
      ),
    );
  },
};
