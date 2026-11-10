// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test'
import { createApp, h, nextTick, ref, type App } from 'vue'
import {
  runtimeApi,
  type BoardTask,
  type BoardCodeCandidates,
  type CodeProposalState,
} from '@eap/runtime-client'
import { i18n } from '../../../src/lib/i18n'
import Panel from '../../../src/features/shell/BoardCodeCandidates.vue'
vi.mock('../../../src/components/ProposalDiffView.vue', () => ({
  default: {
    props: ['before', 'after'],
    template: '<pre data-testid="fixture-diff">{{ before }} → {{ after }}</pre>',
  },
}))
const task = {
  id: crypto.randomUUID(),
  projectId: 'task-project',
  revision: 2,
  executionActive: false,
} as BoardTask
const state = (): CodeProposalState => ({
  proposal: {
    id: crypto.randomUUID(),
    conversationId: crypto.randomUUID(),
    workspace: 'J:/repo',
    summary: 'Candidate',
    files: [
      { path: 'frontend/Page.vue', before: 'before', content: 'after', baseHash: 'b'.repeat(64) },
    ],
    applied: false,
    writeAllowed: true,
    verification: 'not_requested',
    generation: {
      companionFiles: [],
      id: crypto.randomUUID(),
      targetPath: 'frontend/Page.vue',
      baseHash: 'b'.repeat(64),
      capturedAt: 'now',
      prototypeVersionId: '',
      prototypeContentHash: '',
      taskBinding: { taskId: task.id, projectId: task.projectId, revision: task.revision },
    },
  },
  status: 'PROPOSED',
  result: null,
  reason: '',
})
let saved: CodeProposalState, app: App | undefined, root: HTMLElement
const current = ref(task),
  disabled = ref(false)
const button = (id: string) =>
  document.querySelector<HTMLButtonElement>('[data-testid=' + id + ']')!
const listing = (): BoardCodeCandidates => ({
  taskId: task.id,
  projectId: task.projectId,
  currentRevision: current.value.revision,
  workspacePath: 'J:/repo',
  truncated: false,
  items: [
    {
      id: saved.proposal.id,
      conversationId: saved.proposal.conversationId,
      generationId: saved.proposal.generation!.id,
      targetPath: 'frontend/Page.vue',
      taskRevision: 2,
      fileCount: saved.proposal.files.length,
      status: saved.status,
      writeAllowed: true,
      createdAt: 'now',
    },
  ],
})
beforeEach(() => {
  saved = state()
  current.value = task
  disabled.value = false
  vi.spyOn(runtimeApi, 'boardCodeCandidates').mockImplementation(async () => listing())
  vi.spyOn(runtimeApi, 'boardCodeCandidate').mockImplementation(async () =>
    JSON.parse(JSON.stringify(saved)),
  )
  vi.spyOn(runtimeApi, 'applyBoardCodeCandidate').mockImplementation(async () => {
    const result = {
      id: saved.proposal.id,
      written: ['frontend/Page.vue'],
      verification: 'not_requested',
      checks: [],
      status: 'APPLIED',
      afterHash: 'a'.repeat(64),
      reason: '',
    }
    saved = { ...saved, status: 'APPLIED', result }
    return result
  })
  vi.spyOn(runtimeApi, 'refuseBoardCodeCandidate').mockImplementation(async () => {
    saved = { ...saved, status: 'REFUSED' }
    return saved
  })
  vi.spyOn(runtimeApi, 'codeProposal').mockRejectedValue(
    new Error('Chat session must not be required'),
  )
  vi.spyOn(runtimeApi, 'applyCodeProposal').mockRejectedValue(new Error('Do not use session apply'))
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  vi.restoreAllMocks()
})
async function mount() {
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({ render: () => h(Panel, { task: current.value, disabled: disabled.value }) })
  app.use(i18n).mount(root)
  await nextTick()
}
async function review() {
  button('board-code-refresh').click()
  await vi.waitFor(() => expect(button('board-code-open')).not.toBeNull())
  button('board-code-open').click()
  await vi.waitFor(() => expect(button('proposal-apply')).not.toBeNull())
}
it('recovers and reviews persistent task candidates without querying or recreating a Chat session', async () => {
  await mount()
  expect(runtimeApi.boardCodeCandidates).not.toHaveBeenCalled()
  await review()
  expect(root.textContent).toContain('before → after')
  expect(runtimeApi.codeProposal).not.toHaveBeenCalled()
  expect(runtimeApi.applyCodeProposal).not.toHaveBeenCalled()
  expect(runtimeApi.applyBoardCodeCandidate).not.toHaveBeenCalled()
  await nextTick()
  await nextTick()
  expect(runtimeApi.boardCodeCandidate).toHaveBeenCalledTimes(2)
})
it('reviews the entire declared graph and blocks a companion whose baseline differs', async () => {
  saved.proposal.files.push({
    path: 'frontend/Part.vue',
    before: null,
    content: 'new part',
    baseHash: 'absent',
  })
  saved.proposal.generation!.companionFiles = [{ path: 'frontend/Part.vue', baseHash: 'absent' }]
  await mount()
  await review()
  expect(root.querySelectorAll('[data-testid=fixture-diff]')).toHaveLength(2)
  saved.proposal.files[1]!.baseHash = 'a'.repeat(64)
  button('board-code-refresh').click()
  await vi.waitFor(() => expect(root.textContent).toContain('写操作暂停'))
  expect(button('proposal-apply').disabled).toBe(true)
})
it('explicitly confirms task-owned application and reconciles a lost response with a read', async () => {
  const apply = vi.mocked(runtimeApi.applyBoardCodeCandidate)
  apply.mockImplementationOnce(async () => {
    saved = {
      ...saved,
      status: 'APPLIED',
      result: {
        id: saved.proposal.id,
        written: ['frontend/Page.vue'],
        verification: 'not_requested',
        checks: [],
        status: 'APPLIED',
        afterHash: 'a'.repeat(64),
        reason: '',
      },
    }
    throw new Error('response lost')
  })
  await mount()
  await review()
  expect(button('proposal-apply').disabled).toBe(true)
  const consent = root.querySelector<HTMLInputElement>(
    '[data-testid=proposal-application] input[type=checkbox]',
  )!
  consent.click()
  await nextTick()
  expect(button('proposal-apply').disabled).toBe(false)
  button('proposal-apply').click()
  await vi.waitFor(() =>
    expect(root.querySelector('[data-testid=proposal-status]')?.textContent).toContain(
      '已写入并记录',
    ),
  )
  expect(root.querySelector('li')?.textContent).toContain('已写入并记录')
  expect(apply).toHaveBeenCalledTimes(1)
  expect(apply).toHaveBeenCalledWith(task.id, saved.proposal.id, {
    projectId: task.projectId,
    revision: task.revision,
    confirmed: true,
  })
  expect(runtimeApi.applyCodeProposal).not.toHaveBeenCalled()
})
it('permits explicit refusal of a stale candidate but never applies it', async () => {
  current.value = { ...task, revision: 3 }
  await mount()
  await review()
  const consent = root.querySelector<HTMLInputElement>(
    '[data-testid=proposal-application] input[type=checkbox]',
  )!
  expect(consent.disabled).toBe(true)
  expect(button('proposal-apply').disabled).toBe(true)
  button('board-code-refuse').click()
  await nextTick()
  const confirm = [...document.querySelectorAll<HTMLButtonElement>('[role=dialog] button')].find(
    (node) => node.textContent === '拒绝此源码候选',
  )!
  confirm.click()
  await vi.waitFor(() => expect(runtimeApi.refuseBoardCodeCandidate).toHaveBeenCalledOnce())
  await vi.waitFor(() => expect(button('board-code-refuse')).toBeNull())
  expect(root.querySelector('li')?.textContent).toContain('已人工拒绝')
  expect(runtimeApi.applyBoardCodeCandidate).not.toHaveBeenCalled()
})
it('retains previous evidence read-only when catalog refresh fails', async () => {
  await mount()
  await review()
  vi.mocked(runtimeApi.boardCodeCandidates).mockRejectedValue(new Error('offline'))
  button('board-code-refresh').click()
  await vi.waitFor(() => expect(root.textContent).toContain('写操作暂停'))
  expect(root.textContent).toContain('before → after')
  expect(button('board-code-open').disabled).toBe(true)
  expect(button('proposal-apply').disabled).toBe(true)
})
it('rejects another task detail and drops reads that arrive after the task identity changes', async () => {
  await mount()
  button('board-code-refresh').click()
  await vi.waitFor(() => expect(button('board-code-open')).not.toBeNull())
  vi.mocked(runtimeApi.boardCodeCandidate).mockResolvedValue({
    ...saved,
    proposal: {
      ...saved.proposal,
      generation: {
        companionFiles: [],
        ...saved.proposal.generation!,
        taskBinding: { projectId: 'other', taskId: task.id, revision: 2 },
      },
    },
  })
  button('board-code-open').click()
  await vi.waitFor(() => expect(root.textContent).toContain('写操作暂停'))
  expect(root.querySelector('[data-testid=board-code-review]')).toBeNull()
  let finish!: (page: BoardCodeCandidates) => void
  vi.mocked(runtimeApi.boardCodeCandidates).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  button('board-code-refresh').click()
  await nextTick()
  const old = listing()
  current.value = { ...task, id: crypto.randomUUID() }
  await nextTick()
  finish(old)
  await nextTick()
  await nextTick()
  expect(button('board-code-open')).toBeNull()
})
