import type { ChatGraph, ChatGraphNode } from '@eap/runtime-client'

/** Parent key includes the root, so switching root versions preserves each future. */
export type BranchSelection = Record<string, string>
const rootKey = '$root'
export function siblings(graph: ChatGraph, node: ChatGraphNode): ChatGraphNode[] {
  return graph.nodes.filter((candidate) => candidate.parentId === node.parentId)
}
export function selectBranch(
  graph: ChatGraph,
  selection: BranchSelection,
  id: string,
): BranchSelection {
  const next = { ...selection }
  let node = graph.nodes.find((candidate) => candidate.id === id)
  const seen = new Set<string>()
  while (node && !seen.has(node.id)) {
    seen.add(node.id)
    next[node.parentId ?? rootKey] = node.id
    node = graph.nodes.find((candidate) => candidate.id === node!.parentId)
  }
  return next
}
export function selectedPath(graph: ChatGraph, selection: BranchSelection): ChatGraphNode[] {
  const path: ChatGraphNode[] = []
  let parent: string | null = null
  const seen = new Set<string>()
  while (true) {
    const children = graph.nodes.filter((node) => node.parentId === parent)
    const node =
      children.find((child) => child.id === selection[parent ?? rootKey]) ?? children.at(-1)
    if (!node || seen.has(node.id)) return path
    seen.add(node.id)
    path.push(node)
    parent = node.id
  }
}
