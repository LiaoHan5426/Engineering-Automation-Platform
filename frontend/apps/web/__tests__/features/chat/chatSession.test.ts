import { describe, expect, it } from 'vite-plus/test'
import { createChatSession, type ChatApi } from '../../../src/features/chat/chatSession'
import type {
  AiMessageResult,
  AiStatus,
  ContextBudgetObservation,
  ChatGraph,
  ChatMessageNode,
  ChatTurn,
} from '@eap/runtime-client'

/**
 * Test-only projection: seeded turns live in a localStorage snapshot, but the product now reads
 * sent messages from the backend graph. This adapter keeps those session tests meaningful by
 * serving the seeded turns through the graph API, carrying the rich turn for evidence assertions.
 */
function graphApiFromStored(getSnapshot: () => string): Pick<ChatApi, 'conversationGraph'> {
  return {
    conversationGraph: async (id: string): Promise<ChatGraph> => {
      let turns: ChatTurn[] = []
      try {
        const parsed = getSnapshot() ? JSON.parse(getSnapshot()) : null
        turns = parsed?.transcripts?.[id] ?? []
      } catch {
        turns = []
      }
      const all: ChatMessageNode[] = turns.map(
        (turn, index) =>
          ({
            id: turn.nodeId ?? `${id}-node-${index}`,
            parentId: turn.parentId ?? (index > 0 ? `${id}-node-${index - 1}` : null),
            role: turn.role === 'user' ? 'USER' : 'ASSISTANT',
            version: 1,
            text: turn.text,
            executionId: turn.executionId ?? null,
            sequence: index + 1,
            ...({ _turn: turn } as Record<string, unknown>),
          }) as ChatMessageNode,
      )
      return { conversationId: id, path: all, all }
    },
  }
}

function status(state: AiStatus['state'] = 'disabled'): AiStatus {
  return {
    state,
    provider: 'none',
    model: '',
    configurationRevision: 'rev',
    lastObservedAt: null,
    errorCode: '',
    tools: { git_status: false },
    workspaceLabel: 'ws-abc',
  }
}

function result(partial: Partial<AiMessageResult> = {}): AiMessageResult {
  return {
    executionId: 'exec-1',
    answer: 'real',
    error: '',
    status: 'SUCCEEDED',
    approval: 'NOT_REQUIRED',
    verification: 'UNVERIFIED',
    toolEvents: [],
    artifactError: '',
    artifacts: [],
    ...partial,
  }
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  let reject: (reason: unknown) => void = () => {}
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

describe('消息版本浏览', () => {
  it('显示兄弟版本并记住各分支后续，浏览只读且保留草稿', async () => {
    const nodes: ChatMessageNode[] = [
      { id: 'q', parentId: null, role: 'USER', version: 1, text: '问题', sequence: 1 },
      { id: 'a1', parentId: 'q', role: 'ASSISTANT', version: 1, text: '旧回答', sequence: 2 },
      { id: 'a2', parentId: 'q', role: 'ASSISTANT', version: 2, text: '新回答', sequence: 3 },
      { id: 'q2', parentId: 'a1', role: 'USER', version: 1, text: '旧分支后续', sequence: 4 },
    ]
    const reads: Array<string | undefined> = []
    const session = createChatSession({
      aiStatus: async () => status(),
      openAiConversation: async () => ({ conversationId: 'c', workspaceLabel: '', memory: '' }),
      sendAiMessage: async () => {
        throw new Error('浏览不得发送')
      },
      conversationGraph: async (id, leaf) => {
        reads.push(leaf)
        const path = leaf === 'q2' ? [nodes[0]!, nodes[1]!, nodes[3]!] : [nodes[0]!, nodes[2]!]
        return { conversationId: id, path, all: nodes }
      },
    })
    await session.openConversation()
    await session.loadGraph('c')
    session.draft.value = '未发送草稿'
    expect(session.messageVersions('a2').map((n) => n.id)).toEqual(['a1', 'a2'])
    await session.selectMessageVersion('a1')
    expect(session.turns.value.at(-1)?.text).toBe('旧分支后续')
    await session.selectMessageVersion('a2')
    await session.selectMessageVersion('a1')
    expect(reads).toEqual([undefined, 'q2', 'a2', 'q2'])
    expect(session.draft.value).toBe('未发送草稿')
  })
})

describe('消息图读取恢复', () => {
  const graph = (id: string, text = id): ChatGraph => ({
    conversationId: id,
    path: [{ id: `${id}-user`, parentId: null, role: 'USER', version: 1, text, sequence: 1 }],
    all: [],
  })
  function setup(conversationGraph: NonNullable<ChatApi['conversationGraph']>) {
    let serial = 0
    let sends = 0
    const session = createChatSession({
      aiStatus: async () => status(),
      openAiConversation: async () => ({
        conversationId: `c${++serial}`,
        workspaceLabel: '',
        memory: '',
      }),
      conversationGraph,
      sendAiMessage: async () => {
        sends++
        return result()
      },
    })
    return { session, sends: () => sends }
  }
  it('首次读取失败仍选择目标并保留其草稿，重试只读取消息', async () => {
    let failed = true
    const { session, sends } = setup(async (id) => {
      if (failed) throw new Error('offline')
      return graph(id)
    })
    await session.openConversation()
    session.draft.value = '独立草稿'
    session.beginDraft()
    await session.selectConversation('c1')
    expect(session.conversationId.value).toBe('c1')
    expect(session.graphError.value).toBe(true)
    expect(session.draft.value).toBe('独立草稿')
    failed = false
    await session.retryGraph()
    expect(session.graphError.value).toBe(false)
    expect(session.turns.value[0]?.text).toBe('c1')
    expect(session.draft.value).toBe('独立草稿')
    expect(sends()).toBe(0)
  })
  it('启动恢复首次读取失败可重试且不会误报本地存储错误', async () => {
    let fail = true
    const snapshot = JSON.stringify({
      version: 1,
      activeId: 'saved',
      items: [
        {
          id: 'saved',
          title: '历史',
          draft: '保留草稿',
          archived: false,
          workspaceLabel: '',
          memory: '',
          connectionId: null,
        },
      ],
      transcripts: {},
    })
    const session = createChatSession(
      {
        aiStatus: async () => status(),
        openAiConversation: async () => {
          throw new Error('不得创建')
        },
        sendAiMessage: async () => {
          throw new Error('不得发送')
        },
        conversationGraph: async (id) => {
          if (fail) throw new Error('offline')
          return graph(id)
        },
      },
      { getItem: () => snapshot, setItem: () => {} },
    )
    await session.restoreLastConversation()
    expect(session.conversationId.value).toBe('saved')
    expect(session.graphError.value).toBe(true)
    expect(session.storageError.value).toBe(false)
    expect(session.draft.value).toBe('保留草稿')
    fail = false
    await session.retryGraph()
    expect(session.turns.value[0]?.text).toBe('saved')
  })
  it('A/B/A切换后旧A失败不能污染新A内容和状态', async () => {
    const stale = deferred<ChatGraph>()
    let reads = 0
    const { session } = setup(async (id) => (++reads === 1 ? stale.promise : graph(id, '新内容')))
    await session.openConversation()
    await session.openConversation()
    const first = session.selectConversation('c1')
    await session.selectConversation('c2')
    await session.selectConversation('c1')
    stale.reject(new Error('旧失败'))
    await first
    expect(session.graphError.value).toBe(false)
    expect(session.graphLoading.value).toBe(false)
    expect(session.turns.value[0]?.text).toBe('新内容')
  })
  it('读取完成不能将新草稿切回旧会话', async () => {
    const stale = deferred<ChatGraph>()
    const { session } = setup(async () => stale.promise)
    await session.openConversation()
    await session.openConversation()
    const first = session.selectConversation('c1')
    session.beginDraft()
    session.draft.value = '新草稿'
    stale.resolve(graph('c1'))
    await first
    expect(session.conversationId.value).toBeNull()
    expect(session.draft.value).toBe('新草稿')
    expect(session.graphLoading.value).toBe(false)
    expect(session.graphError.value).toBe(false)
  })
  it('刷新失败保留旧消息和草稿，同一会话的过期请求不能覆盖恢复结果', async () => {
    const stale = deferred<ChatGraph>()
    let calls = 0
    const { session } = setup(async (id) => {
      calls++
      if (calls === 2) throw new Error('offline')
      if (calls === 3) return stale.promise
      return graph(id, calls === 1 ? '旧消息' : '新消息')
    })
    await session.openConversation()
    await session.loadGraph('c1')
    session.draft.value = '未发送草稿'
    await session.loadGraph('c1')
    expect(session.graphError.value).toBe(true)
    expect(session.turns.value[0]?.text).toBe('旧消息')
    const pending = session.loadGraph('c1')
    await session.loadGraph('c1')
    stale.resolve(graph('c1', '过期消息'))
    await pending
    expect(session.graphError.value).toBe(false)
    expect(session.turns.value[0]?.text).toBe('新消息')
    expect(session.draft.value).toBe('未发送草稿')
  })
  it.each([false, true])('A/B乱序完成不会改变最新选择或错误（失败=%s）', async (failed) => {
    const pending = deferred<ChatGraph>()
    const { session } = setup(async (id) => (id === 'c1' ? pending.promise : graph(id)))
    await session.openConversation()
    await session.openConversation()
    const first = session.selectConversation('c1')
    await session.selectConversation('c2')
    session.draft.value = 'B草稿'
    if (failed) pending.reject(new Error('offline'))
    else pending.resolve(graph('c1'))
    await first
    expect(session.conversationId.value).toBe('c2')
    expect(session.draft.value).toBe('B草稿')
    expect(session.graphError.value).toBe(false)
    expect(session.turns.value[0]?.text).toBe('c2')
  })
  it.each(['edit', 'regenerate'] as const)(
    '分支%s成功后读回失败保留结果，恢复不重发',
    async (kind) => {
      let reads = 0
      let writes = 0
      const branchResult = deferred<AiMessageResult>()
      const session = createChatSession({
        aiStatus: async () => status(),
        openAiConversation: async () => ({ conversationId: 'c1', workspaceLabel: '', memory: '' }),
        conversationGraph: async (id) => {
          reads++
          if (reads === 2) throw new Error('offline')
          return graph(id)
        },
        sendAiMessage: async () => {
          throw new Error('不得重发')
        },
        editAiMessage: async () => {
          writes++
          return branchResult.promise
        },
        regenerateAiMessage: async () => {
          writes++
          return branchResult.promise
        },
      })
      await session.openConversation()
      await session.loadGraph('c1')
      session.draft.value = '修改问题'
      const pending =
        kind === 'edit' ? session.sendEdit('c1-user') : session.sendRegenerate('c1-user')
      session.draft.value = '发送期间新草稿'
      branchResult.resolve(result({ answer: '已成功回答' }))
      expect(await pending).toBe(true)
      expect(session.graphError.value).toBe(true)
      expect(session.turns.value.at(-1)).toMatchObject({ text: '已成功回答', status: 'SUCCEEDED' })
      await session.retryGraph()
      expect(writes).toBe(1)
      expect(reads).toBe(3)
      expect(session.graphError.value).toBe(false)
      expect(session.draft.value).toBe('发送期间新草稿')
    },
  )
  it('分支成功读回期间切换会话不会清除新会话编辑状态或覆盖内容', async () => {
    const read = deferred<ChatGraph>()
    let serial = 0
    let reads = 0
    const session = createChatSession({
      aiStatus: async () => status(),
      openAiConversation: async () => ({
        conversationId: `c${++serial}`,
        workspaceLabel: '',
        memory: '',
      }),
      sendAiMessage: async () => result(),
      conversationGraph: async (id) => (++reads === 2 ? read.promise : graph(id)),
      editAiMessage: async () => result(),
    })
    await session.openConversation()
    await session.loadGraph('c1')
    session.draft.value = '编辑问题'
    const sent = session.sendEdit('c1-user')
    await Promise.resolve()
    await session.openConversation()
    session.draft.value = 'B草稿'
    read.reject(new Error('late failure'))
    expect(await sent).toBe(false)
    expect(session.conversationId.value).toBe('c2')
    expect(session.draft.value).toBe('B草稿')
    expect(session.graphError.value).toBe(false)
    expect(session.turns.value).toEqual([])
  })
  it.each(['post', 'graph'] as const)('分支%s在途A/B/A往返后只读恢复权威节点', async (stage) => {
    const post = deferred<AiMessageResult>()
    const read = deferred<ChatGraph>()
    const enteredRead = deferred<void>()
    let serial = 0
    let reads = 0
    let writes = 0
    const session = createChatSession({
      aiStatus: async () => status(),
      openAiConversation: async () => ({
        conversationId: `c${++serial}`,
        workspaceLabel: '',
        memory: '',
      }),
      sendAiMessage: async () => result(),
      editAiMessage: async () => {
        writes++
        return post.promise
      },
      conversationGraph: async (id) => {
        if (id === 'c2') return graph(id)
        reads++
        if (stage === 'graph' && reads === 2) {
          enteredRead.resolve()
          return read.promise
        }
        return graph(id, reads === 1 ? '旧问题' : '权威分支')
      },
    })
    await session.openConversation()
    await session.openConversation()
    await session.selectConversation('c1')
    session.draft.value = '修改问题'
    const sending = session.sendEdit('c1-user')
    if (stage === 'graph') {
      post.resolve(result())
      await enteredRead.promise
    }
    await session.selectConversation('c2')
    await session.selectConversation('c1')
    session.draft.value = '往返后草稿'
    if (stage === 'post') post.resolve(result())
    else read.resolve(graph('c1', '过期分支'))
    await sending
    expect(writes).toBe(1)
    expect(session.graphError.value).toBe(false)
    expect(session.graphLoading.value).toBe(false)
    expect(session.turns.value[0]).toMatchObject({ nodeId: 'c1-user', text: '权威分支' })
    expect(session.draft.value).toBe('往返后草稿')
  })
  it('读取期间不能发送，发送启动前的读取不能覆盖发送结果', async () => {
    const pending = deferred<ChatGraph>()
    const { session, sends } = setup(async () => pending.promise)
    await session.openConversation()
    session.draft.value = '保留'
    const read = session.loadGraph('c1')
    await session.send()
    expect(sends()).toBe(0)
    pending.resolve(graph('c1'))
    await read
    await session.send()
    expect(sends()).toBe(1)
  })
})

describe('chat session', () => {
  it('sends explicit planning without tools and preserves the selected implementation settings', async () => {
    let sent: unknown[] = []
    const session = createChatSession({
      openAiConversation: async () => ({
        conversationId: 'plan',
        workspaceLabel: 'ws',
        memory: '',
      }),
      sendAiMessage: async (...args) => {
        sent = args
        return result({ answer: 'Read-only plan' })
      },
    })
    await session.openConversation()
    session.context.value.mode = 'code'
    session.toolMode.value = 'git_status'
    session.draft.value = 'Plan the page'
    await session.send({ ...session.context.value, mode: 'plan' })
    expect(sent[2]).toBe('none')
    expect(sent[3]).toMatchObject({ mode: 'plan' })
    expect(session.context.value.mode).toBe('code')
    expect(session.toolMode.value).toBe('git_status')
    expect(session.turns.value.at(-1)?.text).toBe('Read-only plan')
  })
  it.each(['code', 'knowledge', 'tool', 'task'])(
    'blocks incompatible Skill %s without sending or mutating its draft',
    async (mode) => {
      let called = false
      const session = createChatSession({
        aiStatus: async () => status(),
        openAiConversation: async () => ({
          conversationId: 'guard',
          workspaceLabel: '',
          memory: '',
        }),
        sendAiMessage: async () => {
          called = true
          return result()
        },
      })
      await session.openConversation()
      session.draft.value = 'retain'
      session.context.value.skillRef = {
        id: 'guide',
        version: '1.0.0',
        digest: 'a'.repeat(64),
        stateRevision: 2,
      }
      if (mode === 'code') session.context.value.mode = 'code'
      if (mode === 'knowledge')
        session.context.value.knowledgeExpertRef = { id: 'expert', revision: 1 }
      if (mode === 'tool') session.toolMode.value = 'git_status'
      if (mode === 'task')
        session.context.value.taskRef = {
          projectId: 'p',
          taskId: '00000000-0000-0000-0000-000000000001',
          revision: 1,
        }
      await session.send()
      expect(called).toBe(false)
      expect(session.failure.value).toBe('skill-unavailable')
      expect(session.draft.value).toBe('retain')
      expect(session.context.value.skillRef?.version).toBe('1.0.0')
    },
  )
  it.each([false, true])(
    'records Skill context clearing without leaking a late turn into another conversation (rejected=%s)',
    async (rejected) => {
      let resolve!: (value: AiMessageResult) => void,
        reject!: (error: unknown) => void,
        sequence = 0
      const session = createChatSession({
        aiStatus: async () => status(),
        openAiConversation: async () => ({
          conversationId: `s${++sequence}`,
          workspaceLabel: '',
          memory: '',
        }),
        sendAiMessage: () =>
          new Promise<AiMessageResult>((ok, fail) => {
            resolve = ok
            reject = fail
          }),
      })
      await session.openConversation()
      session.draft.value = 'retain'
      const skillRef = { id: 'guide', version: '1.0.0', digest: 'a'.repeat(64), stateRevision: 2 }
      session.context.value.skillRef = skillRef
      const pending = session.send()
      await session.openConversation()
      session.draft.value = 'other'
      const evidence = { skillRef, instructions: 'prepared only', resources: [], dependencies: [] }
      if (rejected)
        reject({
          response: {
            status: 404,
            data: { code: 'SKILL_NOT_FOUND', contextMemoryCleared: true },
          },
        })
      else resolve(result({ skillContext: evidence, contextMemoryCleared: true }))
      await pending
      expect(session.contextMemoryCleared.value).toBe(false)
      expect(session.draft.value).toBe('other')
      expect(session.turns.value).toEqual([])
      await session.selectConversation('s1')
      expect(session.contextMemoryCleared.value).toBe(true)
      expect(session.expired.value).toBe(false)
      if (rejected) {
        expect(session.draft.value).toBe('retain')
        expect(session.turns.value).toEqual([])
      } else
        expect(session.turns.value[1]).toMatchObject({
          skillContext: evidence,
          contextMemoryCleared: true,
        })
    },
  )
  it.each([false, true])(
    'records rejected-request memory clearing only for its conversation (switched=%s)',
    async (switched) => {
      let reject!: (reason: unknown) => void
      let sequence = 0
      const session = createChatSession({
        aiStatus: async () => status(),
        openAiConversation: async () => ({
          conversationId: `c${++sequence}`,
          workspaceLabel: '',
          memory: '',
        }),
        sendAiMessage: () =>
          new Promise<AiMessageResult>((_resolve, fail) => {
            reject = fail
          }),
      })
      await session.openConversation()
      session.draft.value = 'keep draft'
      session.context.value.knowledgeExpertRef = { id: 'saved', revision: 4 }
      const pending = session.send()
      if (switched) {
        await session.openConversation()
        session.draft.value = 'other draft'
      }
      reject({
        response: {
          status: 409,
          data: { code: 'EXPERT_CONTEXT_STALE', knowledgeMemoryCleared: true },
        },
      })
      await pending
      if (switched) {
        expect(session.knowledgeMemoryCleared.value).toBe(false)
        expect(session.draft.value).toBe('other draft')
        expect(session.failure.value).toBe('')
        await session.selectConversation('c1')
      } else expect(session.failure.value).toBe('knowledge-failed')
      expect(session.knowledgeMemoryCleared.value).toBe(true)
      expect(session.turns.value).toEqual([])
      expect(session.expired.value).toBe(false)
      expect(session.pendingConnectionId.value).toBeNull()
      expect(session.draft.value).toBe('keep draft')
      expect(session.context.value.knowledgeExpertRef).toEqual({ id: 'saved', revision: 4 })
    },
  )
  it.each([400, 403, 404, 409, 503])(
    'classifies INVALID_EXPERT_CONTEXT before transport recovery (%s)',
    async (http) => {
      const session = createChatSession({
        aiStatus: async () => status(),
        openAiConversation: async () => ({ conversationId: 'c1', workspaceLabel: '', memory: '' }),
        sendAiMessage: async () => {
          throw { response: { status: http, data: { code: 'INVALID_EXPERT_CONTEXT' } } }
        },
      })
      await session.openConversation()
      session.draft.value = 'keep draft'
      session.context.value.knowledgeExpertRef = { id: 'saved', revision: 4 }
      await session.send()
      expect(session.failure.value).toBe('knowledge-failed')
      expect(session.expired.value).toBe(false)
      expect(session.pendingConnectionId.value).toBeNull()
      expect(session.turns.value).toEqual([])
      expect(session.draft.value).toBe('keep draft')
      expect(session.context.value.knowledgeExpertRef).toEqual({ id: 'saved', revision: 4 })
    },
  )
  it.each([404, 409, 403, 503])(
    'treats EXPERT_CONTEXT errors as knowledge failures, not model/expiry (%s)',
    async (http) => {
      const session = createChatSession({
        aiStatus: async () => status(),
        openAiConversation: async () => ({ conversationId: 'c1', workspaceLabel: '', memory: '' }),
        sendAiMessage: async () => {
          throw { response: { status: http, data: { code: 'EXPERT_CONTEXT_UNAVAILABLE' } } }
        },
      })
      await session.openConversation()
      session.draft.value = 'keep draft'
      session.context.value.knowledgeExpertRef = { id: 'saved', revision: 4 }
      await session.send()
      expect(session.failure.value).toBe('knowledge-failed')
      expect(session.expired.value).toBe(false)
      expect(session.pendingConnectionId.value).toBeNull()
      expect(session.draft.value).toBe('keep draft')
      expect(session.context.value.knowledgeExpertRef).toEqual({ id: 'saved', revision: 4 })
    },
  )
  it('keeps returned resource evidence on the live turn and replays only server graph content', async () => {
    const evidence = {
      expertRef: { id: 'saved', revision: 4 },
      status: 'no_matches' as const,
      references: [],
    }
    let saved = ''
    const storage = {
      getItem: () => saved || null,
      setItem: (_key: string, value: string) => {
        saved = value
      },
    }
    const graphNode: ChatMessageNode = {
      id: 'c1-answer-1',
      parentId: null,
      role: 'ASSISTANT',
      version: 1,
      text: 'real',
      executionId: 'exec-1',
      sequence: 1,
    }
    const api: ChatApi = {
      conversationGraph: async (id: string): Promise<ChatGraph> => ({
        conversationId: id,
        path: [graphNode],
        all: [graphNode],
      }),
      aiStatus: async () => status(),
      openAiConversation: async () => ({ conversationId: 'c1', workspaceLabel: '', memory: '' }),
      sendAiMessage: async () =>
        result({ knowledgeContext: evidence, knowledgeMemoryCleared: true }),
    }
    const session = createChatSession(api, storage)
    await session.openConversation()
    session.draft.value = 'question'
    await session.send()
    expect(session.turns.value[1]).toMatchObject({
      knowledgeContext: evidence,
      knowledgeMemoryCleared: true,
    })
    const replay = createChatSession(api, storage)
    await replay.restoreLastConversation()
    expect(replay.turns.value[0]).toMatchObject({
      role: 'assistant',
      text: 'real',
      executionId: 'exec-1',
    })
    expect(replay.turns.value[0]).not.toHaveProperty('knowledgeContext')
  })
  it.each([
    [409, 'CODE_GENERATION_BASELINE_CHANGED', 'generation-stale'],
    [400, 'CODE_GENERATION_TARGET_REQUIRED', 'generation-blocked'],
    [400, 'CODE_GENERATION_SCOPE_MISMATCH', 'generation-blocked'],
    [503, 'CODE_GENERATION_CONTEXT_UNAVAILABLE', 'generation-unavailable'],
    [400, 'CODE_PROPOSAL_TOO_LARGE', 'generation-too-large'],
    [409, 'BOARD_REVISION_CONFLICT', 'generation-task-stale'],
    [409, 'CODE_TASK_PROTOTYPE_MISMATCH', 'generation-task-stale'],
    [409, 'CODE_TASK_SNAPSHOT_CHANGED', 'generation-task-stale'],
    [409, 'CODE_WORKSPACE_BUSY', 'generation-task-blocked'],
    [409, 'BOARD_EXECUTION_ACTIVE', 'generation-task-blocked'],
    [409, 'BOARD_PREPARATION_REQUIRED', 'generation-task-blocked'],
    [404, 'BOARD_TASK_NOT_FOUND', 'generation-task-stale'],
  ])(
    'keeps the draft and distinguishes source preparation failure %s %s from a model switch',
    async (http, code, expected) => {
      const api: ChatApi = {
        aiStatus: async () => status('configured_unverified'),
        openAiConversation: async () => ({
          conversationId: 'c1',
          workspaceLabel: 'ws-abc',
          memory: 'memory',
        }),
        sendAiMessage: async () => {
          throw {
            response: { status: http, data: { code, detail: 'Localized preparation failure' } },
          }
        },
      }
      const session = createChatSession(api)
      await session.openConversation()
      session.context.value.mode = 'code'
      session.context.value.targetPath = 'frontend/App.vue'
      session.draft.value = 'Keep my source edits'
      session.context.value.taskRef = {
        projectId: 'p',
        taskId: '12345678-1234-1234-1234-123456789abc',
        revision: 2,
      }
      await session.send()
      expect(session.failure.value).toBe(expected)
      expect(session.draft.value).toBe('Keep my source edits')
      expect(session.turns.value).toEqual([])
      expect(session.pendingConnectionId.value).toBeNull()
      expect(session.expired.value).toBe(false)
      expect(session.context.value.taskRef?.revision).toBe(2)
    },
  )
  it('keeps an oversized code response as an explicit failure without a partial candidate', async () => {
    const api: ChatApi = {
      aiStatus: async () => status('configured_unverified'),
      openAiConversation: async () => ({ conversationId: 'c1', workspaceLabel: 'ws', memory: '' }),
      sendAiMessage: async () =>
        result({ error: 'CODE_PROPOSAL_TOO_LARGE', status: 'FAILED', answer: '', proposal: null }),
    }
    const session = createChatSession(api)
    await session.openConversation()
    session.draft.value = 'Keep draft'
    await session.send()
    expect(session.failure.value).toBe('generation-too-large')
    expect(session.draft.value).toBe('Keep draft')
    expect(session.turns.value.at(-1)?.proposal).toBeNull()
  })
  it('blocks a second send and keeps a failed draft', async () => {
    const pending = deferred<AiMessageResult>()
    let sent = 0
    const api: ChatApi = {
      aiStatus: async () => status(),
      openAiConversation: async () => ({
        conversationId: 'c1',
        workspaceLabel: 'ws-abc',
        memory: 'memory',
      }),
      sendAiMessage: async () => {
        sent += 1
        return pending.promise
      },
    }
    const session = createChatSession(api)
    await session.openConversation()
    session.draft.value = 'hello'
    const first = session.send()
    session.draft.value = 'hello'
    await session.send()
    expect(sent).toBe(1)
    pending.resolve(result({ error: 'TOOL_PERMISSION_DENIED', answer: 'denied' }))
    await first
    expect(session.draft.value).toBe('hello')
    expect(session.failure.value).toBe('kept')
    expect(session.turns.value.some((turn) => turn.text === 'denied')).toBe(true)
  })

  it('writes a late response only to the conversation that sent it', async () => {
    const pending = deferred<AiMessageResult>()
    const api: ChatApi = {
      aiStatus: async () => status(),
      openAiConversation: async () => ({
        conversationId: session.conversationId.value ? 'c2' : 'c1',
        workspaceLabel: 'ws-abc',
        memory: 'memory',
      }),
      sendAiMessage: async () => pending.promise,
    }
    const session = createChatSession(api)
    await session.openConversation()
    session.draft.value = 'first'
    const first = session.send()
    await session.openConversation()
    session.draft.value = 'second draft'
    pending.resolve(result({ answer: 'from-c1' }))
    await first
    expect(session.conversationId.value).toBe('c2')
    expect(session.draft.value).toBe('second draft')
    expect(session.transcripts.value.c1?.some((turn) => turn.text === 'from-c1')).toBe(true)
    expect(session.transcripts.value.c2 ?? []).toEqual([])
  })

  it('does not show a simulated answer when the model is not configured', async () => {
    const api: ChatApi = {
      aiStatus: async () => status('disabled'),
      openAiConversation: async () => ({
        conversationId: 'c1',
        workspaceLabel: 'ws-abc',
        memory: 'memory',
      }),
      sendAiMessage: async () => {
        throw { response: { status: 503, data: { code: 'AI_NOT_CONFIGURED' } } }
      },
    }
    const session = createChatSession(api)
    await session.refreshStatus()
    await session.openConversation()
    session.draft.value = 'hello'
    await session.send()
    expect(session.failure.value).toBe('not-configured')
    expect(session.draft.value).toBe('hello')
    expect(session.turns.value).toEqual([])
    expect(JSON.stringify(session.transcripts.value)).not.toContain('模拟')
  })

  it('clears the failed send once the same draft succeeds', async () => {
    let calls = 0
    const api: ChatApi = {
      aiStatus: async () => status('configured_unverified'),
      openAiConversation: async () => ({
        conversationId: 'c1',
        workspaceLabel: 'ws-abc',
        memory: 'memory',
      }),
      sendAiMessage: async () => {
        calls += 1
        if (calls === 1) throw { response: { status: 500 } }
        return result({ answer: 'retried' })
      },
    }
    const session = createChatSession(api)
    await session.refreshStatus()
    await session.openConversation()
    session.draft.value = 'hello'
    await session.send()
    expect(session.failure.value).toBe('failed')
    expect(session.draft.value).toBe('hello')
    await session.send()
    expect(session.failure.value).toBe('')
    expect(session.draft.value).toBe('')
    expect(session.turns.value.map((turn) => turn.text)).toEqual(['hello', 'retried'])
  })

  it('preserves partial stream evidence as unknown after interruption and retries only explicitly', async () => {
    let calls = 0
    const session = createChatSession({
      aiStatus: async () => status(),
      openAiConversation: async () => ({ conversationId: 'c1', workspaceLabel: '', memory: '' }),
      sendAiMessage: async (_id, _message, _mode, _context, options) => {
        calls++
        if (calls > 1) return result({ answer: 'retried' })
        options?.onEvent?.({
          type: 'answer.delta',
          text: 'partial',
          status: 'RUNNING',
          code: '',
          executionId: 'exec-partial',
          sequence: 1,
        })
        options?.onEvent?.({
          type: 'tool',
          text: '',
          status: 'RUNNING',
          code: 'TOOL_STARTED',
          executionId: 'exec-partial',
          sequence: 2,
        })
        throw { response: { status: 502, data: { code: 'AI_RESPONSE_INCOMPLETE' } } }
      },
    })
    await session.openConversation()
    session.draft.value = 'hello'
    await session.send()
    expect(calls).toBe(1)
    expect(session.sending.value).toBe(false)
    expect(session.draft.value).toBe('hello')
    expect(session.failure.value).toBe('failed')
    expect(session.turns.value[1]).toMatchObject({
      text: 'partial',
      status: 'UNKNOWN',
      error: 'AI_RESPONSE_INCOMPLETE',
      executionId: 'exec-partial',
      toolEvents: [{ sequence: 2, code: 'TOOL_STARTED' }],
    })
    await session.send()
    expect(calls).toBe(2)
    expect(session.turns.value.map((turn) => turn.text)).toEqual([
      'hello',
      'partial',
      'hello',
      'retried',
    ])
    expect(session.turns.value[1]?.status).toBe('UNKNOWN')
    expect(session.failure.value).toBe('')
    expect(session.draft.value).toBe('')
  })

  it.each(['FAILED', 'UNKNOWN', 'RUNNING', 'unrecognized'])(
    'retains streamed output and the draft when the final result is %s without an error code',
    async (terminalStatus) => {
      const session = createChatSession({
        aiStatus: async () => status(),
        openAiConversation: async () => ({ conversationId: 'c1', workspaceLabel: '', memory: '' }),
        sendAiMessage: async (_id, _message, _mode, _context, options) => {
          options?.onEvent?.({
            type: 'answer.delta',
            text: 'partial',
            status: 'RUNNING',
            code: '',
            executionId: 'exec-partial',
            sequence: 1,
          })
          return result({ answer: '', status: terminalStatus })
        },
      })
      await session.openConversation()
      session.draft.value = 'retain'
      await session.send()
      expect(session.turns.value[1]).toMatchObject({
        text: 'partial',
        status: terminalStatus === 'RUNNING' ? 'UNKNOWN' : terminalStatus,
      })
      expect(session.draft.value).toBe('retain')
      expect(session.failure.value).toBe('kept')
      expect(session.sending.value).toBe(false)
    },
  )

  it('accepts SUCCEEDED without promoting unknown statuses to success', async () => {
    let calls = 0
    const session = createChatSession({
      aiStatus: async () => status(),
      openAiConversation: async () => ({ conversationId: 'c1', workspaceLabel: '', memory: '' }),
      sendAiMessage: async () => {
        calls++
        if (calls === 1)
          throw { response: { status: 400, data: { code: 'CONTEXT_BUDGET_EXCEEDED' } } }
        return result({ answer: '模拟回答', status: 'SUCCEEDED' })
      },
    })
    await session.openConversation()
    session.draft.value = 'oversized'
    await session.send()
    expect(session.failure.value).toBe('context-budget-exceeded')
    session.draft.value = 'ordinary edited draft'
    await session.send()
    expect(session.failure.value).toBe('')
    expect(session.draft.value).toBe('')
    expect(session.turns.value[1]).toMatchObject({ text: '模拟回答', status: 'SUCCEEDED' })
  })

  it('treats local abort as unknown rather than confirmed backend cancellation', async () => {
    const session = createChatSession({
      aiStatus: async () => status(),
      openAiConversation: async () => ({ conversationId: 'c1', workspaceLabel: '', memory: '' }),
      sendAiMessage: (_id, _message, _mode, _context, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            reject(Object.assign(new Error('stopped waiting'), { name: 'AbortError' }))
          })
        }),
      cancelAiConversation: async () => ({ cancelled: false, executionId: '' }),
    })
    await session.openConversation()
    session.draft.value = 'retain'
    const pending = session.send()
    await session.cancelSend()
    await pending
    expect(session.turns.value[1]).toMatchObject({
      status: 'UNKNOWN',
      error: 'AI_RESPONSE_INCOMPLETE',
    })
    expect(session.failure.value).toBe('failed')
    expect(session.draft.value).toBe('retain')
    expect(session.sending.value).toBe(false)
  })

  it.each([false, true])(
    'isolates late streamed failure and budget from another conversation (rejected=%s)',
    async (rejected) => {
      const pending = deferred<AiMessageResult>()
      let serial = 0
      const budget: ContextBudgetObservation = {
        platformLimit: 96000,
        outputReserve: 16384,
        inputMaterialLimit: 64000,
        usedChars: 1200,
        materialChars: 800,
        remainingChars: 78416,
        metering: 'CHAR_ESTIMATE',
        sources: [],
        notes: [],
      }
      const session = createChatSession({
        aiStatus: async () => status(),
        openAiConversation: async () => ({
          conversationId: `c${++serial}`,
          workspaceLabel: '',
          memory: '',
        }),
        sendAiMessage: async (id, _message, _mode, _context, options) => {
          if (id === 'c2') return result({ contextBudget: { ...budget, usedChars: 500 } })
          options?.onEvent?.({
            type: 'answer.delta',
            text: 'partial-c1',
            status: 'RUNNING',
            code: '',
            executionId: 'exec-c1',
            sequence: 1,
          })
          return pending.promise
        },
      })
      await session.openConversation()
      session.draft.value = 'first'
      const first = session.send()
      await session.openConversation()
      session.draft.value = 'second'
      await session.send()
      session.draft.value = 'new second draft'
      if (rejected)
        pending.reject({
          response: {
            status: 502,
            data: { code: 'AI_RESPONSE_INCOMPLETE', contextBudget: budget },
          },
        })
      else
        pending.resolve(
          result({
            answer: '',
            error: 'AI_PROVIDER_ERROR',
            status: 'FAILED',
            contextBudget: budget,
          }),
        )
      await first
      expect(session.lastContextBudget.value?.usedChars).toBe(500)
      expect(session.draft.value).toBe('new second draft')
      expect(session.failure.value).toBe('')
      expect(session.turns.value.map((turn) => turn.text)).toEqual(['second', 'real'])
      await session.selectConversation('c1')
      expect(session.draft.value).toBe('first')
      expect(session.turns.value[1]).toMatchObject({
        text: 'partial-c1',
        status: rejected ? 'UNKNOWN' : 'FAILED',
        executionId: rejected ? 'exec-c1' : 'exec-1',
      })
    },
  )

  it.each(['FAILED', 'CANCELLED', 'UNKNOWN'])(
    'retains server terminal %s evidence when the transport subsequently fails',
    async (terminalStatus) => {
      const session = createChatSession({
        aiStatus: async () => status(),
        openAiConversation: async () => ({ conversationId: 'c1', workspaceLabel: '', memory: '' }),
        sendAiMessage: async (_id, _message, _mode, _context, options) => {
          options?.onEvent?.({
            type: 'error',
            text: '',
            status: terminalStatus,
            code: 'SERVER_TERMINAL',
            executionId: 'exec-1',
            sequence: 1,
          })
          throw new Error('socket closed')
        },
      })
      await session.openConversation()
      session.draft.value = 'retain'
      await session.send()
      expect(session.turns.value).toHaveLength(2)
      expect(session.turns.value[1]).toMatchObject({
        status: terminalStatus,
        error: 'SERVER_TERMINAL',
      })
      expect(session.draft.value).toBe('retain')
      expect(session.sending.value).toBe(false)
    },
  )

  it('rolls back only a rejected attempt and ignores its events after explicit retry', async () => {
    let calls = 0
    let lateEvent: NonNullable<
      NonNullable<Parameters<ChatApi['sendAiMessage']>[4]>['onEvent']
    > = () => {}
    const session = createChatSession({
      aiStatus: async () => status(),
      openAiConversation: async () => ({ conversationId: 'c1', workspaceLabel: '', memory: '' }),
      sendAiMessage: async (_id, _message, _mode, _context, options) => {
        calls++
        if (calls === 2) {
          lateEvent = options!.onEvent!
          throw { response: { status: 500 } }
        }
        return result({ answer: calls === 1 ? 'previous answer' : 'retry answer' })
      },
    })
    await session.openConversation()
    session.draft.value = 'previous request'
    await session.send()
    session.draft.value = 'retry request'
    await session.send()
    expect(session.turns.value.map((turn) => turn.text)).toEqual([
      'previous request',
      'previous answer',
    ])
    await session.send()
    lateEvent({
      type: 'answer.delta',
      text: 'stale',
      code: '',
      status: 'RUNNING',
      executionId: 'stale',
      sequence: 1,
    })
    expect(session.turns.value.map((turn) => turn.text)).toEqual([
      'previous request',
      'previous answer',
      'retry request',
      'retry answer',
    ])
    expect(calls).toBe(3)
  })

  it('holds the old conversation until a target change is confirmed', async () => {
    let sent = 0
    let confirmed = 0
    const api: ChatApi = {
      aiStatus: async () => status('configured_unverified'),
      openAiConversation: async () => ({
        conversationId: 'c1',
        workspaceLabel: 'ws-abc',
        memory: 'memory',
        connectionId: 'old',
      }),
      sendAiMessage: async () => {
        sent += 1
        return result()
      },
      modelConnections: async () => ({
        items: [
          {
            id: 'old',
            name: '旧连接',
            kind: 'openai-compatible',
            enabled: true,
            baseUrl: 'https://127.0.0.1:9/v1',
            defaultModel: 'old-model',
            models: [{ id: 'old-model', reasoningEfforts: [] }],
            allowedModels: ['old-model'],
            discoveredAt: '',
            discoveryError: '',
            secretPresent: true,
            revision: 1,
            defaultSelected: true,

            configurationRevision: 'a',
          },
          {
            id: 'next',
            name: '新连接',
            kind: 'openai-compatible',
            enabled: true,
            baseUrl: 'https://127.0.0.1:10/v1',
            defaultModel: 'next-model',
            models: [{ id: 'next-model', reasoningEfforts: [] }],
            allowedModels: ['next-model'],
            discoveredAt: '',
            discoveryError: '',
            secretPresent: true,
            revision: 2,
            defaultSelected: false,

            configurationRevision: 'b',
          },
        ],
        effectiveDefaultId: 'old',
      }),
      assignConversationConnection: async () => {
        confirmed += 1
        return {
          connectionId: 'next',
          memoryCleared: true,
          connectionName: '新连接',
          model: 'next-model',
        }
      },
    }
    const session = createChatSession(api)
    await session.openConversation()
    await session.refreshConnections()
    session.chooseConversationConnection('next', 'next-model')
    session.draft.value = 'stay here'
    await session.send()
    expect(sent).toBe(0)
    expect(confirmed).toBe(0)
    expect(session.pendingConnectionId.value).toBe('next')
    expect(session.targetNotice.value).toContain('新连接')
    await session.confirmConnectionChange()
    expect(confirmed).toBe(1)
    expect(session.boundConnectionId.value).toBe('next')
    expect(session.targetNotice.value).toBe('cleared')
    await session.send()
    expect(sent).toBe(1)
  })

  it('says when a confirmed switch keeps server memory', async () => {
    const api: ChatApi = {
      aiStatus: async () => status('configured_unverified'),
      openAiConversation: async () => ({
        conversationId: 'c1',
        workspaceLabel: 'ws',
        memory: 'memory',
        connectionId: 'old',
        model: 'same-model',
      }),
      modelConnections: async () => ({
        effectiveDefaultId: 'old',
        items: [
          {
            id: 'old',
            name: '旧连接',
            kind: 'openai-compatible',
            enabled: true,
            baseUrl: 'https://127.0.0.1:9/v1',
            defaultModel: 'same-model',
            models: [{ id: 'same-model', reasoningEfforts: [] }],
            allowedModels: ['same-model'],
            discoveredAt: '',
            discoveryError: '',
            secretPresent: true,
            revision: 1,
            defaultSelected: true,
            configurationRevision: 'a',
          },
          {
            id: 'next',
            name: '新连接',
            kind: 'openai-compatible',
            enabled: true,
            baseUrl: 'https://127.0.0.1:10/v1',
            defaultModel: 'same-model',
            models: [{ id: 'same-model', reasoningEfforts: [] }],
            allowedModels: ['same-model'],
            discoveredAt: '',
            discoveryError: '',
            secretPresent: true,
            revision: 1,
            defaultSelected: false,
            configurationRevision: 'b',
          },
        ],
      }),
      assignConversationConnection: async () => ({
        connectionId: 'next',
        memoryCleared: false,
        connectionName: '新连接',
        model: 'same-model',
      }),
    }
    const session = createChatSession(api)
    await session.openConversation()
    await session.refreshConnections()
    session.chooseConversationConnection('next', 'same-model')
    await session.confirmConnectionChange()
    expect(session.boundConnectionId.value).toBe('next')
    expect(session.targetNotice.value).toBe('kept')
  })
})

it('keeps independent drafts, binding and transcripts through switching, reload, archive and deletion', async () => {
  let serial = 0
  const deleted: string[] = []
  const store = new Map<string, string>()
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
  }
  const graphs = new Map<string, ChatGraph>()
  const seedGraph = (id: string, question: string, answer: string) => {
    const user: ChatMessageNode = {
      id: id + '-user',
      parentId: null,
      role: 'USER',
      version: 1,
      text: question,
      sequence: 1,
    }
    const assistant: ChatMessageNode = {
      id: id + '-answer',
      parentId: user.id,
      role: 'ASSISTANT',
      version: 1,
      text: answer,
      executionId: 'exec-1',
      sequence: 2,
    }
    graphs.set(id, { conversationId: id, path: [user, assistant], all: [user, assistant] })
  }
  const api: ChatApi = {
    conversationGraph: async (id: string): Promise<ChatGraph> =>
      graphs.get(id) ?? { conversationId: id, path: [], all: [] },
    aiStatus: async () => status(),
    openAiConversation: async () => ({
      conversationId: 'chat-' + ++serial,
      workspaceLabel: 'ws',
      memory: 'memory',
      connectionId: 'model-' + serial,
    }),
    sendAiMessage: async () => result(),
    deleteAiConversation: async (id) => {
      deleted.push(id)
    },
  }
  const session = createChatSession(api, storage)
  await session.openConversation()
  session.draft.value = 'First request'
  await session.send()
  seedGraph('chat-1', 'First request', 'real')
  session.draft.value = 'First draft'
  await session.openConversation()
  session.draft.value = 'Second draft'
  await session.selectConversation('chat-1')
  expect(session.draft.value).toBe('First draft')
  expect(session.boundConnectionId.value).toBe('model-1')
  expect(session.turns.value).toHaveLength(2)
  session.renameConversation('chat-1', 'Renamed')
  session.archiveConversation('chat-1', true)
  expect(session.conversationId.value).toBeNull()
  const restored = createChatSession(api, storage)
  expect(restored.history.value.find((x) => x.id === 'chat-1')?.archived).toBe(true)
  restored.archiveConversation('chat-1', false)
  await restored.selectConversation('chat-1')
  expect(restored.draft.value).toBe('First draft')
  expect(restored.history.value.find((x) => x.id === 'chat-1')?.title).toBe('Renamed')
  await restored.deleteConversation('chat-1')
  expect(deleted).toEqual(['chat-1'])
  expect(restored.transcripts.value['chat-1']).toBeUndefined()
  await restored.selectConversation('chat-2')
  expect(restored.draft.value).toBe('Second draft')
})
it('keeps expired history readable without sending or silently creating a replacement', async () => {
  let sent = 0
  const api: ChatApi = {
    aiStatus: async () => status(),
    openAiConversation: async () => ({
      conversationId: 'old',
      workspaceLabel: 'ws',
      memory: 'memory',
    }),
    aiConversation: async () => {
      throw { response: { status: 404 } }
    },
    sendAiMessage: async () => {
      sent++
      return result()
    },
  }
  const session = createChatSession(api)
  await session.openConversation()
  session.draft.value = 'kept'
  await session.selectConversation('old')
  await session.send()
  expect(session.expired.value).toBe(true)
  expect(session.draft.value).toBe('kept')
  expect(sent).toBe(0)
})

it('creates the first conversation on send and assigns an explicitly selected model without losing prototype context', async () => {
  const requests: unknown[] = []
  const api: ChatApi = {
    aiStatus: async () => status(),
    openAiConversation: async () => ({
      conversationId: 'first',
      workspaceLabel: 'ws',
      memory: 'memory',
    }),
    assignConversationConnection: async (id, connection, confirmed, model) => {
      requests.push([id, connection, confirmed, model])
      return { connectionId: connection, connectionName: 'desk', model, memoryCleared: false }
    },
    sendAiMessage: async (id, message, tool, context) => {
      requests.push([id, message, tool, context?.prototypeVersionId])
      return result()
    },
  }
  const session = createChatSession(api)
  session.draft.value = 'Implement this prototype'
  session.context.value.prototypeVersionId = 'saved-version'
  session.context.value.mode = 'code'
  session.chooseConversationConnection('desk', 'model-b')
  await session.send()
  expect(requests).toEqual([
    ['first', 'desk', true, 'model-b'],
    ['first', 'Implement this prototype', 'none', 'saved-version'],
  ])
  expect(session.boundModel.value).toBe('model-b')
  expect(session.turns.value[0].model).toBe('model-b')
})

it('preserves per-conversation context and restores the active conversation after returning from settings', async () => {
  let serial = 0
  const store = new Map<string, string>()
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
  }
  const api: ChatApi = {
    ...graphApiFromStored(() => store.get('eap.chat.history.v1') ?? ''),
    aiStatus: async () => status(),
    openAiConversation: async () => ({
      conversationId: 'c' + ++serial,
      workspaceLabel: 'ws',
      memory: 'memory',
      connectionId: 'desk',
      model: 'model-a',
    }),
    sendAiMessage: async () => result(),
  }
  const session = createChatSession(api, storage)
  await session.openConversation()
  session.context.value.instructions = 'Keep project conventions'
  session.context.value.files = [{ name: 'reference.md', content: 'Reference' }]
  await session.openConversation()
  session.context.value.instructions = 'Another task'
  await session.selectConversation('c1')
  expect(session.context.value.instructions).toBe('Keep project conventions')
  expect(session.context.value.files[0].name).toBe('reference.md')
  const restored = createChatSession(api, storage)
  await restored.restoreLastConversation()
  expect(restored.conversationId.value).toBe('c1')
  expect(restored.boundModel.value).toBe('model-a')
  expect(restored.context.value.instructions).toBe('Keep project conventions')
})

it('keeps a new draft local until the first message', async () => {
  let opened = 0
  const api: ChatApi = {
    aiStatus: async () => status(),
    openAiConversation: async () => {
      opened += 1
      return { conversationId: 'made', workspaceLabel: 'ws', memory: 'memory' }
    },
    sendAiMessage: async () => result(),
  }
  const session = createChatSession(api)
  await session.openConversation()
  session.draft.value = '已有草稿'
  session.beginDraft()
  expect(opened).toBe(1)
  expect(session.conversationId.value).toBeNull()
  expect(session.draft.value).toBe('')
  session.draft.value = '第一条'
  await session.send()
  expect(opened).toBe(2)
  expect(session.history.value[0]?.title).toBe('第一条')
})

it('sends an edited question as a versioned branch and reloads the authoritative graph', async () => {
  const branch: ChatGraph = {
    conversationId: 'c1',
    path: [
      {
        id: 'c1-user',
        parentId: null,
        role: 'USER',
        version: 1,
        text: 'original question',
        sequence: 1,
      },
      {
        id: 'c1-answer',
        parentId: 'c1-user',
        role: 'ASSISTANT',
        version: 1,
        text: 'original answer',
        executionId: 'exec-1',
        sequence: 2,
      },
    ],
    all: [],
  }
  const calls: Array<unknown[]> = []
  let graphReads = 0
  const api: ChatApi = {
    aiStatus: async () => status(),
    openAiConversation: async () => ({ conversationId: 'c1', workspaceLabel: '', memory: '' }),
    sendAiMessage: async () => result(),
    conversationGraph: async () => {
      graphReads++
      return branch
    },
    editAiMessage: async (...args) => {
      calls.push(args)
      return result({ answer: 'edited answer' })
    },
  }
  const session = createChatSession(api)
  await session.openConversation()
  await session.loadGraph('c1')
  session.draft.value = 'edited question'
  expect(await session.sendEdit('c1-user')).toBe(true)
  expect(calls).toHaveLength(1)
  expect(calls[0]!.slice(0, 4)).toEqual(['c1', 'c1-user', 'edited question', 'none'])
  expect(graphReads).toBe(2)
  expect(session.turns.value[0].text).toBe('original question')
})

it('regenerates an answer from the user node and reads the sibling branch back', async () => {
  const branch: ChatGraph = {
    conversationId: 'c1',
    path: [
      {
        id: 'c1-user',
        parentId: null,
        role: 'USER',
        version: 1,
        text: 'original question',
        sequence: 1,
      },
      {
        id: 'c1-answer',
        parentId: 'c1-user',
        role: 'ASSISTANT',
        version: 1,
        text: 'original answer',
        sequence: 2,
      },
    ],
    all: [],
  }
  const calls: Array<unknown[]> = []
  let graphReads = 0
  const api: ChatApi = {
    aiStatus: async () => status(),
    openAiConversation: async () => ({ conversationId: 'c1', workspaceLabel: '', memory: '' }),
    sendAiMessage: async () => result(),
    conversationGraph: async () => {
      graphReads++
      return branch
    },
    regenerateAiMessage: async (...args) => {
      calls.push(args)
      return result({ answer: 'regenerated answer' })
    },
  }
  const session = createChatSession(api)
  await session.openConversation()
  await session.loadGraph('c1')
  expect(await session.sendRegenerate('c1-user')).toBe(true)
  expect(calls).toHaveLength(1)
  expect(calls[0]!.slice(0, 4)).toEqual(['c1', 'c1-user', 'original question', 'none'])
  expect(graphReads).toBe(2)
  expect(session.turns.value[1].text).toBe('original answer')
})

it('accumulates tool SSE events while regenerating an answer', async () => {
  const branch: ChatGraph = {
    conversationId: 'c1',
    path: [
      {
        id: 'c1-user',
        parentId: null,
        role: 'USER',
        version: 1,
        text: 'question',
        sequence: 1,
      },
      {
        id: 'c1-answer',
        parentId: 'c1-user',
        role: 'ASSISTANT',
        version: 1,
        text: 'old',
        sequence: 2,
      },
    ],
    all: [],
  }
  let finish!: (value: AiMessageResult) => void
  const api: ChatApi = {
    aiStatus: async () => status(),
    openAiConversation: async () => ({ conversationId: 'c1', workspaceLabel: '', memory: '' }),
    sendAiMessage: async () => result(),
    conversationGraph: async () => branch,
    regenerateAiMessage: async (_id, _node, _text, _mode, _context, options) => {
      options?.onEvent?.({
        type: 'tool',
        text: '',
        status: 'RUNNING',
        code: 'GIT_STATUS',
        executionId: 'regen-exec',
        sequence: 1,
      })
      options?.onEvent?.({
        type: 'answer.delta',
        text: 'new answer',
        status: 'RUNNING',
        code: '',
        executionId: 'regen-exec',
        sequence: 2,
      })
      return new Promise((resolve) => {
        finish = resolve
      })
    },
  }
  const session = createChatSession(api)
  await session.openConversation()
  await session.loadGraph('c1')
  const done = session.sendRegenerate('c1-user')
  await Promise.resolve()
  expect(session.turns.value.at(-1)).toMatchObject({
    text: 'new answer',
    status: 'RUNNING',
    toolEvents: [{ sequence: 1, code: 'GIT_STATUS' }],
  })
  finish(
    result({
      answer: 'new answer',
      executionId: 'regen-exec',
      toolEvents: [{ sequence: 1, code: 'GIT_STATUS' }],
    }),
  )
  expect(await done).toBe(true)
})
