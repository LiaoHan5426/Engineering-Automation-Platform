import { reactive } from 'vue';

/** Navigation state only. Never stores repository grants or execution evidence. */
export const scenarioWorkspaceState = reactive({
  view: 'list' as 'list' | 'detail' | 'workflow',
  detailTab: 'basic' as 'basic' | 'tools' | 'skills' | 'mcp',
  workflowTab: 'versions' as 'versions' | 'preparation',
  versionId: '',
});

export function resetScenarioWorkspaceState() {
  scenarioWorkspaceState.view = 'list';
  scenarioWorkspaceState.detailTab = 'basic';
  scenarioWorkspaceState.workflowTab = 'versions';
  scenarioWorkspaceState.versionId = '';
}
