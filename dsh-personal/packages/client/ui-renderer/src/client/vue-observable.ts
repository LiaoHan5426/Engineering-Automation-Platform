/** Vue-owned subscriptions over immutable external snapshot sources. */
import {
  computed,
  effect,
  getCurrentScope,
  shallowRef,
  type ReactiveEffectRunner,
  type ShallowRef,
} from "vue";
import type { HostObservable } from "@deepseek-ai/dsh-client-ui-slots";

type Publication<T> = { readonly value: T } | { readonly error: unknown };
type Snapshot<T> = Publication<{ readonly snapshot: T; readonly active: () => boolean }>;

/** Run inside the current Vue scope, including the error guard on every trigger. */
function synchronousEffect(read: () => void, onStop?: () => void): void {
  let run: ReactiveEffectRunner<void> | undefined;
  // A watcher checks computed dirtiness before its callback. That check can throw
  // outside our guard; invoke the scoped effect runner directly instead.
  run = effect(read, {
    scheduler: () => {
      run?.();
    },
    ...(onStop === undefined ? {} : { onStop }),
  });
}

/**
 * Select an external snapshot within the current Vue effect scope.
 * Getters follow changing sources and selectors without rerunning component setup.
 * Absence publishes undefined without calling the selector. Equality defaults to
 * Object.is and retains the previous selected reference; nested values stay raw.
 * Initial source binding validates immediately. Subsequent source and selection
 * failures publish synchronously and throw on read, allowing Vue to retire a
 * removed consumer before its queued render without hiding live failures.
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
  source(); // Preserve eager validation of a missing declared standard source.
  const publication = shallowRef<Publication<S | undefined>>({ value: undefined });
  const currentSnapshot = shallowRef<Snapshot<T>>();
  let hasSelection = false;
  let previous: S;

  // Selection tracks its own conditional dependencies; source ownership does not.
  synchronousEffect(() => {
    const current = currentSnapshot.value;
    if (current === undefined) {
      hasSelection = false;
      if (!("value" in publication.value) || publication.value.value !== undefined) {
        publication.value = { value: undefined };
      }
      return;
    }
    if ("error" in current) {
      publication.value = current;
      return;
    }
    const { snapshot, active } = current.value;
    try {
      const next = selector()(snapshot);
      if (!active()) return;
      const unchanged = hasSelection && equal(previous, next);
      if (!active()) return;
      if (unchanged) {
        if (!("value" in publication.value)) publication.value = { value: previous };
        return;
      }
      previous = next;
      hasSelection = true;
      publication.value = { value: next };
    } catch (error) {
      if (active()) publication.value = { error };
    }
  });

  let releaseCurrent = (): void => {};
  synchronousEffect(
    () => {
      releaseCurrent();
      let active = true;
      let unsubscribe: (() => void) | undefined;
      const release = (): void => {
        active = false;
        const dispose = unsubscribe;
        unsubscribe = undefined;
        dispose?.();
      };
      releaseCurrent = release;
      try {
        const current = source();
        if (current === undefined) {
          currentSnapshot.value = undefined;
          return;
        }
        let hasSnapshot = false;
        let previousSnapshot: T;
        const refresh = (): void => {
          if (!active) return;
          try {
            const snapshot = current.getSnapshot();
            if (!active || (hasSnapshot && Object.is(snapshot, previousSnapshot))) return;
            previousSnapshot = snapshot;
            hasSnapshot = true;
            currentSnapshot.value = { value: { snapshot, active: () => active } };
          } catch (error) {
            if (!active) return;
            hasSnapshot = false;
            currentSnapshot.value = { error };
          }
        };
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
        currentSnapshot.value = { error };
      }
    },
    () => releaseCurrent(),
  );
  return computed(() => {
    const current = publication.value;
    if ("error" in current) throw current.error;
    return current.value;
  });
}
