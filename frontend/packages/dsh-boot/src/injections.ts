import type { IndexInjection, IndexInjectionPlacement } from './types.ts'

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function assertNever(row: never): never {
  throw new Error(`dsh-boot: unknown index injection row ${JSON.stringify(row)}`)
}

function renderRow(row: IndexInjection): { placement: IndexInjectionPlacement; markup: string } {
  switch (row.kind) {
    case 'global': {
      const name = JSON.stringify(row.name).replaceAll('<', '\\u003c')
      const value =
        row.value === undefined
          ? 'undefined'
          : JSON.stringify(row.value).replaceAll('<', '\\u003c')
      return { placement: 'head', markup: `<script>globalThis[${name}] = ${value}</script>` }
    }
    case 'script':
      return { placement: row.placement, markup: `<script>${row.text}</script>` }
    case 'script-src':
      return {
        placement: row.placement,
        markup: `<script src="${escapeHtmlAttribute(row.src)}"></script>`,
      }
    case 'script-preload':
      return {
        placement: 'head',
        markup: `<link rel="preload" as="script" href="${escapeHtmlAttribute(row.src)}">`,
      }
    case 'style':
      return { placement: 'head', markup: `<style>${row.text}</style>` }
    case 'html':
      return { placement: row.placement, markup: row.html }
    default:
      return assertNever(row)
  }
}

function splice(html: string, at: number, markup: string): string {
  return `${html.slice(0, at)}${markup}${html.slice(at)}`
}

const READY_MARKUP =
  '<script>(globalThis.__DSH_BOOT_READY__ ??= Promise.withResolvers()).resolve()</script>'

/** Render rows into index.html (includes boot-readiness tail). */
export function renderIndexInjections(html: string, rows: readonly IndexInjection[]): string {
  let head = ''
  let body = ''
  for (const row of rows) {
    const rendered = renderRow(row)
    if (rendered.placement === 'head') head += rendered.markup
    else body += rendered.markup
  }
  body += READY_MARKUP
  let out = html
  if (head !== '') {
    const open = /<head(?:\s[^>]*)?>/i.exec(out)
    out = open === null ? `${head}${out}` : splice(out, open.index + open[0].length, head)
  }
  if (body !== '') {
    const open = /<body(?:\s[^>]*)?>/i.exec(out)
    out = open === null ? `${out}${body}` : splice(out, open.index + open[0].length, body)
  }
  return out
}

export { READY_MARKUP }