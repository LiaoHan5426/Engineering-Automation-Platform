export const FILE_CAP = 6
const FILE_BYTES = 64000
const FILE_CHARS = 16000
const FILE_TOTAL = 24000

export type AttachedText = { name: string; content: string }
export type IncomingFile = { name: string; size: number; text: string; media: boolean }
export type AcceptResult =
  | { ok: true; files: AttachedText[]; note: '' | 'media' }
  | { ok: false; reason: 'limit' | 'media' }

/** Accepts text within the existing caps. Images require a supported media contract and are currently refused. A refusal keeps the previous list. */
export function acceptFiles(
  existing: readonly AttachedText[],
  incoming: readonly IncomingFile[],
): AcceptResult {
  const next = existing.map((file) => ({ ...file }))
  const note: '' | 'media' = ''
  for (const file of incoming) {
    if (file.media) return { ok: false, reason: 'media' }
    const used = next.reduce((size, item) => size + item.content.length, 0)
    if (
      next.length >= FILE_CAP ||
      file.size > FILE_BYTES ||
      file.text.includes('\0') ||
      file.text.length > FILE_CHARS ||
      used + file.text.length > FILE_TOTAL
    )
      return { ok: false, reason: 'limit' }
    next.push({ name: file.name, content: file.text })
  }
  return { ok: true, files: next, note }
}
