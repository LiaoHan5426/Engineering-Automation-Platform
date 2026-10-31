import { randomUUID } from 'node:crypto';
import type { BoardTask } from '@eap/runtime-client';

/** Contract simulation only. State is lost when the mock server restarts. */
export function createBoardBackend() {
  const tasks: BoardTask[] = [];
  const requests = new Map<string, { fingerprint: string; task: BoardTask }>();
  const result = (status: number, data: unknown) => ({ status, data });
  const error = (status: number, detail: string) => result(status, { detail });
  const validText = (value: unknown, limit: number) => typeof value === 'string' && value.length <= limit;
  function present(task: BoardTask) {
    task.preparationIssues = [];
    if (!task.goal.trim()) task.preparationIssues.push('goal');
    if (!task.acceptanceCriteria.trim()) task.preparationIssues.push('acceptanceCriteria');
    task.allowedColumns = !['planned', 'ready'].includes(task.column) ? [] : task.preparationIssues.length ? ['planned'] : ['planned', 'ready'];
    return task;
  }
  return {
    handle(method: string, url: URL, body: Record<string, unknown>) {
      const path = url.pathname;
      const runPath = /^\/board\/tasks\/([^/]+)\/runs$/.exec(path);
      if (runPath) {
        const projectId = method === 'GET' ? url.searchParams.get('projectId') : body.projectId;
        if (!tasks.some(task => task.id === runPath[1] && task.projectId === projectId)) return error(404, 'BOARD_TASK_NOT_FOUND');
        if (method === 'POST') return error(503, 'MOCK_RUN_NOT_AVAILABLE');
        if (method === 'GET') return result(200, { availability: { allowed: false, workspacePath: '', workspaceLabel: '', reason: 'MOCK_RUN_NOT_AVAILABLE' }, items: [] });
      }
      if (path === '/board/tasks' && method === 'GET') {
        if (!url.searchParams.get('projectId')?.trim() || url.searchParams.get('projectId')!.length > 120) return error(400, 'INVALID_BOARD_FIELD');
        return result(200, { items: tasks.filter(task => task.projectId === url.searchParams.get('projectId')).slice(0, 200).map(present) });
      }
      if (path === '/board/tasks' && method === 'POST') {
        if (!validText(body.projectId, 120) || !String(body.projectId).trim() || !validText(body.title, 200) || !String(body.title).trim()) return error(400, 'INVALID_BOARD_FIELD');
        const column = body.column ?? 'planned';
        if (!['planned', 'ready'].includes(String(column))) return error(400, 'INVALID_BOARD_INITIAL_COLUMN');
        const goal = body.goal ?? '', acceptanceCriteria = body.acceptanceCriteria ?? '', sessionId = body.sessionId ?? '';
        if (!validText(goal, 4000) || !validText(acceptanceCriteria, 4000) || !validText(sessionId, 120)) return error(400, 'BOARD_TEXT_TOO_LONG');
        if (typeof body.requestId !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.requestId)) return error(400, 'BOARD_REQUEST_ID_REQUIRED');
        if (column === 'ready' && (!String(goal).trim() || !String(acceptanceCriteria).trim())) return error(409, 'BOARD_PREPARATION_REQUIRED');
        const fingerprint = JSON.stringify([body.projectId, String(body.title).trim(), sessionId, column, goal, acceptanceCriteria]);
        const key = JSON.stringify([body.projectId, body.requestId]);
        const prior = requests.get(key);
        if (prior) return prior.fingerprint === fingerprint ? result(200, present(prior.task)) : error(409, 'BOARD_REQUEST_CONFLICT');
        const task: BoardTask = { id: randomUUID(), projectId: String(body.projectId), title: String(body.title).trim(), column: column as BoardTask['column'], goal: String(goal), acceptanceCriteria: String(acceptanceCriteria), sessionId: String(sessionId), notes: '', priority: 'none', revision: 1, events: ['created'], executionActive: false, preparationIssues: [], allowedColumns: [] };
        tasks.unshift(task); requests.set(key, { fingerprint, task });
        return result(200, present(task));
      }
      if (path.startsWith('/board/tasks/') && method === 'POST') {
        if (!validText(body.projectId, 120) || !String(body.projectId).trim() || !Number.isSafeInteger(body.revision) || Number(body.revision) < 1) return error(400, 'INVALID_BOARD_FIELD');
        const task = tasks.find(item => item.id === path.slice('/board/tasks/'.length) && item.projectId === body.projectId);
        if (!task) return error(404, 'BOARD_TASK_NOT_FOUND');
        if (body.revision !== task.revision) return error(409, 'BOARD_REVISION_CONFLICT');
        const target = body.column ?? task.column;
        if (!['planned', 'ready'].includes(task.column) || !['planned', 'ready'].includes(String(target))) return error(409, 'BOARD_EXECUTION_EVIDENCE_REQUIRED');
        const notes = body.notes ?? task.notes, goal = body.goal ?? task.goal, acceptanceCriteria = body.acceptanceCriteria ?? task.acceptanceCriteria, priority = body.priority ?? task.priority;
        if (![notes, goal, acceptanceCriteria].every(value => validText(value, 4000))) return error(400, 'BOARD_TEXT_TOO_LONG');
        if (!['none', 'p0', 'p1', 'p2'].includes(String(priority))) return error(400, 'INVALID_BOARD_PRIORITY');
        if (target === 'ready' && (!String(goal).trim() || !String(acceptanceCriteria).trim())) return error(409, 'BOARD_PREPARATION_REQUIRED');
        const events: string[] = [];
        if (target !== task.column) events.push(String(target));
        if (notes !== task.notes) events.push('notes_updated');
        if (priority !== task.priority) events.push('priority_updated');
        if (goal !== task.goal || acceptanceCriteria !== task.acceptanceCriteria) events.push('preparation_updated');
        if (events.length) { Object.assign(task, { column: target, notes, goal, acceptanceCriteria, priority, revision: task.revision + 1 }); task.events.push(...events); }
        return result(200, present(task));
      }
      return null;
    },
  };
}
