import { beforeEach, expect, it } from 'vite-plus/test'
import {
  readDeliveryRequest,
  writeDeliveryRequest,
  type PendingDeliveryRequest,
} from '../../../src/features/shell/boardDeliveryRequest'
import { readRunRequest } from '../../../src/features/shell/boardRunRequest'
const values = new Map<string, string>()
const store = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => {
    values.set(key, value)
  },
  removeItem: (key: string) => {
    values.delete(key)
  },
}
const submission = {
  projectId: 'project-a',
  revision: 3,
  workspacePath: 'F:/repo',
  requestId: '12345678-1234-1234-1234-123456789abc',
  paths: ['frontend/App.vue'],
  note: 'literal note',
}
const decision = {
  projectId: submission.projectId,
  revision: 4,
  workspacePath: submission.workspacePath,
  requestId: submission.requestId,
  decisionRequest: {
    projectId: submission.projectId,
    revision: 4,
    requestId: submission.requestId,
    deliveryId: 'delivery-a',
    decision: 'ACCEPT' as const,
    criteriaConfirmed: true,
    previewConfirmed: true,
    previewUrl: 'http://127.0.0.1:5193/',
    comment: 'literal comment',
  },
}
const read = () => readDeliveryRequest(store, 'task-a', 'run-a', 'project-a', 'api-a')
beforeEach(() => values.clear())
it('keeps the exact post-hoc application reference in the request journal', () => {
  const request = {
    ...submission,
    applicationRef: {
      conversationId: submission.requestId,
      proposalId: '22345678-1234-1234-1234-123456789abc',
    },
  }
  writeDeliveryRequest(store, 'task-a', 'run-a', 'api-a', request)
  expect(read()).toEqual(request)
})
it.each([
  null,
  {},
  { conversationId: 'bad', proposalId: submission.requestId },
  { conversationId: submission.requestId, proposalId: submission.requestId, source: 'fake' },
])('rejects malformed stored application references without normalizing them', (applicationRef) => {
  writeDeliveryRequest(store, 'task-a', 'run-a', 'api-a', {
    ...submission,
    applicationRef,
  } as unknown as PendingDeliveryRequest)
  expect(read()).toBeNull()
})
it.each([
  submission,
  decision,
  { ...submission, rejectionCode: 'BOARD_DELIVERY_REQUEST_CONFLICT' },
])('round trips the exact immutable request and conflict state', (request) => {
  expect(writeDeliveryRequest(store, 'task-a', 'run-a', 'api-a', request)).toBe(true)
  expect(read()).toEqual(request)
})
it('isolates task, Run, project, API target and the ordinary Run request journal', () => {
  writeDeliveryRequest(store, 'task-a', 'run-a', 'api-a', submission)
  for (const [task, run, project, scope] of [
    ['task-b', 'run-a', 'project-a', 'api-a'],
    ['task-a', 'run-b', 'project-a', 'api-a'],
    ['task-a', 'run-a', 'project-b', 'api-a'],
    ['task-a', 'run-a', 'project-a', 'api-b'],
  ] as const) {
    expect(readDeliveryRequest(store, task, run, project, scope)).toBeNull()
  }
  expect(readRunRequest(store, 'task-a', 'project-a', 'api-a')).toBeNull()
  writeDeliveryRequest(store, 'task-a', 'run-b', 'api-a', decision)
  writeDeliveryRequest(store, 'task-a', 'run-a', 'api-a', null)
  expect(read()).toBeNull()
  expect(readDeliveryRequest(store, 'task-a', 'run-b', 'project-a', 'api-a')).toEqual(decision)
})
it.each([
  { ...submission, revision: 0 },
  { ...submission, revision: 1.5 },
  { ...submission, requestId: 'not-a-uuid' },
  { ...submission, workspacePath: '' },
  { ...submission, note: null },
  { ...submission, paths: [] },
  { ...submission, paths: ['frontend/App.vue', 'frontend/App.vue'] },
  { ...submission, paths: [' frontend/App.vue'] },
  { ...submission, paths: ['frontend/../secret.ts'] },
  { ...submission, paths: ['backend/Foo.ts'] },
  { ...submission, paths: ['frontend/config.exe'] },
  { ...submission, paths: ['frontend\\App.vue'] },
  { ...submission, paths: [7] },
  { ...submission, paths: Array.from({ length: 9 }, (_, i) => `frontend/File${i}.ts`) },
  { ...submission, rejectionCode: 123 },
  { ...decision, paths: submission.paths, note: submission.note },
  { ...decision, decisionRequest: null },
  ...[
    { deliveryId: '' },
    { projectId: 'other' },
    { requestId: 'different' },
    { revision: 99 },
    { decision: 'OTHER' },
    { criteriaConfirmed: 'yes' },
    { previewConfirmed: null },
    { comment: 7 },
  ].map((change) => ({ ...decision, decisionRequest: { ...decision.decisionRequest, ...change } })),
])('fails closed for malformed persisted payload %# without repairing it', (invalid) => {
  // Seed invalid storage intentionally, bypassing the TypeScript caller contract.
  writeDeliveryRequest(
    store,
    'task-a',
    'run-a',
    'api-a',
    invalid as unknown as PendingDeliveryRequest,
  )
  expect(read()).toBeNull()
})
it('handles corrupt JSON and inaccessible storage without issuing any request', () => {
  writeDeliveryRequest(store, 'task-a', 'run-a', 'api-a', submission)
  for (const key of values.keys()) values.set(key, '{bad json')
  expect(read()).toBeNull()
  expect(readDeliveryRequest(null, 'task-a', 'run-a', 'project-a', 'api-a')).toBeNull()
  const broken = {
    getItem: () => {
      throw new Error('denied')
    },
    setItem: () => {
      throw new Error('quota')
    },
    removeItem: () => {
      throw new Error('denied')
    },
  }
  expect(readDeliveryRequest(broken, 'task-a', 'run-a', 'project-a', 'api-a')).toBeNull()
  expect(writeDeliveryRequest(broken, 'task-a', 'run-a', 'api-a', submission)).toBe(false)
  expect(writeDeliveryRequest(broken, 'task-a', 'run-a', 'api-a', null)).toBe(false)
})
