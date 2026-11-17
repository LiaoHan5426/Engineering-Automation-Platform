import { nextTick } from 'vue'
import { h } from 'vue'
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from './content-render.ts'
type ComponentProps<T extends abstract new (...args: never[]) => {
  $props: unknown
}> = InstanceType<T>['$props']
import { CodeBlock as LocalizedCodeBlock } from '../src/markdown/CodeBlock.tsx'
import { diffBlockLabels, markdownLabels } from './labels.client.ts'
function CodeBlock(props: Omit<ComponentProps<typeof LocalizedCodeBlock>, 'copyLabel' | 'copiedLabel'>) {
  return h(LocalizedCodeBlock, { ...props, ...markdownLabels.code })
}
afterEach(cleanup)
/** The fence's rendered row elements, in source order. */
function rows(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll('pre code > span.line')] as HTMLElement[]
}
const TS_DIFF = [
  'diff --git a/src/app.ts b/src/app.ts',
  'index 1111111..2222222 100644',
  '--- a/src/app.ts',
  '+++ b/src/app.ts',
  '@@ -1,3 +1,4 @@',
  ' const value: number = 1',
  '-const removed = 1',
  '+const added = 2',
  'no marker here',
].join('\n')
describe('diff fences', () => {
  it('classifies added, removed, context, hunk, and file-header rows', async () => {
    const { container } = render(h(CodeBlock, { 'code': TS_DIFF, 'lang': 'diff', 'showHeader': false }))
    await nextTick()
    const lines = rows(container)
    await nextTick()
    expect(lines).toHaveLength(9)
    await nextTick()
    expect(lines[0]!.className).toContain('_diffMeta_')
    await nextTick()
    expect(lines[1]!.className).toContain('_diffMeta_')
    await nextTick()
    expect(lines[2]!.className).toContain('_diffMeta_')
    await nextTick()
    expect(lines[3]!.className).toContain('_diffMeta_')
    await nextTick()
    expect(lines[4]!.className).toContain('_diffHunk_')
    await nextTick()
    expect(lines[5]!.className).not.toContain('_diffAdd_')
    await nextTick()
    expect(lines[5]!.className).not.toContain('_diffDel_')
    await nextTick()
    expect(lines[6]!.className).toContain('_diffDel_')
    await nextTick()
    expect(lines[7]!.className).toContain('_diffAdd_')
    await nextTick()
    expect(lines[8]!.className).not.toContain('_diffAdd_')
    await nextTick()
    expect(lines[8]!.textContent).toBe('no marker here')
  })
  it('keeps the source byte-identical so copy still reproduces the fence', async () => {
    const { container } = render(h(CodeBlock, { 'code': TS_DIFF, 'lang': 'diff', 'showHeader': false }))
    await nextTick()
    await nextTick()
    expect(container.querySelector('pre')!.textContent).toBe(TS_DIFF)
  })
  it('highlights the body with the language the diff header names', async () => {
    const { container } = render(h(CodeBlock, { 'code': TS_DIFF, 'lang': 'diff', 'showHeader': false }))
    await nextTick()
    await nextTick()
    expect(container.querySelectorAll('pre code span[style*="--shiki-"]').length).toBeGreaterThan(0)
  })
  it('falls back to plain body text when the diff names no known language', async () => {
    const code = ['+++ b/notes.unknownext', '@@ -1 +1 @@', '+plain text'].join('\n')
    const { container } = render(h(CodeBlock, { 'code': code, 'lang': 'diff', 'showHeader': false }))
    await nextTick()
    await nextTick()
    expect(rows(container)[2]!.className).toContain('_diffAdd_')
    await nextTick()
    expect(container.querySelectorAll('pre code span[style*="--shiki-"]').length).toBe(0)
  })
  it('treats header-shaped lines after a hunk as changed content', async () => {
    const code = ['--- a/x.ts', '+++ b/x.ts', '@@ -1 +1,2 @@', '--- removed header-like line', '+++ added header-like line'].join('\n')
    const lines = rows(render(h(CodeBlock, { 'code': code, 'lang': 'diff', 'showHeader': false })).container)
    await nextTick()
    await nextTick()
    expect(lines[0]!.className).toContain('_diffMeta_')
    await nextTick()
    expect(lines[1]!.className).toContain('_diffMeta_')
    await nextTick()
    expect(lines[3]!.className).toContain('_diffDel_')
    await nextTick()
    expect(lines[4]!.className).toContain('_diffAdd_')
  })
  it('resolves the language from the old path when the new side is /dev/null', async () => {
    const code = ['--- a/src/app.ts', '+++ /dev/null', '@@ -1 +0,0 @@', '-const removed = 1'].join('\n')
    const { container } = render(h(CodeBlock, { 'code': code, 'lang': 'diff', 'showHeader': false }))
    await nextTick()
    await nextTick()
    expect(container.querySelectorAll('pre code span[style*="--shiki-"]').length).toBeGreaterThan(0)
  })
  it('skips /dev/null on the old side of a creation', async () => {
    const code = ['--- /dev/null', '+++ b/src/new.ts', '@@ -0,0 +1 @@', '+export const created = true'].join('\n')
    const { container } = render(h(CodeBlock, { 'code': code, 'lang': 'diff', 'showHeader': false }))
    await nextTick()
    await nextTick()
    expect(container.querySelectorAll('pre code span[style*="--shiki-"]').length).toBeGreaterThan(0)
  })
  it('renders patch fences the same way', async () => {
    const { container } = render(h(CodeBlock, { 'code': '@@ -1 +1 @@\n-old\n+new', 'lang': 'patch', 'showHeader': false }))
    await nextTick()
    const lines = rows(container)
    await nextTick()
    expect(lines[1]!.className).toContain('_diffDel_')
    await nextTick()
    expect(lines[2]!.className).toContain('_diffAdd_')
  })
  it('renders file-level chrome rows as meta', async () => {
    const code = [
      'similarity index 90%',
      'rename from a/x.ts',
      'rename to b/x.ts',
      'Binary files a/x and b/x differ',
      '\\ No newline at end of file',
    ].join('\n')
    const lines = rows(render(h(CodeBlock, { 'code': code, 'lang': 'diff', 'showHeader': false })).container)
    await nextTick()
    await nextTick()
    expect(lines).toHaveLength(5)
    for (const line of lines)
      expect(line.className).toContain('_diffMeta_')
  })
  it('keeps the second file header of a git diff as chrome', async () => {
    const code = [
      'diff --git a/a.ts b/a.ts',
      '--- a/a.ts',
      '+++ b/a.ts',
      '@@ -1 +1 @@',
      '-old',
      '+new',
      'diff --git a/b.css b/b.css',
      'index 333..444 100644',
      '--- a/b.css',
      '+++ b/b.css',
      '@@ -1 +1 @@',
      '-old',
      '+new',
    ].join('\n')
    const lines = rows(render(h(CodeBlock, { 'code': code, 'lang': 'diff', 'showHeader': false })).container)
    await nextTick()
    await nextTick()
    expect(lines).toHaveLength(13)
    for (const index of [7, 8, 9])
      expect(lines[index]!.className).toContain('_diffMeta_')
    await nextTick()
    expect(lines[11]!.className).toContain('_diffDel_')
    await nextTick()
    expect(lines[12]!.className).toContain('_diffAdd_')
  })
  it('ends a hunk by its line budget so concatenated diff -u headers stay chrome', async () => {
    const code = [
      '--- a/a.ts',
      '+++ b/a.ts',
      '@@ -1 +1 @@',
      '-old',
      '+new',
      '--- a/b.ts',
      '+++ b/b.ts',
      '@@ -1 +1 @@',
      '-x',
      '+y',
    ].join('\n')
    const lines = rows(render(h(CodeBlock, { 'code': code, 'lang': 'diff', 'showHeader': false })).container)
    await nextTick()
    await nextTick()
    expect(lines[5]!.className).toContain('_diffMeta_')
    await nextTick()
    expect(lines[6]!.className).toContain('_diffMeta_')
  })
  it('accepts uppercase diff and patch info strings', async () => {
    const lines = rows(render(h(CodeBlock, { 'code': '@@ -1 +1 @@\n-old\n+new', 'lang': 'Diff', 'showHeader': false })).container)
    await nextTick()
    await nextTick()
    expect(lines[1]!.className).toContain('_diffDel_')
    await nextTick()
    expect(lines[2]!.className).toContain('_diffAdd_')
  })
  it('resolves quoted header paths', async () => {
    const code = ['--- "a/src/app.ts"', '+++ "b/src/app.ts"', '@@ -1 +1 @@', '-const old = 1', '+const next = 2'].join('\n')
    const { container } = render(h(CodeBlock, { 'code': code, 'lang': 'diff', 'showHeader': false }))
    await nextTick()
    await nextTick()
    expect(container.querySelectorAll('pre code span[style*="--shiki-"]').length).toBeGreaterThan(0)
  })
  it('treats every mode, copy, and dissimilarity line as chrome', async () => {
    const code = ['old mode 100644', 'new mode 100755', 'copy from a/x.ts', 'copy to b/x.ts', 'dissimilarity index 20%'].join('\n')
    const lines = rows(render(h(CodeBlock, { 'code': code, 'lang': 'diff', 'showHeader': false })).container)
    await nextTick()
    await nextTick()
    expect(lines).toHaveLength(5)
    for (const line of lines)
      expect(line.className).toContain('_diffMeta_')
  })
  it('tokenizes the removed and added sides independently', async () => {
    const code = ['--- a/src/app.ts', '+++ b/src/app.ts', '@@ -1 +1 @@', '-/*', '+const fixed = 1'].join('\n')
    const lines = rows(render(h(CodeBlock, { 'code': code, 'lang': 'diff', 'showHeader': false })).container)
    await nextTick()
    const added = [...lines[4]!.querySelectorAll('span')]
    const keyword = added.find(span => span.textContent === 'const')
    await nextTick()
    expect(keyword?.style.color).toBe('var(--shiki-token-keyword)')
    const removed = [...lines[3]!.querySelectorAll('span')]
    const comment = removed.find(span => span.textContent.trim() === '/*')
    await nextTick()
    expect(comment?.style.color).toBe('var(--shiki-token-comment)')
  })
  it('keeps rows when the owner turns wrapping off', async () => {
    const { container } = render(h(CodeBlock, { 'code': '@@ -1 +1 @@\n-old\n+new', 'lang': 'diff', 'showHeader': false, 'toolbarLabels': diffBlockLabels, 'wrap': false }))
    await nextTick()
    await nextTick()
    expect(container.querySelector('[data-code-wrap="false"]')).toBeTruthy()
    await nextTick()
    expect(rows(container)).toHaveLength(3)
  })
  it('omits the local wrap action from the toolbar when the owner supplies wrapping', async () => {
    const { container } = render(h(CodeBlock, { 'code': '@@ -1 +1 @@\n-old\n+new', 'lang': 'diff', 'toolbarLabels': diffBlockLabels, 'wrap': true }))
    await nextTick()
    await nextTick()
    expect(container.querySelector('[data-code-wrap="true"]')).toBeTruthy()
    await nextTick()
    expect(screen.queryByRole('button', { name: diffBlockLabels.wrapLabel })).toBeNull()
    await nextTick()
    expect(rows(container)).toHaveLength(3)
  })
  it('renders content under a malformed hunk header', async () => {
    const code = ['@@ not a hunk header @@', '+add', '-del', ' ctx'].join('\n')
    const lines = rows(render(h(CodeBlock, { 'code': code, 'lang': 'diff', 'showHeader': false })).container)
    await nextTick()
    await nextTick()
    expect(lines[0]!.className).toContain('_diffHunk_')
    await nextTick()
    expect(lines[1]!.className).toContain('_diffAdd_')
    await nextTick()
    expect(lines[2]!.className).toContain('_diffDel_')
    await nextTick()
    expect(lines[3]!.className).toContain('_diffContext_')
  })
  it('keeps a group whose last removed line is empty', async () => {
    const code = ['--- a/src/app.ts', '+++ b/src/app.ts', '@@ -1,2 +1,2 @@', '-a', '-', '+b', '+c'].join('\n')
    const lines = rows(render(h(CodeBlock, { 'code': code, 'lang': 'diff', 'showHeader': false })).container)
    await nextTick()
    await nextTick()
    expect(lines).toHaveLength(7)
    await nextTick()
    expect(lines[4]!.textContent).toBe('-')
    await nextTick()
    expect(lines[5]!.textContent).toBe('+b')
  })
  it('keeps the numbered gutter usable on a diff fence', async () => {
    const { container } = render(h(CodeBlock, { 'code': TS_DIFF, 'lang': 'diff', 'lineNumbers': true, 'showHeader': false }))
    await nextTick()
    await nextTick()
    expect(container.querySelector('[data-line-numbers="true"]')).toBeTruthy()
    await nextTick()
    expect(rows(container)).toHaveLength(9)
  })
  it('diff={false} renders a diff-language block without diff rows', async () => {
    const { container } = render(h(CodeBlock, { 'code': '@@ -1 +1 @@\n-old\n+new', 'lang': 'diff', 'diff': false, 'showHeader': false }))
    await nextTick()
    await nextTick()
    expect(container.querySelectorAll('[class*="_diffAdd_"], [class*="_diffDel_"]').length).toBe(0)
    await nextTick()
    expect(container.querySelector('pre')!.textContent).toBe('@@ -1 +1 @@\n-old\n+new')
  })
  it('diff forces rows for any language', async () => {
    const { container } = render(h(CodeBlock, { 'code': '@@ -1 +1 @@\n-old\n+new', 'lang': 'text', 'diff': true, 'showHeader': false }))
    await nextTick()
    const lines = rows(container)
    await nextTick()
    expect(lines).toHaveLength(3)
    await nextTick()
    expect(lines[1]!.className).toContain('_diffDel_')
    await nextTick()
    expect(lines[2]!.className).toContain('_diffAdd_')
  })
})
