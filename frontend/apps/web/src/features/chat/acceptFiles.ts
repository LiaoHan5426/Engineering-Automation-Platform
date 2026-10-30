export const FILE_CAP = 6;
const FILE_BYTES = 64000;
const FILE_CHARS = 16000;
const FILE_TOTAL = 24000;

export type AttachedText = { name: string; content: string };
export type IncomingFile = { name: string; size: number; text: string; media: boolean };
export type AcceptResult =
  | { ok: true; files: AttachedText[]; note: "" | "media" }
  | { ok: false; reason: "limit" | "media" };

/** Accepts text within the existing caps. Images stay filename-only in preview and are refused otherwise. A refusal keeps the previous list. */
export function acceptFiles(existing: readonly AttachedText[], incoming: readonly IncomingFile[], preview: boolean): AcceptResult {
  const next = existing.map((file) => ({ ...file }));
  let note: "" | "media" = "";
  for (const file of incoming) {
    if (file.media) {
      if (!preview) return { ok: false, reason: "media" };
      if (next.length >= FILE_CAP) return { ok: false, reason: "limit" };
      next.push({ name: file.name, content: `[Mock media reference: ${file.name}]` });
      note = "media";
      continue;
    }
    const used = next.reduce((size, item) => size + item.content.length, 0);
    if (next.length >= FILE_CAP || file.size > FILE_BYTES || file.text.includes("\0") || file.text.length > FILE_CHARS || used + file.text.length > FILE_TOTAL)
      return { ok: false, reason: "limit" };
    next.push({ name: file.name, content: file.text });
  }
  return { ok: true, files: next, note };
}
