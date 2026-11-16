// @vitest-environment jsdom
import { defineComponent, Fragment, h as vueH } from "vue";
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { within } from "@testing-library/dom";
import { flushVue as act, renderVue } from "../../ui-primitives/tests/vue-render.ts";
function render(node: Parameters<typeof renderVue>[0]) {
  const view = renderVue(node);
  return { ...view, ...within(document.body) };
}
import { useObservableSelector } from "../src/client/vue-observable.ts";
import type { HostObservable as ObservableSnapshot } from "@deepseek-ai/dsh-client-ui-slots";
// Keep equality local: this suite asserts the eq parameter contract without
// adding a reverse dependency from the UI renderer to runtime.
const shallowEqual = (a: Record<string, unknown>, b: Record<string, unknown>): boolean =>
  Object.keys(a).length === Object.keys(b).length &&
  Object.keys(a).every((k) => Object.is(a[k], b[k]));
interface Snap {
  a: number;
  b: number;
}
/** Hand-rolled observable source so subscription counting is exact. */
function makeSource(initial: Snap) {
  let state = initial;
  const listeners = new Set<() => void>();
  let subscribeCalls = 0;
  const source: ObservableSnapshot<Snap> = {
    getSnapshot: () => state,
    subscribe: (fn) => {
      subscribeCalls += 1;
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
  return {
    source,
    set: (next: Snap) => {
      state = next;
      for (const fn of [...listeners]) fn();
    },
    stats: {
      get subscribeCalls() {
        return subscribeCalls;
      },
      get active() {
        return listeners.size;
      },
    },
  };
}
function createHarness<S>() {
  return defineComponent(
    (props: {
      source: ObservableSnapshot<Snap>;
      sel: (snapshot: Snap) => S;
      eq?: (left: S, right: S) => boolean;
      probe: {
        renders: number;
        value?: S | undefined;
      };
    }) => {
      const selected = useObservableSelector(
        () => props.source,
        () => props.sel,
        props.eq,
      );
      return () => {
        props.probe.renders += 1;
        props.probe.value = selected.value;
        return null;
      };
    },
    { props: ["source", "sel", "eq", "probe"], inheritAttrs: false },
  );
}
const Harness = createHarness<unknown>();
describe("native snapshot selector", () => {
  it("re-renders on selected change and bails out when the slice is equal", async () => {
    const { source, set } = makeSource({ a: 1, b: 10 });
    const probe = { renders: 0, value: undefined as number | undefined };
    render(
      vueH(Harness, {
        source: source,
        sel: (s) => s.a,
        probe: probe,
      }),
    );
    expect(probe.value).toBe(1);
    const before = probe.renders;
    await act(() => {
      set({ a: 1, b: 11 });
    }); // unrelated field: Object.is bail
    expect(probe.renders).toBe(before);
    await act(() => {
      set({ a: 2, b: 11 });
    });
    expect(probe.renders).toBe(before + 1);
    expect(probe.value).toBe(2);
  });
  it("supports custom equality for object slices", async () => {
    const { source, set } = makeSource({ a: 1, b: 10 });
    const probe = {
      renders: 0,
      value: undefined as
        | {
            a: number;
          }
        | undefined,
    };
    render(
      vueH(createHarness<{ a: number }>(), {
        source: source,
        sel: (s) => ({ a: s.a }),
        eq: (left: { a: number }, right: { a: number }) => shallowEqual(left, right),
        probe: probe,
      }),
    );
    const before = probe.renders;
    await act(() => {
      set({ a: 1, b: 99 });
    }); // fresh object, shallow-equal slice
    expect(probe.renders).toBe(before);
    await act(() => {
      set({ a: 5, b: 99 });
    });
    expect(probe.renders).toBe(before + 1);
    expect(probe.value).toEqual({ a: 5 });
  });
  it("does not resubscribe across re-renders of the same component", async () => {
    const { source, set, stats } = makeSource({ a: 1, b: 10 });
    const probe = { renders: 0, value: undefined as number | undefined };
    const { rerender } = render(
      vueH(Harness, {
        source: source,
        sel: (s) => s.a,
        probe: probe,
      }),
    );
    await act(() => {});
    const after = stats.subscribeCalls;
    rerender(
      vueH(Harness, {
        source: source,
        sel: (s) => s.a,
        probe: probe,
      }),
    );
    await act(() => {
      set({ a: 2, b: 10 });
    });
    rerender(
      vueH(Harness, {
        source: source,
        sel: (s) => s.a,
        probe: probe,
      }),
    );
    expect(stats.subscribeCalls).toBe(after);
  });
  it("keeps Fragment-scoped subscribers isolated and cleans up subscriptions on unmount", async () => {
    const { source, stats } = makeSource({ a: 1, b: 10 });
    const probe = { renders: 0, value: undefined as number | undefined };
    const view = render(
      vueH(Fragment, null, [
        vueH(Harness, {
          source: source,
          sel: (s) => s.a,
          probe: probe,
        }),
      ]),
    );
    await act(() => {});
    expect(probe.value).toBe(1);
    view.unmount();
    expect(stats.active).toBe(0);
  });
  it("binds method-style sources without losing this", () => {
    class MethodSource implements ObservableSnapshot<Snap> {
      private state: Snap = { a: 7, b: 0 };
      private listeners = new Set<() => void>();
      getSnapshot(): Snap {
        return this.state;
      }
      subscribe(fn: () => void): () => void {
        this.listeners.add(fn);
        return () => {
          this.listeners.delete(fn);
        };
      }
    }
    const source = new MethodSource();
    const probe = { renders: 0, value: undefined as number | undefined };
    render(
      vueH(Harness, {
        source: source,
        sel: (s) => s.a,
        probe: probe,
      }),
    );
    expect(probe.value).toBe(7);
  });
  it("memoizes the selector result against getSnapshot spam", async () => {
    const { source } = makeSource({ a: 1, b: 10 });
    const sel = vi.fn((s: Snap) => s.a);
    const probe = { renders: 0, value: undefined as number | undefined };
    const { rerender } = render(
      vueH(Harness, {
        source: source,
        sel: sel,
        probe: probe,
      }),
    );
    await act(() => {});
    const calls = sel.mock.calls.length;
    rerender(
      vueH(Harness, {
        source: source,
        sel: sel,
        probe: probe,
      }),
    );
    // Same snapshot + same selector reference: no recompute beyond bookkeeping.
    expect(sel.mock.calls.length).toBeLessThanOrEqual(calls + 1);
  });
});
