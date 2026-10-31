import type { BoardTask, BoardTaskDraft } from '@eap/runtime-client';
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type BoardEdit = { notes: string; priority: BoardTask['priority']; revision: number; goal: string; acceptanceCriteria: string };
const key = (id: string, mock: boolean) => `${mock ? 'mock.' : ''}eap.board-edit.v1.${id}`;
export function readBoardEdit(store: Store | null, id: string, mock: boolean): BoardEdit | null {
  try {
    const value = JSON.parse(store?.getItem(key(id, mock)) ?? 'null');
    if (!value || typeof value.notes !== 'string' || value.notes.length > 4000 || !['none', 'p0', 'p1', 'p2'].includes(value.priority) || !Number.isSafeInteger(value.revision)) return null;
    if (value.goal !== undefined && (typeof value.goal !== 'string' || value.goal.length > 4000)) return null;
    if (value.acceptanceCriteria !== undefined && (typeof value.acceptanceCriteria !== 'string' || value.acceptanceCriteria.length > 4000)) return null;
    return { ...value, goal: value.goal ?? '', acceptanceCriteria: value.acceptanceCriteria ?? '' };
  } catch { return null; }
}
/** Local unsent draft only; cannot change a task's saved revision or execution state. */
export function writeBoardEdit(store: Store | null, id: string, mock: boolean, draft: BoardEdit | null) {
  try { if (draft) store?.setItem(key(id, mock), JSON.stringify(draft)); else store?.removeItem(key(id, mock)); } catch { /* unavailable browser storage does not trigger backend writes */ }
}

const createKey = (projectId: string, mock: boolean) => `${mock ? 'mock.' : ''}eap.board-create.v1.${projectId}`;
export function readBoardCreate(store: Store | null, projectId: string, mock: boolean): BoardTaskDraft | null {
  try {
    const value = JSON.parse(store?.getItem(createKey(projectId, mock)) ?? 'null');
    if (!value || value.projectId !== projectId || !['planned', 'ready'].includes(value.column)) return null;
    for (const [key, limit] of [['title', 200], ['sessionId', 120], ['goal', 4000], ['acceptanceCriteria', 4000]] as const) {
      if (typeof value[key] !== 'string' || value[key].length > limit) return null;
    }
    if (!value.title.trim() || typeof value.requestId !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value.requestId)) return null;
    return value;
  } catch { return null; }
}
/** Preserve the exact request across route changes/reload until its outcome is confirmed. */
export function writeBoardCreate(store: Store | null, projectId: string, mock: boolean, draft: BoardTaskDraft | null): boolean {
  try {
    if (!store) return false;
    if (draft) store.setItem(createKey(projectId, mock), JSON.stringify(draft)); else store.removeItem(createKey(projectId, mock));
    return true;
  } catch { return false; }
}
