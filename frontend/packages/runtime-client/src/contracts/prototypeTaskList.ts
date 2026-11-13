import type { BoardTask } from './boardModels'
import { isBoardTaskColumn, type BoardTaskColumn } from './boardTask'
import type { PrototypeNode } from './prototypeSchema'

export type PrototypeTaskListItem = {
  id: string
  name: string
  status: BoardTaskColumn
  priority: BoardTask['priority']
  summary: string
  goal: string
  acceptanceCriteria: string
}
const keys = ['id', 'name', 'status', 'priority', 'summary', 'goal', 'acceptanceCriteria'] as const
const priorities: readonly BoardTask['priority'][] = ['none', 'p0', 'p1', 'p2']
export function isPrototypeTaskListItems(value: unknown): value is PrototypeTaskListItem[] {
  if (!Array.isArray(value) || value.length > 30) return false
  const ids = new Set<string>()
  return value.every((item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false
    const row = item as Record<string, unknown>
    if (
      Object.keys(row).length !== keys.length ||
      !keys.every((key) => typeof row[key] === 'string')
    )
      return false
    const r = row as PrototypeTaskListItem
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(r.id) || ids.has(r.id)) return false
    ids.add(r.id)
    return (
      !!r.name.trim() &&
      r.name.length <= 120 &&
      r.summary.length <= 240 &&
      !!r.goal.trim() &&
      r.goal.length <= 2000 &&
      !!r.acceptanceCriteria.trim() &&
      r.acceptanceCriteria.length <= 2000 &&
      isBoardTaskColumn(r.status) &&
      priorities.includes(r.priority)
    )
  })
}
export function prototypeTaskListProblems(node: PrototypeNode): string[] {
  return node.kind === 'task-list' &&
    (!isPrototypeTaskListItems(node.props.items) ||
      node.children.length > 0 ||
      ['editable', 'creatable'].some(
        (key) => Object.hasOwn(node.props, key) && typeof node.props[key] !== 'boolean',
      ))
    ? [`invalid_task_list:${node.id}`]
    : []
}
export function parsePrototypeTaskListItems(raw: string): PrototypeTaskListItem[] | null {
  try {
    const value: unknown = JSON.parse(raw)
    return isPrototypeTaskListItems(value) ? value : null
  } catch {
    return null
  }
}
