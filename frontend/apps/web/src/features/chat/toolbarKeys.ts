/**
 * Arrow-key movement for a horizontal toolbar when `focusgroup` is missing.
 * Native `focusgroup` already does this; callers must skip the fallback then.
 */
export function toolbarStep(
  key: string,
  index: number,
  length: number,
  options: { rtl?: boolean } = {},
): number | null {
  if (length <= 0 || index < 0) return null
  if (key === 'Home') return 0
  if (key === 'End') return length - 1
  const dir = options.rtl ? -1 : 1
  if (key === 'ArrowRight') return (index + dir + length) % length
  if (key === 'ArrowLeft') return (index - dir + length) % length
  return null
}

function toolbarItems(bar: HTMLElement): HTMLButtonElement[] {
  return [...bar.querySelectorAll<HTMLButtonElement>('button')].filter(
    (button) => !button.disabled && button.getAttribute('aria-disabled') !== 'true',
  )
}

/** One tab stop, then arrows / Home / End. No-op where `focusgroup` exists. */
export function installToolbarFallback(
  bar: HTMLElement,
  supported = 'focusGroup' in HTMLElement.prototype,
): () => void {
  if (supported) return () => {}
  const sync = (active: HTMLButtonElement | null) => {
    const items = toolbarItems(bar)
    if (!items.length) return
    const current = active && items.includes(active) ? active : items[0]
    for (const item of items) item.tabIndex = item === current ? 0 : -1
  }
  sync(null)
  const onFocusIn = (event: FocusEvent) => {
    if (event.target instanceof HTMLButtonElement) sync(event.target)
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (!(event.target instanceof HTMLButtonElement)) return
    if (event.target.closest('[role="menu"]')) return
    const items = toolbarItems(bar)
    const index = items.indexOf(event.target)
    const next = toolbarStep(event.key, index, items.length, {
      rtl: getComputedStyle(bar).direction === 'rtl',
    })
    if (next == null) return
    event.preventDefault()
    items[next]?.focus()
  }
  bar.addEventListener('focusin', onFocusIn)
  bar.addEventListener('keydown', onKeyDown)
  return () => {
    bar.removeEventListener('focusin', onFocusIn)
    bar.removeEventListener('keydown', onKeyDown)
  }
}
