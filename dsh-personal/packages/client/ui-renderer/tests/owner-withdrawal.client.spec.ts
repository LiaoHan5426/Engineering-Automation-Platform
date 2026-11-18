// @vitest-environment jsdom
/** A removed owner must retire its native bindings before the outlet's queued unmount. */
import { Context } from "@deepseek-ai/cordis";
import { createApp, h, nextTick, onScopeDispose, type Ref, type VNodeChild } from "vue";
import { expect, it, onTestFinished, vi } from "vite-plus/test";
import { defineStore } from "@deepseek-ai/dsh-client-store";
import {
  StaleAuthorizationError,
  type StandardSourceBinding,
} from "@deepseek-ai/dsh-client-ui-slots";
import { SlotRegistry } from "../src/client/registry.ts";
import { createVueSlotRenderer } from "../src/client/vue/slots.ts";
import { defineSlotComponent } from "../src/client/vue/components.ts";

it.each(["ordinary", "shared", "exclusive"] as const)(
  "retires a withdrawn %s owner before a synchronous binding publication",
  async (kind) => {
    const ctx = new Context();
    await ctx.plugin(SlotRegistry);
    const binding = { key: "session", ctx, hooks: {}, keyedHooks: {}, props: {} };
    let snapshot: StandardSourceBinding = binding;
    const listeners = new Set<() => void>();
    const source = {
      getSnapshot: () => snapshot,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };
    ctx.slots.installScope("session", {
      current: source,
      bindingSource: () => source,
      renderArea: (_binding, props) => props.children,
    });
    ctx.slots.install(createVueSlotRenderer());
    const ledger = ctx.slots as {
      register(options: object, component: unknown): () => void;
      registerFactory(options: object, component: unknown): () => void;
    };
    const store = defineStore({ init: () => ({ count: 7 }), actions: {} });
    const creations = vi.spyOn(store, "create");
    const inject = vi.fn(() => ({}));
    let released = 0;
    let retiredRender: ((name: string, input: object) => VNodeChild) | undefined;
    const Factory = defineSlotComponent<{
      useStore: (select: (state: { count: number }) => number) => Readonly<Ref<number | undefined>>;
      renderFactorySlot: (name: string, input: object) => VNodeChild;
    }>(["useStore", "renderFactorySlot"], (props) => {
      const count = props.useStore((state) => state.count);
      retiredRender = props.renderFactorySlot;
      onScopeDispose(() => {
        released += 1;
      });
      return () => h("b", String(count.value));
    });
    ledger.register(
      {
        name: "root",
        ...(kind === "ordinary"
          ? { children: { "native.withdraw": { kind: "single", scope: "session-maybe" } } }
          : {}),
      },
      defineSlotComponent<{
        renderFactorySlot: (
          name: string,
          input: object,
          options: { fallback: VNodeChild },
        ) => VNodeChild;
        renderSlot: (name: string, input: object, options: { fallback: VNodeChild }) => VNodeChild;
      }>(
        ["renderFactorySlot", "renderSlot"],
        (props) => () =>
          kind === "ordinary"
            ? props.renderSlot("native.withdraw", {}, { fallback: "withdrawn" })
            : props.renderFactorySlot("native.withdraw", {}, { fallback: "withdrawn" }),
      ),
    );
    const remove =
      kind === "ordinary"
        ? ledger.register({ name: "native.withdraw", store, inject }, Factory)
        : ledger.registerFactory(
            {
              name: "native.withdraw",
              scope: "session-maybe",
              store: kind === "exclusive" ? () => store : store,
              inject,
            },
            Factory,
          );
    const container = document.createElement("main");
    document.body.append(container);
    const app = createApp({ render: () => ctx.slots.renderSlot("root", {}) });
    const errors = vi.fn();
    app.config.errorHandler = errors;
    onTestFinished(async () => {
      app.unmount();
      container.remove();
      await ctx.fiber.dispose();
    });
    app.mount(container);
    await nextTick();
    expect(container.textContent).toBe("7");
    const before = { creates: creations.mock.calls.length, injects: inject.mock.calls.length };
    remove();
    snapshot = { ...binding, props: { revision: 1 } };
    expect(() => {
      for (const listener of [...listeners]) listener();
    }).not.toThrow();
    await Promise.resolve();
    await nextTick();
    expect(container.textContent).toBe("withdrawn");
    expect(released).toBe(1);
    expect(creations).toHaveBeenCalledTimes(before.creates);
    expect(inject).toHaveBeenCalledTimes(before.injects);
    expect(errors).not.toHaveBeenCalled();
    expect(retiredRender).toBeDefined();
    expect(() => retiredRender!("native.withdraw", {})).toThrow(StaleAuthorizationError);
  },
);
