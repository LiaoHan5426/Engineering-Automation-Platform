import type { Context, Service } from '@deepseek-ai/cordis'
/** Narrow public type facade over the digest-checked original browser build. */
export const contextMenu: { inject: string[]; apply(ctx: Context): void }
export const shortcutReference: typeof contextMenu
export const fileActions: typeof contextMenu
export class LocaleRuntime {
  constructor(ctx: Context)
  setLocale(value: string): void
  bind(namespace: string): (key: string) => string
}
export class ShortcutsService extends Service {
  constructor(ctx: Context)
}
export function createClientModuleSystem(
  target: unknown,
  bootstrap: unknown,
  options: unknown,
): {
  import(id: string): Promise<typeof contextMenu>
  dispose(): Promise<void>
}
