import { reactive, watch } from 'vue'

const SELECTION_KEY = 'eap.scenario.selected-version.v1'
function restoredVersion() {
  try {
    return sessionStorage.getItem(SELECTION_KEY)?.slice(0, 120) ?? ''
  } catch {
    return ''
  }
}

/** Navigation state only. Never stores repository grants or execution evidence. */
export const scenarioWorkspaceState = reactive({
  view: 'list' as 'list' | 'detail' | 'workflow',
  detailTab: 'basic' as 'basic' | 'tools' | 'skills' | 'mcp',
  workflowTab: 'versions' as 'versions' | 'preparation',
  versionId: restoredVersion(),
})
// A remembered ID is a selection only; callers still re-read and validate the server version.
watch(
  () => scenarioWorkspaceState.versionId,
  (value) => {
    try {
      sessionStorage.setItem(SELECTION_KEY, value)
    } catch {
      /* Selection caching is optional. */
    }
  },
  { flush: 'sync' },
)

export function resetScenarioWorkspaceState() {
  scenarioWorkspaceState.view = 'list'
  scenarioWorkspaceState.detailTab = 'basic'
  scenarioWorkspaceState.workflowTab = 'versions'
  scenarioWorkspaceState.versionId = ''
}
