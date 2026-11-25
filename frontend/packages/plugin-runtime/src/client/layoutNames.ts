import { LAYOUT_PREFIX, LAYOUT_SLOTS } from './layoutSlots'

const CATALOG = new Set(LAYOUT_SLOTS.map((slot) => slot.key))

/** Registry name for a catalog key. `root` stays `root` because the shell renders that name. */
export function canonicalSlotName(name: string): string {
  if (name === 'root' || name.startsWith(LAYOUT_PREFIX)) return name
  if (!CATALOG.has(name)) throw new Error(`unknown slot "${name}"`)
  return `${LAYOUT_PREFIX}${name}`
}

export function translateRenderSlot<T extends (key: string, ...rest: never[]) => unknown>(
  render: T | undefined,
): T | undefined {
  if (typeof render !== 'function') return render
  return ((key: string, ...rest: never[]) => render(canonicalSlotName(key), ...rest)) as T
}
