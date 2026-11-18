// @vitest-environment jsdom
/** Observable failures belong to reads, including reactive keys during parent-owned removal. */
import { afterEach, describe, expect, it, onTestFinished, vi } from "vite-plus/test";
import {
  computed,
  defineComponent,
  effectScope,
  h,
  isReadonly,
  onErrorCaptured,
  shallowRef,
} from "vue";
import type { HostObservable } from "@deepseek-ai/dsh-client-ui-slots";
import { act, cleanup, render } from "../../../test-support/client-runtime/src/vue-test.ts";
import { useObservableSelector } from "@deepseek-ai/dsh-client-ui-primitives";
import { keyedSeat } from "../src/client/vue/seats.ts";

function sourceOf<T>(initial: T) {
  let snapshot = initial;
  let failure: Error | undefined;
  const listeners = new Set<() => void>();
  const captured: (() => void)[] = [];
  const source: HostObservable<T> = {
    getSnapshot() {
      if (failure !== undefined) throw failure;
      return snapshot;
    },
    subscribe(listener) {
      captured.push(listener);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return {
    source,
    listeners,
    captured,
    set(value: T) {
      snapshot = value;
      failure = undefined;
      for (const listener of [...listeners]) listener();
    },
    fail(error: Error) {
      failure = error;
      for (const listener of [...listeners]) listener();
    },
  };
}

function ownedScope() {
  const scope = effectScope();
  onTestFinished(() => {
    scope.stop();
  });
  return scope;
}

afterEach(cleanup);

describe("Vue observable read failures", () => {
  it("unmounts a child after its parent removes a live resource key without reporting an error", async () => {
    const layout = sourceOf({ committed: true, address: "first" });
    const resource = sourceOf("document");
    const errors = vi.fn();
    const Parent = defineComponent(() => {
      onErrorCaptured((error) => {
        errors(error);
        return false;
      });
      const current = useObservableSelector(
        () => layout.source,
        () => (value) => value,
      );
      const Child = defineComponent(() => {
        const info = computed(() => {
          if (current.value?.committed !== true) throw new Error("tab is no longer committed");
          return current.value;
        });
        const address = computed(() => info.value.address);
        const useResource = keyedSeat(
          () => () => resource.source,
          () => undefined,
        );
        const selected = useResource(address);
        return () => h("p", String(selected.value));
      });
      return () => (current.value?.committed === true ? h(Child) : h("p", "closed"));
    });
    const view = render(h(Parent));
    expect(view.getByText("document")).toBeDefined();
    const retired = resource.captured[0]!;
    await act(() => {
      layout.set({ committed: false, address: "first" });
    });
    expect(view.getByText("closed")).toBeDefined();
    expect(errors).not.toHaveBeenCalled();
    expect(resource.listeners.size).toBe(0);
    expect(() => {
      retired();
    }).not.toThrow();
    expect(errors).not.toHaveBeenCalled();
  });

  it("keeps key failures observable on read and recovers synchronously to a valid live key", () => {
    const first = sourceOf(1);
    const second = sourceOf(2);
    const key = shallowRef("first");
    const failure = new Error("invalid resource key");
    const address = computed(() => {
      if (key.value === "invalid") throw failure;
      return key.value;
    });
    const selected = ownedScope().run(() =>
      keyedSeat(
        () => (name) => (name === "first" ? first.source : second.source),
        () => undefined,
      )(address),
    )!;
    expect(isReadonly(selected)).toBe(true);
    expect(selected.value).toBe(1);
    const retired = first.captured[0]!;
    expect(() => {
      key.value = "invalid";
    }).not.toThrow();
    expect(() => selected.value).toThrow(failure);
    expect(first.listeners.size).toBe(0);
    key.value = "second";
    expect(selected.value).toBe(2);
    first.fail(new Error("retired source"));
    expect(() => {
      retired();
    }).not.toThrow();
    expect(selected.value).toBe(2);
    second.set(3);
    expect(selected.value).toBe(3);
  });

  it("reports a live consumer key failure through its render boundary", async () => {
    const source = sourceOf("ready");
    const broken = shallowRef(false);
    const failure = new Error("active key failure");
    const errors = vi.fn();
    const Child = defineComponent(() => {
      const address = computed(() => {
        if (broken.value) throw failure;
        return "address";
      });
      const selected = keyedSeat(
        () => () => source.source,
        () => undefined,
      )(address);
      return () => h("p", String(selected.value));
    });
    const Boundary = defineComponent(() => {
      onErrorCaptured((error) => {
        errors(error);
        return false;
      });
      return () => h(Child);
    });
    render(h(Boundary));
    await act(() => {
      broken.value = true;
    });
    expect(errors).toHaveBeenCalledWith(failure);
  });

  it("rejects an invalid initial source factory during hook setup", () => {
    const failure = new Error("initial source failure");
    const scope = ownedScope();
    expect(() =>
      scope.run(() =>
        useObservableSelector<number, number>(
          () => {
            throw failure;
          },
          () => (value) => value,
        ),
      ),
    ).toThrow(failure);
  });

  it("preserves snapshot refresh failures and clears them on the next publication", () => {
    const live = sourceOf(1);
    const selected = ownedScope().run(() =>
      useObservableSelector(
        () => live.source,
        () => (value) => value,
      ),
    )!;
    const failure = new Error("snapshot read failure");
    expect(() => {
      live.fail(failure);
    }).not.toThrow();
    expect(() => selected.value).toThrow(failure);
    live.set(2);
    expect(selected.value).toBe(2);
  });

  it("preserves selector failures and recovers even when the selected value equals the previous success", () => {
    const live = sourceOf(1);
    const failure = new Error("selector failure");
    const selected = ownedScope().run(() =>
      useObservableSelector(
        () => live.source,
        () => (value) => {
          if (value < 0) throw failure;
          return value;
        },
      ),
    )!;
    expect(selected.value).toBe(1);
    expect(() => {
      live.set(-1);
    }).not.toThrow();
    expect(() => selected.value).toThrow(failure);
    live.set(1);
    expect(selected.value).toBe(1);
  });

  it("preserves equality failures and clears them after a successful comparison", () => {
    const live = sourceOf(1);
    const broken = shallowRef(false);
    const failure = new Error("comparison failure");
    const selected = ownedScope().run(() =>
      useObservableSelector(
        () => live.source,
        () => (value) => value,
        (left, right) => {
          if (broken.value) throw failure;
          return left === right;
        },
      ),
    )!;
    expect(selected.value).toBe(1);
    expect(() => {
      broken.value = true;
    }).not.toThrow();
    expect(() => {
      live.set(2);
    }).not.toThrow();
    expect(() => selected.value).toThrow(failure);
    broken.value = false;
    live.set(3);
    expect(selected.value).toBe(3);
  });
});
