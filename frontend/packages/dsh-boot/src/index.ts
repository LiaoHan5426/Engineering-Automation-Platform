export { bootInjections, CLIENT_MODULES_ID } from './boot-injections.ts'
export { mergeEnablement, revFromNameUrl } from './compose-enablement.ts'
export {
  composeFixtureGraph,
  FIXTURE_REQUIRED_ENTRY_IDS,
} from './compose-fixture.ts'
export { fetchEnablement } from './fetch-enablement.ts'
export { READY_MARKUP, renderIndexInjections } from './injections.ts'
export { resolveDshPersonalRoot } from './paths.ts'
export {
  disposePluginDom,
  ensurePluginModuleSink,
  loadEnabledClient,
} from './plugin-loader.ts'
export type {
  IndexInjection,
  IndexInjectionPlacement,
  UiClientContribution,
  WebBootBatch,
  WebBootBatchPhase,
  WebBootEntry,
  WebBootGraph,
  WebBootRelease,
} from './types.ts'
export { eapDshBoot } from './vite-plugin.ts'