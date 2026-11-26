/**
 * @eap/plugin-runtime — transitional Cordis Client seat helpers.
 *
 * Production enablement/boot injection: `@eap/dsh-boot` + `DshBootHost`.
 * This package still supplies seat bootstrap (`bootCordisClient`) until
 * AppWebEntry owns the full ui-* closure. Host/Agent/install stay on py-backend.
 * No EAP profile.
 */

export {
  createPluginIsland,
  islandControlSurface,
  type IslandHost,
  type IslandHandle,
} from './island'
export { bootCordisClient, type CordisBootHandle } from './client/boot'
export { createClientContext, type ClientContext } from './client/context'
export { assembleClientPackages, CLIENT_PACKAGE_APPLY } from './client/assembly'
export { ensureModuleLoader, loadClientModule, pluginRequire } from './moduleLoader'
export { ensureDshCenterAnchor } from './centerAnchor'

export { createReactSlotWrapper, isReactComponent } from './client/reactSlotBridge'
