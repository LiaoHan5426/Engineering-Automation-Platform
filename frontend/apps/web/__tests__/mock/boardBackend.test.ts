import { emptyPrototypeSchema } from '../../src/features/shell/prototypeSchema'
import { randomUUID } from 'node:crypto'
import { expect, it } from 'vite-plus/test'
import { createMockChatBackend } from '../../mock/chatBackend'
import type { BoardTask } from '@eap/runtime-client'
it('observes only scoped mock Tasks and never invents or changes execution records', async () => {
  const api = createMockChatBackend()
  await api.handle('POST', '/board/tasks', {
    requestId: randomUUID(),
    projectId: 'group',
    title: 'draft',
  })
  const before = structuredClone((await api.handle('GET', '/board/tasks?projectId=group')).data)
  expect((await api.handle('GET', '/board/runtime?projectId=group')).data).toMatchObject({
    projectId: 'group',
    taskCount: 1,
    runCount: 0,
    activeRunCount: 0,
    unknownRunCount: 0,
    activeVerificationCount: 0,
    unknownVerificationCount: 0,
    activeWriteCount: 0,
    unknownWriteCount: 0,
    items: [],
    truncated: false,
  })
  expect((await api.handle('GET', '/board/runtime?projectId=other')).data).toMatchObject({
    taskCount: 0,
  })
  expect((await api.handle('GET', '/board/runtime?projectId=')).status).toBe(400)
  expect((await api.handle('GET', '/board/runtime?projectId=' + 'x'.repeat(121))).status).toBe(400)
  expect((await api.handle('POST', '/board/runtime?projectId=group', {})).status).toBe(405)
  expect((await api.handle('GET', '/board/tasks?projectId=group')).data).toEqual(before)
})
it('keeps board project scope and revisions authoritative without simulating a real run', async () => {
  const api = createMockChatBackend()
  const task = (
    await api.handle('POST', '/board/tasks', {
      requestId: randomUUID(),
      goal: 'goal',
      acceptanceCriteria: 'checks',
      projectId: 'group',
      title: 'draft',
    })
  ).data as BoardTask
  expect((await api.handle('GET', '/board/tasks?projectId=other')).data).toEqual({ items: [] })
  expect(
    (
      await api.handle('POST', '/board/tasks/' + task.id, {
        projectId: 'group',
        revision: 2,
        column: 'ready',
      })
    ).status,
  ).toBe(409)
  expect(
    (
      await api.handle('POST', '/board/tasks/' + task.id, {
        projectId: 'group',
        revision: 1,
        column: 'ready',
      })
    ).status,
  ).toBe(200)
  expect(
    (
      await api.handle('POST', '/board/tasks/' + task.id, {
        projectId: 'group',
        revision: 2,
        column: 'running',
      })
    ).status,
  ).toBe(409)
  expect(
    (
      await api.handle('POST', '/board/tasks/' + task.id, {
        projectId: 'group',
        revision: 2,
        column: 'done',
      })
    ).status,
  ).toBe(409)
})
it('persists priority with revision checks and allows initial ready but not initial execution', async () => {
  const api = createMockChatBackend()
  expect(
    (
      await api.handle('POST', '/board/tasks', {
        requestId: randomUUID(),
        goal: 'goal',
        acceptanceCriteria: 'checks',
        projectId: 'group',
        title: 'invalid',
        column: 'running',
      })
    ).status,
  ).toBe(400)
  const task = (
    await api.handle('POST', '/board/tasks', {
      requestId: randomUUID(),
      goal: 'goal',
      acceptanceCriteria: 'checks',
      projectId: 'group',
      title: 'ready draft',
      column: 'ready',
    })
  ).data as BoardTask
  expect(task.column).toBe('ready')
  expect(task.priority).toBe('none')
  expect(
    (
      await api.handle('POST', '/board/tasks/' + task.id, {
        projectId: 'group',
        revision: 1,
        priority: 'urgent',
      })
    ).status,
  ).toBe(400)
  expect(
    (
      await api.handle('POST', '/board/tasks/' + task.id, {
        projectId: 'group',
        revision: 1,
        priority: 'p0',
        notes: 'updated together',
      })
    ).status,
  ).toBe(200)
  const rows = (await api.handle('GET', '/board/tasks?projectId=group')).data as {
    items: BoardTask[]
  }
  expect(rows.items[0]).toMatchObject({
    priority: 'p0',
    notes: 'updated together',
    revision: 2,
    events: ['created', 'notes_updated', 'priority_updated'],
  })
  expect(
    (
      await api.handle('POST', '/board/tasks/' + task.id, {
        projectId: 'group',
        revision: 1,
        priority: 'p2',
      })
    ).status,
  ).toBe(409)
})

it('deduplicates retries after later edits and rejects reusing a request for other content', async () => {
  const api = createMockChatBackend()
  const draft = {
    requestId: randomUUID(),
    projectId: 'group',
    title: 'draft',
    goal: 'goal',
    acceptanceCriteria: 'checks',
  }
  const task = (await api.handle('POST', '/board/tasks', draft)).data as BoardTask
  await api.handle('POST', '/board/tasks/' + task.id, {
    projectId: 'group',
    revision: 1,
    goal: 'edited',
  })
  const retry = await api.handle('POST', '/board/tasks', draft)
  expect(retry.data).toMatchObject({ id: task.id, revision: 2, goal: 'edited' })
  expect((await api.handle('POST', '/board/tasks', { ...draft, title: 'different' })).status).toBe(
    409,
  )
  expect((await api.handle('GET', '/board/tasks?projectId=group')).data).toMatchObject({
    items: [{ id: task.id }],
  })
  expect(
    (
      await api.handle('POST', '/board/tasks/' + task.id, {
        projectId: 'other',
        revision: 2,
        notes: 'bad',
      })
    ).status,
  ).toBe(404)
})
it('reports incomplete preparation and refuses ready without changing the saved draft', async () => {
  const api = createMockChatBackend()
  const draft = { requestId: randomUUID(), projectId: 'group', title: 'draft' }
  expect((await api.handle('POST', '/board/tasks', { ...draft, column: 'ready' })).status).toBe(409)
  const task = (await api.handle('POST', '/board/tasks', draft)).data as BoardTask
  expect(task).toMatchObject({
    preparationIssues: ['goal', 'acceptanceCriteria'],
    allowedColumns: ['planned'],
  })
  expect(
    (
      await api.handle('POST', '/board/tasks/' + task.id, {
        projectId: 'group',
        revision: 1,
        column: 'ready',
      })
    ).status,
  ).toBe(409)
  expect(
    (
      await api.handle('POST', '/board/tasks/' + task.id, {
        projectId: 'group',
        revision: 1,
        column: 'ready',
        goal: 'goal',
        acceptanceCriteria: 'checks',
      })
    ).status,
  ).toBe(200)
  expect(
    (
      await api.handle('POST', '/board/tasks/' + task.id, {
        projectId: 'group',
        revision: 2,
        goal: '',
      })
    ).status,
  ).toBe(409)
})

it('never fabricates verification plans or results for a nonexistent mock Run', async () => {
  const api = createMockChatBackend()
  const task = (
    await api.handle('POST', '/board/tasks', {
      requestId: randomUUID(),
      projectId: 'group',
      title: 'draft',
    })
  ).data as BoardTask
  const route = '/board/tasks/' + task.id + '/runs/' + randomUUID() + '/verification'
  expect(await api.handle('GET', route + '?projectId=group')).toMatchObject({
    status: 404,
    data: { detail: 'BOARD_RUN_NOT_FOUND' },
  })
  expect(
    await api.handle('POST', route + '/plan', { projectId: 'group', workspacePath: '/sample' }),
  ).toMatchObject({ status: 404, data: { detail: 'BOARD_RUN_NOT_FOUND' } })
  expect(
    await api.handle('POST', route, {
      projectId: 'group',
      workspacePath: '/sample',
      planHash: 'hash',
    }),
  ).toMatchObject({ status: 404, data: { detail: 'BOARD_RUN_NOT_FOUND' } })
})
it('never fabricates delivery or acceptance for a mock Run and retains project scope', async () => {
  const api = createMockChatBackend()
  const task = (
    await api.handle('POST', '/board/tasks', {
      requestId: randomUUID(),
      projectId: 'group',
      title: 'draft',
    })
  ).data as BoardTask
  const route = '/board/tasks/' + task.id + '/runs/' + randomUUID() + '/delivery'
  expect(await api.handle('GET', route + '?projectId=group')).toMatchObject({
    status: 404,
    data: { detail: 'BOARD_RUN_NOT_FOUND' },
  })
  for (const suffix of ['', '/decision']) {
    expect(
      await api.handle('POST', route + suffix, {
        projectId: 'group',
        revision: 1,
        applicationRef: { conversationId: randomUUID(), proposalId: randomUUID() },
      }),
    ).toMatchObject({ status: 404, data: { detail: 'BOARD_RUN_NOT_FOUND' } })
    expect(
      await api.handle('POST', route + suffix, { projectId: 'group', revision: 1 }),
    ).toMatchObject({ status: 404, data: { detail: 'BOARD_RUN_NOT_FOUND' } })
    expect(
      await api.handle('POST', route + suffix, { projectId: 'other', revision: 1 }),
    ).toMatchObject({ status: 404, data: { detail: 'BOARD_TASK_NOT_FOUND' } })
  }
  expect(await api.handle('GET', route + '?projectId=other')).toMatchObject({
    status: 404,
    data: { detail: 'BOARD_TASK_NOT_FOUND' },
  })
  expect((await api.handle('GET', '/board/tasks?projectId=group')).data).toMatchObject({
    items: [{ column: 'planned', revision: 1 }],
  })
})
it('links only existing saved versions with project and revision checks', async () => {
  const api = createMockChatBackend()
  const version = (
    await api.handle('POST', '/prototype-versions', {
      requestId: randomUUID(),
      sourceRef: 'builder-alpha',
      title: 'design',
      body: JSON.stringify({
        format: 'eap-prototype-v1',
        schema: {
          ...emptyPrototypeSchema('design'),
          root: {
            id: 'root',
            kind: 'page',
            props: {},
            children: [{ id: 'text', kind: 'text', props: { text: 'saved' }, children: [] }],
          },
        },
      }),
      acceptance: [],
    })
  ).data as { id: string }
  const task = (
    await api.handle('POST', '/board/tasks', {
      requestId: randomUUID(),
      projectId: 'group',
      title: 'draft',
    })
  ).data as BoardTask
  const route = '/board/tasks/' + task.id + '/prototype'
  expect((await api.handle('POST', route, { projectId: 'group', revision: 1 })).status).toBe(400)
  expect(
    (await api.handle('POST', route, { projectId: 'group', revision: 1, versionId: randomUUID() }))
      .status,
  ).toBe(404)
  expect(
    (await api.handle('POST', route, { projectId: 'other', revision: 1, versionId: version.id }))
      .status,
  ).toBe(404)
  expect(
    (await api.handle('POST', route, { projectId: 'group', revision: 1, versionId: version.id }))
      .data,
  ).toMatchObject({ prototypeVersionId: version.id, revision: 2 })
  expect(
    (await api.handle('POST', route, { projectId: 'group', revision: 1, versionId: null })).status,
  ).toBe(409)
  expect(
    (await api.handle('POST', route, { projectId: 'group', revision: 2, versionId: null })).data,
  ).toMatchObject({ prototypeVersionId: null, revision: 3 })
})
