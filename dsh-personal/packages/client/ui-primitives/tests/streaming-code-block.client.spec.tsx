import { nextTick } from 'vue'
import { h } from 'vue'
// @vitest-environment jsdom
// The streaming fence arm: StreamingHighlightSession's incremental
// tokenization equals from-scratch tokenization at every appended prefix, and
// CodeBlock's `streaming` arm renders the same token tree as the settled
// shiki-HTML swap while keeping completed lines' DOM nodes untouched. Lives
// apart from code-block.client.spec.tsx so its lazy-grammar timing cannot
// race that file's first-touch assertions (files run isolated).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from './content-render.ts'
import { CodeBlock } from '../src/markdown/CodeBlock.tsx'
import { StreamingHighlightSession } from '../src/markdown/highlight.ts'
import { markdownLabels } from './labels.client.ts'
const LABELS = markdownLabels.code
afterEach(cleanup)
/**
 * One arm's rendered token tree, with every style channel the settled shiki
 * HTML emits (color plus the markup font-style bits), so equality between the
 * streaming spans and the settled `codeToHtml` swap pins full visual parity.
 */
async function readPre(root: HTMLElement) {
  const pre = root.querySelector('pre.shiki')
  await nextTick()
  expect(pre).not.toBeNull()
  return {
    classes: [...pre!.classList].sort().join(' '),
    tabIndex: pre!.getAttribute('tabindex'),
    text: pre!.textContent,
    lines: [...pre!.querySelectorAll('.line')].map(line => [...line.querySelectorAll('span[style]')].map((span) => {
      const style = (span as HTMLElement).style
      return `${span.textContent ?? ''}|${style.color}|${style.fontStyle}|${style.fontWeight}|${style.textDecoration}`
    })),
  }
}
describe('StreamingHighlightSession', () => {
  it('reconstructs the code verbatim and colors tokens through --shiki-* properties', async () => {
    const code = 'const a = 1\n// note\nconst b = "x"'
    const lines = new StreamingHighlightSession().update(code, 'ts')
    await nextTick()
    expect(lines?.map(line => line.map(span => span.text).join('')).join('\n')).toBe(code)
    await nextTick()
    expect(lines?.[0]?.[0]).toEqual({ text: 'const', style: { color: 'var(--shiki-token-keyword)' } })
    await nextTick()
    expect(lines?.[1]?.[0]?.style.color).toBe('var(--shiki-token-comment)')
  })
  it('incremental growth equals a fresh from-scratch tokenization at every prefix', async () => {
    // The template literal spans lines, so mid-stream states leave the
    // grammar inside a multi-line construct — the case where a stale saved
    // state would color the continuation wrong.
    const code = 'const s = `template\nline ${x} mid\n` // done\nconst t: number = 42'
    const session = new StreamingHighlightSession()
    for (let end = 1; end <= code.length; end++) {
      const slice = code.slice(0, end)
      await nextTick()
      expect(session.update(slice, 'ts')).toEqual(new StreamingHighlightSession().update(slice, 'ts'))
    }
  })
  it('keeps completed lines\' span arrays identical across growth and re-tokenizes only the tail', async () => {
    const session = new StreamingHighlightSession()
    const first = session.update('const a = 1\nlet', 'ts')
    await nextTick()
    expect(first).toBeDefined()
    const second = session.update('const a = 1\nlet b = 2', 'ts')
    await nextTick()
    expect(second?.[0]).toBe(first?.[0])
    await nextTick()
    expect(second?.[1]).not.toBe(first?.[1])
  })
  it('reports only newly completed lines to a retained renderer', async () => {
    const session = new StreamingHighlightSession()
    const first = session.updateFrame('const a = 1\nlet', 'ts')
    const second = session.updateFrame('const a = 1\nlet b = 2\n// tail', 'ts')
    await nextTick()
    expect(first?.appended).toHaveLength(1)
    await nextTick()
    expect(first?.tail).toHaveLength(1)
    await nextTick()
    expect(second?.appended).toHaveLength(1)
    await nextTick()
    expect(second?.appended[0]?.map(span => span.text).join('')).toBe('let b = 2')
    await nextTick()
    expect(second?.tail[0]?.map(span => span.text).join('')).toBe('// tail')
    await nextTick()
    expect(second?.generation).toBe(first?.generation)
    await nextTick()
    expect(session.updateFrame('const a = 1\nlet b = 2\n// tail', 'ts')).toBe(second)
  })
  it('emits one completed line per frame across an 800-line stream', async () => {
    const session = new StreamingHighlightSession()
    let code = ''
    let generation: number | undefined
    let appended = 0
    for (let index = 0; index < 800; index += 1) {
      const line = `const value${String(index)} = ${String(index)}`
      code += `${line}\n`
      const frame = session.updateFrame(code, 'ts')
      await nextTick()
      expect(frame?.appended).toHaveLength(1)
      await nextTick()
      expect(frame?.appended[0]?.map(span => span.text).join('')).toBe(line)
      generation ??= frame?.generation
      await nextTick()
      expect(frame?.generation).toBe(generation)
      appended += frame?.appended.length ?? 0
    }
    await nextTick()
    // Frame cardinality is stable across CI hosts; wall-clock thresholds are
    // diagnostics owned by the manual Web performance inventory.
    expect(appended).toBe(800)
  })
  it('is idempotent per input: repeated calls return the identical result array', async () => {
    const session = new StreamingHighlightSession()
    const result = session.update('const a = 1', 'ts')
    await nextTick()
    expect(result).toBeDefined()
    await nextTick()
    expect(session.update('const a = 1', 'ts')).toBe(result)
  })
  it('an alias switch onto the same grammar keeps the cache; a different grammar re-tokenizes correctly', async () => {
    const session = new StreamingHighlightSession()
    const first = session.update('const a = 1\nlet', 'ts')
    await nextTick()
    expect(first).toBeDefined()
    // Same code under a different alias of the same grammar: recomputed
    // (the idempotence key is the raw input) but the line cache is kept.
    const aliased = session.update('const a = 1\nlet', 'typescript')
    await nextTick()
    expect(aliased?.[0]).toBe(first?.[0])
    const json = session.update('{"a": 1}', 'json')
    await nextTick()
    expect(json).toEqual(new StreamingHighlightSession().update('{"a": 1}', 'json'))
  })
  it('non-append input re-tokenizes from scratch', async () => {
    const session = new StreamingHighlightSession()
    session.update('const a = 1\nconst b = 2', 'ts')
    const replaced = session.update('let c = 3', 'ts')
    await nextTick()
    expect(replaced).toEqual(new StreamingHighlightSession().update('let c = 3', 'ts'))
  })
  it('returns undefined for unknown or absent languages, then recovers when a known one arrives', async () => {
    const session = new StreamingHighlightSession()
    await nextTick()
    expect(session.update('x', 'cobol')).toBeUndefined()
    await nextTick()
    expect(session.update('x', undefined)).toBeUndefined()
    await nextTick()
    expect(session.update('const x = 1', 'ts')).toEqual(new StreamingHighlightSession().update('const x = 1', 'ts'))
  })
  it('a lazy grammar reports plain until it registers, then highlights on the next update', async () => {
    const session = new StreamingHighlightSession()
    await nextTick()
    expect(session.update('print(1)', 'python')).toBeUndefined()
    await vi.waitFor(async () => {
      const lines = session.update('print(1)', 'python')
      await nextTick()
      expect(lines?.[0]?.map(span => span.text).join('')).toBe('print(1)')
      await nextTick()
      expect(lines?.[0]?.length).toBeGreaterThan(1)
    }, { timeout: 5000 })
  })
  it('a trailing newline renders as a real empty last line (settled-arm parity)', async () => {
    const lines = new StreamingHighlightSession().update('const a = 1\n', 'ts')
    await nextTick()
    expect(lines).toHaveLength(2)
    await nextTick()
    expect(lines?.[1]).toEqual([])
  })
  it('a blank line inside a multi-line construct keeps the saved grammar state', async () => {
    // The empty completed segment tokenizes as [[]]; the state saved after it
    // must still be the inside-template state, so the continuation stays
    // string-colored (incremental equals from-scratch at every prefix).
    const code = 'const s = `a\n\nb` // done'
    const session = new StreamingHighlightSession()
    for (let end = 1; end <= code.length; end++) {
      const slice = code.slice(0, end)
      await nextTick()
      expect(session.update(slice, 'ts')).toEqual(new StreamingHighlightSession().update(slice, 'ts'))
    }
    const lines = session.update(code, 'ts')
    await nextTick()
    expect(lines?.[1]).toEqual([])
    await nextTick()
    expect(lines?.[2]?.[0]?.text).toBe('b`')
    await nextTick()
    expect(lines?.[2]?.[0]?.style.color).toBe('var(--shiki-token-string-expression)')
  })
  it('a CRLF boundary never leaks its \\r into the grammar (shiki line-split parity)', async () => {
    // bash: a backslash continuation only holds if the line ends at the
    // continuation — a leaked \r would break the saved state and recolor the
    // next line as a fresh command.
    const code = 'echo a \\\r\nb\r\nc'
    const session = new StreamingHighlightSession()
    for (let end = 1; end <= code.length; end++) {
      const slice = code.slice(0, end)
      await nextTick()
      expect(session.update(slice, 'bash')).toEqual(new StreamingHighlightSession().update(slice, 'bash'))
    }
    // Span text carries no \r for completed lines, exactly like the settled
    // arm's shiki output.
    const lines = session.update(code, 'bash')
    await nextTick()
    expect(lines?.map(line => line.map(span => span.text).join('')).join('\n')).toBe('echo a \\\nb\nc')
  })
  it('markdown markup styles (bold/italic/underline) reach the spans once the grammar loads', async () => {
    const snippet = '# Heading\n**bold words** and *italic* and a [link with spaces](https://x.example) tail'
    await vi.waitFor(async () => {
      await nextTick()
      expect(new StreamingHighlightSession().update('# x', 'md')).toBeDefined()
    }, { timeout: 5000 })
    const session = new StreamingHighlightSession()
    for (let end = 1; end <= snippet.length; end++) {
      const slice = snippet.slice(0, end)
      await nextTick()
      expect(session.update(slice, 'md')).toEqual(new StreamingHighlightSession().update(slice, 'md'))
    }
    const lines = session.update(snippet, 'md')
    await nextTick()
    expect(lines?.[0]?.[0]?.style.fontWeight).toBe('bold')
    const spans = lines?.[1] ?? []
    await nextTick()
    expect(spans.some(span => span.style.fontWeight === 'bold')).toBe(true)
    await nextTick()
    expect(spans.some(span => span.style.fontStyle === 'italic')).toBe(true)
    await nextTick()
    expect(spans.some(span => span.style.textDecoration === 'underline')).toBe(true)
  })
})
describe('CodeBlock streaming arm', () => {
  it('renders the same token tree as the settled shiki HTML swap', async () => {
    const code = 'const s = `tpl\nline ${x}\n`\n'
    const streamed = render(h(CodeBlock, { 'code': code, 'lang': 'ts', 'streaming': true, ...LABELS }))
    await nextTick()
    const settled = render(h(CodeBlock, { 'code': code, 'lang': 'ts', ...LABELS }))
    await nextTick()
    await nextTick()
    expect(await readPre(streamed.container)).toEqual(await readPre(settled.container))
  })
  it('a markdown fence matches the settled swap including font styles, and a CRLF fence matches too', async () => {
    // md is a lazy grammar: wait for it so both arms highlight.
    await vi.waitFor(async () => {
      await nextTick()
      expect(new StreamingHighlightSession().update('# x', 'md')).toBeDefined()
    }, { timeout: 5000 })
    const md = '# Heading\n**bold words** and *italic* and a [link with spaces](https://x.example) tail\n'
    const mdStreamed = render(h(CodeBlock, { 'code': md, 'lang': 'md', 'streaming': true, ...LABELS }))
    await nextTick()
    const mdSettled = render(h(CodeBlock, { 'code': md, 'lang': 'md', ...LABELS }))
    await nextTick()
    const streamedTree = await readPre(mdStreamed.container)
    await nextTick()
    expect(streamedTree).toEqual(await readPre(mdSettled.container))
    // The settled arm really carries the styles, so the equality above cannot
    // pass by both arms dropping them.
    const flat = streamedTree.lines.flat().join(' ')
    await nextTick()
    expect(flat).toContain('|bold|')
    await nextTick()
    expect(flat).toContain('|italic|')
    await nextTick()
    expect(flat).toContain('|underline')
    const crlf = 'echo a \\\r\nb\r\nc\n'
    const crlfStreamed = render(h(CodeBlock, { 'code': crlf, 'lang': 'bash', 'streaming': true, ...LABELS }))
    await nextTick()
    const crlfSettled = render(h(CodeBlock, { 'code': crlf, 'lang': 'bash', ...LABELS }))
    await nextTick()
    await nextTick()
    expect(await readPre(crlfStreamed.container)).toEqual(await readPre(crlfSettled.container))
  })
  it('keeps completed lines\' DOM nodes as the code grows and appends the new ones', async () => {
    const view = render(h(CodeBlock, { 'code': 'const a = 1\nlet partial\n', 'lang': 'ts', 'streaming': true, ...LABELS }))
    await nextTick()
    const firstLine = view.container.querySelector('pre.shiki .line')
    await nextTick()
    expect(firstLine).not.toBeNull()
    view.rerender(h(CodeBlock, { 'code': 'const a = 1\nlet partial = 2\n// tail\n', 'lang': 'ts', 'streaming': true, ...LABELS }))
    await nextTick()
    const lines = view.container.querySelectorAll('pre.shiki .line')
    await nextTick()
    expect(lines).toHaveLength(3)
    await nextTick()
    expect(lines[0]).toBe(firstLine)
    await nextTick()
    expect(lines[2]?.textContent).toBe('// tail')
    await nextTick()
    // Newlines separate the line spans, so pre textContent (the copy source)
    // stays the code verbatim.
    expect(view.container.querySelector('pre.shiki')?.textContent).toBe('const a = 1\nlet partial = 2\n// tail')
  })
  it('keeps a tail line mounted when the next frame completes it', async () => {
    const view = render(h(CodeBlock, { 'code': 'const first = 1\n', 'lang': 'ts', 'streaming': true, ...LABELS }))
    await nextTick()
    const firstLine = view.container.querySelector('pre.shiki .line')
    await nextTick()
    expect(firstLine).not.toBeNull()
    view.rerender(h(CodeBlock, { 'code': 'const first = 1\nconst second = 2\nlet tail', 'lang': 'ts', 'streaming': true, ...LABELS }))
    await nextTick()
    await nextTick()
    expect(view.container.querySelector('pre.shiki .line')).toBe(firstLine)
  })
  it('keeps completed line groups mounted while later groups grow', async () => {
    const code = (count: number) => Array.from({ length: count }, (_, index) => `const v${String(index)} = ${String(index)}`).join('\n')
    const view = render(h(CodeBlock, { 'code': code(40), 'lang': 'ts', 'streaming': true, ...LABELS }))
    await nextTick()
    const firstLine = view.container.querySelector('pre.shiki .line')
    const thirtySecond = view.container.querySelectorAll('pre.shiki .line')[31]
    view.rerender(h(CodeBlock, { 'code': code(80), 'lang': 'ts', 'streaming': true, ...LABELS }))
    await nextTick()
    const lines = view.container.querySelectorAll('pre.shiki .line')
    await nextTick()
    expect(lines).toHaveLength(80)
    await nextTick()
    expect(lines[0]).toBe(firstLine)
    await nextTick()
    expect(lines[31]).toBe(thirtySecond)
  })
  it('reuses an unchanged frame when an unrelated lazy grammar finishes loading', async () => {
    const view = render(h(CodeBlock, { 'code': 'const stable = 1\n', 'lang': 'ts', 'streaming': true, ...LABELS }))
    await nextTick()
    const line = view.container.querySelector('pre.shiki .line')
    await nextTick()
    expect(line).not.toBeNull()
    const loader = new StreamingHighlightSession()
    await nextTick()
    expect(loader.update('puts 1', 'ruby')).toBeUndefined()
    await vi.waitFor(async () => { await nextTick(); expect(loader.update('puts 1', 'ruby')).toBeDefined() }, { timeout: 5000 })
    await nextTick()
    expect(view.container.querySelector('pre.shiki .line')).toBe(line)
  })
  it('streaming with an unknown language stays on the identical plain arm', async () => {
    const view = render(h(CodeBlock, { 'code': 'IDENTIFICATION DIVISION.\n', 'lang': 'cobol', 'streaming': true, ...LABELS }))
    await nextTick()
    await nextTick()
    expect(view.container.querySelector('pre.shiki')).toBeNull()
    await nextTick()
    expect(view.getByText('IDENTIFICATION DIVISION.')).toBeTruthy()
  })
  it('the settle transition preserves the highlighted DOM when the code is unchanged', async () => {
    const code = 'const answer = 42\n'
    const view = render(h(CodeBlock, { 'code': code, 'lang': 'ts', 'streaming': true, ...LABELS }))
    await nextTick()
    const streamedLine = view.container.querySelector('pre.shiki .line')
    const streamedText = view.container.querySelector('pre.shiki')?.textContent
    view.rerender(h(CodeBlock, { 'code': code, 'lang': 'ts', ...LABELS }))
    await nextTick()
    const settledText = view.container.querySelector('pre.shiki')?.textContent
    await nextTick()
    expect(streamedText).toBe('const answer = 42')
    await nextTick()
    expect(settledText).toBe(streamedText)
    await nextTick()
    expect(view.container.querySelector('pre.shiki .line')).toBe(streamedLine)
    view.rerender(h(CodeBlock, { 'code': code, 'lang': 'ts', 'streaming': true, ...LABELS }))
    await nextTick()
    await nextTick()
    expect(view.container.querySelector('pre.shiki')?.textContent).toBe(streamedText)
    await nextTick()
    expect(view.container.querySelector('pre.shiki .line')).toBe(streamedLine)
  })
})
