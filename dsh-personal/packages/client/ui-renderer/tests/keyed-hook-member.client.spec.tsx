import { effectScope, type Ref } from "vue";
import { describe, expect, it, vi, onTestFinished } from "vite-plus/test";
import { act } from "../../../test-support/client-runtime/src/vue-test.ts";
import type { HostObservable, KeyedStandardSource } from "@deepseek-ai/dsh-client-ui-slots";
import { keyedSeat } from "../src/client/vue/seats.ts";
function bindSeat<T>(bind: () => Readonly<Ref<T>>): Readonly<Ref<T>> {
  const scope = effectScope();
  onTestFinished(() => {
    scope.stop();
  });
  return scope.run(bind)!;
}
function observable<T>(initial: T): HostObservable<T> & {
  set(next: T): void;
} {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => value,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set: (next) => {
      value = next;
      for (const listener of [...listeners]) listener();
    },
  };
}
describe("keyed standard Hooks", () => {
  it("reads the resolver's (key, member) source when the second argument is a string", async () => {
    const fork = observable(true);
    const whole = observable({ title: "one" });
    const resolver = vi.fn<KeyedStandardSource>((key, member) =>
      member === undefined
        ? key === "s1"
          ? whole
          : undefined
        : key === "s1" && member === "session/fork"
          ? fork
          : undefined,
    );
    const useAccess = keyedSeat(
      () => resolver,
      () => undefined,
    );
    const member = bindSeat(() => useAccess("s1", "session/fork"));
    expect(member.value).toBe(true);
    await act(() => {
      fork.set(false);
    });
    expect(member.value).toBe(false);
    expect(resolver).toHaveBeenCalledWith("s1", "session/fork");
    expect(bindSeat(() => useAccess("s1", "session/missing")).value).toBeUndefined();
    expect(bindSeat(() => useAccess("s1")).value).toEqual({ title: "one" });
    expect(resolver.mock.calls.some((call) => call.length === 1 && call[0] === "s1")).toBe(true);
  });
  it("keeps the selector, equality, and default-key call forms", async () => {
    const whole = observable({ title: "one", count: 1 });
    const useValue = keyedSeat(
      () => (key) => (key === "k" ? whole : undefined),
      () => "k",
    );
    expect(
      bindSeat(() =>
        useValue(
          "k",
          (value: unknown) =>
            (
              value as {
                title: string;
              }
            ).title,
        ),
      ).value,
    ).toBe("one");
    expect(
      bindSeat(() =>
        useValue(
          (value: unknown) =>
            (
              value as {
                count: number;
              }
            ).count,
        ),
      ).value,
    ).toBe(1);
    const equal = vi.fn(() => true);
    bindSeat(() => useValue("k", (value: unknown) => value, equal));
    await act(() => {
      whole.set({ title: "two", count: 2 });
    });
    expect(equal).toHaveBeenCalled();
    const noDefault = keyedSeat(
      () => (key) => (key === "k" ? whole : undefined),
      () => undefined,
    );
    expect(bindSeat(() => noDefault((value: unknown) => value)).value).toBeUndefined();
  });
  it("reads undefined for every call form while the source family is absent", () => {
    const absent = keyedSeat(
      () => undefined,
      () => undefined,
    );
    expect(bindSeat(() => absent("s1", "session/fork")).value).toBeUndefined();
    const select = vi.fn((value: unknown) => value ?? "fallback");
    expect(bindSeat(() => absent("s1", select)).value).toBeUndefined();
    expect(bindSeat(() => absent(select)).value).toBeUndefined();
    expect(select).not.toHaveBeenCalled();
  });
});
