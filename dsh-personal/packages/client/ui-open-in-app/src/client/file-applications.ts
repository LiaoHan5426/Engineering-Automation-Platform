/** File association reads shared by mounted controls using the same reader and target. */
import { computed, isRef, toValue, type MaybeRefOrGetter, type Ref, type ShallowRef } from 'vue'
import { useObservableSelector } from '@deepseek-ai/dsh-client-ui-primitives'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionWorkspacePathApplication } from '@deepseek-ai/dsh-api-session-controller/types'

type Query = (
  target: string,
  signal: AbortSignal,
) => Promise<readonly SessionWorkspacePathApplication[] | null>
interface Result {
  apps: readonly SessionWorkspacePathApplication[]
  loading: boolean
  failed: boolean
}
interface Entry {
  state: SnapshotStore<Result>
  users: number
  controller: AbortController | null
  refresh: () => void
}
const EMPTY: Result = { apps: [], loading: true, failed: false }
const readers = new WeakMap<Query, Map<string, Entry>>()

/** Each mounted consumer retains the query; the last release cancels and discards it. */
function subscribe(query: Query, target: string, listener: () => void): () => void {
  let targets = readers.get(query)
  if (targets === undefined) {
    targets = new Map()
    readers.set(query, targets)
  }
  let entry = targets.get(target)
  const initial = entry === undefined
  if (entry === undefined) {
    const created: Entry = {
      state: createSnapshotStore<Result>(EMPTY),
      users: 0,
      controller: null,
      refresh: () => {
        created.controller?.abort()
        const controller = new AbortController()
        created.controller = controller
        void query(target, controller.signal).then((apps) => {
          if (!controller.signal.aborted)
            created.state.set({ apps: apps ?? [], loading: false, failed: apps === null })
        })
      },
    }
    entry = created
    targets.set(target, entry)
  }
  const retained = entry
  retained.users += 1
  const release = retained.state.subscribe(listener)
  if (initial) retained.refresh()
  return () => {
    release()
    retained.users -= 1
    if (retained.users === 0) {
      retained.controller?.abort()
      targets.delete(target)
    }
  }
}

/**
 * Share associations and refreshes across mounted controls for the same file and reader.
 * @param target - path or authenticated route identifying the current file.
 * @param query - ref or getter for the reader scoped to the serving Host; failures resolve to null.
 * @param enabled - whether a native desktop is available.
 * @returns readonly reactive metadata, loading and failure states, and a shared refresh callback.
 */
export function useFileApplications(
  target: MaybeRefOrGetter<string>,
  query: (() => Query) | Readonly<Ref<Query>>,
  enabled: MaybeRefOrGetter<boolean>,
): Readonly<ShallowRef<Result & { refresh: () => void }>> {
  const reader = (): Query => (isRef(query) ? query.value : query())
  const source = computed(() => {
    if (!toValue(enabled)) return undefined
    const read = reader()
    const path = toValue(target)
    return {
      getSnapshot: () => readers.get(read)?.get(path)?.state.getSnapshot() ?? EMPTY,
      subscribe: (listener: () => void) => subscribe(read, path, listener),
    }
  })
  const state = useObservableSelector(
    () => source.value,
    () => value => value,
  )
  const refresh = (): void => {
    readers.get(reader())?.get(toValue(target))?.refresh()
  }
  return computed(() => ({ ...(state.value ?? EMPTY), refresh }))
}
