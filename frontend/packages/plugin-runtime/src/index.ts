/**
 * @eap/plugin-runtime — Cordis Client island (real dsh-personal packages).
 *
 * Production: bootCordisClient → ui-renderer SlotRegistry + ui-sidebar-right.apply.
 * Host/Agent/install stay on py-backend. No EAP profile.
 */

export { createPluginIsland, islandControlSurface, type IslandHost, type IslandHandle } from './island'
export { bootCordisClient, type CordisBootHandle } from './client/boot'
export { createClientContext, type ClientContext } from './client/context'
export { assembleClientPackages, CLIENT_PACKAGE_APPLY } from './client/assembly'
export { ensureModuleLoader, loadClientModule } from './moduleLoader'
export { ensureDshCenterAnchor } from './centerAnchor'
