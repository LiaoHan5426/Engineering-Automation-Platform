import { computed, defineComponent, h, watch } from "vue";
import { JsonBlock } from "@deepseek-ai/dsh-client-ui-primitives";
import { createSnapshotStore } from "@deepseek-ai/dsh-client-store";
import type {
  ConversationLocationDataStore,
  ConversationTurnDataMap,
} from "@deepseek-ai/dsh-client-ui-conversation/client";
import type {
  ChatNodeHookContext,
  ChatNodeOwnerProps,
  ChatFlowSlotProps,
  UsePresentation,
} from "../contract/slots.ts";
import { hasAssistantReplyContent } from "../contract/assistant-content.ts";
import type { ChatNode } from "../contract/chat-nodes.ts";
import type { ChatNodeStore } from "../contract/snapshot.ts";
import { isAtOrOutside } from "../contract/group-tree.ts";
import { turnProcessAlwaysOpen } from "../contract/turn-process.ts";
import { turnProcessOpen } from "../stores.ts";
import { hiddenOrCollapsing } from "./flow-motion.ts";
import css from "./ChatView.module.css";

interface ChatNodeSeatProps extends ChatNodeOwnerProps {
  readonly nodeKey: string;
  /** A replaced Builder must rebind keyed hooks even when references and keys survive. */
  readonly nodeStore: ChatNodeStore;
  readonly useChatNode: ChatFlowSlotProps["useChatNode"];
  readonly useChatNodeProcess: ChatFlowSlotProps["useChatNodeProcess"];
  readonly usePresentation: UsePresentation;
  readonly useStore: ChatFlowSlotProps["useStore"];
  readonly actions: ChatFlowSlotProps["actions"];
  readonly renderSlot: ChatFlowSlotProps["renderSlot"];
  readonly t: ChatFlowSlotProps["t"];
  readonly useChatNodeBottom: ChatFlowSlotProps["useChatNodeBottom"];
  readonly deferCollapse: boolean;
  readonly useGroupAction: ChatFlowSlotProps["useGroupAction"];
}

type RoutedChatNodeOwner = {
  [Kind in ChatNode["kind"]]: ChatNodeOwnerProps & { readonly node: ChatNode<Kind> };
}[ChatNode["kind"]];

function turnDataOf(
  node: ChatNode | undefined,
): ConversationLocationDataStore<ConversationTurnDataMap> | undefined {
  const location = node?.location;
  return location?.kind === "turn" || location?.kind === "step" ? location.turn.data : undefined;
}

function turnOf(node: ChatNode | undefined): number | undefined {
  const location = node?.location;
  return location?.kind === "turn" || location?.kind === "step" ? location.turn.turn : undefined;
}

/**
 * Subscribe, apply Turn-process visibility, and dispatch one stable Context key.
 * Policy reads select this seat's own conclusion, so a mode change re-renders
 * only seats whose visibility actually changes.
 */
export const ChatNodeSeat = defineComponent(
  (props: ChatNodeSeatProps) => {
    const key = computed(() => props.nodeKey);
    const bottom = props.useChatNodeBottom(key);
    const node = props.useChatNode(key, (current) => current as ChatNode | undefined);
    const processPresentation = props.useChatNodeProcess(key);
    const processSpec = computed(() => processPresentation.value?.spec);
    const storedOpen = props.useStore(
      (state) =>
        processSpec.value !== undefined &&
        turnProcessOpen(state, processSpec.value, bottom.value === true && props.deferCollapse),
    );
    const liveProcess = computed(
      () => processPresentation.value !== undefined && !processPresentation.value.turnClosed,
    );
    const interleavedInput = computed(
      () => processPresentation.value?.hasInterleavedInput === true,
    );
    const alwaysOpen = computed(
      () => liveProcess.value || interleavedInput.value || turnProcessAlwaysOpen(node.value),
    );
    const processOpen = computed(() => alwaysOpen.value || storedOpen.value);
    const setOpen = (open: boolean): void => {
      const spec = processSpec.value;
      if (spec !== undefined && !alwaysOpen.value)
        props.actions.setTurnProcessOpen(spec.turn, spec.answerStep ?? 0, open);
    };
    const foldCompleted = props.usePresentation((policy) => policy.foldCompletedTurns);
    const keepReplies = props.usePresentation((policy) => policy.foldedReplies === "all");
    const processWindowReady = computed(() => {
      const spec = processSpec.value;
      const presentation = processPresentation.value;
      return (
        spec !== undefined &&
        presentation !== undefined &&
        foldCompleted.value &&
        presentation.turn === spec.turn &&
        (presentation.turnStarted || presentation.turnClosed)
      );
    });
    const replyRow = computed(
      () =>
        keepReplies.value &&
        node.value?.kind === "assistant-step" &&
        props.groupPart !== "reasoning" &&
        hasAssistantReplyContent(node.value.data.blocks),
    );
    const processMember = computed(() => {
      const current = node.value;
      const spec = processSpec.value;
      return (
        current !== undefined &&
        spec !== undefined &&
        processWindowReady.value &&
        !replyRow.value &&
        !isAtOrOutside(current, "turn") &&
        current.anchorSeq >= spec.processStartSeq &&
        (liveProcess.value ||
          spec.answerAnchorSeq === null ||
          current.anchorSeq < spec.answerAnchorSeq ||
          (props.groupPart === "reasoning" &&
            current.kind === "assistant-step" &&
            current.data.step === spec.answerStep))
      );
    });
    const processAnswer = computed(
      () =>
        node.value !== undefined &&
        processWindowReady.value &&
        !liveProcess.value &&
        props.groupPart !== "reasoning" &&
        node.value.kind === "assistant-step" &&
        node.value.data.step === processSpec.value?.answerStep,
    );
    const ownsDisclosure = computed(
      () => node.value?.kind === "turn-process" || processAnswer.value || replyRow.value,
    );
    const foldable = computed(
      () =>
        processWindowReady.value &&
        (liveProcess.value || processMember.value || ownsDisclosure.value),
    );
    const turnProcess = computed(() =>
      processSpec.value === undefined
        ? undefined
        : {
            spec: processSpec.value,
            foldable: foldable.value,
            hasContent:
              !interleavedInput.value &&
              (processSpec.value.inlineReasoning ||
                (keepReplies.value
                  ? processPresentation.value?.hasNonReplyProcess === true
                  : processPresentation.value?.hasExternalProcess === true)),
            open: processOpen.value,
            setOpen,
          },
    );
    const controllerInactive = computed(
      () => node.value?.kind === "turn-process" && foldCompleted.value && !foldable.value,
    );
    const processHidden = computed(
      () =>
        controllerInactive.value || (foldable.value && processMember.value && !processOpen.value),
    );
    const revealProcess = (): void => {
      if (processMember.value) setOpen(true);
    };
    const wrapperRef = props.useGroupAction(processHidden, revealProcess);
    const disclosureReset = createSnapshotStore(0);
    const turnData = computed(() => turnDataOf(node.value));
    const hookContext = computed<ChatNodeHookContext>(() => ({
      turnData: turnData.value,
      disclosureReset,
      useGroupAction: props.useGroupAction,
    }));
    watch(
      [processMember, processHidden, wrapperRef],
      () => {
        if (
          processMember.value &&
          processHidden.value &&
          wrapperRef.value !== null &&
          hiddenOrCollapsing(wrapperRef.value)
        ) {
          disclosureReset.set(disclosureReset.getSnapshot() + 1);
        }
      },
      { flush: "post", immediate: true },
    );
    return () => {
      const current = node.value;
      if (current === undefined) return null;
      const owner: ChatNodeOwnerProps = {
        ...(props.groupPart === undefined ? {} : { groupPart: props.groupPart }),
        cwd: props.cwd,
        openFile: props.openFile,
        inspectCall: props.inspectCall,
        forkAt: props.forkAt,
        loadImage: props.loadImage,
        turnProcess: turnProcess.value,
      };
      // The discriminant and the owner are routed together at this keyed boundary.
      const routedOwner = { ...owner, node: current } as RoutedChatNodeOwner;
      const flowKey =
        props.groupPart === undefined || props.groupPart === "response"
          ? current.key
          : JSON.stringify([current.key, props.groupPart]);
      return h(
        "div",
        {
          ref: wrapperRef,
          class: css.flowItem,
          "data-chat-anchor-key": flowKey,
          "data-chat-flow-key": flowKey,
          "data-chat-paging-anchor": current.kind !== "turn-process" || undefined,
          "data-chat-node-key": current.key,
          "data-chat-group-part": props.groupPart,
          "data-chat-flow-kind": current.kind,
          "data-chat-turn": turnOf(current),
          "data-turn-process-member": processMember.value || undefined,
          "data-turn-process-hidden": processHidden.value || undefined,
        },
        [
          props.renderSlot("conversation.chat.node", routedOwner, {
            entryKey: current.kind,
            hookContext: hookContext.value,
            fallback: h(JsonBlock, {
              label: props.t("message.unknownSurface", { type: current.kind }),
              payload: current.data,
              truncatedLabel: (total: number) => props.t("json.truncated", { total }),
            }),
          }),
        ],
      );
    };
  },
  {
    name: "ChatNodeSeat",
    inheritAttrs: false,
    props: [
      "nodeKey",
      "groupPart",
      "nodeStore",
      "useChatNode",
      "useChatNodeProcess",
      "usePresentation",
      "cwd",
      "openFile",
      "inspectCall",
      "forkAt",
      "loadImage",
      "useStore",
      "actions",
      "renderSlot",
      "t",
      "useChatNodeBottom",
      "deferCollapse",
      "useGroupAction",
    ],
  },
);
