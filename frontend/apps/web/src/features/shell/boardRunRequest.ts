import type { BoardRunStart } from '@eap/runtime-client'
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const key = (id: string, scope: string) => `${scope}.eap.board-run.v1.${id}`
export function readRunRequest(
  store: Store | null,
  id: string,
  projectId: string,
  scope: string,
): BoardRunStart | null {
  try {
    const value = JSON.parse(store?.getItem(key(id, scope)) ?? 'null')
    if (
      !value ||
      value.projectId !== projectId ||
      !Number.isSafeInteger(value.revision) ||
      value.revision < 1 ||
      typeof value.workspacePath !== 'string' ||
      !value.workspacePath.trim() ||
      value.workspacePath.length > 2048 ||
      typeof value.requestId !== 'string' ||
      !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value.requestId)
    )
      return null
    return value
  } catch {
    return null
  }
}
export function writeRunRequest(
  store: Store | null,
  id: string,
  scope: string,
  request: BoardRunStart | null,
): boolean {
  try {
    if (!store) return false
    if (request) store.setItem(key(id, scope), JSON.stringify(request))
    else store.removeItem(key(id, scope))
    return true
  } catch {
    return false
  }
}
