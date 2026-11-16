/** Native DOM carrier and framework-equivalent directory binding for component fixtures. */
import { computed, onScopeDispose, shallowRef } from "vue";
import type { SnapshotStore, SnapshotSelectorHook } from "@deepseek-ai/dsh-client-store";
import type { ModelDirectoryState } from "../src/client/directory.ts";
export { act, cleanup, render } from "../../../test-support/client-runtime/src/vue-test.ts";

/** Bind the fixture's real source for the lifetime of the mounted component. */
export function bindDirectory(
  source: SnapshotStore<ModelDirectoryState>,
): SnapshotSelectorHook<ModelDirectoryState> {
  return (selector) => {
    const snapshot = shallowRef(source.getSnapshot());
    onScopeDispose(
      source.subscribe(() => {
        snapshot.value = source.getSnapshot();
      }),
    );
    return computed(() => selector(snapshot.value));
  };
}
