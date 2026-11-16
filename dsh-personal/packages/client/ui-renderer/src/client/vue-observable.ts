/** Vue-owned subscriptions over immutable external snapshot sources. */
import { getCurrentScope, shallowReadonly, shallowRef, watchEffect, type ShallowRef } from "vue";
import type { HostObservable } from "@deepseek-ai/dsh-client-ui-slots";

/**
 * Select an external snapshot within the current Vue effect scope.
 * Getters follow changing sources and selectors without rerunning component setup.
 * Absence publishes undefined without calling the selector. Equality defaults to
 * Object.is and retains the previous selected reference; nested values stay raw.
 * @param source - reactive getter for the current source, or absence.
 * @param selector - reactive getter for the selection function.
 * @param equal - selected-value equality; omitted uses Object.is.
 * @returns a shallow readonly ref released when its owning scope stops.
 */
export function useObservableSelector<T, S>(
  source: () => HostObservable<T> | undefined,
  selector: () => (snapshot: T) => S,
  equal: (left: S, right: S) => boolean = Object.is,
): Readonly<ShallowRef<S | undefined>> {
  if (getCurrentScope() === undefined) {
    throw new Error("observable selector requires an active Vue effect scope");
  }
  const selected = shallowRef<S | undefined>();
  const currentSnapshot = shallowRef<{ readonly snapshot: T; readonly active: () => boolean }>();
  let hasSelection = false;
  let previous: S;

  // Every selection runs inside Vue tracking, including external publications.
  // Subscription ownership depends only on the source, not selector dependencies.
  watchEffect(
    () => {
      const current = currentSnapshot.value;
      if (current === undefined) {
        hasSelection = false;
        selected.value = undefined;
        return;
      }
      const next = selector()(current.snapshot);
      if (!current.active()) return;
      const unchanged = hasSelection && equal(previous, next);
      if (!current.active() || unchanged) return;
      previous = next;
      hasSelection = true;
      selected.value = next;
    },
    { flush: "sync" },
  );

  watchEffect(
    (onCleanup) => {
      const current = source();
      let active = true;
      let unsubscribe: (() => void) | undefined;
      const release = (): void => {
        active = false;
        const dispose = unsubscribe;
        unsubscribe = undefined;
        dispose?.();
      };
      onCleanup(release);
      if (current === undefined) {
        currentSnapshot.value = undefined;
        return;
      }
      let hasSnapshot = false;
      let previousSnapshot: T;
      const refresh = (): void => {
        if (!active) return;
        const snapshot = current.getSnapshot();
        if (!active || (hasSnapshot && Object.is(snapshot, previousSnapshot))) return;
        previousSnapshot = snapshot;
        hasSnapshot = true;
        currentSnapshot.value = { snapshot, active: () => active };
      };
      try {
        refresh();
        if (!active) return;
        const dispose = current.subscribe(refresh);
        if (!active) dispose();
        else {
          unsubscribe = dispose;
          refresh();
        }
      } catch (error) {
        release();
        throw error;
      }
    },
    { flush: "sync" },
  );
  return shallowReadonly(selected);
}
