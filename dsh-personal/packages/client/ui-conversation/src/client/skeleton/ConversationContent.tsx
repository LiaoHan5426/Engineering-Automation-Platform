import {
  defineComponent,
  computed,
  shallowRef,
  watch,
  h,
  onMounted,
  onScopeDispose,
  type ComponentPublicInstance,
} from "vue";
import clsx from "clsx";
import type { WorkspaceId } from "@deepseek-ai/dsh-workspace/types";
import { workspaceDisplayTitle } from "@deepseek-ai/dsh-api-workspace-controller/default-workspace";
import type { ConversationContentProps, ConversationViewsProps } from "../contract/slots.ts";
import { HeroShell, WorkspaceChip, workspaceLabel } from "./EmptyHero.tsx";
import css from "./ConversationRoot.module.css";
function ConversationSessionView({ renderSlot }: ConversationViewsProps) {
  return renderSlot("conversation.session", {});
}
function NoConversationWidthControls() {
  return null;
}
/**
 * Render the shared Conversation body and its occurrence-selected local Components.
 * @param props - Factory input, standard Session sources, and Conversation seats.
 * @returns the Conversation view, Composer, and optional width controls.
 */
export const ConversationContent = defineComponent(
  (props: ConversationContentProps) => {
    const sessionId = computed(() => props.sessionId);
    const phase = computed(() => props.phase);
    const hero = computed(() => props.hero);
    const useSession = computed(() => props.useSession);
    const useSessions = computed(() => props.useSessions);
    const useSessionStatus = computed(() => props.useSessionStatus);
    const useWorkspaces = computed(() => props.useWorkspaces);
    const useInput = computed(() => props.useInput);
    const useComposerBlock = computed(() => props.useComposerBlock);
    const renderSlot = computed(() => props.renderSlot);
    const renderSlotChain = computed(() => props.renderSlotChain);
    const selectWorkspace = computed(() => props.selectWorkspace);
    const t = computed(() => props.t);
    const useFactorySlot = computed(() => props.useFactorySlot);
    const session = useSession.value((snapshot) => snapshot);
    const Views = useFactorySlot.value("views", ConversationSessionView);
    const WidthControls = useFactorySlot.value("widthControls", NoConversationWidthControls);
    const body = shallowRef<HTMLDivElement | null>(null);
    const pendingInteraction = useSessionStatus.value((snapshot) =>
      sessionId.value === undefined ? undefined : snapshot.get(sessionId.value)?.pendingInteraction,
    );
    const inputState = useInput.value((s) => s);
    const cwd = useSessions.value((s) =>
      sessionId.value === undefined ? undefined : s.byId[sessionId.value]?.cwd,
    );
    const workspaces = useWorkspaces.value((s) => s);
    const composerBlock = useComposerBlock.value((block) => block);
    const pickerOpen = shallowRef(false);
    const setPickerOpen = (
      next:
        | typeof pickerOpen.value
        | ((previous: typeof pickerOpen.value) => typeof pickerOpen.value),
    ) => {
      pickerOpen.value = typeof next === "function" ? next(pickerOpen.value) : next;
    };
    const pendingWorkspaceId = shallowRef<WorkspaceId | undefined>();
    const setPendingWorkspaceId = (
      next:
        | (WorkspaceId | undefined)
        | ((previous: WorkspaceId | undefined) => WorkspaceId | undefined),
    ) => {
      pendingWorkspaceId.value = typeof next === "function" ? next(pendingWorkspaceId.value) : next;
    };
    const pickerAnchor = shallowRef<HTMLButtonElement | null>(null);
    let seatObserver: ResizeObserver | null = null;
    onScopeDispose(() => {
      seatObserver?.disconnect();
    });
    const seatResizeRef = (seat: HTMLDivElement | null): void => {
      seatObserver?.disconnect();
      seatObserver = null;
      const scroller = seat?.parentElement ?? null;
      if (seat === null || scroller === null) return;
      seatObserver = new ResizeObserver(() => {
        scroller.style.setProperty("--dsh-composer-height", `${seat.offsetHeight}px`);
        scroller.style.setProperty(
          "--dsh-conversation-viewport-height",
          `${scroller.clientHeight}px`,
        );
      });
      seatObserver.observe(seat);
      seatObserver.observe(scroller);
    };
    const sessionWorkspace = computed(() => {
      const id = sessionId.value;
      return id === undefined
        ? undefined
        : workspaces.value.items.find((workspace) => workspace.sessionIds.includes(id));
    });
    const pendingWorkspace = computed(() =>
      workspaces.value.items.find(
        (workspace) => workspace.workspaceId === pendingWorkspaceId.value,
      ),
    );
    const zone = computed(() =>
      session.value === undefined || inputState.value === undefined
        ? undefined
        : { session: session.value, input: inputState.value },
    );
    const storedChipTitle = computed(
      () =>
        pendingWorkspace.value?.title ??
        (sessionId.value === undefined
          ? undefined
          : (sessionWorkspace.value?.title ??
            (workspaces.value.phase === "ready" || cwd.value === undefined || cwd.value === ""
              ? undefined
              : workspaceLabel(cwd.value)))),
    );
    const chipTitle = computed(() =>
      storedChipTitle.value === undefined
        ? undefined
        : workspaceDisplayTitle(storedChipTitle.value, t.value("workspace.defaultName")),
    );
    const heroWorkspaceRow = () =>
      h(
        "div",
        {
          class: css.heroWorkspaceRow,
        },
        [
          h(WorkspaceChip, {
            buttonRef: pickerAnchor,
            label: chipTitle.value,
            menuOpen: pickerOpen.value,
            onClick: () => {
              setPickerOpen((open) => !open);
            },
            t: t.value,
          }),
          renderSlot.value("conversation.hero.workspace", {
            open: pickerOpen.value,
            anchorRef: pickerAnchor,
            selectedId: pendingWorkspaceId.value ?? sessionWorkspace.value?.workspaceId,
            onPick: (workspaceId) => {
              setPickerOpen(false);
              setPendingWorkspaceId(workspaceId);
              void selectWorkspace.value(workspaceId).catch(() => {
                setPendingWorkspaceId((current) => (current === workspaceId ? undefined : current));
              });
            },
            onClose: () => {
              setPickerOpen(false);
            },
          }),
          renderSlot.value("conversation.hero.agentPreset", {}),
          sessionId.value === undefined
            ? null
            : h(
                "div",
                {
                  class: css.heroOptions,
                },
                [renderSlot.value("conversation.hero.options", {})],
              ),
        ],
      );
    const inert = computed(
      () => sessionId.value === undefined || (hero.value && chipTitle.value === undefined),
    );
    const inputBar = () =>
      renderSlot.value("conversation.composer.bar", {
        variant: hero.value ? "hero" : "composer",
        occurrence: props.variant,
        ...(inert.value
          ? {
              disabled: true,
              placeholder: t.value("placeholder.workspace"),
              workspacePickerOpen: pickerOpen.value,
              onRequestWorkspace: () => {
                setPickerOpen(true);
              },
            }
          : !inert.value && composerBlock.value !== undefined
            ? // `blocked`, not `disabled`: the bar refuses input either way, but a
              // block keeps the model seat live because choosing a model is how the
              // user clears it.
              { blocked: composerBlock.value, placeholder: composerBlock.value.reason }
            : hero.value
              ? { placeholder: t.value("placeholder.hero") }
              : {}),
      });
    const composerBar = () =>
      h(
        "div",
        {
          class: clsx(css.composerStack, hero.value && css.composerHero),
        },
        [
          hero.value &&
            h(HeroShell, {
              t: t.value,
              renderSlot: renderSlot.value,
            }),
          hero.value && heroWorkspaceRow(),
          zone.value !== undefined && renderSlot.value("conversation.input.dock", zone.value),
          inputBar(),
        ],
      );
    const composer = () =>
      renderSlotChain.value(
        "conversation.composer",
        {
          sessionId: sessionId.value,
          session: session.value,
          pendingInteraction: pendingInteraction.value,
        },
        { fallback: composerBar(), fallbackOnly: sessionId.value === undefined, overlay: true },
      );
    const composerSeat = () =>
      h(
        "div",
        {
          ref: (node: Element | ComponentPublicInstance | null) => {
            seatResizeRef(node instanceof HTMLDivElement ? node : null);
          },
          class: css.composerSeat,
          "data-composer-seat": "",
          "data-conversation-region": "composer",
        },
        [composer()],
      );
    onMounted(() =>
      watch(
        [
          () => pendingWorkspaceId.value,
          () => sessionWorkspace.value?.workspaceId,
          () => workspaces.value.phase,
          () => pendingWorkspace.value,
        ],
        (_value, _previous, onCleanup) => {
          const cleanup = (() => {
            if (pendingWorkspaceId.value === undefined) return;
            if (
              sessionWorkspace.value?.workspaceId === pendingWorkspaceId.value ||
              (workspaces.value.phase === "ready" && pendingWorkspace.value === undefined)
            ) {
              setPendingWorkspaceId(undefined);
            }
          })();
          if (typeof cleanup === "function") onCleanup(cleanup);
        },
        { immediate: true, flush: "post" },
      ),
    );
    return () =>
      h(
        "div",
        {
          ref: body,
          class: clsx(css.body, props.variant === "embedded" && css.embeddedBody),
          "data-conversation-content": "",
          "data-conversation-session": sessionId.value,
          "data-conversation-region": "chat",
          "data-content-phase": phase.value,
        },
        [
          renderSlot.value(
            "conversation.hero.frame",
            { hero: hero.value && props.variant !== "embedded" },
            {
              children: h(
                "div",
                {
                  class: css.scrollBody,
                  "data-conversation-scroll": "",
                },
                [sessionId.value === undefined ? null : h(Views, null), composerSeat()],
              ),
            },
          ),
          h(WidthControls, {
            container: body.value,
            phase: phase.value,
          }),
        ],
      );
  },
  {
    props: [
      "sessionId",
      "variant",
      "phase",
      "hero",
      "useSession",
      "useSessions",
      "useSessionStatus",
      "useWorkspaces",
      "useInput",
      "useComposerBlock",
      "renderSlot",
      "renderSlotChain",
      "selectWorkspace",
      "t",
      "useFactorySlot",
    ],
    inheritAttrs: false,
  },
);
