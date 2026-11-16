import { h } from "vue";
/** Child-renderer stubs for component units; registry behavior uses the real runtime fixture. */
import { makeTranslate } from "@deepseek-ai/dsh-client-test-runtime";
import { zh as commonZh } from "@deepseek-ai/dsh-client-locale/src/locales/zh.ts";
import type {
  GlobalStandardProps,
  SessionStandardProps,
  PropsRuntime,
  PropsRenderFactories,
} from "@deepseek-ai/dsh-client-ui-slots";
import type { ReasoningContentInput } from "../src/client/contract/slots.ts";
import type { AssistantMarkdownProps } from "../src/client/chat/AssistantMarkdown.tsx";
import { DefaultReasoningBody, ReasoningContent } from "../src/client/chat/ReasoningContent.tsx";
import { zh } from "../src/client/locale.ts";
const t = makeTranslate(zh, commonZh);
/** Reject attachment loads in component fixtures without durable images. */
export const unusedImageLoader: AssistantMarkdownProps["loadImage"] = async () => {
  throw new Error("This component fixture has no durable image attachments");
};
function unusedSeat(): never {
  throw new Error("Unexpected framework seat in a direct reasoning component fixture");
}
const standard: GlobalStandardProps & SessionStandardProps = {
  sessionId: "reasoning-component" as SessionStandardProps["sessionId"],
  usePanelInfo: unusedSeat,
  useRemoteAccess: unusedSeat,
  useSessions: unusedSeat,
  useSessionRetainInfo: unusedSeat,
  useContextMenu: unusedSeat,
  useWorkspaces: unusedSeat,
  useResource: unusedSeat,
  useWorkspaceAccess: unusedSeat,
  useTrajectory: unusedSeat,
  useSession: unusedSeat,
  useProjection: unusedSeat,
  useAccess: unusedSeat,
  useConversation: unusedSeat,
  useInput: unusedSeat,
  useChat: unusedSeat,
  useSessionAccess: unusedSeat,
  useSessionStatus: unusedSeat,
  inputActions: {
    insertQuote: unusedSeat,
    captureInsertion: unusedSeat,
    insertText: unusedSeat,
    setDraft: unusedSeat,
    persistDraft: unusedSeat,
    addAttachments: unusedSeat,
    removeAttachment: unusedSeat,
    pruneAttachments: unusedSeat,
    submit: unusedSeat,
  },
};
function content(input: ReasoningContentInput) {
  // The component only reads these inputs; unused framework seats are exercised in assembly tests.
  return h(ReasoningContent, {
    ...standard,
    ...input,
    t,
    renderFactorySlot: renderReasoningFactory,
    useFactorySlot: unusedSeat,
  });
}
/** Render the production child component without emulating a registry or its dispatch. */
export const renderReasoningSlot: AssistantMarkdownProps["renderSlot"] = (
  key: string,
  input: object,
) => {
  if (key !== "conversation.chat.reasoning.body")
    throw new Error(`Unexpected reasoning Slot: ${key}`);
  return h(DefaultReasoningBody, {
    ...standard,
    ...(input as Pick<
      PropsRuntime<"conversation.chat.reasoning.body">,
      "rawText" | "text" | "running"
    >),
    renderFactorySlot: renderReasoningFactory,
  });
};
/** Supply the official component at the Factory call seam of a standalone component unit. */
export const renderReasoningFactory: PropsRenderFactories["renderFactorySlot"] = (name, input) => {
  if (name !== "conversation.chat.reasoning.content")
    throw new Error(`unexpected Factory: ${name}`);
  return content(input as ReasoningContentInput);
};
