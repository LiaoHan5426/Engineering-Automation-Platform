// @vitest-environment jsdom
/** Node publications preserve the contextual hook scope until its selected owner changes. */
import { Context } from "@deepseek-ai/cordis";
import {
  createApp,
  defineComponent,
  h,
  nextTick,
  onScopeDispose,
  shallowRef,
  toValue,
  type Ref,
  type ShallowRef,
} from "vue";
import { expect, it, onTestFinished, vi } from "vite-plus/test";
import { createSnapshotStore } from "@deepseek-ai/dsh-client-store";
import { bindSnapshotSelector, makeTranslate } from "@deepseek-ai/dsh-client-test-runtime";
import { SlotRegistry, useObservableSelector } from "@deepseek-ai/dsh-client-ui-renderer/client";
import type {
  HostObservable,
  KeyedSnapshotSelectorHook,
  PropsRenderSlots,
} from "@deepseek-ai/dsh-client-ui-slots";
import { createVueSlotRenderer } from "../../ui-renderer/src/client/vue/slots.ts";
import { ChatNodeSeat } from "../src/client/chat/ChatNodeSeat.tsx";
import { CHAT_NODE_INJECT } from "../src/client/apply.ts";
import type {
  ChatNodeInjected,
  UseDisclosure,
  UseGroupAction,
} from "../src/client/contract/slots.ts";
import type { ChatNode } from "../src/client/contract/chat-nodes.ts";
import { ChatSnapshotBuilder } from "../src/client/conversation-nodes/chat-snapshot-builder.ts";
import { presentationPolicyFor } from "../src/client/presentation-policy.ts";
import { chatSnapshotFixture } from "./chat-snapshot-fixture.client.ts";

type SeatProps = InstanceType<typeof ChatNodeSeat>["$props"];
type SourceKey = string | Readonly<Ref<string | undefined>>;

function keyedSelector<T>(
  source: (key: string) => HostObservable<T>,
): KeyedSnapshotSelectorHook<T> {
  function useKeyed(key: SourceKey): Readonly<ShallowRef<T | undefined>>;
  function useKeyed<S>(
    key: SourceKey,
    select: (value: T) => S,
    equal?: (left: S, right: S) => boolean,
  ): Readonly<ShallowRef<S | undefined>>;
  function useKeyed<S>(
    key: SourceKey,
    select?: (value: T) => S,
    equal?: (left: S, right: S) => boolean,
  ) {
    const read = () => {
      const current = toValue(key);
      return current === undefined ? undefined : source(current);
    };
    return select === undefined
      ? useObservableSelector(read, () => (value: T) => value)
      : useObservableSelector(read, () => select, equal);
  }
  return useKeyed;
}

it("retains disclosure, subscriptions and DOM across settlement, but rebinds changed context owners", async () => {
  const ctx = new Context();
  await ctx.plugin(SlotRegistry);
  const binding = createSnapshotStore({
    key: "session",
    ctx,
    hooks: {},
    keyedHooks: {},
    props: {},
  });
  ctx.slots.installScope("session", {
    current: binding,
    bindingSource: () => binding,
    renderArea: (_binding, props) => props.children,
  });
  ctx.slots.install(createVueSlotRenderer());
  const turn = chatSnapshotFixture({
    turnTimings: new Map([[1, { startTime: 0 }]]),
  }).timeline.turns.get(1)!;
  let node: ChatNode<"assistant-step"> = {
    key: "assistant:1",
    id: "1",
    target: "chat",
    kind: "assistant-step",
    anchorSeq: 1,
    location: { kind: "turn", turn },
    visibility: "visible",
    data: { status: "running", blocks: [], turn: 1, step: 1, time: 0 },
  };
  const builder = new ChatSnapshotBuilder();
  const publish = () => {
    builder.replace({
      nodes: [node],
      timeline: {
        turnOrder: [1],
        turns: new Map([[1, node.location.kind === "turn" ? node.location.turn : turn]]),
      },
    });
    builder.publish();
  };
  publish();
  const nodes = builder.empty.nodes;
  const groupAction = shallowRef<UseGroupAction>(() => shallowRef<HTMLDivElement | null>(null));
  const started = vi.fn();
  const stopped = vi.fn();
  const hooks: ChatNodeInjected = {
    hooks: {
      ...CHAT_NODE_INJECT.hooks,
      disclosure: (standard, context) => {
        const bind = CHAT_NODE_INJECT.hooks.disclosure(standard, context);
        return () => {
          started();
          onScopeDispose(stopped);
          return bind();
        };
      },
    },
  };
  const Entry = defineComponent(
    (props: { useDisclosure: UseDisclosure; useGroupAction: UseGroupAction }) => {
      const disclosure = props.useDisclosure();
      props.useGroupAction(false, () => {});
      return () =>
        h(
          "button",
          {
            onClick: disclosure.value.toggle,
            "aria-expanded": disclosure.value.expanded,
          },
          disclosure.value.expanded ? "open" : "closed",
        );
    },
    { props: ["useDisclosure", "useGroupAction"], inheritAttrs: false },
  );
  const Frame = defineComponent(
    (props: PropsRenderSlots<"conversation.chat.node">) => () =>
      h(ChatNodeSeat, {
        nodeKey: node.key,
        nodeStore: nodes,
        useChatNode: keyedSelector((key) => nodes.source(key)),
        useChatNodeProcess: keyedSelector((key) => nodes.processSource(key)),
        useChatNodeBottom: keyedSelector((key) => nodes.bottomSource(key)),
        usePresentation: bindSnapshotSelector(
          createSnapshotStore(presentationPolicyFor("verbose")),
        ),
        useStore: bindSnapshotSelector(createSnapshotStore({ turnProcesses: [] })),
        actions: { setTurnProcessOpen: () => {} },
        useGroupAction: groupAction.value,
        renderSlot: props.renderSlot,
        t: makeTranslate({}),
        openFile: () => {},
        forkAt: () => {},
        inspectCall: undefined,
        loadImage: async () => "",
        deferCollapse: false,
      } satisfies SeatProps),
    { props: ["renderSlot"], inheritAttrs: false },
  );
  ctx.slots.register(
    {
      name: "root",
      children: {
        "conversation.chat.node": { kind: "keyed", scope: "session", inject: hooks },
      },
    },
    Frame,
  );
  ctx.slots.register({ name: "conversation.chat.node", key: "assistant-step" }, Entry);
  const host = document.createElement("main");
  document.body.append(host);
  const app = createApp({ render: () => ctx.slots.renderSlot("root", {}) });
  const errors = vi.fn();
  app.config.errorHandler = errors;
  let mounted = true;
  onTestFinished(async () => {
    if (mounted) app.unmount();
    host.remove();
    await ctx.fiber.dispose();
  });
  app.mount(host);
  await nextTick();
  expect(errors.mock.calls).toEqual([]);
  const button = host.querySelector("button")!;
  button.click();
  await nextTick();
  expect(button.textContent).toBe("open");
  expect(started).toHaveBeenCalledTimes(1);
  expect(stopped).not.toHaveBeenCalled();

  node = { ...node, data: { ...node.data, status: "settled" } };
  publish();
  await nextTick();
  expect(host.querySelector("button")).toBe(button);
  expect(button.textContent).toBe("open");
  expect(started).toHaveBeenCalledTimes(1);
  expect(stopped).not.toHaveBeenCalled();

  const replacement = chatSnapshotFixture({
    turnTimings: new Map([[1, { startTime: 0 }]]),
  }).timeline.turns.get(1)!;
  expect(replacement.data).not.toBe(turn.data);
  node = { ...node, location: { kind: "turn", turn: replacement } };
  publish();
  await nextTick();
  expect(host.querySelector("button")).toBe(button);
  expect(button.textContent).toBe("closed");
  expect(started).toHaveBeenCalledTimes(2);
  expect(stopped).toHaveBeenCalledTimes(1);
  button.click();
  await nextTick();
  expect(button.textContent).toBe("open");

  groupAction.value = () => shallowRef<HTMLDivElement | null>(null);
  await nextTick();
  expect(host.querySelector("button")).toBe(button);
  expect(button.textContent).toBe("closed");
  expect(started).toHaveBeenCalledTimes(3);
  expect(stopped).toHaveBeenCalledTimes(2);
  expect(errors).not.toHaveBeenCalled();
  app.unmount();
  mounted = false;
  expect(stopped).toHaveBeenCalledTimes(3);
});
