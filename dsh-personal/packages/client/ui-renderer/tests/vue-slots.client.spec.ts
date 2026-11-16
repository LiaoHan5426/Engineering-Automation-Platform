// @vitest-environment jsdom
import { Context } from "@deepseek-ai/cordis";
import { createApp, h, nextTick, onScopeDispose, shallowRef, type VNodeChild } from "vue";
import { afterEach, describe, expect, it } from "vitest";
import type {
  StandardSourceBinding,
  ScopedStandardSourceBinding,
  SessionProviderComponent,
  HostObservable,
} from "@deepseek-ai/dsh-client-ui-slots";
import { defineStore } from "@deepseek-ai/dsh-client-store";
import { SlotRegistry } from "../src/client/registry.ts";
import { createVueSlotRenderer } from "../src/client/vue/slots.ts";
import { defineSlotComponent } from "../src/client/vue/components.ts";

function scopedBinding(binding: ScopedStandardSourceBinding): ScopedStandardSourceBinding {
  return binding;
}

type Face = Record<string, unknown>;
interface Ledger {
  register(options: object, component: unknown): () => void;
  registerFactory(options: object, component: unknown): () => void;
}
function source<T>(initial: T) {
  let current = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set: (value: T) => {
      current = value;
      for (const listener of listeners) listener();
    },
  };
}
const resources: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const release of resources.splice(0).reverse()) await release();
});
async function bench(resolve?: (target: unknown) => HostObservable<StandardSourceBinding>) {
  const ctx = new Context();
  await ctx.plugin(SlotRegistry);
  const slots = ctx.slots;
  const absent: StandardSourceBinding = { key: undefined, hooks: {}, keyedHooks: {}, props: {} };
  const current = source(absent);
  slots.installScope("session", {
    current,
    bindingSource: resolve ?? (() => current),
    renderArea: (binding, props) =>
      binding.key === undefined ? (props.empty?.() ?? null) : props.children,
  });
  slots.install(createVueSlotRenderer());
  const container = document.createElement("main");
  document.body.append(container);
  let app: ReturnType<typeof createApp> | undefined;
  resources.push(async () => {
    app?.unmount();
    container.remove();
    await ctx.fiber.dispose();
  });
  return {
    ctx,
    slots: slots as Ledger,
    current,
    container,
    mount: async (onError?: (error: unknown) => void) => {
      app = createApp({ render: () => slots.renderSlot("root", {}) });
      if (onError !== undefined) app.config.errorHandler = onError;
      app.mount(container);
      await settle();
    },
  };
}
async function settle() {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
  await nextTick();
}
const text = defineSlotComponent<{ text: string }>(["text"], (props) => () => h("b", props.text));
const host = defineSlotComponent<Face>(["renderSlot"], (props) => () => {
  const render = props["renderSlot"] as (
    name: string,
    input: object,
    options?: object,
  ) => VNodeChild;
  return [
    render("native.single", { text: "single" }),
    render("native.list", {}),
    render("native.keyed", { text: "keyed" }, { entryKey: "picked" }),
  ];
});

describe("native Vue slot execution", () => {
  it("uses core single/list/keyed election and removes disposed contributions", async () => {
    const b = await bench();
    b.slots.register(
      {
        name: "root",
        children: {
          "native.single": { kind: "single", scope: "root" },
          "native.list": { kind: "list", scope: "root" },
          "native.keyed": { kind: "keyed", scope: "root" },
        },
      },
      host,
    );
    b.slots.register({ name: "native.single" }, text);
    const a = b.slots.register(
      { name: "native.list", id: "a", inject: () => ({ text: "A" }) },
      text,
    );
    b.slots.register({ name: "native.list", id: "b", inject: () => ({ text: "B" }) }, text);
    b.slots.register({ name: "native.keyed", key: "picked" }, text);
    b.slots.register(
      { name: "native.keyed", key: "other", inject: () => ({ text: "wrong" }) },
      text,
    );
    await b.mount();
    expect(b.container.textContent).toBe("singleABkeyed");
    a();
    await settle();
    expect(b.container.textContent).toBe("singleBkeyed");
    expect(b.container.querySelector('[data-slot="native.list"]')).not.toBeNull();
  });

  it("refreshes source rosters without remounting or changing cached hook functions", async () => {
    const b = await bench();
    let setups = 0;
    let exposed: Face = {};
    const first = source("first");
    let release = b.ctx.slots.provideRoot({ hooks: { value: first } });
    const Root = defineSlotComponent<Face>(["useValue", "useResource"], (props) => {
      setups += 1;
      exposed = props;
      const read = props["useValue"] as (
        select: (value: string) => string,
      ) => Readonly<{ value: string | undefined }>;
      const selected = read((value) => value);
      return () => h("b", `${selected.value ?? "absent"}:${typeof props["useResource"]}`);
    });
    b.slots.register({ name: "root" }, Root);
    await b.mount();
    const fixed = exposed["useValue"];
    expect(b.container.textContent).toBe("first:undefined");
    expect(() => release()).not.toThrow();
    await settle();
    expect(b.container.textContent).toBe("absent:undefined");
    expect(exposed["useValue"]).toBeUndefined();
    release = b.ctx.slots.provideRoot({
      hooks: { value: source("second") },
      keyedHooks: { resource: () => first },
    });
    await settle();
    const keyed = exposed["useResource"];
    expect(b.container.textContent).toBe("second:function");
    expect(exposed["useValue"]).toBe(fixed);
    expect(typeof keyed).toBe("function");
    release();
    await settle();
    b.ctx.slots.provideRoot({ hooks: { value: first }, keyedHooks: { resource: () => first } });
    await settle();
    expect(exposed["useResource"]).toBe(keyed);
    expect(exposed["useValue"]).toBe(fixed);
    expect(setups).toBe(1);
  });

  it("rejects a declared strict standard hook whose source is absent", async () => {
    const missing = source<StandardSourceBinding>({
      key: "strict",
      hooks: { value: undefined },
      keyedHooks: {},
      props: {},
    });
    const b = await bench(() => missing);
    b.current.set(missing.getSnapshot());
    const Strict = defineSlotComponent<Face>(["useValue"], (props) => {
      (props["useValue"] as () => unknown)();
      return () => null;
    });
    const Root = defineSlotComponent<{
      SessionProvider: SessionProviderComponent;
      renderSlot: (name: string, input: object) => VNodeChild;
    }>(
      ["SessionProvider", "renderSlot"],
      (props) => () =>
        h(props.SessionProvider, {}, { default: () => props.renderSlot("native.strict", {}) }),
    );
    b.slots.register(
      { name: "root", children: { "native.strict": { kind: "single", scope: "session" } } },
      Root,
    );
    b.slots.register({ name: "native.strict" }, Strict);
    const errors: unknown[] = [];
    await b.mount((error) => {
      errors.push(error);
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ message: "strict standard hook 'value' has no source" });
  });

  it("adopts an optional session then remounts on context-generation replacement", async () => {
    const b = await bench();
    const reads: string[] = [];
    let setups = 0;
    let releases = 0;
    const scoped = defineSlotComponent<Face>(["useValue"], (props) => {
      setups += 1;
      onScopeDispose(() => {
        releases += 1;
      });
      const useValue = props["useValue"] as (
        select: (value: string) => string,
      ) => Readonly<{ value: string | undefined }>;
      const value = useValue((v) => v);
      return () => {
        reads.push(value.value ?? "none");
        return h("b", value.value ?? "none");
      };
    });
    const Root = defineSlotComponent<Face>(
      ["renderSlot"],
      (props) => () =>
        (props["renderSlot"] as (name: string, input: object) => VNodeChild)("native.optional", {}),
    );
    // The absent descriptor retains the declared hook name for first adoption.
    b.current.set({ key: undefined, hooks: { value: undefined }, keyedHooks: {}, props: {} });
    b.slots.register(
      { name: "root", children: { "native.optional": { kind: "single", scope: "session-maybe" } } },
      Root,
    );
    b.slots.register({ name: "native.optional" }, scoped);
    await b.mount();
    expect(b.container.textContent).toBe("none");
    const a = source("A");
    const actx = new Context();
    resources.push(() => actx.fiber.dispose());
    b.current.set(
      scopedBinding({ key: "same", ctx: actx, hooks: { value: a }, keyedHooks: {}, props: {} }),
    );
    await settle();
    expect(b.container.textContent).toBe("A");
    expect(setups).toBe(1);
    const bctx = new Context();
    resources.push(() => bctx.fiber.dispose());
    b.current.set(
      scopedBinding({
        key: "same",
        ctx: bctx,
        hooks: { value: source("B") },
        keyedHooks: {},
        props: {},
      }),
    );
    await settle();
    expect(b.container.textContent).toBe("B");
    expect(setups).toBe(2);
    expect(releases).toBe(1);
    a.set("STALE");
    await settle();
    expect(b.container.textContent).toBe("B");
    expect(reads).not.toContain("STALE");
  });

  it("keeps simultaneous provider sessions isolated through updates and explicit absence", async () => {
    const actx = new Context();
    const bctx = new Context();
    resources.push(
      () => actx.fiber.dispose(),
      () => bctx.fiber.dispose(),
    );
    const a = source("A");
    const b = source("B");
    const first = source<StandardSourceBinding>(
      scopedBinding({
        key: "a",
        ctx: actx,
        hooks: { value: a },
        keyedHooks: {},
        props: {},
      }),
    );
    const second = source<StandardSourceBinding>(
      scopedBinding({
        key: "b",
        ctx: bctx,
        hooks: { value: b },
        keyedHooks: {},
        props: {},
      }),
    );
    const absent = source<StandardSourceBinding>({
      key: undefined,
      hooks: { value: undefined },
      keyedHooks: {},
      props: {},
    });
    const fixture = await bench((target) =>
      target === "a" ? first : target === "b" ? second : absent,
    );
    const target = shallowRef<string | undefined>("a");
    const Root = defineSlotComponent<Face>(["renderSlot", "SessionProvider"], (props) => () => {
      const render = props["renderSlot"] as (name: string, input: object) => VNodeChild;
      const Provider = props["SessionProvider"] as import("vue").Component;
      return [
        h(Provider, {
          session: target.value,
          children: render("native.panel", {}),
          empty: () => h("em", "empty"),
        }),
        h(Provider, { session: "b" }, { default: () => render("native.panel", {}) }),
      ];
    });
    const Panel = defineSlotComponent<Face>(["useValue"], (props) => {
      const read = props["useValue"] as (
        select: (value: string) => string,
      ) => Readonly<{ value: string | undefined }>;
      const value = read((v) => v);
      return () => h("b", value.value);
    });
    fixture.slots.register(
      { name: "root", children: { "native.panel": { kind: "single", scope: "session" } } },
      Root,
    );
    fixture.slots.register({ name: "native.panel" }, Panel);
    await fixture.mount();
    expect(fixture.container.textContent).toBe("AB");
    a.set("AA");
    await settle();
    expect(fixture.container.textContent).toBe("AAB");
    target.value = undefined;
    await settle();
    expect(fixture.container.textContent).toBe("emptyB");
    a.set("STALE");
    b.set("BB");
    await settle();
    expect(fixture.container.textContent).toBe("emptyBB");
    target.value = "a";
    await settle();
    expect(fixture.container.textContent).toBe("STALEBB");
  });

  it("shares declared viewing stores within one session and isolates replacement generations", async () => {
    const actx = new Context();
    const bctx = new Context();
    const nextctx = new Context();
    resources.push(
      () => actx.fiber.dispose(),
      () => bctx.fiber.dispose(),
      () => nextctx.fiber.dispose(),
    );
    const first = source<StandardSourceBinding>(
      scopedBinding({
        key: "a",
        ctx: actx,
        hooks: {},
        keyedHooks: {},
        props: {},
      }),
    );
    const second = source<StandardSourceBinding>(
      scopedBinding({
        key: "b",
        ctx: bctx,
        hooks: {},
        keyedHooks: {},
        props: {},
      }),
    );
    const fixture = await bench((target) => (target === "a" ? first : second));
    let injectCalls = 0;
    const handle = defineStore({
      init: () => ({ count: 0 }),
      actions: {
        increment: (draft) => {
          draft.count += 1;
        },
      },
    });
    const Panel = defineSlotComponent<Face>(["useStore", "actions"], (props) => {
      const count = (
        props["useStore"] as (
          select: (state: { count: number }) => number,
        ) => Readonly<{ value: number }>
      )((state) => state.count);
      return () =>
        h(
          "button",
          { onClick: () => (props["actions"] as { increment: () => void }).increment() },
          String(count.value),
        );
    });
    const Root = defineSlotComponent<Face>(["SessionProvider", "renderSlot"], (props) => () => {
      const Provider = props["SessionProvider"] as import("vue").Component;
      const render = props["renderSlot"] as (name: string, input: object) => VNodeChild;
      return [
        { key: "primary", session: "a" },
        { key: "secondary", session: "a" },
        { key: "other-session", session: "b" },
      ].map((target) => h(Provider, { ...target, children: render("native.store", {}) }));
    });
    fixture.slots.register(
      { name: "root", children: { "native.store": { kind: "single", scope: "session" } } },
      Root,
    );
    fixture.slots.register(
      {
        name: "native.store",
        store: handle,
        inject: () => {
          injectCalls += 1;
          return {};
        },
      },
      Panel,
    );
    await fixture.mount();
    expect(injectCalls).toBe(2);
    fixture.container.querySelector("button")?.click();
    await settle();
    expect(fixture.container.textContent).toBe("110");
    first.set(scopedBinding({ key: "a", ctx: nextctx, hooks: {}, keyedHooks: {}, props: {} }));
    await settle();
    expect(fixture.container.textContent).toBe("000");
    expect(injectCalls).toBe(3);
    await actx.fiber.dispose();
    fixture.container.querySelector("button")?.click();
    await settle();
    expect(fixture.container.textContent).toBe("110");
  });

  it("binds keyed resource seats, locale, and changing contextual slot hooks natively", async () => {
    const fixture = await bench();
    const one = source("one");
    const two = source("two");
    const selected = shallowRef("one");
    const context = shallowRef("x");
    const revision = source({ revision: 0 });
    let language = "en";
    fixture.ctx.slots.installLocale({
      ...revision,
      bind: (namespace) => (key) => `${language}:${namespace}:${key}`,
    });
    fixture.ctx.slots.provideRoot({
      hooks: { value: one },
      keyedHooks: { resource: (key) => (key === "one" ? one : two) },
    });
    const Panel = defineSlotComponent<Face>(
      ["useResource", "useContextual", "useInjected", "t"],
      (props) => {
        const resource = (
          props["useResource"] as (key: typeof selected) => Readonly<{ value: string }>
        )(selected);
        const contextual = (props["useContextual"] as () => Readonly<{ value: string }>)();
        const injected = (
          props["useInjected"] as (select: (value: string) => string) => Readonly<{ value: string }>
        )((value) => value);
        return () =>
          h(
            "b",
            `${resource.value}/${contextual.value}/${injected.value}/${(props["t"] as (key: string) => string)("hello")}`,
          );
      },
    );
    const Root = defineSlotComponent<Face>(
      ["renderSlot"],
      (props) => () =>
        (props["renderSlot"] as (name: string, input: object, options: object) => VNodeChild)(
          "native.context",
          {},
          { hookContext: context.value },
        ),
    );
    fixture.slots.register(
      {
        name: "root",
        children: {
          "native.context": {
            kind: "single",
            scope: "root",
            inject: {
              hooks: {
                contextual: (standard: Face, prefix: string) => () =>
                  (standard["useValue"] as (select: (value: string) => string) => unknown)(
                    (value) => `${prefix}:${value}`,
                  ),
              },
            },
          },
        },
      },
      Root,
    );
    fixture.slots.register(
      { name: "native.context", locale: "native", inject: () => ({ hooks: { injected: two } }) },
      Panel,
    );
    await fixture.mount();
    expect(fixture.container.textContent).toBe("one/x:one/two/en:native:hello");
    selected.value = "two";
    context.value = "y";
    language = "fr";
    revision.set({ revision: 1 });
    await settle();
    expect(fixture.container.textContent).toBe("two/y:one/two/fr:native:hello");
    one.set("ONE");
    two.set("TWO");
    await settle();
    expect(fixture.container.textContent).toBe("TWO/y:ONE/TWO/fr:native:hello");
  });

  it("elects chains without mounting decliners and preserves an overlay fallback instance", async () => {
    const fixture = await bench();
    const elect = shallowRef(false);
    let fallbackSetups = 0;
    let declinesMounted = 0;
    const Fallback = defineSlotComponent<object>([], () => {
      fallbackSetups += 1;
      return () => h("i", "fallback");
    });
    const Decline = defineSlotComponent<object>([], () => {
      declinesMounted += 1;
      return () => h("b", "decline");
    });
    const Winner = defineSlotComponent<{ matched: string }>(
      ["matched"],
      (props) => () => h("b", props.matched),
    );
    const Root = defineSlotComponent<Face>(
      ["renderSlotChain"],
      (props) => () =>
        (props["renderSlotChain"] as (name: string, input: object, options: object) => VNodeChild)(
          "native.chain",
          { elect: elect.value },
          { overlay: true, fallback: h(Fallback) },
        ),
    );
    fixture.slots.register(
      {
        name: "root",
        children: { "native.chain": { kind: "chain", scope: "root", inline: true } },
      },
      Root,
    );
    fixture.slots.register({ name: "native.chain", select: () => null }, Decline);
    fixture.slots.register(
      {
        name: "native.chain",
        select: (owner: { elect: boolean }) => (owner.elect ? "matched" : null),
      },
      Winner,
    );
    await fixture.mount();
    expect(fallbackSetups).toBe(1);
    expect(declinesMounted).toBe(0);
    elect.value = true;
    await settle();
    expect(
      fixture.container.querySelector("[data-chain-overlay-fallback]")?.getAttribute("style"),
    ).toContain("none");
    expect(fixture.container.textContent).toBe("fallbackmatched");
    expect(fallbackSetups).toBe(1);
    elect.value = false;
    await settle();
    expect(fallbackSetups).toBe(1);
    expect(
      fixture.container.querySelector("[data-chain-overlay-fallback]")?.getAttribute("style"),
    ).toContain("contents");
  });

  it("keeps exhausted single and list cells as failures and recovers on replacement registration", async () => {
    const fixture = await bench();
    const Root = defineSlotComponent<Face>(["renderSlot"], (props) => () => {
      const render = props["renderSlot"] as (
        name: string,
        input: object,
        options: object,
      ) => VNodeChild;
      return [
        render("native.crash", {}, { fallback: "natural" }),
        render("native.dry", {}, { fallback: "empty" }),
      ];
    });
    const Broken = defineSlotComponent<object>([], () => () => {
      throw new Error("native broken");
    });
    fixture.slots.register(
      {
        name: "root",
        children: {
          "native.crash": { kind: "single", scope: "root" },
          "native.dry": { kind: "list", scope: "root" },
        },
      },
      Root,
    );
    fixture.slots.register({ name: "native.crash" }, Broken);
    fixture.slots.register({ name: "native.dry", id: "row" }, Broken);
    await fixture.mount();
    expect(fixture.container.querySelectorAll("[data-slot-error]")).toHaveLength(2);
    expect(fixture.container.textContent).toBe("");
    fixture.slots.register(
      { name: "native.crash", priority: -1, inject: () => ({ text: "recovered" }) },
      text,
    );
    fixture.slots.register(
      { name: "native.dry", id: "row", priority: -1, inject: () => ({ text: "row recovered" }) },
      text,
    );
    await settle();
    expect(fixture.container.textContent).toBe("recoveredrow recovered");
    expect(fixture.container.querySelectorAll("[data-slot-error]")).toHaveLength(0);
  });

  it("composes exact HOC layers without remounting content on unrelated keys", async () => {
    const fixture = await bench();
    let contentSetups = 0;
    const Content = defineSlotComponent<object>([], () => {
      contentSetups += 1;
      return () => h("strong", "content");
    });
    const Wrapper = defineSlotComponent<{ children: VNodeChild; label: string }>(
      ["children", "label"],
      (props) => () => h("section", { "data-layer": props.label }, [props.children]),
    );
    const Root = defineSlotComponent<Face>(
      ["renderSlot"],
      (props) => () =>
        (props["renderSlot"] as (name: string, input: object, options: object) => VNodeChild)(
          "native.hoc",
          {},
          { entryKey: "chosen", children: h(Content) },
        ),
    );
    fixture.slots.register(
      { name: "root", children: { "native.hoc": { kind: "hoc", scope: "root" } } },
      Root,
    );
    fixture.slots.register(
      { name: "native.hoc", id: "wrap", inject: () => ({ label: "wild" }) },
      Wrapper,
    );
    fixture.slots.register(
      { name: "native.hoc", id: "wrap", key: "chosen", inject: () => ({ label: "exact" }) },
      Wrapper,
    );
    await fixture.mount();
    expect(fixture.container.querySelector("section")?.getAttribute("data-layer")).toBe("exact");
    expect(contentSetups).toBe(1);
    fixture.slots.register(
      { name: "native.hoc", id: "other", key: "unrelated", inject: () => ({ label: "other" }) },
      Wrapper,
    );
    await settle();
    expect(fixture.container.querySelectorAll("section")).toHaveLength(1);
    expect(contentSetups).toBe(1);
  });

  it("attributes HOC content errors to the enclosing owner and layer errors to their layer", async () => {
    const contentCase = await bench();
    const reports: string[] = [];
    contentCase.ctx.slots.onEntryError((key) => {
      reports.push(key);
    });
    const Broken = defineSlotComponent<object>([], () => () => {
      throw new Error("content failed");
    });
    const Wrapper = defineSlotComponent<{ children: VNodeChild }>(
      ["children"],
      (props) => () => h("section", [props.children]),
    );
    const Root = defineSlotComponent<Face>(
      ["renderSlot"],
      (props) => () =>
        (props["renderSlot"] as (name: string, input: object, options: object) => VNodeChild)(
          "native.errorhoc",
          {},
          { children: h(Broken) },
        ),
    );
    contentCase.slots.register(
      { name: "root", children: { "native.errorhoc": { kind: "hoc", scope: "root" } } },
      Root,
    );
    contentCase.slots.register({ name: "native.errorhoc", id: "wrapper" }, Wrapper);
    await contentCase.mount();
    expect(reports).toEqual(["root"]);

    const layerCase = await bench();
    const layers: string[] = [];
    layerCase.ctx.slots.onEntryError((key) => {
      layers.push(key);
    });
    const Parent = defineSlotComponent<Face>(
      ["renderSlot"],
      (props) => () =>
        (props["renderSlot"] as (name: string, input: object, options: object) => VNodeChild)(
          "native.layerfailure",
          {},
          { children: h("strong", "survives") },
        ),
    );
    layerCase.slots.register(
      { name: "root", children: { "native.layerfailure": { kind: "hoc", scope: "root" } } },
      Parent,
    );
    layerCase.slots.register({ name: "native.layerfailure", id: "broken" }, Broken);
    await layerCase.mount();
    expect(layers).toEqual(["native.layerfailure"]);
    expect(layerCase.container.textContent).toBe("survives");
  });

  it("contains recursive factory errors and recovers after a definition replacement", async () => {
    const fixture = await bench();
    const reports: string[] = [];
    fixture.ctx.slots.onEntryError((key) => {
      reports.push(key);
    });
    const Recursive = defineSlotComponent<Face>(
      ["renderFactorySlot"],
      (props) => () =>
        (props["renderFactorySlot"] as (name: string, input: object) => VNodeChild)(
          "native.recursive",
          {},
        ),
    );
    const Root = defineSlotComponent<Face>(["renderFactorySlot"], (props) => () => [
      h("b", "outside"),
      (props["renderFactorySlot"] as (name: string, input: object) => VNodeChild)(
        "native.recursive",
        {},
      ),
    ]);
    fixture.slots.register({ name: "root" }, Root);
    const remove = fixture.slots.registerFactory(
      { name: "native.recursive", scope: "root" },
      Recursive,
    );
    await fixture.mount();
    expect(reports).toEqual(["factory:native.recursive"]);
    expect(fixture.container.textContent).toBe("outside");
    expect(fixture.container.querySelector("[data-factory-error]")).not.toBeNull();
    remove();
    fixture.slots.registerFactory(
      { name: "native.recursive", scope: "root", inject: () => ({ text: "replacement" }) },
      text,
    );
    await settle();
    expect(fixture.container.textContent).toBe("outsidereplacement");
    expect(fixture.container.querySelector("[data-factory-error]")).toBeNull();
  });

  it("renders factory local component overrides with current plain inputs", async () => {
    const b = await bench();
    const label = shallowRef("first");
    const Fallback = defineSlotComponent<{ text: string }>(
      ["text"],
      (props) => () => h("i", `fallback:${props.text}`),
    );
    const Selected = defineSlotComponent<{ text: string }>(
      ["text"],
      (props) => () => h("b", props.text),
    );
    const Factory = defineSlotComponent<Face>(["useFactorySlot", "text"], (props) => {
      const useLocal = props["useFactorySlot"] as (
        name: string,
        fallback: import("vue").Component,
      ) => import("vue").Component;
      const Local = useLocal("body", Fallback);
      return () => h(Local, { text: props["text"] });
    });
    const Root = defineSlotComponent<Face>(
      ["renderFactorySlot"],
      (props) => () =>
        (
          props["renderFactorySlot"] as (name: string, input: object, options: object) => VNodeChild
        )("native.local", { text: label.value }, { slots: { body: Selected } }),
    );
    b.slots.register({ name: "root" }, Root);
    b.slots.registerFactory(
      { name: "native.local", scope: "root", slots: { body: { scope: "root" } } },
      Factory,
    );
    await b.mount();
    expect(b.container.textContent).toBe("first");
    label.value = "second";
    await settle();
    expect(b.container.textContent).toBe("second");
  });

  it("owns exclusive Factory viewing stores per occurrence and resets a removed position", async () => {
    const fixture = await bench();
    const show = shallowRef(true);
    const createCounter = () =>
      defineStore({
        init: () => ({ count: 0 }),
        actions: {
          increment: (draft) => {
            draft.count += 1;
          },
        },
      });
    const Local = defineSlotComponent<Face>(["useStore", "actions"], (props) => {
      const count = (
        props["useStore"] as (
          select: (state: { count: number }) => number,
        ) => Readonly<{ value: number }>
      )((state) => state.count);
      return () =>
        h(
          "button",
          { onClick: () => (props["actions"] as { increment: () => void }).increment() },
          String(count.value),
        );
    });
    const Counter = defineSlotComponent<Face>(["useFactorySlot"], (props) => {
      const Selected = (
        props["useFactorySlot"] as (name: string, fallback: typeof Local) => typeof Local
      )("body", Local);
      return () => h(Selected);
    });
    const Root = defineSlotComponent<Face>(["renderFactorySlot"], (props) => () => {
      const render = props["renderFactorySlot"] as (name: string, input: object) => VNodeChild;
      return [show.value ? render("native.counter", {}) : null, render("native.counter", {})];
    });
    fixture.slots.register({ name: "root" }, Root);
    fixture.slots.registerFactory(
      {
        name: "native.counter",
        scope: "root",
        store: createCounter,
        slots: { body: { scope: "root" } },
      },
      Counter,
    );
    await fixture.mount();
    fixture.container.querySelector("button")?.click();
    await settle();
    expect(fixture.container.textContent).toBe("10");
    show.value = false;
    await settle();
    expect(fixture.container.textContent).toBe("0");
    show.value = true;
    await settle();
    expect(fixture.container.textContent).toBe("00");
  });

  it("mounts two independent native factory occurrences and disposes their scopes", async () => {
    const b = await bench();
    let setups = 0;
    let releases = 0;
    const Factory = defineSlotComponent<{ label: string }>(["label"], (props) => {
      const local = shallowRef(++setups);
      onScopeDispose(() => {
        releases += 1;
      });
      return () =>
        h(
          "button",
          {
            onClick: () => {
              local.value += 10;
            },
          },
          `${props.label}:${local.value}`,
        );
    });
    const Root = defineSlotComponent<Face>(["renderFactorySlot"], (props) => () => {
      const render = props["renderFactorySlot"] as (name: string, input: object) => VNodeChild;
      return [render("native.factory", { label: "a" }), render("native.factory", { label: "b" })];
    });
    b.slots.register({ name: "root" }, Root);
    const remove = b.slots.registerFactory({ name: "native.factory", scope: "root" }, Factory);
    await b.mount();
    expect(b.container.textContent).toBe("a:1b:2");
    b.container.querySelector("button")?.click();
    await settle();
    expect(b.container.textContent).toBe("a:11b:2");
    remove();
    await settle();
    expect(b.container.textContent).toBe("");
    expect(releases).toBe(2);
  });
});
