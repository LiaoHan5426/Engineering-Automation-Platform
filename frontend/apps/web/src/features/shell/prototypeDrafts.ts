export type DesignerSource = 'builder-alpha' | 'builder-beta'
export type DesignerRecovery = {
  format: 1
  sourceRef: DesignerSource
  title: string
  project: Record<string, unknown>
  cleanTitle: string
  cleanProject: Record<string, unknown>
}
export const recoveryKey = (source: DesignerSource) => 'eap.prototype-recovery.v1.' + source

/** Each designer has one storage namespace. Old global documents are not read or migrated. */
export function scopedPrototypeStorage(source: DesignerSource, storage?: Storage): Storage {
  const current = () => {
    const value = storage ?? globalThis.localStorage
    if (!value) throw new Error('DESIGNER_LOCAL_STORAGE_UNAVAILABLE')
    return value
  }
  return {
    get length() {
      return current().length
    },
    key: (index) => current().key(index),
    clear: () => {
      throw new Error('PROTOTYPE_SCOPED_CLEAR_DENIED')
    },
    getItem: (key) => current().getItem(key + '.' + source),
    setItem: (key, value) => {
      current().setItem(key + '.' + source, value)
      if (current().getItem(key + '.' + source) !== value)
        throw new Error('DESIGNER_LOCAL_WRITE_UNCONFIRMED')
    },
    removeItem: (key) => current().removeItem(key + '.' + source),
  }
}
export function writeDesignerRecovery(value: DesignerRecovery, storage: Storage = localStorage) {
  const raw = JSON.stringify(value)
  if (raw.length > 2_000_000) throw new Error('DESIGNER_RECOVERY_TOO_LARGE')
  storage.setItem(recoveryKey(value.sourceRef), raw)
  if (storage.getItem(recoveryKey(value.sourceRef)) !== raw)
    throw new Error('DESIGNER_LOCAL_WRITE_UNCONFIRMED')
}
export function readDesignerRecovery(
  source: DesignerSource,
  storage: Storage = localStorage,
): DesignerRecovery | null {
  const raw = storage.getItem(recoveryKey(source))
  if (!raw) return null
  try {
    if (raw.length > 2_000_000) throw new Error()
    const value = JSON.parse(raw) as DesignerRecovery
    const object = (x: unknown) => !!x && typeof x === 'object' && !Array.isArray(x)
    if (
      value.format !== 1 ||
      value.sourceRef !== source ||
      typeof value.title !== 'string' ||
      typeof value.cleanTitle !== 'string' ||
      !object(value.project) ||
      !object(value.cleanProject)
    )
      throw new Error()
    return value
  } catch {
    throw new Error('DESIGNER_RECOVERY_INVALID')
  }
}
