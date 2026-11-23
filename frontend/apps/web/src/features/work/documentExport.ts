/**
 * Client-side Markdown export for the Work document surface.
 *
 * The title and body are the current real draft; this module never samples or
 * invents document content.
 */

function normalizeBody(content: string): string {
  return content.replace(/\r\n?/g, '\n').trim()
}

export function buildMarkdownDocument(title: string, content: string): string {
  const heading = `# ${title.trim()}`
  const body = normalizeBody(content)
  if (!body) return `${heading}\n`
  if (body.startsWith(heading)) return `${body.replace(/\s+$/, '')}\n`
  return `${heading}\n\n${body.replace(/\s+$/, '')}\n`
}

export function markdownFileName(title: string): string {
  const safe = title
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
  return `${safe || 'document'}.md`
}

/** Returns false when the host has no Blob URL support; no partial download. */
export function downloadMarkdownFile(title: string, content: string, target: Document): boolean {
  if (typeof URL.createObjectURL !== 'function') return false
  const markdown = buildMarkdownDocument(title, content)
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const link = target.createElement('a')
    link.href = url
    link.download = markdownFileName(title)
    link.rel = 'noopener'
    target.body.append(link)
    link.click()
    link.remove()
  } finally {
    URL.revokeObjectURL?.(url)
  }
  return true
}
