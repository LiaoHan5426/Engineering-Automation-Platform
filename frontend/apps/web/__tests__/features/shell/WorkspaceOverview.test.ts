// @vitest-environment happy-dom
import { createApp, nextTick } from 'vue'
import { expect, it, vi } from 'vite-plus/test'
import { runtimeApi } from '@eap/runtime-client'
import WorkspaceOverview from '../../../src/features/shell/WorkspaceOverview.vue'
import { i18n } from '../../../src/lib/i18n'

it('shows recorded chat usage and links only unfinished tasks in the requested project', async () => {
  const stats = vi.spyOn(runtimeApi, 'stats').mockResolvedValue({
    windowDays: 7, chat: { newConversations: 4, sentMessages: 9 },
    tasksTotal: 0, tasksInWindow: 0, observationsInWindow: 0, byStatus: {}, byDecision: {},
    model: { recordedRuns: 0, calls: 0, share: null }, deterministicShare: null, source: 'test', note: '',
  })
  const task = {
    id: '12345678-1234-1234-1234-123456789abc', projectId: 'local-eap',
    title: 'Open task', notes: '', sessionId: '', revision: 1, events: [],
    priority: 'none' as const, goal: '', acceptanceCriteria: '', executionActive: false,
    prototypeVersionId: null, preparationIssues: [], allowedColumns: [],
  }
  const board = vi.spyOn(runtimeApi, 'boardTasks').mockResolvedValue({
    items: [
      { ...task, column: 'ready' },
      { ...task, title: 'Finished task', column: 'done' },
      { ...task, title: 'Other project task', projectId: 'other', column: 'ready' },
    ],
  })
  const root = document.createElement('div')
  const app = createApp(WorkspaceOverview, { boardEnabled: true }).use(i18n)
  app.mount(root)
  try {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
    expect(Array.from(root.querySelectorAll('dd'), (node) => node.textContent)).toEqual(['4', '9'])
    const links = Array.from(root.querySelectorAll('a'))
    expect(links.map((link) => link.textContent?.trim())).toEqual(['Open task'])
    expect(links[0]?.getAttribute('href')).toBe('#board?projectId=local-eap&taskId=' + task.id)
    expect(board).toHaveBeenCalledWith('local-eap')
  } finally {
    app.unmount()
    stats.mockRestore()
    board.mockRestore()
  }
})
