/**
 * Minimal, dependency-free Markdown subset parser.
 *
 * Why not a library: chat answers stream in token by token, so the parser must be
 * total (never throw) and must tolerate half-written constructs — an unterminated
 * fence becomes an *open* code block instead of leaking raw backticks into prose.
 * Why not `v-html`: the renderer builds a node tree, so untrusted model output can
 * never inject markup. Links are additionally filtered by protocol.
 */

export type Inline =
  | { type: 'text'; value: string }
  | { type: 'code'; value: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'del'; children: Inline[] }
  | { type: 'link'; href: string; children: Inline[] }

export type Block =
  | { type: 'paragraph'; children: Inline[] }
  | { type: 'heading'; level: number; children: Inline[] }
  | { type: 'code'; lang: string; value: string; open: boolean }
  | { type: 'list'; ordered: boolean; start: number; items: Inline[][] }
  | { type: 'quote'; children: Inline[] }
  | { type: 'table'; header: Inline[][]; rows: Inline[][][] }
  | { type: 'divider' }

const FENCE = /^\s{0,3}(`{3,}|~{3,})\s*([^`\s]*)/
const HEADING = /^\s{0,3}(#{1,6})\s+(.*)$/
const DIVIDER = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/
const QUOTE = /^\s{0,3}>\s?/
const BULLET = /^(\s*)(?:[-*+])\s+(.*)$/
const ORDERED = /^(\s*)(\d{1,9})[.)]\s+(.*)$/
const TABLE_ROW = /^\s*\|(.+)\|\s*$/
const TABLE_RULE = /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/

const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

/** Only absolute http(s)/mailto links survive; anything else is rendered as text. */
export function safeHref(raw: string): string | null {
  const value = raw.trim()
  if (!value || value.length > 2048) return null
  try {
    const url = new URL(value)
    return SAFE_PROTOCOLS.has(url.protocol) ? url.toString() : null
  } catch {
    return null
  }
}

function pushText(nodes: Inline[], value: string): void {
  if (!value) return
  const last = nodes[nodes.length - 1]
  if (last && last.type === 'text') last.value += value
  else nodes.push({ type: 'text', value })
}

/** Index of the closing run of `marker`, or -1. */
function findClose(source: string, from: number, marker: string): number {
  const index = source.indexOf(marker, from)
  return index === from ? -1 : index
}

export function parseInline(source: string): Inline[] {
  const nodes: Inline[] = []
  let buffer = ''
  let i = 0
  const flush = () => {
    pushText(nodes, buffer)
    buffer = ''
  }

  while (i < source.length) {
    const char = source[i]!

    if (char === '\\' && i + 1 < source.length) {
      buffer += source[i + 1]!
      i += 2
      continue
    }

    if (char === '`') {
      const close = source.indexOf('`', i + 1)
      if (close > i + 1) {
        flush()
        nodes.push({ type: 'code', value: source.slice(i + 1, close) })
        i = close + 1
        continue
      }
      buffer += char
      i += 1
      continue
    }

    if (source.startsWith('**', i) || source.startsWith('__', i)) {
      const marker = source.slice(i, i + 2)
      const close = findClose(source, i + 2, marker)
      if (close !== -1) {
        flush()
        nodes.push({ type: 'strong', children: parseInline(source.slice(i + 2, close)) })
        i = close + 2
        continue
      }
      buffer += marker
      i += 2
      continue
    }

    if (source.startsWith('~~', i)) {
      const close = findClose(source, i + 2, '~~')
      if (close !== -1) {
        flush()
        nodes.push({ type: 'del', children: parseInline(source.slice(i + 2, close)) })
        i = close + 2
        continue
      }
      buffer += '~~'
      i += 2
      continue
    }

    if (char === '*') {
      const close = findClose(source, i + 1, '*')
      if (close !== -1) {
        flush()
        nodes.push({ type: 'em', children: parseInline(source.slice(i + 1, close)) })
        i = close + 1
        continue
      }
      buffer += char
      i += 1
      continue
    }

    if (char === '[') {
      const labelEnd = source.indexOf(']', i + 1)
      if (labelEnd !== -1 && source[labelEnd + 1] === '(') {
        const hrefEnd = source.indexOf(')', labelEnd + 2)
        if (hrefEnd !== -1) {
          const href = safeHref(source.slice(labelEnd + 2, hrefEnd))
          const label = source.slice(i + 1, labelEnd)
          flush()
          if (href) nodes.push({ type: 'link', href, children: parseInline(label) })
          else pushText(nodes, label || source.slice(i, hrefEnd + 1))
          i = hrefEnd + 1
          continue
        }
      }
      buffer += char
      i += 1
      continue
    }

    buffer += char
    i += 1
  }

  flush()
  return nodes
}

function splitCells(row: string): string[] {
  const trimmed = row.trim().replace(/^\|/, '').replace(/\|$/, '')
  const cells: string[] = []
  let current = ''
  let escaped = false
  for (const char of trimmed) {
    if (escaped) {
      current += char
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (char === '|') {
      cells.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  cells.push(current.trim())
  return cells
}

function alignCells(cells: string[], width: number): Inline[][] {
  const out: Inline[][] = []
  for (let i = 0; i < width; i += 1) out.push(parseInline(cells[i] ?? ''))
  return out
}

export function parseMarkdown(source: string): Block[] {
  if (!source) return []
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]!

    if (!line.trim()) {
      i += 1
      continue
    }

    const fence = FENCE.exec(line)
    if (fence) {
      const marker = fence[1]!
      const lang = fence[2] ?? ''
      const body: string[] = []
      let closed = false
      i += 1
      while (i < lines.length) {
        const candidate = lines[i]!
        const closing = FENCE.exec(candidate)
        if (closing && closing[1]![0] === marker[0] && closing[1]!.length >= marker.length) {
          closed = true
          i += 1
          break
        }
        body.push(candidate)
        i += 1
      }
      blocks.push({ type: 'code', lang, value: body.join('\n'), open: !closed })
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1]!.length,
        children: parseInline(heading[2]!.trim()),
      })
      i += 1
      continue
    }

    if (DIVIDER.test(line)) {
      blocks.push({ type: 'divider' })
      i += 1
      continue
    }

    if (QUOTE.test(line)) {
      const body: string[] = []
      while (i < lines.length && QUOTE.test(lines[i]!)) {
        body.push(lines[i]!.replace(QUOTE, ''))
        i += 1
      }
      blocks.push({ type: 'quote', children: parseInline(body.join('\n').trim()) })
      continue
    }

    const bullet = BULLET.exec(line)
    const ordered = bullet ? null : ORDERED.exec(line)
    if (bullet || ordered) {
      const isOrdered = Boolean(ordered)
      const start = isOrdered ? Number(ordered![2]) : 1
      const items: Inline[][] = []
      while (i < lines.length) {
        const current = lines[i]!
        const next = isOrdered ? ORDERED.exec(current) : BULLET.exec(current)
        if (!next) break
        const text = isOrdered ? next[3]! : next[2]!
        const continuation: string[] = [text]
        i += 1
        while (
          i < lines.length &&
          lines[i]!.trim() &&
          !BULLET.test(lines[i]!) &&
          !ORDERED.test(lines[i]!) &&
          !FENCE.test(lines[i]!) &&
          !HEADING.test(lines[i]!)
        ) {
          continuation.push(lines[i]!.trim())
          i += 1
        }
        items.push(parseInline(continuation.join(' ')))
      }
      blocks.push({ type: 'list', ordered: isOrdered, start, items })
      continue
    }

    if (line.includes('|') && i + 1 < lines.length && TABLE_RULE.test(lines[i + 1]!)) {
      const header = splitCells(line)
      const width = header.length
      i += 2
      const rows: Inline[][][] = []
      while (i < lines.length && lines[i]!.includes('|') && lines[i]!.trim()) {
        const row = TABLE_ROW.exec(lines[i]!)
        if (!row) break
        rows.push(alignCells(splitCells(lines[i]!), width))
        i += 1
      }
      blocks.push({ type: 'table', header: alignCells(header, width), rows })
      continue
    }

    const paragraph: string[] = []
    while (i < lines.length) {
      const current = lines[i]!
      if (!current.trim()) break
      if (
        FENCE.test(current) ||
        HEADING.test(current) ||
        DIVIDER.test(current) ||
        QUOTE.test(current) ||
        BULLET.test(current) ||
        ORDERED.test(current) ||
        (current.includes('|') && i + 1 < lines.length && TABLE_RULE.test(lines[i + 1]!))
      ) {
        break
      }
      paragraph.push(current.trim())
      i += 1
    }
    blocks.push({ type: 'paragraph', children: parseInline(paragraph.join('\n')) })
  }

  return blocks
}
