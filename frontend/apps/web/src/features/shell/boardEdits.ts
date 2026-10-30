import type { BoardTask } from '@eap/runtime-client';
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type BoardEdit = { notes: string; priority: BoardTask['priority']; revision: number };
const key = (id: string, mock: boolean) => `${mock ? 'mock.' : ''}eap.board-edit.v1.${id}`;
export function readBoardEdit(store: Store | null, id: string, mock: boolean): BoardEdit | null {
  try {
    const value = JSON.parse(store?.getItem(key(id, mock)) ?? 'null');
    if (!value || typeof value.notes !== 'string' || value.notes.length > 4000 || !['none', 'p0', 'p1', 'p2'].includes(value.priority) || !Number.isSafeInteger(value.revision)) return null;
    return value;
  } catch { return null; }
}
/** Local unsent draft only; cannot change a task's saved revision or execution state. */
export function writeBoardEdit(store: Store | null, id: string, mock: boolean, draft: BoardEdit | null) {
  try { if (draft) store?.setItem(key(id, mock), JSON.stringify(draft)); else store?.removeItem(key(id, mock)); } catch { /* unavailable browser storage does not trigger backend writes */ }
}
