/**
 * @deprecated Fake applyUiSlots/dockkit order is not the shell.
 * Production uses bootCordisClient and the shell slot registry.
 * No dsh client UI package is applied.
 */

export const CLIENT_PACKAGE_APPLY = [] as const

export function assembleClientPackages(): () => void {
  console.warn(
    '[eap-plugin-runtime] assembleClientPackages is deprecated; use bootCordisClient',
  )
  return () => {}
}
