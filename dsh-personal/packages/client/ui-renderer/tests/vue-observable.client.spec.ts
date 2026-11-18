import { describe, expect, it, vi } from "vite-plus/test";
import { effectScope, isReadonly, isReactive, reactive, shallowRef, watchEffect } from "vue";
import type { HostObservable } from "@deepseek-ai/dsh-client-ui-slots";
import { useObservableSelector } from "@deepseek-ai/dsh-client-ui-primitives";

function makeSource<T>(initial: T) {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  const captured: (() => void)[] = [];
  const source: HostObservable<T> = {
    getSnapshot() {
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
    captured,
    listeners,
    set(next: T) {
      snapshot = next;
      for (const listener of [...listeners]) listener();
    },
  };
}

describe("Vue external observable selector", () => {
  it("follows two independently selected Session sources and invalidates old callbacks", () => {
    const first = makeSource({ count: 1 });
    const second = makeSource({ count: 10 });
    const current = shallowRef(first.source);
    const scope = effectScope();
    try {
      const selected = scope.run(() =>
        useObservableSelector(
          () => current.value,
          () => (value) => value.count,
        ),
      )!;
      const oldCallback = first.captured[0]!;
      expect(selected.value).toBe(1);
      current.value = second.source;
      expect(selected.value).toBe(10);
      expect(first.listeners.size).toBe(0);
      first.set({ count: 99 });
      oldCallback();
      expect(selected.value).toBe(10);
      second.set({ count: 11 });
      expect(selected.value).toBe(11);
      current.value = first.source;
      expect(selected.value).toBe(99);
      oldCallback();
      expect(selected.value).toBe(99);
    } finally {
      scope.stop();
    }
    expect(first.listeners.size).toBe(0);
    expect(second.listeners.size).toBe(0);
  });

  it("adopts an absent source and returns to absence without invoking its selector", () => {
    const live = makeSource({ count: 3 });
    const current = shallowRef<HostObservable<{ count: number }> | undefined>();
    const select = vi.fn((value: { count: number }) => value.count);
    const scope = effectScope();
    try {
      const selected = scope.run(() =>
        useObservableSelector(
          () => current.value,
          () => select,
        ),
      )!;
      expect(selected.value).toBeUndefined();
      expect(select).not.toHaveBeenCalled();
      current.value = live.source;
      expect(selected.value).toBe(3);
      current.value = undefined;
      const calls = select.mock.calls.length;
      live.captured[0]!();
      expect(selected.value).toBeUndefined();
      expect(select).toHaveBeenCalledTimes(calls);
      expect(live.listeners.size).toBe(0);
    } finally {
      scope.stop();
    }
  });

  it.each(["snapshot", "snapshot-error", "selection"] as const)(
    "does not subscribe after synchronous scope disposal during %s",
    (stage) => {
      const scope = effectScope();
      const subscribe = vi.fn(() => () => {});
      const source: HostObservable<number> = {
        getSnapshot() {
          if (stage !== "selection") scope.stop();
          if (stage === "snapshot-error") throw new Error("disposed snapshot");
          return 1;
        },
        subscribe,
      };
      expect(() =>
        scope.run(() =>
          useObservableSelector(
            () => source,
            () => (value) => {
              if (stage === "selection") scope.stop();
              return value;
            },
          ),
        ),
      ).not.toThrow();
      expect(subscribe).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    "releases a subscription stopped synchronously during subscribe (notify: %s)",
    (notify) => {
      const scope = effectScope();
      const dispose = vi.fn();
      let snapshot = 1;
      const source: HostObservable<number> = {
        getSnapshot: () => snapshot,
        subscribe(listener) {
          if (notify) {
            snapshot = 2;
            listener();
          } else scope.stop();
          return dispose;
        },
      };
      scope.run(() =>
        useObservableSelector(
          () => source,
          () => (value) => {
            if (value === 2) scope.stop();
            return value;
          },
        ),
      );
      expect(dispose).toHaveBeenCalledOnce();
      scope.stop();
      expect(dispose).toHaveBeenCalledOnce();
    },
  );

  it("rechecks a snapshot changed during subscription setup without notification", () => {
    let snapshot = 1;
    const unsubscribe = vi.fn();
    const source: HostObservable<number> = {
      getSnapshot() {
        return snapshot;
      },
      subscribe() {
        snapshot = 2;
        return unsubscribe;
      },
    };
    const scope = effectScope();
    const selected = scope.run(() =>
      useObservableSelector(
        () => source,
        () => (value) => value,
      ),
    )!;
    expect(selected.value).toBe(2);
    scope.stop();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("follows a props selector replacement and reactive values read by a selector", () => {
    const live = makeSource({ first: 2, second: 7 });
    const props = reactive({
      select: (value: { first: number; second: number }) => value.first,
      multiplier: 1,
    });
    const scope = effectScope();
    try {
      const selected = scope.run(() =>
        useObservableSelector(
          () => live.source,
          () => (value) => props.select(value) * props.multiplier,
        ),
      )!;
      expect(selected.value).toBe(2);
      props.select = (value) => value.second;
      expect(selected.value).toBe(7);
      props.multiplier = 3;
      expect(selected.value).toBe(21);
      live.set({ first: 4, second: 8 });
      expect(selected.value).toBe(24);
    } finally {
      scope.stop();
    }
  });

  it("tracks reactive dependencies first introduced by a later external snapshot without resubscribing", () => {
    const live = makeSource({ mode: "fixed" });
    const location = shallowRef("history");
    const scope = effectScope();
    try {
      const selected = scope.run(() =>
        useObservableSelector(
          () => live.source,
          () => (snapshot) => (snapshot.mode === "fixed" ? "collapsed" : location.value),
        ),
      )!;
      expect(selected.value).toBe("collapsed");
      live.set({ mode: "location" });
      expect(selected.value).toBe("history");
      location.value = "current";
      expect(selected.value).toBe("current");
      expect(live.captured).toHaveLength(1);
      expect(live.listeners.size).toBe(1);
    } finally {
      scope.stop();
    }
  });

  it("retains equal slices and exposes raw nested values through a shallow readonly ref", () => {
    const initial: Readonly<{ count: number }> = Object.freeze({ count: 1 });
    const live = makeSource({ slice: initial, other: 0 });
    const scope = effectScope();
    const seen: object[] = [];
    try {
      const selected = scope.run(() => {
        const result = useObservableSelector(
          () => live.source,
          () => (value) => value.slice,
          (left, right) => left.count === right.count,
        );
        watchEffect(
          () => {
            if (result.value !== undefined) seen.push(result.value);
          },
          { flush: "sync" },
        );
        return result;
      })!;
      expect(isReadonly(selected)).toBe(true);
      expect(isReactive(selected.value)).toBe(false);
      expect(selected.value).toBe(initial);
      live.set({ slice: Object.freeze({ count: 1 }), other: 1 });
      expect(selected.value).toBe(initial);
      expect(seen).toHaveLength(1);
      const changed = Object.freeze({ count: 2 });
      live.set({ slice: changed, other: 2 });
      expect(selected.value).toBe(changed);
      expect(seen).toEqual([initial, changed]);
    } finally {
      scope.stop();
    }
  });

  it("releases scope subscriptions once and ignores a queued callback after disposal", () => {
    const live = makeSource(1);
    const select = vi.fn((value: number) => value);
    const scope = effectScope();
    const selected = scope.run(() =>
      useObservableSelector(
        () => live.source,
        () => select,
      ),
    )!;
    const callback = live.captured[0]!;
    scope.stop();
    scope.stop();
    expect(live.listeners.size).toBe(0);
    live.set(2);
    callback();
    expect(selected.value).toBe(1);
    expect(select).toHaveBeenCalledOnce();
  });

  it("rejects unowned subscriptions outside a Vue effect scope", () => {
    const live = makeSource(1);
    expect(() =>
      useObservableSelector(
        () => live.source,
        () => (value) => value,
      ),
    ).toThrow("active Vue effect scope");
    expect(live.listeners.size).toBe(0);
  });
});
