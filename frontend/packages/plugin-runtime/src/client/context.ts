/**
 * Compatibility entry — prefer bootCordisClient for production.
 * Kept so older tests that stub a minimal context can still import types.
 */

export { bootCordisClient } from './boot'
export type { ClientContext, SlotEntry } from './types'

/** @deprecated Production path uses bootCordisClient (real Cordis + ui-sidebar-right.apply). */
export async function createClientContext(options: {
  hostApiBase: string
  fetchHost: (method: string, body?: Record<string, unknown>) => Promise<unknown>
}) {
  const { bootCordisClient } = await import('./boot')
  const boot = await bootCordisClient(options)
  const ctx = boot.ctx
  const originalDispose = ctx.dispose.bind(ctx)
  ctx.dispose = () => {
    boot.dispose()
    originalDispose()
  }
  return ctx
}
