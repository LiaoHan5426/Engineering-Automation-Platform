/**
 * Compatibility facade — prefer bootCordisClient / client/context.
 */
export { createClientContext, type ClientContext, type SlotEntry } from './client/context'
export type {
  ClientModules,
  Disposer,
  LocaleService,
  RemoteFacade,
  SlotService,
} from './client/types'
