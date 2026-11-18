import { expect, it } from 'vite-plus/test'
import { selectedPath, selectBranch } from '../../../src/features/chat/messageGraph'
import type { ChatGraph, ChatGraphNode } from '@eap/runtime-client'
function node(id: string, parentId: string | null, role: 'user' | 'assistant'): ChatGraphNode {
  return {
    id,
    parentId,
    role,
    content: id,
    operationId: id,
    executionId: null,
    response: null,
    status: 'SUCCEEDED',
  }
}
it('restores selected descendants independently for root edits and regenerated answers', () => {
  const graph: ChatGraph = {
    conversationId: 'c',
    revision: 1,
    operations: [],
    nodes: [
      node('root-a', null, 'user'),
      node('a1', 'root-a', 'assistant'),
      node('a2', 'root-a', 'assistant'),
      node('follow', 'a1', 'user'),
      node('answer', 'follow', 'assistant'),
      node('root-b', null, 'user'),
      node('b1', 'root-b', 'assistant'),
    ],
  }
  let selection = selectBranch(graph, {}, 'answer')
  expect(selectedPath(graph, selection).map((n) => n.id)).toEqual([
    'root-a',
    'a1',
    'follow',
    'answer',
  ])
  selection = selectBranch(graph, selection, 'a2')
  expect(selectedPath(graph, selection).map((n) => n.id)).toEqual(['root-a', 'a2'])
  selection = selectBranch(graph, selection, 'root-b')
  expect(selectedPath(graph, selection).map((n) => n.id)).toEqual(['root-b', 'b1'])
  selection = selectBranch(graph, selection, 'root-a')
  expect(selectedPath(graph, selection).map((n) => n.id)).toEqual(['root-a', 'a2'])
  selection = selectBranch(graph, selection, 'a1')
  expect(selectedPath(graph, selection).map((n) => n.id)).toEqual([
    'root-a',
    'a1',
    'follow',
    'answer',
  ])
})
