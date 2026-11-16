import { defineComponent, computed, watch, h, onMounted } from "vue";
import type { ConversationSessionSlotProps } from "../contract/slots.ts";
import { conversationPhase } from "../contract/snapshot.ts";
import { resolveActiveView } from "../view-selection.ts";
import css from "./ConversationRoot.module.css";
/**
 * Renders the active Session view inside the resident scrollport and keeps
 * the input draft persisted while blank Hero chrome is visible.
 * @param props - Strict Session input/store, view ledger, and render shares.
 * @returns the active view area, or null while the Session remains blank.
 */
export const DefaultConversationViews = defineComponent(
  (props: ConversationSessionSlotProps) => {
    const view = computed(() => props.view);
    const useSession = computed(() => props.useSession);
    const useConversation = computed(() => props.useConversation);
    const useConversationViews = computed(() => props.useConversationViews);
    const inputActions = computed(() => props.inputActions);
    const useStore = computed(() => props.useStore);
    const actions = computed(() => props.actions);
    const renderSlot = computed(() => props.renderSlot);
    const bindDraftPersistence = computed(() => props.bindDraftPersistence);
    const openView = computed(() => props.openView);
    const useInspectCall = computed(() => props.useInspectCall);
    const tabs = useConversationViews.value((value) => value);
    const inspectCall = useInspectCall.value((value) => value);
    const selectedId = useStore.value((s) => s.view);
    const active = computed(() => resolveActiveView(tabs.value, selectedId.value));
    const session = useSession.value((s) => s);
    const conversation = useConversation.value((s) => s);
    const viewRequest = useStore.value((s) => s.viewRequest ?? null);
    const viewId = computed(() => view.value ?? active.value?.id);
    onMounted(() =>
      watch(
        [() => inputActions.value],
        (_value, _previous, onCleanup) => {
          const cleanup = (() => {
            const unbindDraftPersistence = bindDraftPersistence.value(actions.value.setDraft);
            inputActions.value.persistDraft();
            return () => {
              unbindDraftPersistence();
            };
            // The Session input owns content before this persistence writer is attached.
          })();
          if (typeof cleanup === "function") onCleanup(cleanup);
        },
        { immediate: true, flush: "post" },
      ),
    );
    return () => {
      if (session.value.blank && conversationPhase(session.value, conversation.value) === "blank")
        return null;
      return h(
        "div",
        {
          class: css.viewArea,
        },
        [
          viewId.value !== undefined &&
            renderSlot.value(
              "conversation.view",
              {
                inspectCall: inspectCall.value,
                viewRequest: viewRequest.value,
                openView: openView.value,
                completeViewRequest: actions.value.completeViewRequest,
              },
              { only: viewId.value },
            ),
        ],
      );
    };
  },
  {
    props: [
      "view",
      "useSession",
      "useConversation",
      "useConversationViews",
      "inputActions",
      "useStore",
      "actions",
      "renderSlot",
      "bindDraftPersistence",
      "openView",
      "useInspectCall",
    ],
    inheritAttrs: false,
  },
);
