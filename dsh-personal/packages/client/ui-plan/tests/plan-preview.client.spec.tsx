// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi, type Mock } from "vite-plus/test";
import { fireEvent, screen } from "@testing-library/dom";
import { h } from "vue";
import { RemoteError } from "@deepseek-ai/dsh-typert-protocol";
import type { SessionStandardProps, GlobalStandardProps } from "@deepseek-ai/dsh-client-ui-slots";
import type { SidebarRightTabInfo } from "@deepseek-ai/dsh-client-ui-sidebar-right/client";
import type { PaneId, TabId } from "@deepseek-ai/dsh-client-ui-dockkit";
import type { ResourceSnapshot } from "@deepseek-ai/dsh-client-resources/client";
import {
  cleanupVue as cleanup,
  flushVue as act,
  renderVue,
} from "../../ui-primitives/tests/vue-render.ts";
import { within as queriesWithin } from "@testing-library/dom";
import { nextTick } from "vue";
function render(node: Parameters<typeof renderVue>[0]) {
  const view = renderVue(node);
  return { ...view, ...queriesWithin(document.body) };
}
import {
  ConversationNodeAssembler,
  type TurnLocation,
} from "@deepseek-ai/dsh-client-ui-conversation/client";
import type { SessionLiveEventEntry } from "@deepseek-ai/dsh-api-session-controller/client";
import type { ChatNode, ChatSnapshot } from "@deepseek-ai/dsh-client-ui-chat/client";
import { useObservableSelector } from "@deepseek-ai/dsh-client-ui-primitives";
import { computed, shallowRef, toValue, type MaybeRefOrGetter, type ShallowRef } from "vue";
import type { HostObservable } from "@deepseek-ai/dsh-client-ui-slots";
import { bindSnapshotSelector } from "@deepseek-ai/dsh-client-test-runtime";
function keyedObservableHook<T>(source: (key: string) => HostObservable<T>) {
  function useKeyed(key: MaybeRefOrGetter<string | undefined>): Readonly<ShallowRef<T | undefined>>;
  function useKeyed<S>(
    key: MaybeRefOrGetter<string | undefined>,
    select: (value: T) => S,
  ): Readonly<ShallowRef<S | undefined>>;
  function useKeyed<S>(
    key: MaybeRefOrGetter<string | undefined>,
    select?: (value: T) => S,
  ): Readonly<ShallowRef<T | S | undefined>> {
    return useObservableSelector<T, T | S>(
      () => {
        const current = toValue(key);
        return current === undefined ? undefined : source(current);
      },
      () => (value) => (select === undefined ? value : select(value)),
    );
  }
  return useKeyed;
}
import {
  ChatSnapshotBuilder,
  chatViewDefinition,
} from "../../ui-chat/src/client/conversation-nodes/chat-snapshot-builder.ts";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
import { makeTranslate } from "@deepseek-ai/dsh-client-test-runtime";
import { createSnapshotStore } from "@deepseek-ai/dsh-client-store";
import { en as commonEn } from "@deepseek-ai/dsh-client-locale/src/locales/en.ts";
import { en, zh } from "../src/client/locales.ts";
import { PlanCards, PlanReviewOpen } from "../src/client/PlanCard.tsx";
import { PlanPreview, PlanTitle } from "../src/client/PlanPreview.tsx";
import { planAddress, parsePlanAddress, submittedPlan } from "../src/client/plan.ts";
import { reviewPreviewAddress, isReviewPreviewAddress } from "../src/client/review-preview.ts";
import { planDefinition } from "../src/client/plan-definition.ts";
import { createPlanReviewStore } from "../src/client/review-store.ts";
afterEach(cleanup);
const markdown = "# Keep this plan\n\n## Goal\n\n- Review\n- Implement";
const call = {
  type: "tool/call",
  seq: 12,
  data: {
    turn: 1,
    name: "exit_plan_mode",
    callId: "call:1",
    arguments: JSON.stringify({ plan: markdown }),
  },
};
const plan = submittedPlan(call)!;
const target = {
  session: { kind: "session" as const, sessionId: "session / 中文" as SessionId },
  callId: plan.callId,
};
const t = makeTranslate(en, commonEn);
function planHook(
  plans: readonly (typeof plan)[],
): InstanceType<typeof PlanCards>["$props"]["usePlans"] {
  const source = createSnapshotStore(plans);
  return keyedObservableHook(() => source);
}
function unconsumedSeat(): never {
  throw new Error("This plan fixture does not consume this standard seat");
}
const standardProps = {
  sessionId: target.session.sessionId,
  useSession: unconsumedSeat,
  useProjection: unconsumedSeat,
  useAccess: unconsumedSeat,
  useConversation: unconsumedSeat,
  useInput: unconsumedSeat,
  useChat: unconsumedSeat,
  useTrajectory: unconsumedSeat,
  useRemoteAccess: unconsumedSeat,
  useSessions: unconsumedSeat,
  useSessionRetainInfo: unconsumedSeat,
  useSessionAccess: unconsumedSeat,
  useSessionStatus: unconsumedSeat,
  usePanelInfo: unconsumedSeat,
  useContextMenu: unconsumedSeat,
  useWorkspaces: unconsumedSeat,
  useResource: unconsumedSeat,
  useWorkspaceAccess: unconsumedSeat,
  inputActions: {
    insertQuote: unconsumedSeat,
    captureInsertion: unconsumedSeat,
    insertText: unconsumedSeat,
    setDraft: unconsumedSeat,
    persistDraft: unconsumedSeat,
    addAttachments: unconsumedSeat,
    removeAttachment: unconsumedSeat,
    pruneAttachments: unconsumedSeat,
    submit: unconsumedSeat,
  },
} satisfies SessionStandardProps & GlobalStandardProps;
/** The opener's props share; each test supplies the on-screen Session hook beside it. */
function reviewProps(
  review: InstanceType<typeof PlanReviewOpen>["$props"]["review"],
  openReview: Mock,
  store: ReturnType<ReturnType<typeof createPlanReviewStore>["create"]>,
) {
  return {
    ...standardProps,
    review,
    requestKey: "question:1",
    t,
    openReview,
    actions: store.actions,
    useStore: bindSnapshotSelector(store),
  } satisfies Omit<InstanceType<typeof PlanReviewOpen>["$props"], "useSidebarMounted">;
}
/** A bound `useSidebarMounted` reading one on-screen Session value. */
function seatHook(source: HostObservable<SessionId | undefined>) {
  return bindSnapshotSelector(source);
}
function tabHook(address: string, params?: SidebarRightTabInfo["tab"]["navigation"]["params"]) {
  const info: SidebarRightTabInfo = {
    sidebar: { expanded: true, fullscreen: false },
    panel: { id: "pane:plan" as PaneId, isFloating: false },
    tab: {
      id: "tab:plan" as TabId,
      kind: "plan",
      contentId: address,
      title: "Plan",
      visible: true,
      navigation: { address, params, revision: 0 },
      signal: new AbortController().signal,
      actions: {
        bindCommands: () => () => {},
        openResource: vi.fn(),
        openTab: vi.fn(),
        close: vi.fn(),
      },
    },
  };
  return () => computed(() => info);
}
describe("submitted plan identity", () => {
  it("reads native, running PTC, and settled PTC calls", async () => {
    expect(plan).toEqual({ callId: "call:1", title: "Keep this plan", markdown });
    for (const type of ["tool/ptc-dispatch-start", "tool/ptc-dispatch"]) {
      expect(
        submittedPlan({
          type,
          data: { name: "exit_plan_mode", subCallId: "call:1", arguments: { plan: markdown } },
        }),
      ).toEqual(plan);
    }
  });
  it.each([
    { type: "user/message", data: call.data },
    { type: "tool/call", data: null },
    { type: "tool/call", data: [] },
    { type: "tool/call", data: { ...call.data, name: "read" } },
    { type: "tool/call", data: { ...call.data, callId: "" } },
    { type: "tool/call", data: { ...call.data, arguments: {} } },
    { type: "tool/call", data: { ...call.data, arguments: "{" } },
    { type: "tool/call", data: { ...call.data, arguments: "null" } },
    { type: "tool/call", data: { ...call.data, arguments: '{"plan":42}' } },
    { type: "tool/call", data: { ...call.data, arguments: '{"plan":"no title"}' } },
  ])("leaves malformed or unrelated input to its existing renderer: %j", async (event) => {
    expect(submittedPlan(event)).toBeUndefined();
  });
  it("round-trips opaque identifiers and refuses malformed addresses", async () => {
    expect(parsePlanAddress(planAddress(target))).toEqual(target);
    for (const mode of ["one-shot", "continuable"] as const) {
      const child = {
        session: {
          kind: "subagent" as const,
          parentSessionId: target.session.sessionId,
          childSessionId: "child / 中文" as SessionId,
          mode,
        },
        callId: plan.callId,
      };
      expect(parsePlanAddress(planAddress(child))).toEqual(child);
    }
    for (const address of [
      "file:///plan.md",
      "dsh-resource://plan/s/c/extra",
      "dsh-resource://plan/s/%XX",
      "dsh-resource://plan/s/c?text=x",
      "dsh-resource://plan//c",
      "dsh-resource://plan/subagent/p/c/invalid/call",
      "dsh-resource://plan/subagent/p/c/one-shot",
    ]) {
      expect(parsePlanAddress(address)).toBeUndefined();
    }
  });
  it("keeps a settled PTC update correlated with its existing card", async () => {
    expect(planDefinition.match(call as never)).toEqual({ id: plan.callId, role: "start" });
    const event = {
      type: "tool/ptc-dispatch",
      data: { name: "exit_plan_mode", subCallId: plan.callId, arguments: { plan: markdown } },
    };
    expect(planDefinition.match(event as never)).toEqual({ id: plan.callId, role: "update" });
    const context = {
      key: "plan",
      id: plan.callId,
      state: plan,
      start: { event: { seq: 12 }, location: { kind: "unresolved" } },
    };
    expect(planDefinition.buildViewNode!(context as never)).toMatchObject({
      visibility: "hidden",
      anchorSeq: 12,
      data: plan,
    });
    expect(
      planDefinition.buildViewNode!({
        ...context,
        state: undefined,
        start: undefined,
        matches: [],
      } as never),
    ).toBeNull();
  });
  it("retains the submitted version and recovers a cropped PTC start from settlement", async () => {
    expect(planDefinition.match({ type: "user/message", data: {} } as never)).toBeNull();
    const state = planDefinition.start({} as never, { event: call } as never, {} as never);
    expect(state).toEqual(plan);
    expect(planDefinition.update({ state } as never, {} as never)).toBe(state);
    const settled = {
      event: {
        type: "tool/ptc-dispatch",
        seq: 21,
        data: { name: "exit_plan_mode", subCallId: plan.callId, arguments: { plan: markdown } },
      },
      location: { kind: "unresolved" },
    };
    expect(
      planDefinition.buildViewNode!({ key: "plan", id: plan.callId, matches: [settled] } as never),
    ).toMatchObject({ anchorSeq: 21, data: plan });
  });
});
it("projects native and PTC submissions into their resolved turns without duplicate cards", async () => {
  const assembler = new ConversationNodeAssembler(
    { entries: () => [planDefinition], fallbackEntry: () => undefined },
    { entries: () => [chatViewDefinition] },
  );
  const events = [
    { type: "turn/start", data: { turn: 1 } },
    { type: "step/start", data: { turn: 1, step: 1 } },
    call,
    {
      type: "tool/call",
      data: { turn: 1, step: 1, callId: "root", name: "run_code", arguments: "{}" },
    },
    {
      type: "tool/ptc-dispatch-start",
      data: {
        rootCallId: "root",
        parentCallId: "root",
        subCallId: "ptc",
        name: "exit_plan_mode",
        arguments: { plan: markdown },
      },
    },
    {
      type: "tool/ptc-dispatch",
      data: {
        rootCallId: "root",
        parentCallId: "root",
        subCallId: "ptc",
        name: "exit_plan_mode",
        arguments: { plan: markdown },
        isError: false,
        content: [],
      },
    },
    { type: "turn/end", data: { turn: 1 } },
    { type: "turn/start", data: { turn: 2 } },
    { ...call, data: { ...call.data, turn: 2, callId: "next-turn" } },
    { type: "turn/end", data: { turn: 2 } },
  ];
  const entries = events.map((event, index) => ({
    type: "event",
    event: { ...event, seq: index + 1, time: index },
  })) as SessionLiveEventEntry[];
  assembler.replaceWindow(entries, false);
  assembler.activateTarget("chat");
  const snapshot = assembler.snapshot("chat") as ChatSnapshot;
  expect(snapshot.order).toEqual([]);
  expect(snapshot.nodes.values()).toHaveLength(3);
  const props = {
    turn: { turn: 1 },
    usePlans: keyedObservableHook((turn) =>
      snapshot.nodes.turnDataSource(Number(turn), "submitted-plan"),
    ) as InstanceType<typeof PlanCards>["$props"]["usePlans"],
    t,
    openPlan: vi.fn(),
  } as InstanceType<typeof PlanCards>["$props"];
  const view = render(
    h(PlanCards, {
      ...props,
    }),
  );
  expect(view.container.querySelectorAll("[data-plan-card]")).toHaveLength(2);
  await act(() => {
    view.rerender(
      h(PlanCards, {
        ...({ ...props, turn: { turn: 2 } } as unknown as InstanceType<typeof PlanCards>["$props"]),
      }),
    );
  });
  expect(view.container.querySelector("[data-plan-card]")?.getAttribute("data-plan-card")).toBe(
    "next-turn",
  );
  assembler.replaceWindow(
    entries.filter((_, index) => index !== 4),
    true,
  );
  expect((assembler.snapshot("chat") as ChatSnapshot).nodes.values()).toHaveLength(3);
});
it("updates plan cards only for their Turn’s plan data and preserves invocation order across paging", async () => {
  const builder = new ChatSnapshotBuilder();
  const timeline = builder.empty.timeline;
  const store = builder.empty.nodes;
  const source = store.turnDataSource(1, "submitted-plan");
  const turn = (id: number): TurnLocation => ({
    turn: id,
    start: undefined,
    end: undefined,
    status: "unknown",
    steps: [],
    data: { get: () => undefined, source: () => createSnapshotStore(undefined) },
  });
  const node = (id: string, seq: number, owner = 1): ChatNode<"submitted-plan"> => ({
    key: id,
    id,
    kind: "submitted-plan",
    target: "chat",
    anchorSeq: seq,
    location: { kind: "turn", turn: turn(owner) },
    visibility: "hidden",
    data: { ...plan, callId: id as typeof plan.callId, title: id },
  });
  const first = node("First plan", 10);
  const second = node("Second plan", 20);
  builder.replace({ nodes: [second, first, node("Other Turn", 30, 2)], timeline });
  builder.publish();
  expect(store.turnDataSource(1, "submitted-plan")).toBe(source);
  expect(source.getSnapshot()).toEqual([first.data, second.data]);
  const changed = vi.fn();
  const unsubscribe = source.subscribe(changed);
  const props = {
    turn: turn(1),
    t,
    openPlan: vi.fn(),
    useChat: () => {
      throw new Error("PlanCards must not subscribe to the complete Chat");
    },
    usePlans: keyedObservableHook((key) => store.turnDataSource(Number(key), "submitted-plan")),
  } as InstanceType<typeof PlanCards>["$props"];
  const view = render(
    h(PlanCards, {
      ...props,
    }),
  );
  try {
    const original = source.getSnapshot();
    await act(() => {
      builder.apply({
        upserts: [
          node("Another Turn’s plan", 40, 2),
          { ...first, location: { kind: "turn", turn: turn(1) } },
          { ...node("unrelated", 50), kind: "unrelated-test-kind" },
        ],
        timeline,
      });
      builder.publish();
    });
    expect(changed).not.toHaveBeenCalled();
    expect(source.getSnapshot()).toBe(original);
    expect(screen.getAllByRole("button")).toHaveLength(2);
    const earlier = node("Earlier plan", 5);
    await act(() => {
      builder.apply({ upserts: [earlier], timeline });
      builder.publish();
    });
    expect(changed).toHaveBeenCalledOnce();
    expect(source.getSnapshot()).toEqual([earlier.data, first.data, second.data]);
    expect(
      screen.getAllByRole("button").map((button) => button.getAttribute("data-plan-card")),
    ).toEqual(["Earlier plan", "First plan", "Second plan"]);
    {
      fireEvent.click(screen.getAllByRole("button")[0]!);
      await nextTick();
    }
    expect(props.openPlan).toHaveBeenCalledWith(earlier.data.callId);
    await act(() => {
      builder.apply({
        upserts: [{ ...first, location: { kind: "turn", turn: turn(2) } }],
        timeline,
      });
      builder.publish();
    });
    expect(source.getSnapshot()).toEqual([earlier.data, second.data]);
    await act(() => {
      builder.replace({ nodes: [], timeline });
      builder.publish();
    });
    expect(source.getSnapshot()).toEqual([]);
    expect(view.container.children).toHaveLength(0);
  } finally {
    unsubscribe();
  }
});
describe("plan entry points and document", () => {
  it("opens the exact persistent card in either locale", async () => {
    for (const dictionary of [en, zh]) {
      const openPlan = vi.fn();
      const props = {
        turn: { turn: 1 },
        usePlans: planHook([plan]),
        seq: 30,
        t: makeTranslate(dictionary, commonEn),
        openPlan,
      } as InstanceType<typeof PlanCards>["$props"];
      const view = render(
        h(PlanCards, {
          ...props,
        }),
      );
      expect(openPlan).not.toHaveBeenCalled();
      expect(screen.getByText(dictionary["preview.action"])).toBeTruthy();
      expect(screen.queryByText("Implement")).toBeNull();
      {
        fireEvent.click(screen.getByRole("button"));
        await nextTick();
      }
      expect(openPlan).toHaveBeenCalledWith(plan.callId);
      expect(screen.getByText(plan.title)).toBeTruthy();
      view.unmount();
    }
  });
  it("renders the supplied invocation order and removes cards when the collection empties", async () => {
    const revised = { ...plan, callId: "call:2" as typeof plan.callId, title: "Second plan" };
    const plans = [plan, revised, { ...revised, callId: "call:3" as typeof plan.callId }];
    const openPlan = vi.fn();
    const collection = createSnapshotStore(plans);
    const bindPlans = keyedObservableHook(() => collection);
    const props = { turn: { turn: 1 }, usePlans: bindPlans, t, openPlan } as InstanceType<
      typeof PlanCards
    >["$props"];
    const view = render(
      h(PlanCards, {
        ...props,
      }),
    );
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      expect.stringContaining(plan.title),
      expect.stringContaining(revised.title),
      expect.stringContaining(revised.title),
    ]);
    {
      fireEvent.click(screen.getAllByRole("button")[1]!);
      await nextTick();
    }
    expect(openPlan).toHaveBeenCalledWith("call:2");
    await act(() => {
      collection.set([]);
    });
    expect(view.container.children).toHaveLength(0);
  });
  it.each([true, false])(
    "opens once, preserves manual closure, and reopens a review (logged: %s)",
    async (logged) => {
      const openReview = vi.fn();
      const store = createPlanReviewStore().create();
      const review = {
        id: "review",
        question: "Approve?",
        approve: { label: "Approve" },
        plan: markdown,
        ...(logged ? { callId: plan.callId } : {}),
      };
      const props = {
        ...reviewProps(review, openReview, store),
        useSidebarMounted: seatHook(
          createSnapshotStore<SessionId | undefined>(target.session.sessionId),
        ),
      };
      const first = render(
        h(PlanReviewOpen, {
          ...props,
        }),
      );
      await act(() => {});
      expect(openReview).toHaveBeenCalledExactlyOnceWith(review, "question:1");
      first.rerender(
        h(PlanReviewOpen, {
          ...props,
        }),
      );
      first.unmount();
      const second = render(
        h(PlanReviewOpen, {
          ...props,
        }),
      );
      expect(openReview).toHaveBeenCalledTimes(1);
      {
        fireEvent.click(screen.getByRole("button", { name: "Open plan in sidebar" }));
        await nextTick();
      }
      expect(openReview).toHaveBeenCalledTimes(2);
      const revised = {
        ...review,
        plan: "# Revised",
        ...(logged ? { callId: "call:2" as typeof plan.callId } : {}),
      };
      second.rerender(
        h(PlanReviewOpen, {
          ...({ ...props, review: revised, requestKey: "question:2" } as InstanceType<
            typeof PlanReviewOpen
          >["$props"]),
        }),
      );
      expect(openReview).toHaveBeenLastCalledWith(revised, "question:2");
      expect(openReview).toHaveBeenCalledTimes(3);
      second.unmount();
      const other = createPlanReviewStore().create();
      render(
        h(PlanReviewOpen, {
          ...({
            ...props,
            actions: other.actions,
            useStore: bindSnapshotSelector(other),
          } as InstanceType<typeof PlanReviewOpen>["$props"]),
        }),
      );
      expect(openReview).toHaveBeenCalledTimes(4);
    },
  );
  it("waits for a Session on screen before opening automatically, then opens once", async () => {
    // A retained Sidebar can hold the review while no Session is on screen.
    const openReview = vi.fn();
    const store = createPlanReviewStore().create();
    const mounted = createSnapshotStore<SessionId | undefined>(undefined);
    const review = {
      id: "review",
      question: "Approve?",
      approve: { label: "Approve" },
      plan: markdown,
      callId: plan.callId,
    };
    const props = {
      ...reviewProps(review, openReview, store),
      useSidebarMounted: seatHook(mounted),
    };
    const view = render(
      h(PlanReviewOpen, {
        ...props,
      }),
    );
    expect(openReview).not.toHaveBeenCalled();
    expect(store.getSnapshot().opened).toEqual({});
    {
      // The manual opener stays available without a Session on screen; the service decides what to do.
      fireEvent.click(screen.getByRole("button", { name: "Open plan in sidebar" }));
      await nextTick();
    }
    expect(openReview).toHaveBeenCalledTimes(1);
    mounted.set(target.session.sessionId);
    await act(() => {
      view.rerender(
        h(PlanReviewOpen, {
          ...props,
        }),
      );
    });
    expect(openReview).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().opened).toEqual({ [`call:${plan.callId}`]: true });
    await act(() => {
      view.rerender(
        h(PlanReviewOpen, {
          ...props,
        }),
      );
    });
    mounted.set(undefined);
    await act(() => {
      view.rerender(
        h(PlanReviewOpen, {
          ...props,
        }),
      );
    });
    mounted.set(target.session.sessionId);
    await act(() => {
      view.rerender(
        h(PlanReviewOpen, {
          ...props,
        }),
      );
    });
    expect(openReview).toHaveBeenCalledTimes(2);
  });
  it("renders temporary Markdown and reports expired navigation after reload", async () => {
    const address = reviewPreviewAddress(target.session.sessionId, "window:question:1");
    expect(isReviewPreviewAddress(address)).toBe(true);
    expect(isReviewPreviewAddress(planAddress(target))).toBe(false);
    const props = {
      ...standardProps,
      t,
      useResource: () =>
        computed<ResourceSnapshot<never>>(() => ({
          status: "none",
          value: undefined,
          failure: undefined,
        })),
      useTabInfo: tabHook(address, { planReview: { title: plan.title, markdown } }),
    } satisfies InstanceType<typeof PlanPreview>["$props"];
    const view = render(
      h(PlanPreview, {
        ...(props as unknown as InstanceType<typeof PlanPreview>["$props"]),
      }),
    );
    expect(screen.getByRole("heading", { name: plan.title })).toBeTruthy();
    expect(screen.getByText("Implement")).toBeTruthy();
    await act(() => {
      view.rerender(
        h(PlanTitle, {
          ...(props as unknown as InstanceType<typeof PlanTitle>["$props"]),
        }),
      );
    });
    expect(screen.getByText(plan.title)).toBeTruthy();
    await act(() => {
      view.rerender(
        h(PlanPreview, {
          ...{ ...props, useTabInfo: tabHook(address) },
        }),
      );
    });
    expect(screen.getByRole("status").textContent).toBe(en["preview.expired"]);
    await act(() => {
      view.rerender(
        h(PlanTitle, {
          ...{ ...props, useTabInfo: tabHook(address) },
        }),
      );
    });
    expect(screen.getByText("Plan")).toBeTruthy();
    await act(() => {
      view.rerender(
        h(PlanPreview, {
          ...{ ...props, useTabInfo: tabHook(address, { line: 2 }) },
        }),
      );
    });
    expect(screen.getByRole("status").textContent).toBe(en["preview.expired"]);
  });
  it("shows restored Markdown and its heading as the tab title", async () => {
    const props = {
      t,
      useTabInfo: () =>
        computed(() => ({ tab: { title: "Plan", navigation: { address: planAddress(target) } } })),
      useResource: () => computed(() => ({ status: "live", value: plan })),
    };
    render(
      h(PlanPreview, {
        ...(props as unknown as InstanceType<typeof PlanPreview>["$props"]),
      }),
    );
    expect(screen.getByRole("heading", { name: plan.title })).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    cleanup();
    render(
      h(PlanTitle, {
        ...(props as unknown as InstanceType<typeof PlanTitle>["$props"]),
      }),
    );
    expect(screen.getByText(plan.title)).toBeTruthy();
  });
  it("keeps a tab label while history loads", async () => {
    const props = {
      useTabInfo: () =>
        computed(() => ({ tab: { title: "Plan", navigation: { address: planAddress(target) } } })),
      useResource: () => computed(() => ({ status: "loading" })),
    };
    render(
      h(PlanTitle, {
        ...(props as unknown as InstanceType<typeof PlanTitle>["$props"]),
      }),
    );
    expect(screen.getByText("Plan")).toBeTruthy();
  });
  it.each([en, zh])("localizes plan failures and unavailable providers", async (dictionary) => {
    const props = {
      ...standardProps,
      t: makeTranslate(dictionary, commonEn),
      useTabInfo: tabHook(planAddress(target)),
    };
    const resource = shallowRef<ResourceSnapshot<never>>({
      status: "loading",
      value: undefined,
      failure: undefined,
    });
    render(
      h(PlanPreview, {
        ...({ ...props, useResource: () => resource } satisfies InstanceType<
          typeof PlanPreview
        >["$props"]),
      }),
    );
    expect(screen.getByRole("status").textContent).toBe(dictionary["preview.loading"]);
    await act(() => {
      resource.value = { status: "none", value: undefined, failure: undefined };
    });
    expect(screen.getByRole("status").textContent).toBe(dictionary["preview.unavailable"]);
    for (const [failure, message] of [
      [
        new RemoteError("plan/invalid-address", "connection lost", {}),
        dictionary["preview.invalidAddress"],
      ],
      [new RemoteError("plan/not-found", "connection lost", {}), dictionary["preview.notFound"]],
      [new RemoteError("plan/read-failed", "connection lost", {}), "connection lost"],
      [
        new RemoteError("session/not-found", "connection lost", {
          sessionId: target.session.sessionId,
        }),
        "connection lost",
      ],
    ] as const) {
      await act(() => {
        resource.value = { status: "failed", value: undefined, failure };
      });
      expect(screen.getByRole("status").textContent).toBe(dictionary["preview.failed"] + message);
    }
  });
});
