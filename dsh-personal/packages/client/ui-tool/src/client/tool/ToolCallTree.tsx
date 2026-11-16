/** Root/subcall Tool composition with one keyed atomic dispatch path. */
import { computed, defineComponent, h, type VNode, type VNodeChild } from "vue";
import type { ToolCallBlock } from "@deepseek-ai/dsh-client-ui-chat/client";
import type { ToolCallOwnerProps, ToolCallPhaseProps, ToolTreeProps } from "../contract/slots.ts";
import { toolRowModel } from "./models/tool-call-model.ts";
import { GenericToolCard } from "./toolviews/GenericToolCard.tsx";
import css from "./ToolCallTree.module.css";
function toolCallPhase(block: ToolCallBlock): ToolCallPhaseProps {
  if ("kind" in block) return { phase: "result", block };
  return block.phase === "preparing" ? { phase: "preparing", block } : { phase: "start", block };
}
/** Resolve a Tool call's wire name from its current stage. */
function callName(call: ToolCallPhaseProps): string {
  return call.phase === "result" ? (call.block.call?.name ?? "") : call.block.name;
}
type BranchProps = Pick<
  ToolTreeProps,
  "renderSlot" | "cwd" | "openFile" | "inspectCall" | "loadImage" | "useDisclosure"
> & {
  renderFallback: (owner: ToolCallOwnerProps) => VNodeChild;
  block: ToolCallBlock;
  home?: string | undefined;
};
/** A stable block owns one atomic dispatch and its recursive children. */
const ToolCallBranch = defineComponent(
  (props: BranchProps) => {
    const call = computed(() => toolCallPhase(props.block));
    const owner = computed<ToolCallOwnerProps>(() => {
      const callId = call.value.block.callId;
      return {
        callId,
        toolName: callName(call.value),
        ...call.value,
        openFile: props.openFile,
        cwd: props.cwd,
        home: props.home,
        loadImage: props.loadImage,
        useDisclosure: props.useDisclosure,
        inspect:
          props.inspectCall === undefined
            ? undefined
            : () => {
                props.inspectCall?.(callId);
              },
      };
    });
    const denied = computed(
      () =>
        call.value.phase === "result" &&
        toolRowModel(owner.value.toolName, call.value.block).autoReviewDenial !== null,
    );
    return (): VNode =>
      h(
        "div",
        {
          class: css.callRow,
          "data-chat-anchor-key": `call:${owner.value.callId}`,
          "data-chat-call-id": owner.value.callId,
        },
        [
          denied.value
            ? props.renderFallback(owner.value)
            : props.renderSlot("tool.call.toolview", owner.value, {
                entryKey: owner.value.toolName,
                fallback: props.renderFallback(owner.value),
              }),
          call.value.phase !== "preparing" && call.value.block.subCalls.length > 0
            ? h(
                "div",
                { class: css.subCalls, "data-subcalls": "" },
                call.value.block.subCalls.map((child) =>
                  h(ToolCallBranch, {
                    ...props,
                    block: child,
                    key: child.callId,
                  }),
                ),
              )
            : null,
        ],
      );
  },
  {
    name: "ToolCallBranch",
    props: [
      "cwd",
      "openFile",
      "inspectCall",
      "loadImage",
      "renderSlot",
      "useDisclosure",
      "renderFallback",
      "block",
      "home",
    ],
  },
);
/**
 * Render one root Tool call and its recursive children through the same atomic keyed dispatch.
 * @param props - Whole-Tool owner data and the Tool-owned child-slot share.
 * @returns The native Tool call-tree component.
 */
export const ToolCallTree = defineComponent(
  (props: ToolTreeProps) => {
    const { getTriggerProps } = props.useContextMenu();
    const getFileTriggerProps = (path: string) =>
      getTriggerProps(() => ({
        kind: "file",
        value: { sessionId: props.sessionId, path: props.resolveFilePath(path) },
      }));
    const renderFallback = (owner: ToolCallOwnerProps) =>
      h(GenericToolCard, {
        ...owner,
        t: props.t,
        getFileTriggerProps,
      });
    const home = props.useHostInfo((info) => info.home);
    return () =>
      h(ToolCallBranch, {
        renderSlot: props.renderSlot,
        block: props.node.data.root,
        cwd: props.cwd,
        home: home.value,
        openFile: props.openFile,
        renderFallback,
        inspectCall: props.inspectCall,
        useDisclosure: props.useDisclosure,
        loadImage: props.loadImage,
      });
  },
  {
    name: "ToolCallTree",
    props: [
      "groupPart",
      "cwd",
      "openFile",
      "inspectCall",
      "forkAt",
      "loadImage",
      "turnProcess",
      "node",
      "useTurnData",
      "useDisclosure",
      "useGroupAction",
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
      "renderSlot",
      "__renders",
      "SessionProvider",
      "t",
      "resolveFilePath",
      "useHostInfo",
    ],
  },
);
