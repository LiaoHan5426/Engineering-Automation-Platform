/** Shared membership operation; each domain owns its values and classifications. */
export function hasWireValue<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value)
}
