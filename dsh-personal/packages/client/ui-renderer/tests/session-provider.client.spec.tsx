// @vitest-environment jsdom
import { defineComponent, computed, shallowRef, h as vueH, Fragment, type VNodeChild } from "vue";

import { useObservableSelector } from "../src/client/vue-observable.ts";
const identity = <T,>(value: T): T => value;
import { Context } from "@deepseek-ai/cordis";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, within } from "@testing-library/dom";
import {
  cleanupVue as cleanup,
  flushVue as act,
  renderVue,
} from "../../ui-primitives/tests/vue-render.ts";

function render(node: Parameters<typeof renderVue>[0]) {
  const view = renderVue(node);
  return { ...view, ...within(document.body) };
}
import type {
  SessionBinding as ControllerBinding,
  SessionReference,
} from "@deepseek-ai/dsh-api-session-controller/client";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
import type {
  SessionProviderComponent,
  StoredEntry,
  ScopedStandardSourceBinding,
  SlotRendererHost,
  SlotScopeAdapter,
  StandardSourceBinding,
} from "@deepseek-ai/dsh-client-ui-slots";
import type {} from "@deepseek-ai/dsh-client-ui-session/client";
import { renderSessionArea } from "../../ui-session/src/client/session-provider.tsx";
import { createVueSlotRenderer } from "../src/client/vue/slots.ts";
const roots: Context[] = [];
afterEach(async () => {
  cleanup();
  await Promise.all(roots.splice(0).map((ctx) => ctx.fiber.dispose()));
  vi.restoreAllMocks();
});
function observable<T>(initial: T) {
  let value = initial;
  const subs = new Set<() => void>();
  return {
    getSnapshot: () => value,
    subscribe: (fn: () => void) => {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
    set: (next: T) => {
      value = next;
      for (const fn of [...subs]) fn();
    },
  };
}
type SessionBody = (
  renderSlot: (key: string, owner: object) => VNodeChild,
  Provider: SessionProviderComponent,
  reference: SessionReference | undefined,
) => VNodeChild;
function makeHost(
  body: SessionBody,
  options: {
    installRenderArea?: boolean;
    optional?: boolean;
  } = {},
) {
  const absentBinding: StandardSourceBinding = {
    key: undefined,
    hooks: { session: undefined },
    keyedHooks: {},
    props: { sessionId: undefined },
  };
  const absent = observable(absentBinding);
  const selected = observable<SessionReference | undefined>(undefined);
  const references = new Map<string, SessionReference>();
  const sources = new Map<SessionReference, ReturnType<typeof observable<StandardSourceBinding>>>();
  const sessionEntries: StoredEntry[] = [];
  const root = observable<StandardSourceBinding>({
    key: undefined,
    hooks: {},
    keyedHooks: {},
    props: {},
  });
  const bindingSource = vi.fn((reference: SessionReference | undefined) => {
    if (reference === undefined) return absent;
    const source = sources.get(reference);
    if (source === undefined) throw new Error("unknown fixture reference");
    return source;
  });
  const sessionAdapter: SlotScopeAdapter = {
    current: absent,
    bindingSource,
    ...(options.installRenderArea === false ? {} : { renderArea: renderSessionArea }),
  };
  const scope = options.optional === true ? "session-maybe" : "session";
  const rootEntry: StoredEntry = {
    component: defineComponent(
      (props: {
        renderSlot: (key: string, owner: object) => VNodeChild;
        SessionProvider: SessionProviderComponent;
      }) => {
        const externalSource1 = useObservableSelector(
          () => ({ subscribe: selected.subscribe, getSnapshot: selected.getSnapshot }),
          () => identity,
        );
        const reference = externalSource1;
        return () => body(props.renderSlot, props.SessionProvider, reference.value);
      },
      {
        props: ["renderSlot", "SessionProvider"],
        inheritAttrs: false,
      },
    ),
    options: {},
    children: { "k.session": { kind: "single", scope } },
  };
  const host: SlotRendererHost = {
    subscribe: () => () => {},
    getVersion: () => 0,
    entriesOf: (key) => (key === "root" ? [rootEntry] : sessionEntries),
    entriesOfSlot: (key) => (key === "root" ? [rootEntry] : sessionEntries),
    reportEntryError: () => {},
    reportFactoryError: () => {},
    specOf: (key) =>
      key === "root"
        ? { kind: "single", scope: "root" }
        : key === "k.session"
          ? { kind: "single", scope }
          : undefined,
    isLive: () => true,
    storeOf: () => undefined,
    factoryStoreOf: () => undefined,
    retainFactoryOccurrence: () => () => {},
    subscribeFactory: () => () => {},
    getFactoryVersion: () => 0,
    factoryOf: () => undefined,
    isFactoryLive: () => false,
    root,
    scopeRevision: observable(0),
    scope: () => sessionAdapter,
  };
  return {
    host,
    bindingSource,
    current: {
      set: (id: string | undefined) => {
        selected.set(id === undefined ? undefined : references.get(id));
      },
    },
    addSession: (id: string) => {
      const ctx = new Context();
      roots.push(ctx);
      const binding: ScopedStandardSourceBinding = {
        key: id,
        ctx,
        hooks: { session: observable({ sid: id }) },
        keyedHooks: {},
        props: { sessionId: id },
      };
      const release = vi.fn();
      const reference: SessionReference = {
        sessionId: id as SessionId,
        binding: { sessionId: id, ctx } as ControllerBinding,
        ready: Promise.resolve({ sessionId: id, ctx } as ControllerBinding),
        release,
        [Symbol.dispose]: release,
      };
      const source = observable<StandardSourceBinding>(binding);
      references.set(id, reference);
      sources.set(reference, source);
      return { binding, reference, source, release };
    },
    registerSession: (entry: StoredEntry) => {
      sessionEntries.push(entry);
    },
  };
}
const Counter = defineComponent(
  (props: { sessionId: string }) => {
    const sessionId = computed(() => props.sessionId);
    const count = shallowRef(0);
    const setCount = (
      next: typeof count.value | ((previous: typeof count.value) => typeof count.value),
    ) => {
      count.value = typeof next === "function" ? next(count.value) : next;
    };
    return () =>
      vueH(
        "button",
        {
          onClick: () => {
            setCount(count.value + 1);
          },
        },
        [sessionId.value, ":", count.value],
      );
  },
  {
    props: ["sessionId"],
    inheritAttrs: false,
  },
);
describe("SessionProvider", () => {
  it("renders explicit absence and switches only when the owner supplies a reference", async () => {
    const h = makeHost((renderSlot, Provider, reference) =>
      vueH(
        Provider,
        {
          session: reference,
          empty: () => vueH("span", null, ["empty"]),
        },
        {
          default: () => [renderSlot("k.session", {})],
        },
      ),
    );
    h.registerSession({
      component: ({ sessionId }: { sessionId: string }) => vueH("b", null, [sessionId]),
      options: {},
    });
    h.addSession("s1");
    const view = render(vueH(Fragment, null, [createVueSlotRenderer().renderRoot(h.host, {})]));
    expect(view.container.textContent).toBe("empty");
    expect(h.bindingSource).toHaveBeenCalledWith(undefined);
    await act(() => {
      h.current.set("s1");
    });
    expect(view.container.textContent).toBe("s1");
    await act(() => {
      h.current.set(undefined);
    });
    expect(view.container.textContent).toBe("empty");
  });
  it("renders nothing for explicit absence when the empty branch is omitted", () => {
    const h = makeHost((_renderSlot, Provider) =>
      vueH(
        Provider,
        {
          session: undefined,
        },
        {
          default: () => [vueH("b", null, ["session"])],
        },
      ),
    );
    const view = render(vueH(Fragment, null, [createVueSlotRenderer().renderRoot(h.host, {})]));
    expect(view.container.textContent).toBe("");
  });
  it("does not infer a root scope from the main owner selection", () => {
    const h = makeHost((renderSlot) => renderSlot("k.session", {}), { optional: true });
    h.addSession("s1");
    h.registerSession({
      component: ({ sessionId }: { sessionId?: string }) =>
        vueH("b", null, [sessionId ?? "absent"]),
      options: {},
    });
    h.current.set("s1");
    const view = render(vueH(Fragment, null, [createVueSlotRenderer().renderRoot(h.host, {})]));
    expect(view.container.textContent).toBe("absent");
  });
  it("preserves a resident optional subtree when absence adopts its first Session", async () => {
    const h = makeHost(
      (renderSlot, Provider, reference) => {
        const body = renderSlot("k.session", {});
        return vueH(
          Provider,
          {
            session: reference,
            empty: () => body,
          },
          {
            default: () => [body],
          },
        );
      },
      { optional: true },
    );
    h.registerSession({
      component: ({ sessionId }: { sessionId?: string }) =>
        vueH(Counter, {
          sessionId: sessionId ?? "blank",
        }),
      options: {},
    });
    h.addSession("first");
    const view = render(vueH(Fragment, null, [createVueSlotRenderer().renderRoot(h.host, {})]));
    const button = view.getByRole("button");
    await fireEvent.click(button);
    expect(button.textContent).toBe("blank:1");
    await act(() => {
      h.current.set("first");
    });
    expect(view.getByRole("button")).toBe(button);
    expect(button.textContent).toBe("first:1");
  });
  it("resets an adopted optional subtree for a same-id replacement generation", async () => {
    const h = makeHost(
      (renderSlot, Provider, reference) => {
        const body = renderSlot("k.session", {});
        return vueH(
          Provider,
          {
            session: reference,
            empty: () => body,
          },
          {
            default: () => [body],
          },
        );
      },
      { optional: true },
    );
    h.registerSession({ component: Counter, options: {} });
    h.addSession("same");
    h.current.set("same");
    const view = render(vueH(Fragment, null, [createVueSlotRenderer().renderRoot(h.host, {})]));
    const oldButton = view.getByRole("button");
    await fireEvent.click(oldButton);
    expect(oldButton.textContent).toBe("same:1");
    await act(() => {
      h.addSession("same");
      h.current.set("same");
    });
    expect(view.getByRole("button")).not.toBe(oldButton);
    expect(view.getByRole("button").textContent).toBe("same:0");
  });
  it("resets local state on a Session switch and on a same-id new Context generation", async () => {
    const h = makeHost((renderSlot, Provider, reference) =>
      vueH(
        Provider,
        {
          session: reference,
        },
        {
          default: () => [renderSlot("k.session", {})],
        },
      ),
    );
    h.registerSession({ component: Counter, options: {} });
    h.addSession("s1");
    h.addSession("s2");
    h.current.set("s1");
    const view = render(vueH(Fragment, null, [createVueSlotRenderer().renderRoot(h.host, {})]));
    await fireEvent.click(view.getByRole("button"));
    expect(view.container.textContent).toBe("s1:1");
    await act(() => {
      h.current.set("s2");
    });
    expect(view.container.textContent).toBe("s2:0");
    await fireEvent.click(view.getByRole("button"));
    await act(() => {
      h.addSession("s2");
      h.current.set("s2");
    });
    expect(view.container.textContent).toBe("s2:0");
  });
  it("refreshes descriptor props without remounting the live generation", async () => {
    const h = makeHost((renderSlot, Provider, reference) =>
      vueH(
        Provider,
        {
          session: reference,
        },
        {
          default: () => [renderSlot("k.session", {})],
        },
      ),
    );
    const session = h.addSession("s1");
    h.registerSession({
      component: ({ sessionId, feature }: { sessionId: string; feature?: string }) =>
        vueH(Fragment, null, [
          vueH(Counter, {
            sessionId: sessionId,
          }),
          vueH("b", null, [feature]),
        ]),
      options: {},
    });
    h.current.set("s1");
    const view = render(vueH(Fragment, null, [createVueSlotRenderer().renderRoot(h.host, {})]));
    await fireEvent.click(view.getByRole("button"));
    await act(() => {
      session.source.set({
        ...session.binding,
        props: { ...session.binding.props, feature: "added" },
      });
    });
    expect(view.container.textContent).toBe("s1:1added");
    await act(() => {
      session.source.set(session.binding);
    });
    expect(view.container.textContent).toBe("s1:1");
  });
  it("binds nested Providers independently and restores the outer reference for siblings", () => {
    const h = makeHost((renderSlot, Provider, reference) =>
      vueH(
        Provider,
        {
          session: reference,
        },
        {
          default: () => [
            renderSlot("k.session", { position: "outer-before" }),
            vueH(
              Provider,
              {
                session: nested.reference,
              },
              {
                default: () => [renderSlot("k.session", { position: "inner" })],
              },
            ),
            vueH(
              Provider,
              {
                session: undefined,
                empty: () => vueH("i", null, ["nested-empty"]),
              },
              {
                default: () => ["hidden"],
              },
            ),
            renderSlot("k.session", { position: "outer-after" }),
          ],
        },
      ),
    );
    const outer = h.addSession("a");
    const nested = h.addSession("b");
    h.current.set("a");
    h.registerSession({
      component: ({ sessionId, position }: { sessionId: string; position: string }) =>
        vueH("b", null, [position, ":", sessionId, ";"]),
      options: {},
    });
    const view = render(vueH(Fragment, null, [createVueSlotRenderer().renderRoot(h.host, {})]));
    expect(view.container.textContent).toBe("outer-before:a;inner:b;nested-emptyouter-after:a;");
    view.unmount();
    expect(outer.release).not.toHaveBeenCalled();
    expect(nested.release).not.toHaveBeenCalled();
  });
  it("delivers the Provider seat to entries declaring only optional Session children", () => {
    const h = makeHost(
      (renderSlot, Provider, reference) =>
        vueH(
          Provider,
          {
            session: reference,
          },
          {
            default: () => [renderSlot("k.session", {})],
          },
        ),
      { optional: true },
    );
    h.addSession("optional");
    h.current.set("optional");
    h.registerSession({
      component: ({ sessionId }: { sessionId?: string }) => vueH("b", null, [sessionId]),
      options: {},
    });
    expect(
      render(vueH(Fragment, null, [createVueSlotRenderer().renderRoot(h.host, {})])).container
        .textContent,
    ).toBe("optional");
  });
  it("fails loud when the Session adapter omits its area renderer", () => {
    const h = makeHost(() => null, { installRenderArea: false });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      render(vueH(Fragment, null, [createVueSlotRenderer().renderRoot(h.host, {})])),
    ).toThrow(/does not provide its area renderer/);
  });
});
