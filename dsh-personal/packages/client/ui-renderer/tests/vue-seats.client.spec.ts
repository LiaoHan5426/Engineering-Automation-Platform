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
