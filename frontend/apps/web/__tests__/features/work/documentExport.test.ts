import { describe, expect, it } from 'vite-plus/test'
import { buildMarkdownDocument, markdownFileName } from '../../../src/features/work/documentExport'

describe('work document markdown export', () => {
  it('builds a complete markdown document from the real draft', () => {
    expect(buildMarkdownDocument('路线图', '## 目标\n围绕自动化平台。')).toBe(
      '# 路线图\n\n## 目标\n围绕自动化平台。\n',
    )
  })

  it('does not duplicate a title already present in the draft', () => {
    expect(buildMarkdownDocument('路线图', '# 路线图\n\n## 目标')).toBe('# 路线图\n\n## 目标\n')
  })

  it('normalizes line endings and trailing whitespace', () => {
    expect(buildMarkdownDocument('  访谈  ', '正文\r\nnext   \r\n')).toBe('# 访谈\n\n正文\nnext\n')
  })

  it('creates a safe, readable filename from the real document title', () => {
    expect(markdownFileName('产品/路线图:v1')).toBe('产品-路线图-v1.md')
    expect(markdownFileName('   ')).toBe('document.md')
  })
})
