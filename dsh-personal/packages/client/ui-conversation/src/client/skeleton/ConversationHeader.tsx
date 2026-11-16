import { defineComponent, computed, h } from "vue";
/** Resident conversation navigation and Session-specific header content. */
import clsx from "clsx";
import type { ConversationHeaderProps } from "../contract/slots.ts";
import { conversationPhase } from "../contract/snapshot.ts";
import css from "./ConversationRoot.module.css";
/**
 * Keeps global navigation available before a Session exists.
 * @param props - Optional Session sources and authorized header slots.
 * @returns The persistent header with any selected Session's title and views.
 */
export const ConversationHeader = defineComponent(
  (props: ConversationHeaderProps) => {
    const sessionId = computed(() => props.sessionId);
    const useSession = computed(() => props.useSession);
    const useConversation = computed(() => props.useConversation);
    const renderSlot = computed(() => props.renderSlot);
    const session = useSession.value((s) => s);
    const conversation = useConversation.value((s) => s);
    const blank = computed(
      () =>
        session.value === undefined ||
        conversation.value === undefined ||
        (session.value.blank && conversationPhase(session.value, conversation.value) === "blank"),
    );
    return () =>
      h(
        "header",
        {
          class: clsx(css.header, blank.value && css.headerBlank),
          "data-window-drag": true,
        },
        [
          h(
            "div",
            {
              class: css.headerLeading,
              "data-conversation-header-leading": "",
            },
            [renderSlot.value("conversation.header.leading", {})],
          ),
          sessionId.value === undefined
            ? // The empty title row keeps the blank-Session header height, so the
              // Hero centers its input card at the same offset before a Session exists.
              h("div", {
                class: css.titleRow,
              })
            : renderSlot.value("conversation.session.header", { hideChrome: blank.value }),
        ],
      );
  },
  {
    props: ["sessionId", "useSession", "useConversation", "renderSlot"],
    inheritAttrs: false,
  },
);
