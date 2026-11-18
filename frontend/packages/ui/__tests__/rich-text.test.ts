// @vitest-environment happy-dom
import { expect, it, vi } from 'vite-plus/test'
import { markdownBlocks, richTextBudget, sanitizeDiagram } from '../src/rich-text/markdown'
import { createApp, h, nextTick } from 'vue'
import RichText from '../src/rich-text/RichText.vue'
it('renders GFM tables, strikeout, fences, escaped HTML and safe links without image requests', async () => {
  const blocks = await markdownBlocks(
    '| a | b |\n|---|---|\n| 1 | 2 |\n\n~~gone~~ [safe](https://example.com) ![tracking](https://remote.invalid/a.png)\n\n<img src=x onerror=alert(1)> [bad](javascript:alert(1))\n\n```js\nconst x = 1\n```',
  )
  const html = blocks
    .filter((b) => b.kind === 'html')
    .map((b) => b.text)
    .join('')
  expect(html).toContain('<table>')
  expect(html).toContain('<s>gone</s>')
  expect(html).toContain('noopener noreferrer')
  expect(html).not.toMatch(/<img|onerror="|href="javascript:/)
  expect(blocks.at(-1)).toMatchObject({ kind: 'code', language: 'js', text: 'const x = 1\n' })
})
it('bounds parsing, preserves oversized content, handles unfinished streaming fences and untrusted math', async () => {
  const source = '<script>x</script>'.repeat(richTextBudget.source)
  expect(await markdownBlocks(source)).toEqual([{ kind: 'code', text: source }])
  expect((await markdownBlocks('```js\nconst x =')).at(-1)?.text).toBe('const x =')
  const math = (await markdownBlocks('$\\href{javascript:alert(1)}{click}$'))
    .map((b) => b.text)
    .join('')
  expect(math).not.toContain('href="javascript:')
})
it('removes active SVG and every external resource reference', () => {
  const svg = sanitizeDiagram(
    '<svg xmlns="http://www.w3.org/2000/svg"><path fill="url(https://evil)" style="filter:url(https://evil)" d="M0 0"></path><style>@import "https://evil";</style><image href="https://evil/x"></image><foreignObject><iframe src="https://evil"></iframe></foreignObject><script>alert(1)</script></svg>',
  )
  expect(svg).not.toMatch(/https:|<image|<style|<script|foreignObject|iframe/)
  expect(svg).toContain('<path')
})
it('coalesces stream updates and discards stale renders without taking focus', async () => {
  vi.useFakeTimers()
  const root = document.createElement('div')
  document.body.append(root)
  const { ref } = await import('vue')
  const source = ref('first')
  const app = createApp({
    render: () =>
      h(RichText, {
        source: source.value,
        copyLabel: 'Copy',
        copiedLabel: 'Copied',
        failedLabel: 'Failed',
        renderLabel: 'Render',
        sourceLabel: 'Source',
      }),
  })
  app.mount(root)
  source.value = '**latest**'
  await nextTick()
  await vi.advanceTimersByTimeAsync(richTextBudget.refresh + 1)
  await nextTick()
  expect(root.querySelector('strong')?.textContent).toBe('latest')
  expect(root.textContent).not.toContain('first')
  app.unmount()
  root.remove()
  vi.useRealTimers()
})
