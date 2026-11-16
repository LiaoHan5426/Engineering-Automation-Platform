// @vitest-environment jsdom
import {
  defineComponent,
  computed,
  shallowRef,
  watch,
  h as vueH,
  Fragment,
  onMounted,
  type VNodeChild,
} from "vue";
import {} from "../src/client/vue-observable.ts";

import { fireEvent } from "@testing-library/dom";
import { flushVue as act } from "../../ui-primitives/tests/vue-render.ts";
import { describe, expect, it, vi } from "vitest";
import { SlotTestRuntime } from "@deepseek-ai/dsh-client-test-runtime";
import type { SessionReference } from "@deepseek-ai/dsh-api-session-controller/client";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
import type {
  ActionsDecl,
  FactoryComponentPropsOf,
  FactoryLocalComponentPropsOf,
  HostObservable,
  PropsRenderFactories,
  PropsRenderSlots,
  StoreHandle,
  StoreInstanceLike,
} from "@deepseek-ai/dsh-client-ui-slots";
import { StaleAuthorizationError } from "@deepseek-ai/dsh-client-ui-slots";
interface CounterState {
  count: number;
}
interface CounterActions extends ActionsDecl<CounterState> {
  increment(draft: CounterState): void;
}
type CounterStore = StoreHandle<CounterState, CounterActions>;
declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface SlotMap {
    "renderer.factory.child": {
      kind: "list";
      scope: "root";
    };
    "renderer.factory.chain": {
      kind: "chain";
      scope: "root";
      owner: {
        enabled: boolean;
      };
    };
    "renderer.factory.session-area": {
      kind: "single";
      scope: "session";
    };
  }
  interface LocaleNamespaceMap {
    "renderer-factory": "word";
  }
  interface SlotFactoryMap {
    "renderer.factory": {
      scope: "root";
      props: {
        label: string;
        crash?: boolean;
      };
      children: {
        "renderer.factory.child": {
          kind: "list";
          scope: "root";
        };
      };
      store: CounterStore;
      inject: {
        hooks: {
          suffix: HostObservable<string>;
        };
        tag: string;
      };
      locale: "renderer-factory";
      slots: {
        view: {
          scope: "root";
          props: {
            text: string;
          };
        };
      };
    };
    "renderer.recursive-factory": {
      scope: "root";
    };
    "renderer.session-store-factory": {
      scope: "session";
      store: CounterStore;
    };
    "renderer.scoped-local-factory": {
      scope: "root";
      slots: {
        view: {
          scope: "session";
        };
      };
    };
    "renderer.nested-factory": {
      scope: "root";
      slots: {
        view: {
          scope: "root";
        };
      };
    };
    "renderer.session-factory-root-local": {
      scope: "session";
      props: {
        report: (hasSessionId: boolean) => void;
      };
      slots: {
        view: {
          scope: "root";
          props: {
            report: (hasSessionId: boolean) => void;
          };
        };
      };
    };
    "renderer.session-error-factory": {
      scope: "session";
      props: {
        crashIn: string;
      };
    };
    "renderer.error-factory": {
      scope: "root";
    };
    "renderer.healthy-factory": {
      scope: "root";
    };
    "renderer.chain-factory": {
      scope: "root";
      children: {
        "renderer.factory.child": {
          kind: "list";
          scope: "root";
        };
        "renderer.factory.chain": {
          kind: "chain";
          scope: "root";
        };
      };
    };
  }
}
const SESSION_AREA = {
  "renderer.factory.session-area": { kind: "single", scope: "session" },
} as const;
const sid = (value: string): SessionId => value as SessionId;
function observable<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => value,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set: (next: T) => {
      value = next;
      for (const listener of [...listeners]) listener();
    },
  };
}
function counterHandle(clearPersisted = vi.fn()): CounterStore {
  return {
    spec: {
      init: () => ({ count: 0 }),
      actions: {
        increment: (draft) => {
          draft.count += 1;
        },
      },
    },
    create: () => {
      const source = observable<CounterState>({ count: 0 });
      return {
        ...source,
        actions: {
          increment: () => {
            source.set({ count: source.getSnapshot().count + 1 });
          },
        },
        clearPersisted,
      } as StoreInstanceLike as ReturnType<CounterStore["create"]>;
    },
  };
}
type FactoryProps = FactoryComponentPropsOf<"renderer.factory">;
type LocalProps = FactoryLocalComponentPropsOf<"renderer.factory", "view">;
type ChainFactoryProps = FactoryComponentPropsOf<"renderer.chain-factory">;
type NestedFactoryProps = FactoryComponentPropsOf<"renderer.nested-factory">;
type ScopedLocalProps = FactoryLocalComponentPropsOf<"renderer.scoped-local-factory", "view">;
let defaultMounts = 0;
let customMounts = 0;
const DefaultView = defineComponent(
  (props: LocalProps) => {
    const text = computed(() => props.text);
    const tag = computed(() => props.tag);
    const t = computed(() => props.t);
    const useSuffix = computed(() => props.useSuffix);
    onMounted(() =>
      watch(
        () => [],
        (_value, _previous, onCleanup) => {
          const cleanup = (() => {
            defaultMounts += 1;
          })();
          if (typeof cleanup === "function") onCleanup(cleanup);
        },
        { immediate: true, flush: "post" },
      ),
    );
    const hookValue1 = useSuffix.value((value) => value);
    return () =>
      vueH(
        "i",
        {
          "data-view": "default",
        },
        [text.value, ":", tag.value, ":", hookValue1.value, ":", t.value("word")],
      );
  },
  {
    props: ["text", "tag", "t", "useSuffix"],
    inheritAttrs: false,
  },
);
const CustomView = defineComponent(
  (props: LocalProps) => {
    const text = computed(() => props.text);
    const tag = computed(() => props.tag);
    const t = computed(() => props.t);
    const useSuffix = computed(() => props.useSuffix);
    onMounted(() =>
      watch(
        () => [],
        (_value, _previous, onCleanup) => {
          const cleanup = (() => {
            customMounts += 1;
          })();
          if (typeof cleanup === "function") onCleanup(cleanup);
        },
        { immediate: true, flush: "post" },
      ),
    );
    const hookValue1 = useSuffix.value((value) => value);
    return () =>
      vueH(
        "i",
        {
          "data-view": "custom",
        },
        [text.value, ":", tag.value, ":", hookValue1.value, ":", t.value("word")],
      );
  },
  {
    props: ["text", "tag", "t", "useSuffix"],
    inheritAttrs: false,
  },
);
function CrashingView(): never {
  throw new Error("selected view crashed");
}
function SessionCrashingView({ sessionId }: ScopedLocalProps) {
  if (sessionId === "broken") throw new Error("broken session view");
  return vueH("span", null, [sessionId]);
}
const NestedFactoryBody = defineComponent(
  (props: NestedFactoryProps) => {
    const useFactorySlot = computed(() => props.useFactorySlot);
    const View = useFactorySlot.value("view", () => null);
    return () => vueH(View, null);
  },
  {
    props: ["useFactorySlot"],
    inheritAttrs: false,
  },
);
function NestedFactoryView({ renderFactorySlot }: LocalProps) {
  return renderFactorySlot("renderer.nested-factory", {}, { slots: { view: CrashingView } });
}
const FactoryBody = defineComponent(
  (props: FactoryProps) => {
    const label = computed(() => props.label);
    const crash = computed(() => props.crash);
    const useStore = computed(() => props.useStore);
    const actions = computed(() => props.actions);
    const useFactorySlot = computed(() => props.useFactorySlot);
    const renderSlot = computed(() => props.renderSlot);
    if (crash.value === true) throw new Error(`crash:${label.value}`);
    const View = useFactorySlot.value("view", DefaultView);
    const hookValue1 = useStore.value((state) => state.count);
    return () =>
      vueH(
        "section",
        {
          "data-factory": label.value,
        },
        [
          vueH(
            "span",
            {
              "data-count": true,
            },
            [hookValue1.value],
          ),
          vueH(
            "button",
            {
              type: "button",
              onClick: actions.value.increment,
            },
            ["increment ", label.value],
          ),
          vueH(View, {
            text: label.value,
          }),
          renderSlot.value("renderer.factory.child", {}),
        ],
      );
  },
  {
    props: ["label", "crash", "useStore", "actions", "useFactorySlot", "renderSlot"],
    inheritAttrs: false,
  },
);
function installLocale(runtime: SlotTestRuntime) {
  const revision = observable({ revision: 0 });
  runtime.slots.installLocale({
    ...revision,
    bind: (namespace) => (key) => `${namespace}:${key}`,
  });
  return revision;
}
function registerFactory(
  runtime: SlotTestRuntime,
  storeFactory: () => CounterStore,
  component: typeof FactoryBody = FactoryBody,
): () => void {
  const suffix = observable("suffix");
  return runtime.slots.registerFactory(
    {
      name: "renderer.factory",
      scope: "root",
      children: { "renderer.factory.child": { kind: "list", scope: "root" } },
      store: storeFactory,
      inject: () => ({ hooks: { suffix }, tag: "injected" }),
      locale: "renderer-factory",
      slots: { view: { scope: "root" } },
    },
    component,
  );
}
describe("Factory rendering", () => {
  it("reports direct test-runtime lookups before rendering and without a definition", async () => {
    const runtime = await SlotTestRuntime.create();
    expect(() => runtime.factoryOf("renderer.factory")).toThrow("before renderRoot");
    await runtime.root.declare({}, () => null);
    runtime.renderRoot();
    expect(() => runtime.factoryOf("renderer.factory")).toThrow("no definition");
    await runtime.dispose();
  });
  it("assembles inject, locale, children, local selection, and exclusive stores per occurrence", async () => {
    defaultMounts = 0;
    customMounts = 0;
    const runtime = await SlotTestRuntime.create();
    installLocale(runtime);
    const handles: CounterStore[] = [];
    registerFactory(runtime, () => {
      const handle = counterHandle();
      handles.push(handle);
      return handle;
    });
    runtime.slots.register({ name: "renderer.factory.child", id: "child" }, () =>
      vueH("small", null, ["child"]),
    );
    await runtime.root.declare(
      {},
      defineComponent(
        (props: PropsRenderFactories) => {
          const renderFactorySlot = computed(() => props.renderFactorySlot);
          const revision = shallowRef(0);
          const setRevision = (
            next:
              | typeof revision.value
              | ((previous: typeof revision.value) => typeof revision.value),
          ) => {
            revision.value = typeof next === "function" ? next(revision.value) : next;
          };
          return () =>
            vueH(Fragment, null, [
              vueH(
                "button",
                {
                  type: "button",
                  onClick: () => {
                    setRevision((value) => value + 1);
                  },
                },
                ["rerender ", revision.value],
              ),
              renderFactorySlot.value(
                "renderer.factory",
                { label: "A" },
                { slots: { view: CustomView } },
              ),
              renderFactorySlot.value("renderer.factory", { label: "B" }),
            ]);
        },
        {
          props: ["renderFactorySlot"],
          inheritAttrs: false,
        },
      ),
    );
    const view = runtime.renderRoot();
    await act(() => {});
    expect(handles).toHaveLength(2);
    expect(
      view.getByText("A:injected:suffix:renderer-factory:word").getAttribute("data-view"),
    ).toBe("custom");
    expect(
      view.getByText("B:injected:suffix:renderer-factory:word").getAttribute("data-view"),
    ).toBe("default");
    expect(view.getAllByText("child")).toHaveLength(2);
    await fireEvent.click(view.getByRole("button", { name: "increment A" }));
    expect(view.container.querySelector('[data-factory="A"] [data-count]')?.textContent).toBe("1");
    expect(view.container.querySelector('[data-factory="B"] [data-count]')?.textContent).toBe("0");
    await fireEvent.click(view.getByRole("button", { name: /rerender/u }));
    expect(customMounts).toBe(1);
    expect(defaultMounts).toBe(1);
    await runtime.dispose();
  });
  it("keeps the occurrence Store across Fragment effect replay and renderer updates", async () => {
    const runtime = await SlotTestRuntime.create();
    const locale = installLocale(runtime);
    registerFactory(runtime, counterHandle);
    await runtime.root.declare({}, ({ renderFactorySlot }: PropsRenderFactories) =>
      vueH(Fragment, null, [renderFactorySlot("renderer.factory", { label: "strict" })]),
    );
    const view = runtime.renderRoot();
    await act(() => {});
    await fireEvent.click(view.getByRole("button", { name: "increment strict" }));
    expect(view.container.querySelector("[data-count]")?.textContent).toBe("1");
    await act(async () => {
      locale.set({ revision: 1 });
    });
    expect(view.container.querySelector("[data-count]")?.textContent).toBe("1");
    await runtime.dispose();
  });
  it("mints one exclusive handle per rendered Session incarnation", async () => {
    const runtime = await SlotTestRuntime.create();
    await runtime.sessions.add({ id: "s1" });
    const first = runtime.sessions.retainFor(runtime.ctx, sid("s1"));
    const handles: CounterStore[] = [];
    runtime.slots.registerFactory(
      {
        name: "renderer.session-store-factory",
        scope: "session",
        store: () => {
          const handle = counterHandle();
          handles.push(handle);
          return handle;
        },
      },
      defineComponent(
        (props: FactoryComponentPropsOf<"renderer.session-store-factory">) => {
          const count = props.useStore((state) => state.count);
          return () => vueH("span", null, [props.sessionId, ":", count.value]);
        },
        { props: ["useStore", "sessionId"], inheritAttrs: false },
      ),
    );
    let selectReference: ((reference: SessionReference) => void) | undefined;
    await runtime.root.declare(
      SESSION_AREA,
      defineComponent(
        (props: PropsRenderFactories & PropsRenderSlots<"renderer.factory.session-area">) => {
          const renderFactorySlot = computed(() => props.renderFactorySlot);
          const SessionProvider = computed(() => props.SessionProvider);
          const reference = shallowRef(first);
          const select = (
            next:
              | typeof reference.value
              | ((previous: typeof reference.value) => typeof reference.value),
          ) => {
            reference.value = typeof next === "function" ? next(reference.value) : next;
          };
          selectReference = select;
          return () =>
            vueH(
              SessionProvider.value,
              {
                session: reference.value,
              },
              {
                default: () => [renderFactorySlot.value("renderer.session-store-factory", {})],
              },
            );
        },
        {
          props: ["renderFactorySlot", "SessionProvider"],
          inheritAttrs: false,
        },
      ),
    );
    const view = runtime.renderRoot();
    await act(() => {});
    expect(view.container.textContent).toBe("s1:0");
    expect(handles).toHaveLength(1);
    await runtime.sessions.add({ id: "s2" });
    const second = runtime.sessions.retainFor(runtime.ctx, sid("s2"));
    await act(async () => {
      selectReference?.(second);
    });
    expect(view.container.textContent).toBe("s2:0");
    expect(handles).toHaveLength(2);
    await runtime.dispose();
  });
  it("binds a local Component to the scope at its render position", async () => {
    const runtime = await SlotTestRuntime.create();
    await runtime.sessions.add({ id: "nested" });
    const reference = runtime.sessions.retainFor(runtime.ctx, sid("nested"));
    runtime.slots.registerFactory(
      {
        name: "renderer.scoped-local-factory",
        scope: "root",
        slots: { view: { scope: "session" } },
      },
      defineComponent(
        (props: FactoryComponentPropsOf<"renderer.scoped-local-factory">) => {
          const useFactorySlot = computed(() => props.useFactorySlot);
          const View = useFactorySlot.value("view", (props: ScopedLocalProps) =>
            vueH("span", null, [props.sessionId]),
          );
          return () => vueH(View, null);
        },
        {
          props: ["useFactorySlot"],
          inheritAttrs: false,
        },
      ),
    );
    await runtime.root.declare(SESSION_AREA, ({ renderFactorySlot, SessionProvider }) =>
      vueH(
        SessionProvider,
        {
          session: reference,
        },
        {
          default: () => [renderFactorySlot("renderer.scoped-local-factory", {})],
        },
      ),
    );
    const view = runtime.renderRoot();
    await act(() => {});
    expect(view.container.textContent).toBe("nested");
    await runtime.dispose();
  });
  it("binds chain children with ordinary routing and stale-authority checks", async () => {
    const runtime = await SlotTestRuntime.create();
    let retainedRender: ChainFactoryProps["renderSlot"] | undefined;
    let retainedChain: ChainFactoryProps["renderSlotChain"] | undefined;
    const dispose = runtime.slots.registerFactory(
      {
        name: "renderer.chain-factory",
        scope: "root",
        children: {
          "renderer.factory.child": { kind: "list", scope: "root" },
          "renderer.factory.chain": { kind: "chain", scope: "root" },
        },
      },
      defineComponent(
        (nativeProps: FactoryComponentPropsOf<"renderer.chain-factory">) => () => {
          const { renderSlot, renderSlotChain } = nativeProps;
          retainedRender = renderSlot;
          retainedChain = renderSlotChain;
          return renderSlotChain(
            "renderer.factory.chain",
            { enabled: true },
            { fallback: vueH("i", null, ["none"]) },
          );
        },
        { props: ["renderSlot", "renderSlotChain"], inheritAttrs: false },
      ),
    );
    runtime.slots.register(
      {
        name: "renderer.factory.chain",
        select: (owner) => (owner.enabled ? "selected" : null),
      },
      defineComponent((props: { matched: string }) => () => vueH("span", null, [props.matched]), {
        props: ["matched"],
      }),
    );
    await runtime.root.declare({}, ({ renderFactorySlot }: PropsRenderFactories) =>
      vueH(Fragment, null, [renderFactorySlot("renderer.chain-factory", {})]),
    );
    const view = runtime.renderRoot();
    await act(() => {});
    expect(view.container.textContent).toBe("selected");
    if (retainedRender === undefined || retainedChain === undefined)
      throw new Error("Factory child bindings are missing");
    const render = retainedRender as (key: string, owner: object) => VNodeChild;
    const renderChain = retainedChain as (key: string, owner: object) => VNodeChild;
    expect(() => render("renderer.factory.chain", {})).toThrow(/use renderSlotChain/);
    expect(() => renderChain("renderer.factory.child", {})).toThrow(/not 'chain'/);
    dispose();
    expect(() => renderChain("renderer.factory.chain", { enabled: true })).toThrow(
      /disposed Factory/,
    );
    await runtime.dispose();
  });
  it("gives a local Component only its own scope standard props", async () => {
    const runtime = await SlotTestRuntime.create();
    await runtime.sessions.add({ id: "outer-session" });
    const first = runtime.sessions.retainFor(runtime.ctx, sid("outer-session"));
    const report = vi.fn();
    let mounts = 0;
    runtime.slots.registerFactory(
      {
        name: "renderer.session-factory-root-local",
        scope: "session",
        slots: { view: { scope: "root" } },
      },
      defineComponent(
        (props: FactoryComponentPropsOf<"renderer.session-factory-root-local">) => {
          const report = computed(() => props.report);
          const outerSessionId = computed(() => props.sessionId);
          const useFactorySlot = computed(() => props.useFactorySlot);
          const View = useFactorySlot.value("view", (props) => {
            props.report(Object.hasOwn(props, "sessionId"));
            return vueH("span", null, [outerSessionId.value]);
          });
          onMounted(() =>
            watch(
              () => [],
              (_value, _previous, onCleanup) => {
                const cleanup = (() => {
                  mounts += 1;
                })();
                if (typeof cleanup === "function") onCleanup(cleanup);
              },
              { immediate: true, flush: "post" },
            ),
          );
          return () =>
            vueH(View, {
              report: report.value,
            });
        },
        {
          props: ["report", "sessionId", "useFactorySlot"],
          inheritAttrs: false,
        },
      ),
    );
    let selectReference: ((reference: SessionReference) => void) | undefined;
    await runtime.root.declare(
      SESSION_AREA,
      defineComponent(
        (props: PropsRenderFactories & PropsRenderSlots<"renderer.factory.session-area">) => {
          const renderFactorySlot = computed(() => props.renderFactorySlot);
          const SessionProvider = computed(() => props.SessionProvider);
          const reference = shallowRef(first);
          const select = (
            next:
              | typeof reference.value
              | ((previous: typeof reference.value) => typeof reference.value),
          ) => {
            reference.value = typeof next === "function" ? next(reference.value) : next;
          };
          selectReference = select;
          return () =>
            vueH(
              SessionProvider.value,
              {
                session: reference.value,
              },
              {
                default: () => [
                  renderFactorySlot.value("renderer.session-factory-root-local", { report }),
                ],
              },
            );
        },
        {
          props: ["renderFactorySlot", "SessionProvider"],
          inheritAttrs: false,
        },
      ),
    );
    const view = runtime.renderRoot();
    await act(() => {});
    expect(view.container.textContent).toBe("outer-session");
    expect(report).toHaveBeenCalledWith(false);
    expect(mounts).toBe(1);
    await runtime.sessions.add({ id: "second-session" });
    const second = runtime.sessions.retainFor(runtime.ctx, sid("second-session"));
    await act(async () => {
      selectReference?.(second);
    });
    expect(view.container.textContent).toBe("second-session");
    expect(mounts).toBe(2);
    await runtime.dispose();
  });
  it("fails loud when a strict local Component has no current scope binding", async () => {
    const runtime = await SlotTestRuntime.create();
    runtime.slots.registerFactory(
      {
        name: "renderer.scoped-local-factory",
        scope: "root",
        slots: { view: { scope: "session" } },
      },
      defineComponent(
        (props) => {
          const useFactorySlot = computed(() => props.useFactorySlot);
          const View = useFactorySlot.value("view", () => null);
          return () => vueH(View, null);
        },
        {
          props: ["useFactorySlot"],
          inheritAttrs: false,
        },
      ),
    );
    await runtime.root.declare({}, ({ renderFactorySlot }: PropsRenderFactories) =>
      vueH(Fragment, null, [renderFactorySlot("renderer.scoped-local-factory", {})]),
    );
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => runtime.renderRoot()).toThrow(/strict session local slot 'view'/);
    spy.mockRestore();
    await runtime.dispose();
  });
  it("renders a fallback until a definition appears and restores it after disposal", async () => {
    const runtime = await SlotTestRuntime.create();
    installLocale(runtime);
    await runtime.root.declare({}, ({ renderFactorySlot }: PropsRenderFactories) =>
      vueH(Fragment, null, [
        renderFactorySlot(
          "renderer.factory",
          { label: "A" },
          { fallback: vueH("b", null, ["missing"]) },
        ),
      ]),
    );
    const view = runtime.renderRoot();
    await act(() => {});
    expect(view.container.textContent).toBe("missing");
    let dispose = () => {};
    await act(async () => {
      dispose = registerFactory(runtime, counterHandle);
    });
    expect(view.container.querySelector('[data-factory="A"]')).not.toBeNull();
    await act(async () => {
      dispose();
    });
    expect(view.container.textContent).toBe("missing");
    await act(async () => {
      registerFactory(
        runtime,
        counterHandle,
        defineComponent(
          (nativeProps: FactoryProps) => () => {
            const props = nativeProps;
            return vueH("strong", null, ["replacement:", props.label]);
          },
          { props: ["label", "renderSlot"], inheritAttrs: false },
        ),
      );
    });
    expect(view.container.textContent).toBe("replacement:A");
    await runtime.dispose();
  });
  it("contains a component crash to its occurrence", async () => {
    const runtime = await SlotTestRuntime.create();
    installLocale(runtime);
    registerFactory(runtime, counterHandle);
    const reported = vi.fn();
    runtime.slots.onEntryError(reported);
    await runtime.root.declare({}, ({ renderFactorySlot }: PropsRenderFactories) =>
      vueH(Fragment, null, [
        renderFactorySlot("renderer.factory", { label: "bad", crash: true }),
        renderFactorySlot("renderer.factory", { label: "good" }),
      ]),
    );
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const view = runtime.renderRoot();
    await act(() => {});
    const definition = runtime.factoryOf("renderer.factory");
    spy.mockRestore();
    expect(view.container.querySelector('[data-factory-error="renderer.factory"]')).not.toBeNull();
    expect(view.container.querySelector('[data-factory="good"]')).not.toBeNull();
    expect(reported).toHaveBeenCalledWith(
      "factory:renderer.factory",
      definition,
      expect.any(Error),
      { abdicated: false },
    );
    await runtime.dispose();
  });
  it("attributes a caller-selected local Component crash to its caller", async () => {
    const runtime = await SlotTestRuntime.create();
    installLocale(runtime);
    registerFactory(runtime, counterHandle);
    const reported = vi.fn();
    runtime.slots.onEntryError(reported);
    await runtime.root.declare({}, ({ renderFactorySlot }: PropsRenderFactories) =>
      vueH(Fragment, null, [
        renderFactorySlot(
          "renderer.factory",
          { label: "local" },
          { slots: { view: CrashingView } },
        ),
      ]),
    );
    const caller = runtime.slots.entries("root")[0];
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const view = runtime.renderRoot();
    await act(() => {});
    spy.mockRestore();
    expect(
      view.container.querySelector('[data-factory-error="renderer.factory:view"]'),
    ).not.toBeNull();
    expect(reported).toHaveBeenCalledWith("factory:renderer.factory", caller, expect.any(Error), {
      abdicated: false,
    });
    await runtime.dispose();
  });
  it("attributes a fallback local Component crash to its Factory definition and resets for its Session", async () => {
    const runtime = await SlotTestRuntime.create();
    await runtime.sessions.add({ id: "broken" });
    const broken = runtime.sessions.retainFor(runtime.ctx, sid("broken"));
    runtime.slots.registerFactory(
      {
        name: "renderer.scoped-local-factory",
        scope: "root",
        slots: { view: { scope: "session" } },
      },
      defineComponent(
        (props) => {
          const useFactorySlot = computed(() => props.useFactorySlot);
          const View = useFactorySlot.value("view", SessionCrashingView);
          return () => vueH(View, null);
        },
        {
          props: ["useFactorySlot"],
          inheritAttrs: false,
        },
      ),
    );
    const reported = vi.fn();
    runtime.slots.onEntryError(reported);
    let selectReference: ((reference: SessionReference) => void) | undefined;
    await runtime.root.declare(
      SESSION_AREA,
      defineComponent(
        (props: PropsRenderFactories & PropsRenderSlots<"renderer.factory.session-area">) => {
          const renderFactorySlot = computed(() => props.renderFactorySlot);
          const SessionProvider = computed(() => props.SessionProvider);
          const reference = shallowRef(broken);
          const select = (
            next:
              | typeof reference.value
              | ((previous: typeof reference.value) => typeof reference.value),
          ) => {
            reference.value = typeof next === "function" ? next(reference.value) : next;
          };
          selectReference = select;
          return () =>
            vueH(
              SessionProvider.value,
              {
                session: reference.value,
              },
              {
                default: () => [renderFactorySlot.value("renderer.scoped-local-factory", {})],
              },
            );
        },
        {
          props: ["renderFactorySlot", "SessionProvider"],
          inheritAttrs: false,
        },
      ),
    );
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const view = runtime.renderRoot();
    await act(() => {});
    const definition = runtime.factoryOf("renderer.scoped-local-factory");
    expect(
      view.container.querySelector('[data-factory-error="renderer.scoped-local-factory:view"]'),
    ).not.toBeNull();
    expect(reported).toHaveBeenCalledWith(
      "factory:renderer.scoped-local-factory",
      definition,
      expect.any(Error),
      { abdicated: false },
    );
    await runtime.sessions.add({ id: "healthy" });
    const healthy = runtime.sessions.retainFor(runtime.ctx, sid("healthy"));
    await act(async () => {
      selectReference?.(healthy);
    });
    expect(view.container.textContent).toBe("healthy");
    spy.mockRestore();
    await runtime.dispose();
  });
  it("preserves caller ownership when a selected local Component renders a nested Factory", async () => {
    const runtime = await SlotTestRuntime.create();
    installLocale(runtime);
    registerFactory(runtime, counterHandle);
    runtime.slots.registerFactory(
      {
        name: "renderer.nested-factory",
        scope: "root",
        slots: { view: { scope: "root" } },
      },
      NestedFactoryBody,
    );
    const reported = vi.fn();
    runtime.slots.onEntryError(reported);
    await runtime.root.declare({}, ({ renderFactorySlot }: PropsRenderFactories) =>
      vueH(Fragment, null, [
        renderFactorySlot(
          "renderer.factory",
          { label: "nested" },
          { slots: { view: NestedFactoryView } },
        ),
      ]),
    );
    const caller = runtime.slots.entries("root")[0];
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    runtime.renderRoot();
    spy.mockRestore();
    expect(reported).toHaveBeenCalledWith(
      "factory:renderer.nested-factory",
      caller,
      expect.any(Error),
      { abdicated: false },
    );
    await runtime.dispose();
  });
  it("reports stale authorization failures while their Factory definition remains live", async () => {
    const runtime = await SlotTestRuntime.create();
    installLocale(runtime);
    registerFactory(
      runtime,
      counterHandle,
      defineComponent(
        (_nativeProps: FactoryProps) => () => {
          throw new StaleAuthorizationError("definition unloaded during render");
        },
        { props: ["label", "renderSlot"], inheritAttrs: false },
      ),
    );
    const reported = vi.fn();
    runtime.slots.onEntryError(reported);
    await runtime.root.declare({}, ({ renderFactorySlot }: PropsRenderFactories) =>
      vueH(Fragment, null, [renderFactorySlot("renderer.factory", { label: "stale" })]),
    );
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const view = runtime.renderRoot();
    await act(() => {});
    spy.mockRestore();
    expect(view.container.querySelector('[data-factory-error="renderer.factory"]')).not.toBeNull();
    expect(reported).toHaveBeenCalledWith(
      "factory:renderer.factory",
      runtime.factoryOf("renderer.factory"),
      expect.any(StaleAuthorizationError),
      { abdicated: false },
    );
    await runtime.dispose();
  });
  it("retries a failed session Factory after the Session incarnation changes", async () => {
    const runtime = await SlotTestRuntime.create();
    await runtime.sessions.add({ id: "broken" });
    const broken = runtime.sessions.retainFor(runtime.ctx, sid("broken"));
    runtime.slots.registerFactory(
      {
        name: "renderer.session-error-factory",
        scope: "session",
      },
      defineComponent(
        (nativeProps: FactoryComponentPropsOf<"renderer.session-error-factory">) => () => {
          const { crashIn, sessionId } = nativeProps;
          if (sessionId === crashIn) throw new Error(`crash:${sessionId}`);
          return vueH("span", null, [sessionId]);
        },
        { props: ["crashIn", "sessionId"], inheritAttrs: false },
      ),
    );
    let selectReference: ((reference: SessionReference) => void) | undefined;
    await runtime.root.declare(
      SESSION_AREA,
      defineComponent(
        (props: PropsRenderFactories & PropsRenderSlots<"renderer.factory.session-area">) => {
          const renderFactorySlot = computed(() => props.renderFactorySlot);
          const SessionProvider = computed(() => props.SessionProvider);
          const reference = shallowRef(broken);
          const select = (
            next:
              | typeof reference.value
              | ((previous: typeof reference.value) => typeof reference.value),
          ) => {
            reference.value = typeof next === "function" ? next(reference.value) : next;
          };
          selectReference = select;
          return () =>
            vueH(
              SessionProvider.value,
              {
                session: reference.value,
              },
              {
                default: () => [
                  renderFactorySlot.value("renderer.session-error-factory", { crashIn: "broken" }),
                ],
              },
            );
        },
        {
          props: ["renderFactorySlot", "SessionProvider"],
          inheritAttrs: false,
        },
      ),
    );
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const view = runtime.renderRoot();
    await act(() => {});
    expect(
      view.container.querySelector('[data-factory-error="renderer.session-error-factory"]'),
    ).not.toBeNull();
    await runtime.sessions.add({ id: "healthy" });
    const healthy = runtime.sessions.retainFor(runtime.ctx, sid("healthy"));
    await act(async () => {
      selectReference?.(healthy);
    });
    expect(view.container.textContent).toBe("healthy");
    spy.mockRestore();
    await runtime.dispose();
  });
  it("resets a failed boundary when the render position selects another Factory", async () => {
    const runtime = await SlotTestRuntime.create();
    runtime.slots.registerFactory(
      { name: "renderer.error-factory", scope: "root" },
      defineComponent(
        (_nativeProps: FactoryComponentPropsOf<"renderer.error-factory">) => () => {
          throw new Error("broken factory");
        },
        { props: [], inheritAttrs: false },
      ),
    );
    runtime.slots.registerFactory(
      { name: "renderer.healthy-factory", scope: "root" },
      defineComponent(
        (_nativeProps: FactoryComponentPropsOf<"renderer.healthy-factory">) => () => {
          return vueH("span", null, ["healthy factory"]);
        },
        { props: [], inheritAttrs: false },
      ),
    );
    await runtime.root.declare(
      {},
      defineComponent(
        (props: PropsRenderFactories) => {
          const renderFactorySlot = computed(() => props.renderFactorySlot);
          const name = shallowRef<"renderer.error-factory" | "renderer.healthy-factory">(
            "renderer.error-factory",
          );
          const setName = (
            next:
              | ("renderer.error-factory" | "renderer.healthy-factory")
              | ((
                  previous: "renderer.error-factory" | "renderer.healthy-factory",
                ) => "renderer.error-factory" | "renderer.healthy-factory"),
          ) => {
            name.value = typeof next === "function" ? next(name.value) : next;
          };
          return () =>
            vueH(Fragment, null, [
              vueH(
                "button",
                {
                  type: "button",
                  onClick: () => {
                    setName("renderer.healthy-factory");
                  },
                },
                ["switch factory"],
              ),
              renderFactorySlot.value(name.value, {}),
            ]);
        },
        {
          props: ["renderFactorySlot"],
          inheritAttrs: false,
        },
      ),
    );
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const view = runtime.renderRoot();
    await act(() => {});
    expect(
      view.container.querySelector('[data-factory-error="renderer.error-factory"]'),
    ).not.toBeNull();
    await fireEvent.click(view.getByRole("button", { name: "switch factory" }));
    expect(view.container.textContent).toContain("healthy factory");
    spy.mockRestore();
    await runtime.dispose();
  });
  it("rejects undeclared local slots, recursive rendering, duplicate props, and stale child authority", async () => {
    const unknownRuntime = await SlotTestRuntime.create();
    installLocale(unknownRuntime);
    registerFactory(unknownRuntime, counterHandle);
    await unknownRuntime.root.declare({}, ({ renderFactorySlot }: PropsRenderFactories) =>
      vueH(Fragment, null, [
        renderFactorySlot(
          "renderer.factory",
          { label: "A" },
          {
            slots: { unknown: DefaultView } as never,
          },
        ),
      ]),
    );
    const spy = vi.fn();
    const stopSpy = unknownRuntime.slots.onEntryError(spy);
    const unknownView = unknownRuntime.renderRoot();
    await act(() => {});
    expect(unknownView.container.querySelector('[data-slot-error="root"]')).not.toBeNull();
    expect(
      spy.mock.calls
        .flat()
        .some((value) => String(value).includes("local slot 'unknown' is not declared")),
    ).toBe(true);
    stopSpy();
    await unknownRuntime.dispose();
    const recursiveRuntime = await SlotTestRuntime.create();
    recursiveRuntime.slots.registerFactory(
      {
        name: "renderer.recursive-factory",
        scope: "root",
      },
      defineComponent(
        (nativeProps: FactoryComponentPropsOf<"renderer.recursive-factory">) => () => {
          const { renderFactorySlot } = nativeProps;
          return vueH(Fragment, null, [renderFactorySlot("renderer.recursive-factory", {})]);
        },
        { props: ["renderFactorySlot"], inheritAttrs: false },
      ),
    );
    await recursiveRuntime.root.declare({}, ({ renderFactorySlot }: PropsRenderFactories) =>
      vueH(Fragment, null, [renderFactorySlot("renderer.recursive-factory", {})]),
    );
    const recursiveSpy = vi.fn();
    const stopRecursiveSpy = recursiveRuntime.slots.onEntryError(recursiveSpy);
    const recursiveView = recursiveRuntime.renderRoot();
    await act(() => {});
    expect(
      recursiveView.container.querySelector('[data-factory-error="renderer.recursive-factory"]'),
    ).not.toBeNull();
    expect(
      recursiveSpy.mock.calls
        .flat()
        .some((value) => String(value).includes("recursive render of factory")),
    ).toBe(true);
    stopRecursiveSpy();
    await recursiveRuntime.dispose();
    const staleRuntime = await SlotTestRuntime.create();
    installLocale(staleRuntime);
    let retainedRender: FactoryProps["renderSlot"] | undefined;
    const dispose = registerFactory(
      staleRuntime,
      counterHandle,
      defineComponent(
        (nativeProps: FactoryProps) => () => {
          const props = nativeProps;
          retainedRender = props.renderSlot;
          return null;
        },
        { props: ["label", "renderSlot"], inheritAttrs: false },
      ),
    );
    await staleRuntime.root.declare({}, ({ renderFactorySlot }: PropsRenderFactories) =>
      vueH(Fragment, null, [renderFactorySlot("renderer.factory", { label: "A" })]),
    );
    staleRuntime.renderRoot();
    dispose();
    expect(() => retainedRender?.("renderer.factory.child", {})).toThrow(/disposed Factory/);
    await staleRuntime.dispose();
    const collisionRuntime = await SlotTestRuntime.create();
    installLocale(collisionRuntime);
    registerFactory(collisionRuntime, counterHandle);
    await collisionRuntime.root.declare({}, ({ renderFactorySlot }: PropsRenderFactories) =>
      vueH(Fragment, null, [
        renderFactorySlot("renderer.factory", { label: "A", actions: "caller" } as never),
      ]),
    );
    const collisionSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => collisionRuntime.renderRoot()).toThrow(/duplicate prop 'actions'/);
    collisionSpy.mockRestore();
    await collisionRuntime.dispose();
  });
});
