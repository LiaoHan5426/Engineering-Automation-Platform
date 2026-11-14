import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'

// Presentation budgets; exceeding these retains the original source for copying.
export const richTextBudget = Object.freeze({
  source: 100_000,
  depth: 32,
  tokens: 10_000,
  code: 20_000,
  math: 2_000,
  diagrams: 4,
  diagram: 8_000,
  timeout: 2_000,
  refresh: 80,
})
export type RichBlock = { kind: 'html' | 'code' | 'math'; text: string; language?: string }
const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  ...{ maxNesting: richTextBudget.depth },
})
md.renderer.rules.image = (tokens, i) => md.utils.escapeHtml(`[${tokens[i]?.content ?? ''}]`)
const linkOpen = md.renderer.rules.link_open
md.renderer.rules.link_open = (tokens, i, options, env, self) => {
  tokens[i]?.attrSet('rel', 'noopener noreferrer')
  return linkOpen ? linkOpen(tokens, i, options, env, self) : self.renderToken(tokens, i, options)
}
// Dollar math is recognized outside code spans; raw HTML remains escaped.
md.inline.ruler.after('escape', 'math', (state, silent) => {
  if (state.src[state.pos] !== '$' || state.src[state.pos + 1] === '$') return false
  const end = state.src.indexOf('$', state.pos + 1)
  if (
    end < 0 ||
    end - state.pos > richTextBudget.math ||
    state.src.slice(state.pos, end).includes('\n')
  )
    return false
  if (!silent) {
    const token = state.push('math_inline', '', 0)
    token.content = state.src.slice(state.pos + 1, end)
  }
  state.pos = end + 1
  return true
})
md.renderer.rules.math_inline = (tokens, i, _options, env) => {
  const source = tokens[i]?.content ?? ''
  return env.katex
    ? env.katex.renderToString(source, {
        throwOnError: false,
        trust: false,
        strict: 'error',
        maxExpand: 200,
        maxSize: 10,
      })
    : md.utils.escapeHtml(`$${source}$`)
}
export function sanitizeMarkup(html: string) {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, mathMl: true },
    FORBID_TAGS: ['img', 'iframe', 'style', 'input', 'form'],
    FORBID_ATTR: ['src', 'srcset'],
    ALLOW_DATA_ATTR: false,
  })
}
export function sanitizeDiagram(svg: string) {
  const clean = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: false },
    FORBID_TAGS: ['foreignObject', 'image', 'a', 'style', 'script', 'use'],
    FORBID_ATTR: ['href', 'xlink:href', 'src', 'style'],
    ALLOW_DATA_ATTR: false,
  })
  const document = new DOMParser().parseFromString(clean, 'image/svg+xml')
  for (const element of Array.from(document.querySelectorAll('*'))) {
    for (const attribute of Array.from(element.attributes)) {
      if (/url\s*\(/i.test(attribute.value) && !/^url\(#[\w-]+\)$/.test(attribute.value))
        element.removeAttribute(attribute.name)
    }
  }
  return document.documentElement.tagName === 'svg'
    ? new XMLSerializer().serializeToString(document.documentElement)
    : ''
}
export async function markdownBlocks(source: string): Promise<RichBlock[]> {
  if (source.length > richTextBudget.source) return [{ kind: 'code', text: source }]
  const tokens = md.parse(source, {})
  let count = 0
  const countTokens = (items: typeof tokens): void => {
    for (const token of items) {
      count++
      if (token.children) countTokens(token.children)
    }
  }
  countTokens(tokens)
  if (count > richTextBudget.tokens) return [{ kind: 'code', text: source }]
  const env: { katex?: typeof import('katex').default } = {}
  if (tokens.some((token) => token.children?.some((child) => child.type === 'math_inline')))
    env.katex = (await import('katex')).default
  const blocks: RichBlock[] = []
  let pending: typeof tokens = []
  const flush = () => {
    if (pending.length)
      blocks.push({
        kind: 'html',
        text: sanitizeMarkup(md.renderer.render(pending, md.options, env)),
      })
    pending = []
  }
  for (const token of tokens) {
    if ((token.type === 'fence' || token.type === 'code_block') && token.level === 0) {
      flush()
      blocks.push({
        kind: 'code',
        text: token.content,
        language: token.info.trim().split(/\s+/)[0],
      })
    } else if (
      token.type === 'inline' &&
      token.content.startsWith('$$') &&
      token.content.endsWith('$$') &&
      token.content.length <= richTextBudget.math + 4
    ) {
      // The surrounding paragraph remains a valid empty paragraph.
      flush()
      blocks.push({ kind: 'math', text: token.content.slice(2, -2).trim() })
    } else pending.push(token)
  }
  flush()
  return blocks
}
