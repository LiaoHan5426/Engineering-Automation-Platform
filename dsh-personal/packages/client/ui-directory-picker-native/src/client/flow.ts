/**
 * The native picking occupant (package-internal; the `./client` surface
 * exposes only the Loader exports). Same-package tests exercise it directly
 * through this module.
 */
import { defineComponent, onScopeDispose, watch } from 'vue'
// Type-only: the owner contract of the directory-flow holes.
import type { DirectoryFlowOwnerProps } from '@deepseek-ai/dsh-client-ui-workspace/client'

/** Injected face: the native chooser call the flow drives (bound in apply's closure). */
export interface NativeFlowInjected {
  /** Open the local desktop or Host single-directory chooser. */
  pick: () => Promise<string | null>
}

/**
 * Renderless flow occupant: each rising `open` edge runs exactly one pick and
 * reports exactly one outcome; watching `open` alone means re-renders (and
 * an adoption keeping `open` true while `busy`) never launch a second
 * chooser. The owner withdrawing `open` re-arms the next request.
 * @param props - owner conversation plus the injected pick call.
 * @returns nothing — the native chooser renders on the host display.
 */
export const NativeDirectoryFlow = defineComponent(
  (props: DirectoryFlowOwnerProps & NativeFlowInjected) => {
    let alive = true
    // The chooser cannot abort; disposal retires its callbacks while it finishes.
    onScopeDispose(() => {
      alive = false
    })
    watch(
      () => props.open,
      (open) => {
        if (!open) return
        props.pick().then(
          (path) => {
            if (!alive) return
            if (path === null) props.onCancel()
            else props.onPicked(path)
          },
          (reason: unknown) => {
            if (!alive) return
            props.onError(reason instanceof Error ? reason.message : String(reason))
          },
        )
      },
      { immediate: true },
    )
    return () => null
  },
  { props: ['open', 'busy', 'onPicked', 'onCancel', 'onError', 'pick'], inheritAttrs: false },
)
