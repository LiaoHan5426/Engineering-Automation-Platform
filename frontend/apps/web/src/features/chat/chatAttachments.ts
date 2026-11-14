import { acceptFiles, FILE_CAP, type AttachedText } from './acceptFiles'

/** Original implementation; IndexedDB Blob approach informed by chat-demo v0.1.1.
 * No upstream source is copied. No upload, provider reference or network side effect.
 */
export const ATTACHMENT_LIMITS = {
  fileBytes: 8 * 1024 * 1024,
  localBytes: 32 * 1024 * 1024,
  nameChars: 255,
} as const
export const ATTACHMENT_ERRORS = {
  unavailable: 'attachment.storageUnavailable',
  quota: 'attachment.quota',
  storage: 'attachment.storage',
  limit: 'attachment.limit',
  unsupported: 'attachment.unsupported',
  missing: 'attachment.missing',
  mismatch: 'attachment.digestMismatch',
  imageContract: 'attachment.imageContractUnavailable',
} as const
export type AttachmentErrorCode = (typeof ATTACHMENT_ERRORS)[keyof typeof ATTACHMENT_ERRORS]
export class AttachmentError extends Error {
  constructor(readonly code: AttachmentErrorCode) {
    super(code)
    this.name = 'AttachmentError'
  }
}
export type LocalAttachment = Readonly<{
  id: string
  name: string
  mime: string
  size: number
  sha256: string
  kind: 'text' | 'image'
}>
type StoredAttachment = LocalAttachment & { blob: Blob | null; owners: string[] }
export type AttachmentOwner = `draft:${string}` | `message:${string}`
function checkOwner(owner: AttachmentOwner) {
  if (!/^(draft|message):.+$/.test(owner) || owner.length > 256)
    throw new AttachmentError(ATTACHMENT_ERRORS.limit)
}

function failure(error: unknown): AttachmentError {
  if (error instanceof AttachmentError) return error
  return new AttachmentError(
    error instanceof DOMException && error.name === 'QuotaExceededError'
      ? ATTACHMENT_ERRORS.quota
      : ATTACHMENT_ERRORS.storage,
  )
}
function metadata(row: StoredAttachment): LocalAttachment {
  const { id, name, mime, size, sha256, kind } = row
  return { id, name, mime, size, sha256, kind }
}
function same(a: LocalAttachment, b: LocalAttachment) {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.sha256 === b.sha256 &&
    a.size === b.size &&
    a.mime === b.mime &&
    a.kind === b.kind
  )
}
async function inspect(file: File): Promise<{ blob: Blob; ref: LocalAttachment }> {
  if (
    !file.size ||
    file.size > ATTACHMENT_LIMITS.fileBytes ||
    file.name.length > ATTACHMENT_LIMITS.nameChars
  )
    throw new AttachmentError(ATTACHMENT_ERRORS.limit)
  const bytes = new Uint8Array(await file.arrayBuffer())
  let mime = ''
  if (
    bytes[0] === 137 &&
    bytes[1] === 80 &&
    bytes[2] === 78 &&
    bytes[3] === 71 &&
    bytes[4] === 13 &&
    bytes[5] === 10 &&
    bytes[6] === 26 &&
    bytes[7] === 10
  )
    mime = 'image/png'
  else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) mime = 'image/jpeg'
  else if (
    String.fromCharCode(...bytes.slice(0, 6)) === 'GIF89a' ||
    String.fromCharCode(...bytes.slice(0, 6)) === 'GIF87a'
  )
    mime = 'image/gif'
  else if (
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  )
    mime = 'image/webp'
  const kind = mime ? 'image' : 'text'
  if (!mime) {
    if (
      file.type.startsWith('image/') ||
      file.type.startsWith('audio/') ||
      /\.(pdf|docx?|xlsx?|pptx?|zip|mp[34]|wav|ogg|svg)$/i.test(file.name) ||
      (bytes[0] === 37 && String.fromCharCode(...bytes.slice(0, 4)) === '%PDF')
    )
      throw new AttachmentError(ATTACHMENT_ERRORS.unsupported)
    let text: string
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      throw new AttachmentError(ATTACHMENT_ERRORS.unsupported)
    }
    const result = acceptFiles([], [{ name: file.name, size: file.size, text, media: false }])
    if (!result.ok) throw new AttachmentError(ATTACHMENT_ERRORS.limit)
    mime = 'text/plain'
  }
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const sha256 = Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('')
  return {
    blob: new Blob([bytes], { type: mime }),
    ref: { id: crypto.randomUUID(), name: file.name, mime, size: file.size, sha256, kind },
  }
}

/** Namespace must include backend/service identity AND workspace, not a conversation.
 * IDB readwrite transactions serialize reference changes across instances and tabs.
 * Draft and immutable message owners are distinct; viewing a branch does not release it.
 */
export function createChatAttachmentStore(
  namespace: string,
  factory: IDBFactory | undefined = globalThis.indexedDB,
) {
  if (!namespace || namespace.length > 1024) throw new AttachmentError(ATTACHMENT_ERRORS.limit)
  let connection: Promise<IDBDatabase> | undefined
  const open = () =>
    (connection ??= new Promise<IDBDatabase>((resolve, reject) => {
      if (!factory) {
        reject(new AttachmentError(ATTACHMENT_ERRORS.unavailable))
        return
      }
      const request = factory.open(`eap.chat.attachments:${namespace}`, 1)
      request.onupgradeneeded = () =>
        request.result.createObjectStore('originals', { keyPath: 'id' })
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close()
          connection = undefined
        }
        resolve(request.result)
      }
      request.onerror = () => {
        connection = undefined
        reject(failure(request.error))
      }
      request.onblocked = () => {
        connection = undefined
        reject(new AttachmentError(ATTACHMENT_ERRORS.unavailable))
      }
    }))
  async function transaction<T>(
    write: boolean,
    apply: (rows: StoredAttachment[], store: IDBObjectStore) => T,
  ): Promise<T> {
    try {
      const db = await open()
      return await new Promise<T>((resolve, reject) => {
        const tx = db.transaction('originals', write ? 'readwrite' : 'readonly')
        const store = tx.objectStore('originals')
        const request = store.getAll()
        let result: T
        let problem: unknown
        request.onsuccess = () => {
          try {
            result = apply(request.result as StoredAttachment[], store)
          } catch (error) {
            problem = error
            tx.abort()
          }
        }
        tx.oncomplete = () => resolve(result)
        tx.onabort = tx.onerror = () => reject(failure(problem ?? tx.error))
      })
    } catch (error) {
      throw failure(error)
    }
  }
  async function select(
    files: readonly File[],
    owner: AttachmentOwner,
  ): Promise<LocalAttachment[]> {
    checkOwner(owner)
    if (files.length > FILE_CAP) throw new AttachmentError(ATTACHMENT_ERRORS.limit)
    const prepared = await Promise.all(files.map(inspect))
    return transaction(true, (rows, store) => {
      if (
        rows.length + prepared.length > 512 ||
        rows.filter((row) => row.owners.includes(owner)).length + prepared.length > FILE_CAP ||
        rows.reduce((n, row) => n + (row.blob?.size ?? 0), 0) +
          prepared.reduce((n, row) => n + row.ref.size, 0) >
          ATTACHMENT_LIMITS.localBytes
      )
        throw new AttachmentError(ATTACHMENT_ERRORS.limit)
      for (const { ref, blob } of prepared) store.add({ ...ref, blob, owners: [owner] })
      return prepared.map((row) => row.ref)
    })
  }
  async function retain(owner: AttachmentOwner, refs: readonly LocalAttachment[]) {
    checkOwner(owner)
    if (refs.length > FILE_CAP) throw new AttachmentError(ATTACHMENT_ERRORS.limit)
    await transaction(true, (rows, store) => {
      if (
        new Set([
          ...rows.filter((row) => row.owners.includes(owner)).map((row) => row.id),
          ...refs.map((ref) => ref.id),
        ]).size > FILE_CAP
      )
        throw new AttachmentError(ATTACHMENT_ERRORS.limit)
      const selected = refs.map((ref) => {
        const row = rows.find((row) => row.id === ref.id)
        if (!row || !row.blob) throw new AttachmentError(ATTACHMENT_ERRORS.missing)
        if (!same(row, ref)) throw new AttachmentError(ATTACHMENT_ERRORS.mismatch)
        if (!row.owners.includes(owner) && row.owners.length >= 256)
          throw new AttachmentError(ATTACHMENT_ERRORS.limit)
        return row
      })
      for (const row of selected)
        store.put({ ...row, owners: [...new Set([...row.owners, owner])] })
    })
  }
  async function release(owner: AttachmentOwner, id?: string) {
    await transaction(true, (rows, store) => {
      for (const row of rows.filter(
        (row) => row.owners.includes(owner) && (!id || row.id === id),
      )) {
        const owners = row.owners.filter((value) => value !== owner)
        if (owners.length) store.put({ ...row, owners })
        else store.delete(row.id)
      }
    })
  }
  async function prepareSubmission(
    refs: readonly LocalAttachment[],
    capabilities: { imageMimeTypes: readonly string[] } = { imageMimeTypes: [] },
  ) {
    if (refs.length > FILE_CAP || refs.reduce((n, ref) => n + ref.size, 0) > 16 * 1024 * 1024)
      throw new AttachmentError(ATTACHMENT_ERRORS.limit)
    const textFiles: AttachedText[] = []
    const prepared = []
    for (const ref of refs) {
      if (ref.kind === 'image' && !capabilities.imageMimeTypes.includes(ref.mime))
        throw new AttachmentError(ATTACHMENT_ERRORS.imageContract)
      const blob = await get(ref)
      const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
      const hash = Array.from(new Uint8Array(digest), (value) =>
        value.toString(16).padStart(2, '0'),
      ).join('')
      if (hash !== ref.sha256) throw new AttachmentError(ATTACHMENT_ERRORS.mismatch)
      const text = ref.kind === 'text' ? await blob.text() : undefined
      if (text !== undefined) {
        const result = acceptFiles(textFiles, [
          { name: ref.name, size: ref.size, text, media: false },
        ])
        if (!result.ok) throw new AttachmentError(ATTACHMENT_ERRORS.limit)
        textFiles.push({ name: ref.name, content: text })
      }
      prepared.push({ ref, blob, text })
    }
    return prepared
  }
  async function get(ref: LocalAttachment): Promise<Blob> {
    return transaction(false, (rows) => {
      const row = rows.find((row) => row.id === ref.id)
      if (!row?.blob) throw new AttachmentError(ATTACHMENT_ERRORS.missing)
      if (!same(row, ref)) throw new AttachmentError(ATTACHMENT_ERRORS.mismatch)
      return row.blob
    })
  }
  return {
    select,
    retain,
    get,
    prepareSubmission,
    list: (owner: AttachmentOwner) =>
      transaction(false, (rows) => rows.filter((row) => row.owners.includes(owner)).map(metadata)),
    remove: (owner: AttachmentOwner, id: string) => release(owner, id),
    clear: (owner: AttachmentOwner) => release(owner),
    /** Display these owners before confirming destructive original eviction. */
    affectedOwners: (id: string) =>
      transaction(false, (rows) => rows.find((row) => row.id === id)?.owners ?? []),
    evictOriginal: (id: string) =>
      transaction(true, (rows, store) => {
        const row = rows.find((row) => row.id === id)
        if (row) store.put({ ...row, blob: null })
      }),
    async reselect(ref: LocalAttachment, file: File, owner: AttachmentOwner) {
      checkOwner(owner)
      const replacement = await inspect(file)
      if (
        replacement.ref.sha256 !== ref.sha256 ||
        replacement.ref.size !== ref.size ||
        replacement.ref.mime !== ref.mime ||
        replacement.ref.kind !== ref.kind
      )
        throw new AttachmentError(ATTACHMENT_ERRORS.mismatch)
      await transaction(true, (rows, store) => {
        const old = rows.find((row) => row.id === ref.id)
        if (old && !same(old, ref)) throw new AttachmentError(ATTACHMENT_ERRORS.mismatch)
        if (
          (!old && rows.length >= 512) ||
          (old && !old.owners.includes(owner) && old.owners.length >= 256) ||
          (!old?.owners.includes(owner) &&
            rows.filter((row) => row.owners.includes(owner)).length >= FILE_CAP)
        )
          throw new AttachmentError(ATTACHMENT_ERRORS.limit)
        if (
          rows.reduce((n, row) => n + (row.id === ref.id ? 0 : (row.blob?.size ?? 0)), 0) +
            file.size >
          ATTACHMENT_LIMITS.localBytes
        )
          throw new AttachmentError(ATTACHMENT_ERRORS.limit)
        store.put({
          ...ref,
          blob: replacement.blob,
          owners: [...new Set([...(old?.owners ?? []), owner])],
        })
      })
    },
    /** Call only on explicit Send. Contents are transient; never persist this projection. */
    async prepareTextSubmission(refs: readonly LocalAttachment[]): Promise<AttachedText[]> {
      return (await prepareSubmission(refs)).map(({ ref, text }) => ({
        name: ref.name,
        content: text!,
      }))
    },
    async close() {
      const db = await connection
      db?.close()
      connection = undefined
    },
  }
}
export type ChatAttachmentStore = ReturnType<typeof createChatAttachmentStore>

/** A view owns a lease; revoke on remove, conversation switch and unmount. */
export function createAttachmentPreviews(
  store: ChatAttachmentStore,
  urls: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'> = URL,
) {
  const active = new Set<string>()
  let generation = 0
  return {
    async acquire(ref: LocalAttachment) {
      if (ref.kind !== 'image') throw new AttachmentError(ATTACHMENT_ERRORS.unsupported)
      const current = generation
      const blob = await store.get(ref)
      if (current !== generation) throw new AttachmentError(ATTACHMENT_ERRORS.missing)
      const url = urls.createObjectURL(blob)
      active.add(url)
      return {
        url,
        release: () => {
          if (active.delete(url)) urls.revokeObjectURL(url)
        },
      }
    },
    dispose() {
      generation++
      for (const url of active) urls.revokeObjectURL(url)
      active.clear()
    },
  }
}
