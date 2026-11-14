import { describe, expect, it, vi } from 'vite-plus/test'
import { IDBFactory } from 'fake-indexeddb'
import {
  createAttachmentPreviews,
  createChatAttachmentStore,
} from '../../../src/features/chat/chatAttachments'

const text = (content = 'hello', name = 'note.txt') =>
  new File([content], name, { type: 'text/plain' })
const image = () =>
  new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0])], 'image.png', {
    type: 'image/png',
  })
const draft = 'draft:conversation-a' as const

describe('local chat attachment lifecycle with IndexedDB', () => {
  it('persists real Blobs across reopen, keeps metadata bounded and selects without sending', async () => {
    const factory = new IDBFactory()
    const first = createChatAttachmentStore('backend-a/workspace-a', factory)
    const refs = await first.select([text()], draft)
    expect(Object.keys(refs[0]!).sort()).toEqual(['id', 'kind', 'mime', 'name', 'sha256', 'size'])
    expect(JSON.stringify(refs)).not.toContain('hello')
    expect(refs[0]!.sha256).toHaveLength(64)
    await first.close()
    const reopened = createChatAttachmentStore('backend-a/workspace-a', factory)
    expect(await reopened.list(draft)).toEqual(refs)
    expect(await (await reopened.get(refs[0]!)).text()).toBe('hello')
    expect(await reopened.prepareTextSubmission(refs)).toEqual([
      { name: 'note.txt', content: 'hello' },
    ])
    expect(await createChatAttachmentStore('backend-b/workspace-a', factory).list(draft)).toEqual(
      [],
    )
    await reopened.close()
  })

  it('retains shared branch owners, and collects only after the final owner releases', async () => {
    const factory = new IDBFactory()
    const store = createChatAttachmentStore('shared', factory)
    const otherTab = createChatAttachmentStore('shared', factory)
    const refs = await store.select([text()], draft)
    await Promise.all([store.retain('message:root', refs), otherTab.retain('message:edited', refs)])
    await store.clear(draft)
    await store.remove('message:root', refs[0]!.id)
    expect(await otherTab.list('message:edited')).toEqual(refs)
    expect(await store.get(refs[0]!)).toBeInstanceOf(Blob)
    await otherTab.clear('message:edited')
    await expect(store.get(refs[0]!)).rejects.toMatchObject({ code: 'attachment.missing' })
    await store.close()
    await otherTab.close()
  })

  it('reports affected owners before eviction and requires identical bytes on reselect', async () => {
    const store = createChatAttachmentStore('missing', new IDBFactory())
    const refs = await store.select([text()], draft)
    const ref = refs[0]!
    expect(await store.affectedOwners(ref.id)).toEqual([draft])
    await store.evictOriginal(ref.id)
    expect(await store.list(draft)).toEqual(refs)
    await expect(store.prepareTextSubmission(refs)).rejects.toMatchObject({
      code: 'attachment.missing',
    })
    await expect(store.reselect(ref, text('different'), draft)).rejects.toMatchObject({
      code: 'attachment.digestMismatch',
    })
    await store.reselect(ref, text('hello', 'renamed.txt'), draft)
    expect(await store.prepareTextSubmission(refs)).toEqual([
      { name: 'note.txt', content: 'hello' },
    ])
    await store.close()
  })

  it('keeps images local until explicit submission to a supported model and revokes previews', async () => {
    const store = createChatAttachmentStore('image', new IDBFactory())
    const refs = await store.select([image()], draft)
    const urls = { createObjectURL: vi.fn(() => 'blob:local'), revokeObjectURL: vi.fn() }
    const previews = createAttachmentPreviews(store, urls)
    const lease = await previews.acquire(refs[0]!)
    expect(lease.url).toBe('blob:local')
    lease.release()
    lease.release()
    expect(urls.revokeObjectURL).toHaveBeenCalledTimes(1)
    await previews.acquire(refs[0]!)
    previews.dispose()
    expect(urls.revokeObjectURL).toHaveBeenCalledTimes(2)
    const pending = previews.acquire(refs[0]!)
    previews.dispose()
    await expect(pending).rejects.toMatchObject({ code: 'attachment.missing' })
    await expect(store.prepareSubmission(refs)).rejects.toMatchObject({
      code: 'attachment.imageContractUnavailable',
    })
    const sent = await store.prepareSubmission(refs, { imageMimeTypes: ['image/png'] })
    expect(sent[0]!.blob.size).toBe(9)
    expect(sent[0]!.text).toBeUndefined()
    await store.close()
  })

  it('rejects unsupported formats and oversized batches atomically', async () => {
    const store = createChatAttachmentStore('limits', new IDBFactory())
    for (const file of [
      new File(['%PDF-1'], 'paper.pdf'),
      new File(['audio'], 'voice.wav'),
      new File(['<svg/>'], 'vector.svg'),
    ])
      await expect(store.select([text(), file], draft)).rejects.toMatchObject({
        code: 'attachment.unsupported',
      })
    await expect(
      store.select(
        Array.from({ length: 7 }, () => text()),
        draft,
      ),
    ).rejects.toMatchObject({ code: 'attachment.limit' })
    await expect(store.select([text('x'.repeat(16001))], draft)).rejects.toMatchObject({
      code: 'attachment.limit',
    })
    expect(await store.list(draft)).toEqual([])
    await store.close()
  })

  it('preserves existing selection on quota/storage failures and reports unavailable IDB', async () => {
    const factory = new IDBFactory()
    const store = createChatAttachmentStore('quota', factory)
    const refs = await store.select([text()], draft)
    // Use the actual factory object store prototype (no hand-written IDB imitation).
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = factory.open('eap.chat.attachments:quota', 1)
      request.onsuccess = () => resolve(request.result)
    })
    const proto = Object.getPrototypeOf(
      db.transaction('originals').objectStore('originals'),
    ) as IDBObjectStore
    const add = vi.spyOn(proto, 'add').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    await expect(store.select([text('second')], draft)).rejects.toMatchObject({
      code: 'attachment.quota',
    })
    add.mockRestore()
    expect(await store.list(draft)).toEqual(refs)
    db.close()
    await store.close()
    await expect(
      createChatAttachmentStore('unavailable', undefined).select([text()], draft),
    ).rejects.toMatchObject({ code: 'attachment.storageUnavailable' })
  })
})
