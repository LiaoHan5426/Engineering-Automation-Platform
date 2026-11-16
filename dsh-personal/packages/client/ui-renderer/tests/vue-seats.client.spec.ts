// @vitest-environment jsdom
import {
  computed,
  createApp,
  defineComponent,
  effectScope,
  h,
  isReadonly,
  nextTick,
  onScopeDispose,
  shallowRef,
  watchEffect,
  type Ref,
} from "vue";
import { expect, it, vi } from "vitest";
import { contextualSeat } from "../src/client/vue/seats.ts";

it("binds a void contextual hook with scoped effects and disposes before rebinding", () => {
  const context = shallowRef("first");
  const hidden = shallowRef(false);
  const events: string[] = [];
  const owner = effectScope();
  const factory =
    (_standard: Record<string, unknown>, value: unknown) => (state: typeof hidden) => {
      events.push(`bind:${value}`);
      watchEffect(() => {
        events.push(`${value}:${state.value}`);
      });
      onScopeDispose(() => {
        events.push(`dispose:${value}`);
      });
    };
  const result = owner.run(() =>
    contextualSeat(
      () => factory,
      () => ({}),
      () => context.value,
    )(hidden),
  );
  expect(result).toBeUndefined();
  expect(events).toEqual(["bind:first", "first:false"]);
  context.value = "second";
  expect(events).toEqual([
    "bind:first",
    "first:false",
    "dispose:first",
    "bind:second",
    "second:false",
  ]);
  owner.stop();
  hidden.value = true;
  context.value = "stale";
  expect(events.at(-1)).toBe("dispose:second");
});

it("retains a reactive selector ref across contextual binding replacement", () => {
  const context = shallowRef("first");
  const owner = effectScope();
  const result = owner.run(() =>
    contextualSeat(
      () => (_standard, value) => () => computed(() => value),
      () => ({}),
      () => context.value,
    )(),
  );
  expect(isReadonly(result)).toBe(true);
  expect(result?.value).toBe("first");
  context.value = "second";
  expect(result?.value).toBe("second");
  owner.stop();
  expect(result?.value).toBeUndefined();
});

it("forwards Vue DOM ref writes to the current contextual scope without readonly warnings", async () => {
  const context = shallowRef("first");
  const targets = new Map<string, Ref<unknown>>();
  const released: string[] = [];
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  let forwarded: Ref<unknown> | undefined;
  const app = createApp(
    defineComponent(() => {
      forwarded = contextualSeat(
        () => (_standard, value) => () => {
          const target = shallowRef<unknown>(null);
          targets.set(String(value), target);
          onScopeDispose(() => {
            released.push(String(value));
          });
          return target;
        },
        () => ({}),
        () => context.value,
      )();
      return () =>
        h("div", {
          ref: (element) => {
            if (forwarded !== undefined) forwarded.value = element;
          },
          "data-context": context.value,
        });
    }),
  );
  const host = document.createElement("div");
  document.body.append(host);
  try {
    app.mount(host);
    const element = host.firstElementChild;
    expect(targets.get("first")?.value).toBe(element);
    expect(isReadonly(forwarded)).toBe(false);
    context.value = "second";
    await nextTick();
    expect(host.firstElementChild).toBe(element);
    expect(released).toEqual(["first"]);
    expect(targets.get("second")?.value).toBe(element);
    app.unmount();
    expect(released).toEqual(["first", "second"]);
    expect(forwarded?.value).toBeUndefined();
    const stale = targets.get("second")?.value;
    if (forwarded) forwarded.value = document.createElement("aside");
    expect(targets.get("second")?.value).toBe(stale);
    expect(warn).not.toHaveBeenCalled();
  } finally {
    if (host.firstChild) app.unmount();
    host.remove();
    warn.mockRestore();
  }
});

it("retains contextual effects and DOM targets across equivalent rendered input wrappers", async () => {
  const firstContext = { name: "first" };
  const context = shallowRef(firstContext);
  const source = shallowRef<object>({});
  const revision = shallowRef(0);
  const extraStandardEntry = shallowRef(false);
  const published = shallowRef(0);
  const hidden = shallowRef(false);
  const bound: string[] = [];
  const released: string[] = [];
  const observed: string[] = [];
  const targets: Ref<unknown>[] = [];
  const createFactories = (name: string) => ({
    effect: (_standard: Record<string, unknown>, value: unknown) => () => {
      void published.value;
      const id = `${name}:effect:${String((value as typeof firstContext).name)}`;
      bound.push(id);
      watchEffect(() => {
        observed.push(`${id}:${hidden.value}`);
      });
      onScopeDispose(() => {
        released.push(id);
      });
    },
    dom: (_standard: Record<string, unknown>, value: unknown) => () => {
      void published.value;
      const id = `${name}:dom:${String((value as typeof firstContext).name)}`;
      const target = shallowRef<unknown>(null);
      bound.push(id);
      targets.push(target);
      onScopeDispose(() => {
        released.push(id);
      });
      return target;
    },
  });
  const factories = shallowRef(createFactories("initial"));
  let forwarded: Ref<unknown> | undefined;
  const Child = defineComponent(
    (props: {
      options: { hookContext: typeof firstContext };
      standard: Record<string, unknown>;
      factories: ReturnType<typeof createFactories>;
      revision: number;
    }) => {
      contextualSeat(
        () => props.factories.effect,
        () => props.standard,
        () => props.options.hookContext,
      )();
      forwarded = contextualSeat(
        () => props.factories.dom,
        () => props.standard,
        () => props.options.hookContext,
      )();
      return () =>
        h("section", {
          "data-revision": props.revision,
          ref: (element) => {
            if (forwarded !== undefined) forwarded.value = element;
          },
        });
    },
    { inheritAttrs: false, props: ["options", "standard", "factories", "revision"] },
  );
  const app = createApp(
    defineComponent(
      () => () =>
        h(Child, {
          options: { hookContext: context.value },
          standard: {
            source: source.value,
            ...(extraStandardEntry.value ? { extra: source.value } : {}),
          },
          factories: factories.value,
          revision: revision.value,
        }),
    ),
  );
  const host = document.createElement("div");
  document.body.append(host);
  let mounted = false;
  try {
    app.mount(host);
    mounted = true;
    const element = host.firstElementChild;
    const forwardingRef = forwarded;
    const initialTarget = targets[0];
    expect(bound).toEqual(["initial:effect:first", "initial:dom:first"]);
    expect(initialTarget?.value).toBe(element);

    revision.value++;
    await nextTick();
    expect(host.firstElementChild).toBe(element);
    expect(element?.getAttribute("data-revision")).toBe("1");
    expect(bound).toEqual(["initial:effect:first", "initial:dom:first"]);
    expect(released).toEqual([]);
    expect(targets).toHaveLength(1);
    expect(forwarded).toBe(forwardingRef);
    expect(initialTarget?.value).toBe(element);
    hidden.value = true;
    await nextTick();
    expect(observed).toEqual(["initial:effect:first:false", "initial:effect:first:true"]);
    published.value++;
    await nextTick();
    expect(bound).toHaveLength(2);
    expect(released).toEqual([]);
    expect(targets[0]).toBe(initialTarget);

    context.value = { name: "second" };
    await nextTick();
    expect(released).toEqual(["initial:effect:first", "initial:dom:first"]);
    expect(bound.slice(-2)).toEqual(["initial:effect:second", "initial:dom:second"]);
    expect(targets.at(-1)?.value).toBe(element);
    expect(bound).toHaveLength(4);

    factories.value = createFactories("replacement");
    await nextTick();
    expect(released.slice(-2)).toEqual(["initial:effect:second", "initial:dom:second"]);
    expect(bound.slice(-2)).toEqual(["replacement:effect:second", "replacement:dom:second"]);
    expect(targets.at(-1)?.value).toBe(element);
    expect(bound).toHaveLength(6);

    source.value = {};
    await nextTick();
    expect(released.slice(-2)).toEqual(["replacement:effect:second", "replacement:dom:second"]);
    expect(released).toHaveLength(6);
    expect(bound).toHaveLength(8);
    expect(targets).toHaveLength(4);
    expect(targets.at(-1)?.value).toBe(element);
    expect(forwarded).toBe(forwardingRef);
    expect(host.firstElementChild).toBe(element);

    extraStandardEntry.value = true;
    await nextTick();
    expect(bound).toHaveLength(10);
    expect(released).toHaveLength(8);
    expect(targets.at(-1)?.value).toBe(element);
    extraStandardEntry.value = false;
    await nextTick();
    expect(bound).toHaveLength(12);
    expect(released).toHaveLength(10);
    expect(targets.at(-1)?.value).toBe(element);

    app.unmount();
    mounted = false;
    expect(released).toHaveLength(12);
    expect(forwarded?.value).toBeUndefined();
    const bindingCount = bound.length;
    context.value = { name: "after unmount" };
    hidden.value = false;
    await nextTick();
    expect(bound).toHaveLength(bindingCount);
    expect(released).toHaveLength(12);
  } finally {
    if (mounted) app.unmount();
    host.remove();
  }
});

it("clears the previous DOM target and releases a contextual scope whose replacement fails", () => {
  const context = shallowRef("ready");
  const released: string[] = [];
  const owner = effectScope();
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const factory = (_standard: Record<string, unknown>, value: unknown) => () => {
    onScopeDispose(() => {
      released.push(String(value));
    });
    if (value === "failed") throw new Error("contextual replacement failed");
    return shallowRef<unknown>(null);
  };
  try {
    const forwarded = owner.run(() =>
      contextualSeat(
        () => factory,
        () => ({}),
        () => context.value,
      )(),
    );
    const element = document.createElement("div");
    if (forwarded !== undefined) forwarded.value = element;
    expect(forwarded?.value).toBe(element);
    expect(() => {
      context.value = "failed";
    }).toThrow("contextual replacement failed");
    expect(forwarded?.value).toBeUndefined();
    expect(released).toEqual(["ready", "failed"]);
    if (forwarded !== undefined) forwarded.value = document.createElement("aside");
    expect(forwarded?.value).toBeUndefined();
    owner.stop();
    expect(released).toEqual(["ready", "failed"]);
  } finally {
    owner.stop();
    warn.mockRestore();
  }
});

it("continues to reject a raw contextual selector result", () => {
  const owner = effectScope();
  try {
    expect(() =>
      owner.run(() =>
        contextualSeat(
          () => () => () => ({ expanded: false }),
          () => ({}),
          () => undefined,
        )(),
      ),
    ).toThrow("contextual selector hook must return a Vue ref");
  } finally {
    owner.stop();
  }
});
