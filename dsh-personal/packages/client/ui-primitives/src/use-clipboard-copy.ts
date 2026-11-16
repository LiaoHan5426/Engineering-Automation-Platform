/** Clipboard writes with component-owned success feedback and cleanup. */
import { onScopeDispose, ref, type Ref } from 'vue'
import { writeClipboard } from './clipboard.ts'

/** Clipboard action and its temporary success state. */
export interface ClipboardCopyState {
  /** True for one second after an accepted clipboard write. */
  readonly copied: Readonly<Ref<boolean>>
  /** Write the current text unless a write or success indication is already active. */
  readonly onCopy: () => void
}

/**
 * Keep clipboard feedback local to the mounted control and release its reset timer on disposal.
 * @param text - Getter for the exact text to copy when the action is invoked.
 * @returns Reactive success feedback and a stable action callback.
 */
export function useClipboardCopy(text: () => string): ClipboardCopyState {
  const copied = ref(false)
  let pending = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let disposed = false
  onScopeDispose(() => {
    disposed = true
    if (timer !== null) clearTimeout(timer)
  })
  const onCopy = () => {
    if (disposed || copied.value || pending) return
    pending = true
    void writeClipboard(text()).then((ok) => {
      if (disposed) return
      pending = false
      if (!ok) return
      copied.value = true
      timer = setTimeout(() => {
        timer = null
        copied.value = false
      }, 1000)
    })
  }
  return { copied, onCopy }
}
