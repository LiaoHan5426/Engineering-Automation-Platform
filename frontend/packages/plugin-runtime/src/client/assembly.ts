/**
 * @deprecated Fake applyUiSlots/dockkit order does not match dsh-personal.
 * Production uses bootCordisClient (PLATFORM libs + ui-sidebar-right.apply).
 */

export const CLIENT_PACKAGE_APPLY = [
  { name: 'ui-renderer', note: 'Cordis apply → slots' },
  { name: 'ui-sidebar-right', note: 'Cordis apply → RightbarSeat' },
] as const

export function assembleClientPackages(): () => void {
  console.warn(
    '[eap-plugin-runtime] assembleClientPackages is deprecated; use bootCordisClient',
  )
  return () => {}
}
