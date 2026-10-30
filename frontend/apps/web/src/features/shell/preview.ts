import { reactive } from 'vue';
import type { TaskContext } from '@eap/runtime-client';
import { workbench, type BoardColumn, type WorkMode } from './workbench';

export const previewProjects = [
  { id: 'eap-demo', name: 'EAP', directory: 'frontend/apps/web' },
  { id: 'office-demo', name: 'Office', directory: 'documents' },
] as const;
export type PreviewChange = { path: string; before: string; after: string };
export type PreviewSession = {
  id: string; mode: WorkMode; projectId: string; title: string; draft: string; model: string; execution: 'chat' | 'plan' | 'agent';
  context: TaskContext; turns: Array<{ role: 'user' | 'assistant'; text: string; model: string }>;
  changes: PreviewChange[]; stage: 'idle' | 'review' | 'acceptance' | 'accepted' | 'rejected';
  resources: string[];
};
export type PreviewTask = { id: string; sessionId: string; projectId: string; title: string; column: BoardColumn; notes: string; events: string[] };

/** Local fixtures only: no API, filesystem, model or timer side effects. */
export function createPreview() {
  let sequence = 0;
  const state = reactive({ activeId: '', projectId: 'eap-demo', sessions: [] as PreviewSession[], tasks: [] as PreviewTask[] });
  function create(mode: WorkMode, projectId = state.projectId) {
    const item: PreviewSession = {
      id: `preview-${++sequence}`, mode, projectId, title: '', draft: '', model: 'reasoning-demo', execution: 'chat',
      context: { mode: 'chat', expert: 'general', instructions: '', reasoning: 'default', approval: 'review', files: [], prototypeVersionId: '', targetPath: '' },
      turns: [], changes: [], stage: 'idle', resources: [],
    };
    state.sessions.push(item); state.activeId = item.id; state.projectId = projectId;
    return state.sessions.find(value => value.id === item.id)!;
  }
  function select(id: string) {
    const item = state.sessions.find(value => value.id === id);
    if (item) { state.activeId = id; state.projectId = item.projectId; }
    return item;
  }
  function current(mode: WorkMode = workbench.workMode) {
    return state.sessions.find(item => item.id === state.activeId && item.mode === mode)
      ?? select(state.sessions.find(item => item.mode === mode && item.projectId === state.projectId)?.id ?? '') ?? create(mode);
  }
  function project(id: string, mode: WorkMode) {
    if (!previewProjects.some(item => item.id === id)) return;
    state.projectId = id;
    return select(state.sessions.find(item => item.projectId === id && item.mode === mode)?.id ?? '') ?? create(mode, id);
  }
  function task(item: PreviewSession) {
    const existing = state.tasks.find(value => value.sessionId === item.id); if (existing) return existing;
    const value: PreviewTask = { id: `preview-task-${++sequence}`, sessionId: item.id, projectId: item.projectId, title: item.title || item.draft.slice(0, 32) || 'EAP UI', column: 'planned', notes: '', events: ['created'] };
    state.tasks.push(value); return state.tasks.find(row => row.id === value.id)!;
  }
  function move(id: string, target: BoardColumn) {
    const item = state.tasks.find(value => value.id === id); if (!item) return false;
    if (target === 'running') return false;
    const allowed: Record<BoardColumn, BoardColumn[]> = { planned: ['ready'], ready: ['planned'], running: ['ready', 'acceptance'], acceptance: [], done: [] };
    if (!allowed[item.column].includes(target)) return false;
    item.column = target; item.events.push(target); return true;
  }
  return { state, create, current, select, project, task, move };
}
export const preview = createPreview();
