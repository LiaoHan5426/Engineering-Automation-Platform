// @vitest-environment happy-dom
import { expect, it } from 'vite-plus/test'
import { parseInline, parseMarkdown, safeHref } from '../src/rich-text/markdown'

it('parses paragraphs and inline emphasis', () => {
  const blocks = parseMarkdown('结果为 **通过**，参考 `rule-1`。')
  expect(blocks).toHaveLength(1)
  const paragraph = blocks[0]!
  expect(paragraph.type).toBe('paragraph')
  if (paragraph.type !== 'paragraph') return
  expect(paragraph.children.map((node) => node.type)).toEqual([
    'text',
    'strong',
    'text',
    'code',
    'text',
  ])
})

it('keeps an unterminated fence as an open code block instead of raw backticks', () => {
  const blocks = parseMarkdown('```java\npublic cla')
  expect(blocks).toHaveLength(1)
  const code = blocks[0]!
  expect(code.type).toBe('code')
  if (code.type !== 'code') return
  expect(code.open).toBe(true)
  expect(code.lang).toBe('java')
  expect(code.value).toBe('public cla')
})

it('closes a fence and keeps the following paragraph separate', () => {
  const blocks = parseMarkdown('```sql\nselect 1\n```\n说明')
  expect(blocks.map((block) => block.type)).toEqual(['code', 'paragraph'])
  const code = blocks[0]!
  if (code.type === 'code') expect(code.open).toBe(false)
})

it('parses a pipe table with header and rows', () => {
  const blocks = parseMarkdown('| 规则 | 级别 |\n| --- | --- |\n| 全表扫描 | 警告 |')
  const table = blocks[0]!
  expect(table.type).toBe('table')
  if (table.type !== 'table') return
  expect(table.header).toHaveLength(2)
  expect(table.rows).toHaveLength(1)
  expect(table.rows[0]).toHaveLength(2)
})

it('parses ordered and unordered lists', () => {
  const ordered = parseMarkdown('1. 先校验\n2. 再执行')
  const first = ordered[0]!
  expect(first.type).toBe('list')
  if (first.type === 'list') {
    expect(first.ordered).toBe(true)
    expect(first.start).toBe(1)
    expect(first.items).toHaveLength(2)
  }

  const bullet = parseMarkdown('- 甲\n- 乙')
  const second = bullet[0]!
  if (second.type === 'list') {
    expect(second.ordered).toBe(false)
    expect(second.items).toHaveLength(2)
  }
})

it('drops javascript: links and keeps the label as text', () => {
  const nodes = parseInline('[点我](javascript:alert(1))')
  expect(nodes.some((node) => node.type === 'link')).toBe(false)
  expect(nodes.map((node) => (node.type === 'text' ? node.value : '')).join('')).toContain('点我')
})

it('accepts only http, https and mailto protocols', () => {
  expect(safeHref('https://example.com/a')).toBe('https://example.com/a')
  expect(safeHref('mailto:a@b.com')).toBe('mailto:a@b.com')
  expect(safeHref('data:text/html,<b>x</b>')).toBeNull()
  expect(safeHref('/relative/path')).toBeNull()
})

it('is total on truncated streaming input', () => {
  for (const source of ['**未闭合', '| a | b', '> 引用', '1.', '# 标题', '```']) {
    expect(() => parseMarkdown(source)).not.toThrow()
  }
})
