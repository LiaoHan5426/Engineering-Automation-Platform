export const BoardTaskColumn = {
  PLANNED: 'planned',
  READY: 'ready',
  RUNNING: 'running',
  ACCEPTANCE: 'acceptance',
  DONE: 'done',
} as const
export type BoardTaskColumn = (typeof BoardTaskColumn)[keyof typeof BoardTaskColumn]
export const boardTaskColumnValues: readonly BoardTaskColumn[] = Object.values(BoardTaskColumn)
export function isBoardTaskColumn(value: unknown): value is BoardTaskColumn {
  return typeof value === 'string' && (boardTaskColumnValues as readonly string[]).includes(value)
}
