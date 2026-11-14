import {
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  ref,
  type Ref,
} from 'vue'

/**
 * Staged for `@eap/hooks`. Dialog and ConfirmBox are the current callers.
 * Extract the package when a feature needs the same trap.
 */
const FOCUSABLE =
  "button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])"

export function useEscClose(onEscape: () => void) {
  return function onKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    onEscape()
  }
}

function isAvailable(node: HTMLElement) {
  if (node.matches(':disabled, input[type="hidden"]')) return false
  for (let current: HTMLElement | null = node; current; current = current.parentElement) {
    const style = getComputedStyle(current)
    if (
      current.hidden ||
      current.inert ||
      current.hasAttribute('inert') ||
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.visibility === 'collapse'
    )
      return false
  }
  return true
}

export function useFocusTrap(
  root: Ref<HTMLElement | null>,
  options: {
    onEscape?: () => void
    initial?: (node: HTMLElement) => HTMLElement | null | undefined
  } = {},
) {
  let previousFocus: HTMLElement | null = null
  let disposed = false
  const close = options.onEscape ? useEscClose(options.onEscape) : null

  const active = ref(true)
  function focusInitial() {
    void nextTick(() => {
      const node = root.value
      if (!node || disposed || !active.value) return
      const initial = options.initial?.(node)
      ;(initial && isAvailable(initial) ? initial : node).focus()
    })
  }
  onMounted(() => {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    focusInitial()
  })
  onDeactivated(() => {
    active.value = false
  })
  onActivated(() => {
    if (active.value) return
    active.value = true
    focusInitial()
  })

  onBeforeUnmount(() => {
    disposed = true
    const node = root.value
    // Let the host remove the modal and release inert before restoring its opener.
    void nextTick(() => {
      const active = document.activeElement
      // A caller may explicitly focus a newly created item or another modal.
      if (
        active &&
        active !== document.body &&
        active !== document.documentElement &&
        !node?.contains(active)
      )
        return
      if (previousFocus?.isConnected && isAvailable(previousFocus)) previousFocus.focus()
    })
  })

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      close?.(event)
      return
    }
    if (event.key !== 'Tab' || !root.value) return
    const controls = Array.from(root.value.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (node) => node.tabIndex >= 0 && isAvailable(node),
    )
    const first = controls[0]
    const last = controls.at(-1)
    if (!first || !last) {
      event.preventDefault()
      root.value.focus()
      return
    }
    const outsideSequence = !controls.includes(document.activeElement as HTMLElement)
    if (event.shiftKey && (document.activeElement === first || outsideSequence)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (document.activeElement === last || outsideSequence)) {
      event.preventDefault()
      first.focus()
    }
  }

  return { onKeydown, active }
}
