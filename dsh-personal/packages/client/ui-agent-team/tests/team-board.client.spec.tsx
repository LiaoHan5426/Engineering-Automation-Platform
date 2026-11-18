// @vitest-environment jsdom
import { h } from "vue";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { act, cleanup, render } from "../../../test-support/client-runtime/src/vue-test.ts";
import { fireEvent, screen } from "@testing-library/dom";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
import type {
  TeamProjection,
  TeamTaskId,
  TeamTaskView as TeamTask,
} from "@deepseek-ai/dsh-agent-team/client";
import type {
  SessionListState,
  SessionSummary,
} from "@deepseek-ai/dsh-api-session-controller/client";
import { createSnapshotStore } from "@deepseek-ai/dsh-client-store";
import { bindSnapshotSelector, makeTranslate } from "@deepseek-ai/dsh-client-test-runtime";
import { zh as commonZh } from "@deepseek-ai/dsh-client-locale/src/locales/zh.ts";
import { TeamBoard, TeamProgress, type TeamBoardProps } from "../src/client/TeamBoard.tsx";
import { createTeamBoardStore } from "../src/client/team-board-store.ts";
import { zh } from "../src/client/locales.ts";
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const SESSION = "root-session-id" as SessionId;
const TASK_1 = "task-1" as TeamTaskId;
const TASK_2 = "task-2" as TeamTaskId;
const task: TeamTask = {
  id: TASK_1,
  revision: 1,
  subject: "Implement runtime",
  description: "Build the Team runtime",
  status: "in_progress",
  ownerId: SESSION,
  ownerName: "lead",
  blockedBy: [],
  writeScopes: ["src"],
  ready: false,
  writeScopeWarnings: ["write scopes overlap with task-2"],
};
const team: TeamProjection = { enabled: true, tasks: [task] };
type Projections = SessionListState["projectionsBySession"];
function summary(id: SessionId, title?: string): SessionSummary {
  return {
    id,
    ...(title === undefined ? {} : { title }),
    displayTitle: title ?? id,
    running: false,
    retainedBy: {},
    blank: false,
    updatedAt: 0,
  };
}
function bench(
  options: {
    projections?: Projections;
    sessionId?: SessionId;
    byId?: Record<SessionId, SessionSummary>;
    value?: TeamProjection;
  } = {},
) {
  const sessionId = options.sessionId ?? SESSION;
  const byId = options.byId ?? { [SESSION]: summary(SESSION) };
  const sessions = createSnapshotStore<SessionListState>({
    ids: Object.keys(byId) as SessionId[],
    byId,
    phase: "ready",
    projectionsBySession: options.projections ?? {
      [SESSION]: { state: "ready", error: null, values: { agentTeam: options.value ?? team } },
    },
  });
  const useProjection = ((
    _key: "agentTeam",
    selector?: (value: TeamProjection | undefined) => unknown,
  ) =>
    bindSnapshotSelector(sessions)((state) => {
      const value = state.projectionsBySession[sessionId]?.values.agentTeam;
      return selector === undefined ? value : selector(value);
    })) as TeamBoardProps["useProjection"];
  const store = createTeamBoardStore().create();
  const props = {
    sessionId,
    useStore: bindSnapshotSelector(store),
    actions: store.actions,
    renderFactorySlot: (_name: string, p: { onToggle?: () => void; label?: string }) => p.onToggle ? h("button", { onClick: p.onToggle }, p.label) : null,
    useProjection,
    useSessions: bindSnapshotSelector(sessions),
    t: makeTranslate(zh, commonZh),
  } as TeamBoardProps;
  return { props, sessions, store };
}
async function setProjectionSnapshot(
  sessions: ReturnType<typeof bench>["sessions"],
  sessionId: SessionId,
  snapshot: Projections[SessionId],
): Promise<void> {
  await act(() => {
    const current = sessions.getSnapshot();
    sessions.set({
      ...current,
      projectionsBySession: { ...current.projectionsBySession, [sessionId]: snapshot },
    });
  });
}
async function setProjection(
  sessions: ReturnType<typeof bench>["sessions"],
  sessionId: SessionId,
  value: TeamProjection,
): Promise<void> {
  await setProjectionSnapshot(sessions, sessionId, {
    state: "ready",
    error: null,
    values: { agentTeam: value },
  });
}
function row(subject = task.subject): HTMLElement { return screen.getByRole('button', { name: new RegExp(subject, 'u') }) }
describe('Team panel', () => {
  it('hides disabled and empty sections and exposes a failure without requiring tasks', () => {
    let b = bench({ value: { enabled: false, tasks: [] } }); let view = render(h(TeamBoard, b.props)); expect(view.container.textContent).toBe(''); view.unmount()
    b = bench({ value: { enabled: true, tasks: [], failure: 'transport disconnected' } }); view = render(h(TeamBoard, b.props)); expect(view.getByRole('alert').textContent).toContain('transport disconnected')
  })
  it('orders active, pending and reversed completed tasks and excludes deleted rows', () => {
    const b = bench({ value: { ...team, tasks: [
      { ...task, id: 'pending' as TeamTaskId, subject: 'Pending', status: 'pending', ready: true },
      { ...task, id: 'done1' as TeamTaskId, subject: 'Done first', status: 'completed' },
      { ...task, id: 'done2' as TeamTaskId, subject: 'Done second', status: 'completed' },
      task, { ...task, id: 'deleted' as TeamTaskId, subject: 'Deleted', status: 'deleted' },
    ] } })
    const view = render(h(TeamBoard, b.props))
    expect([...view.container.querySelectorAll('[data-team-task]')].map(el => el.getAttribute('data-team-task'))).toEqual([TASK_1, 'pending', 'done2', 'done1'])
    expect(view.queryByText('Deleted')).toBeNull(); expect(view.queryByRole('heading')).toBeNull()
  })
  it('expands description and owner and keeps only one task open', async () => {
    const b = bench({ value: { ...team, tasks: [task, { ...task, id: TASK_2, subject: 'Review', ownerName: 'worker' }] } })
    const view = render(h(TeamBoard, b.props))
    await act(() => fireEvent.click(row())); expect(row().getAttribute('aria-expanded')).toBe('true')
    expect(view.getByText(task.description)).toBeTruthy(); expect(view.getByText('lead')).toBeTruthy()
    await act(() => fireEvent.click(row('Review'))); expect(row().getAttribute('aria-expanded')).toBe('false')
    expect(view.getByText('worker')).toBeTruthy(); expect(view.container.querySelectorAll('[data-team-task-details]')).toHaveLength(1)
  })
  it('announces a pending blocked task without exposing machine ids or write scope warnings', () => {
    const b = bench({ value: { ...team, tasks: [{ ...task, status: 'pending', ready: false }] } })
    const view = render(h(TeamBoard, b.props)); expect(view.getByRole('img', { name: b.props.t('blocked') })).toBeTruthy()
    expect(view.queryByText(TASK_1)).toBeNull(); expect(view.queryByText(task.writeScopeWarnings[0]!)).toBeNull()
  })
  it('folds only more than six tasks and retains unfolding across a remount', async () => {
    const b = bench({ value: { ...team, tasks: Array.from({ length: 7 }, (_, i) => ({ ...task, id: ('task-' + i) as TeamTaskId, subject: 'Task ' + i })) } })
    let view = render(h(TeamBoard, b.props)); expect(view.container.querySelectorAll('[data-team-task]')).toHaveLength(5)
    await act(() => fireEvent.click(view.getByRole('button', { name: b.props.t('list.more', { count: 2 }) })))
    expect(view.container.querySelectorAll('[data-team-task]')).toHaveLength(7); view.unmount()
    view = render(h(TeamBoard, b.props)); expect(view.container.querySelectorAll('[data-team-task]')).toHaveLength(7)
  })
  it('publishes progress separately from the body and follows projection changes', async () => {
    const b = bench(), view = render(h(TeamProgress, b.props))
    expect(view.container.textContent).toContain(b.props.t('progress.active', { count: 1 }))
    await setProjection(b.sessions, SESSION, { enabled: true, tasks: [{ ...task, status: 'completed' }] })
    expect(view.container.textContent).toContain(b.props.t('progress.completed', { count: 1 }))
  })
})
