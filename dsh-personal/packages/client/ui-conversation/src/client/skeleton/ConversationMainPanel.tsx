import { defineComponent, computed, h } from "vue";
import type { ConversationSlotProps } from "../contract/slots.ts";
import { conversationPhase } from "../contract/snapshot.ts";
import { ConversationWidthControls } from "./ConversationWidthControls.tsx";
import css from "./ConversationRoot.module.css";
const CONTENT_SLOTS = { widthControls: ConversationWidthControls };
/**
 * Render the existing main Conversation frame around the extracted content.
 * @param props - the original `main.conversation` Slot props.
 * @returns the unchanged root, Header, content, and width-control subtree.
 */
export const ConversationMainPanel = defineComponent(
  (props: ConversationSlotProps) => {
    const sessionId = computed(() => props.sessionId);
    const useSession = computed(() => props.useSession);
    const useSessions = computed(() => props.useSessions);
    const useConversation = computed(() => props.useConversation);
    const renderSlot = computed(() => props.renderSlot);
    const renderFactorySlot = computed(() => props.renderFactorySlot);
    const session = useSession.value((s) => s);
    const conversation = useConversation.value((s) => s);
    const shellPhase = computed(() =>
      session.value === undefined || conversation.value === undefined
        ? "blank"
        : conversationPhase(session.value, conversation.value),
    );
    const openState = computed(() => session.value?.openState);
    const summaryBlank = useSessions.value((s) =>
      sessionId.value === undefined ? undefined : s.byId[sessionId.value]?.blank,
    );
    const settling = computed(
      () =>
        sessionId.value !== undefined &&
        shellPhase.value === "blank" &&
        openState.value === "loading" &&
        summaryBlank.value !== true,
    );
    const hero = computed(
      () =>
        sessionId.value === undefined ||
        (shellPhase.value === "blank" &&
          (openState.value === "open" || summaryBlank.value === true)),
    );
    const phase = computed(() => (settling.value ? "settling" : hero.value ? "hero" : "active"));
    return () =>
      h(
        "div",
        {
          class: css.root,
          "data-phase": phase.value,
        },
        [
          renderSlot.value("conversation.header", {}),
          renderFactorySlot.value(
            "conversation.content",
            {
              variant: "main",
              phase: phase.value,
              hero: hero.value,
            },
            {
              slots: CONTENT_SLOTS,
            },
          ),
        ],
      );
  },
  {
    props: [
      "sessionId",
      "useSession",
      "useSessions",
      "useConversation",
      "renderSlot",
      "renderFactorySlot",
    ],
    inheritAttrs: false,
  },
);
