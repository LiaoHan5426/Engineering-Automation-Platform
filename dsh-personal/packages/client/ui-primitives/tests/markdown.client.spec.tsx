import { nextTick } from 'vue'
import { h } from 'vue'
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from './content-render.ts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { JsonBlock, MarkdownText } from './markdown-test-components.tsx'
import { LinkIconMedium, MarkdownDelegateProvider } from '../src/index.ts'
import { cjkFriendlyStrong } from '../src/markdown/cjkFriendlyStrong.ts'
import { mathCompatibility } from '../src/markdown/mathCompatibility.ts'
afterEach(cleanup)
describe('MarkdownText', () => {
  it('renders CommonMark and GFM elements as semantic DOM', async () => {
    const markdown = [
      '# Heading',
      '',
      'Paragraph with **strong**, *emphasis*, ~~deleted~~, `inline`, and [safe](https://example.com).  ',
      'Hard break.',
      '',
      '> Quote',
      '',
      '- parent',
      '  - child',
      '',
      '1. first',
      '2. second',
      '',
      '- [x] done',
      '- [ ] pending',
      '',
      '| Name | Value |',
      '| --- | --- |',
      '| alpha | beta |',
      '',
      '---',
      '',
      '```ts',
      'const answer = 42',
      '```',
      '',
      '<https://deepseek.com>',
    ].join('\n')
    const { container } = render(h(MarkdownText, { 'text': markdown }))
    await nextTick()
    await nextTick()
    expect(screen.getByRole('heading', { level: 1, name: 'Heading' })).toBeTruthy()
    await nextTick()
    expect(container.querySelector('strong')?.textContent).toBe('strong')
    await nextTick()
    expect(container.querySelector('em')?.textContent).toBe('emphasis')
    await nextTick()
    expect(container.querySelector('del')?.textContent).toBe('deleted')
    await nextTick()
    expect(container.querySelector('blockquote')?.textContent?.trim()).toBe('Quote')
    await nextTick()
    expect(container.querySelectorAll('ul')).toHaveLength(3)
    await nextTick()
    expect(container.querySelector('ol')).not.toBeNull()
    await nextTick()
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(2)
    await nextTick()
    expect(container.querySelector('table')?.textContent).toContain('alphabeta')
    await nextTick()
    expect(container.querySelector('hr')).not.toBeNull()
    await nextTick()
    expect(container.querySelector('pre code')?.textContent).toContain('const answer = 42')
    await nextTick()
    // The ts fence routed through the shared CodeBlock: shiki token spans + banner.
    expect(container.querySelector('pre.shiki')).not.toBeNull()
    await nextTick()
    expect(screen.getByText('ts')).toBeTruthy()
    await nextTick()
    expect(screen.getByRole('button', { name: '复制' })).toBeTruthy()
    await nextTick()
    expect(container.querySelector('br')).not.toBeNull()
    await nextTick()
    expect(screen.getByRole('link', { name: 'safe' }).getAttribute('target')).toBe('_blank')
    await nextTick()
    expect(screen.getByRole('link', { name: 'https://deepseek.com' })).toBeTruthy()
  })
  it('keeps single tildes literal and strikes only double-tilde runs', async () => {
    const source = '约 10~20 分钟，或 30~40 分钟，~~删除~~'
    for (const streaming of [false, true]) {
      const rendered = render(h(MarkdownText, { 'text': source, 'streaming': streaming }))
      await nextTick()
      expect([...rendered.container.querySelectorAll('del')].map(node => node.textContent)).toEqual(['删除'])
      await nextTick()
      expect(rendered.container.textContent).toContain('约 10~20 分钟，或 30~40 分钟')
      rendered.unmount()
    }
    await nextTick()
  })
  it('closes punctuation-terminated strong emphasis before adjacent CJK text', async () => {
    const cases = [
      ['**注意：**内容', '注意：'],
      ['**Notice:**内容', 'Notice:'],
      ['**事件中间件（waterfall）**实现', '事件中间件（waterfall）'],
      ['**事件中间件(waterfall)**实现', '事件中间件(waterfall)'],
      ['**句号。**后续', '句号。'],
      ['**Period.**后续', 'Period.'],
      ['**提醒！**继续', '提醒！'],
      ['**Warning!**继续', 'Warning!'],
    ] as const
    const source = cases.map(([markdown]) => markdown).join('\n\n')
    for (const streaming of [false, true]) {
      const rendered = render(h(MarkdownText, { 'text': source, 'streaming': streaming }))
      await nextTick()
      expect([...rendered.container.querySelectorAll('strong')].map(node => node.textContent))
        .toEqual(cases.map(([, strong]) => strong))
      rendered.unmount()
    }
    await nextTick()
  })
  it('keeps the CJK strong extension out of escaped, code, math, and ASCII contexts', async () => {
    const source = [
      String.raw `\**注意：**内容`,
      '`**注意：**内容`',
      '**Notice:**text',
      '*提醒！*继续',
      '$**注意：**内容$',
      '```md',
      '**注意：**内容',
      '```',
      '**普通**内容',
      '*普通*内容',
      'word**“引号”**word',
      '词*“引号”*继续',
    ].join('\n\n')
    const { container } = render(h(MarkdownText, { 'text': source }))
    await nextTick()
    await nextTick()
    expect([...container.querySelectorAll('strong')].map(node => node.textContent)).toEqual(['普通'])
    await nextTick()
    expect([...container.querySelectorAll('em')].map(node => node.textContent)).toEqual(['普通'])
    await nextTick()
    expect(container.querySelector('code')?.textContent).toBe('**注意：**内容')
    await nextTick()
    expect(container.querySelector('.katex annotation')?.textContent).toBe('**注意：**内容')
    await nextTick()
    expect(container.querySelector('pre code')?.textContent).toContain('**注意：**内容')
    await nextTick()
    expect(container.textContent).toContain('**Notice:**text')
    await nextTick()
    expect(container.textContent).toContain('*提醒！*继续')
    await nextTick()
    expect(container.textContent).toContain('**注意：**内容')
    await nextTick()
    expect(container.textContent).toContain('word**“引号”**word')
    await nextTick()
    expect(container.textContent).toContain('词*“引号”*继续')
  })
  it('opens strong emphasis after CJK text when the span starts with punctuation', async () => {
    const cases = [
      ['针对**“当键盘已经进入深睡眠（彻底断连）时的重连速度”**，继续', ['“当键盘已经进入深睡眠（彻底断连）时的重连速度”']],
      ['一条**“N 小、D 大”**的路', ['“N 小、D 大”']],
      ['是**“用大模型少训”与“用小模型多训”之间的抉择**。', ['“用大模型少训”与“用小模型多训”之间的抉择']],
      ['采用**（实验性）**方案', ['（实验性）']],
      ['导致了**“Wi-Fi 下收不到推送”**的现象，以及包含**（内容）**的列表。', ['“Wi-Fi 下收不到推送”', '（内容）']],
      ['用户判定**「还是有点现代」**，根因是**走错了一代**，不是配色', ['「还是有点现代」', '走错了一代']],
      ['执行**`bluetoothd`**进程，以及**“深睡眠”**测试', ['bluetoothd', '“深睡眠”']],
    ] as const
    const source = cases.map(([markdown]) => markdown).join('\n\n')
    for (const streaming of [false, true]) {
      const rendered = render(h(MarkdownText, { 'text': source, 'streaming': streaming }))
      await nextTick()
      expect([...rendered.container.querySelectorAll('strong')].map(node => node.textContent))
        .toEqual(cases.flatMap(([, strong]) => strong))
      await nextTick()
      expect(rendered.container.textContent).not.toContain('**')
      rendered.unmount()
    }
    await nextTick()
  })
  it('links complete HTTP(S) inline code without promoting commands, unsafe schemes, or fences', async () => {
    const localUrl = 'http://127.0.0.1:3199/?demo=1'
    const remoteUrl = 'https://example.com/preview?q=one%20two#result'
    const source = [
      `\`${localUrl}\``,
      `\`${remoteUrl}\``,
      '`curl http://127.0.0.1:3199/?demo=1`',
      '`javascript:alert(1)`',
      '`mailto:dev@example.com`',
      `\`  ${localUrl}  \``,
      '```',
      localUrl,
      '```',
    ].join('\n\n')
    const { container } = render(h(MarkdownText, { 'text': source }))
    await nextTick()
    const links = screen.getAllByRole('link')
    await nextTick()
    expect(links.map(link => link.getAttribute('href'))).toEqual([localUrl, remoteUrl])
    for (const link of links) {
      await nextTick()
      expect(link.closest('code')).not.toBeNull()
      await nextTick()
      expect(link.getAttribute('target')).toBe('_blank')
      await nextTick()
      expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    }
    links[0]?.focus()
    await nextTick()
    expect(document.activeElement).toBe(links[0])
    await nextTick()
    expect(screen.getByText('curl http://127.0.0.1:3199/?demo=1').closest('a')).toBeNull()
    await nextTick()
    expect(screen.getByText('javascript:alert(1)').closest('a')).toBeNull()
    await nextTick()
    expect(screen.getByText('mailto:dev@example.com').closest('a')).toBeNull()
    const paddedCode = [...container.querySelectorAll('code')]
      .find(code => code.textContent === ` ${localUrl} `)
    await nextTick()
    expect(paddedCode?.querySelector('a')).toBeNull()
    await nextTick()
    expect(container.querySelector('pre code a')).toBeNull()
  })
  it('delegates ordinary HTTP(S) clicks while preserving modified-click behavior', async () => {
    const openExternalLink = vi.fn<(href: string) => void>()
    render(h(MarkdownDelegateProvider, { 'openExternalLink': openExternalLink }, { 'default': () => [h(MarkdownText, { 'text': '[secure](https://example.com/a) [plain](http://example.com/b) `https://example.com/code` [mail](mailto:dev@example.com)' })] }))
    await nextTick()
    const secure = screen.getByRole('link', { name: 'secure' })
    const plain = screen.getByRole('link', { name: 'plain' })
    const code = screen.getByRole('link', { name: 'https://example.com/code' })
    await nextTick()
    expect(await fireEvent.click(secure)).toBe(false)
    await nextTick()
    expect(await fireEvent.click(plain)).toBe(false)
    await nextTick()
    expect(await fireEvent.click(code)).toBe(false)
    await nextTick()
    expect(openExternalLink.mock.calls).toEqual([
      ['https://example.com/a'],
      ['http://example.com/b'],
      ['https://example.com/code'],
    ])
    for (const modified of [
      { button: 1 },
      { metaKey: true },
      { ctrlKey: true },
      { shiftKey: true },
      { altKey: true },
    ])
      expect(await fireEvent.click(secure, modified)).toBe(true)
    await nextTick()
    expect(openExternalLink).toHaveBeenCalledTimes(3)
    await nextTick()
    expect(screen.getByRole('link', { name: 'mail' }).getAttribute('target')).toBeNull()
  })
  it('updates the delegated link handler while Markdown is streaming', async () => {
    const first = vi.fn<(href: string) => void>()
    const second = vi.fn<(href: string) => void>()
    const source = '[web](https://example.com/)'
    const view = render(h(MarkdownDelegateProvider, { 'openExternalLink': first }, { 'default': () => [h(MarkdownText, { 'text': source, 'streaming': true })] }))
    await nextTick()
    await fireEvent.click(screen.getByRole('link', { name: 'web' }))
    view.rerender(h(MarkdownDelegateProvider, { 'openExternalLink': second }, { 'default': () => [h(MarkdownText, { 'text': source, 'streaming': true })] }))
    await nextTick()
    await fireEvent.click(screen.getByRole('link', { name: 'web' }))
    await nextTick()
    expect(first).toHaveBeenCalledOnce()
    await nextTick()
    expect(second).toHaveBeenCalledOnce()
  })
  it('links inline code through the file-mention resolver: URL first, settled only, never inside links', async () => {
    const opened: string[] = []
    const fileMentions = {
      resolve: (value: string) => value === 'index.html' || value === 'out/index.html'
        ? { open: () => { opened.push(value) }, label: 'Open out/index.html', title: 'out/index.html' }
        : undefined,
    }
    const source = [
      '`index.html`',
      '`other.css`',
      '`https://example.com/`',
      // Inside an anchor the mention stays inert code: a button cannot nest there.
      '[see `out/index.html`](https://example.com/doc)',
      '[ref `out/index.html`][target]',
      '[target]: https://example.com/ref',
      '```',
      'index.html',
      '```',
    ].join('\n\n')
    const { container } = render(h(MarkdownText, { 'text': source, 'fileMentions': fileMentions }))
    await nextTick()
    const mention = screen.getByRole('button', { name: 'Open out/index.html' })
    await nextTick()
    expect(mention.closest('code')).not.toBeNull()
    await nextTick()
    // The full path rides title, the same disambiguator the row's chips carry.
    expect(mention.getAttribute('title')).toBe('out/index.html')
    await fireEvent.click(mention)
    await nextTick()
    expect(opened).toEqual(['index.html'])
    await nextTick()
    // Exactly one live mention: the two inside anchors declined, and an
    // unresolved token plus fenced code stay inert.
    expect(container.querySelectorAll('code button')).toHaveLength(1)
    await nextTick()
    expect(container.querySelectorAll('a code button, a button')).toHaveLength(0)
    await nextTick()
    expect(screen.getByText('other.css').closest('button')).toBeNull()
    await nextTick()
    // URL promotion wins before the resolver sees a token.
    expect(screen.getByText('https://example.com/').closest('a')).not.toBeNull()
    // Streaming renders keep mentions off — the one gate lives here: cached
    // frozen elements must not bake in handlers that could go stale.
    const streamed = render(h(MarkdownText, { 'text': '`index.html`\n\nmore\n\n', 'streaming': true, 'fileMentions': fileMentions }))
    await nextTick()
    await nextTick()
    expect(streamed.container.querySelector('button')).toBeNull()
  })
  it('exposes the CJK strong syntax as a micromark extension needing CommonMark attention markers', async () => {
    const extension = cjkFriendlyStrong()
    await nextTick()
    expect(cjkFriendlyStrong()).toBe(extension)
    const construct = extension.text?.[42]
    const tokenizer = Array.isArray(construct) ? construct[0]?.tokenize : construct?.tokenize
    await nextTick()
    expect(tokenizer).toBeTypeOf('function')
    await nextTick()
    expect(() => tokenizer?.call({
      parser: { constructs: { attentionMarkers: {} } },
      previous: null,
    } as never, {} as never, () => undefined, () => undefined)).toThrow('micromark CommonMark attention markers are unavailable')
  })
  it('a fence labeled with an inherited object key renders plain, never crashing shiki', async () => {
    for (const label of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      const { container, unmount } = render(h(MarkdownText, { 'text': '```' + label + '\ncode body\n```' }))
      await nextTick()
      expect(container.querySelector('pre.shiki')).toBeNull()
      await nextTick()
      expect(container.querySelector('pre code')?.textContent).toContain('code body')
      unmount()
    }
    await nextTick()
  })
  it('an empty fence keeps the stock pre; a language-less fence renders the plain CodeBlock arm', async () => {
    const empty = render(h(MarkdownText, { 'text': '```\n```' }))
    await nextTick()
    await nextTick()
    expect(empty.container.querySelector('pre')?.outerHTML).toBe('<pre><code></code></pre>')
    const plain = render(h(MarkdownText, { 'text': '```\nno language here\n```' }))
    await nextTick()
    await nextTick()
    expect(plain.container.querySelector('pre.shiki')).toBeNull()
    await nextTick()
    expect(plain.container.querySelector('pre code')?.textContent).toContain('no language here')
  })
  it('streaming highlights a registered-grammar fence; the finalize swap keeps it highlighted', async () => {
    const fence = '```ts\nconst answer = 42\n```'
    const live = render(h(MarkdownText, { 'text': fence, 'streaming': true }))
    await nextTick()
    const pre = live.container.querySelector('pre.shiki')
    await nextTick()
    expect(pre).not.toBeNull()
    await nextTick()
    expect(pre?.textContent).toContain('const answer = 42')
    await nextTick()
    expect(pre?.querySelectorAll('span[style]').length).toBeGreaterThan(1)
    live.rerender(h(MarkdownText, { 'text': fence }))
    await nextTick()
    await nextTick()
    expect(live.container.querySelector('pre.shiki')).not.toBeNull()
  })
  it('a growing unclosed fence extends highlighting; completed lines keep their DOM nodes', async () => {
    const live = render(h(MarkdownText, { 'text': '```ts\nconst a = 1\nlet partial', 'streaming': true }))
    await nextTick()
    const lines = live.container.querySelectorAll('pre.shiki .line')
    await nextTick()
    expect(lines).toHaveLength(2)
    const firstLine = lines[0]
    live.rerender(h(MarkdownText, { 'text': '```ts\nconst a = 1\nlet partial = 2\n// tail\n```', 'streaming': true }))
    await nextTick()
    const grown = live.container.querySelectorAll('pre.shiki .line')
    await nextTick()
    expect(grown).toHaveLength(3)
    await nextTick()
    expect(grown[0]).toBe(firstLine)
    await nextTick()
    expect(grown[2]?.textContent).toBe('// tail')
    await nextTick()
    expect(live.container.querySelector('pre.shiki')?.textContent).toBe('const a = 1\nlet partial = 2\n// tail')
  })
  it('a fence whose info string is still mid-chunk has no content to color, so no wrong grammar ever paints', async () => {
    // '```t' could complete to ts, toml, … — but until its line ends, the
    // fence has no content and keeps the stock empty pre.
    const live = render(h(MarkdownText, { 'text': '```t', 'streaming': true }))
    await nextTick()
    await nextTick()
    expect(live.container.querySelector('pre')?.outerHTML).toBe('<pre><code class="language-t"></code></pre>')
    live.rerender(h(MarkdownText, { 'text': '```ts\nconst answer = 42', 'streaming': true }))
    await nextTick()
    await nextTick()
    expect(live.container.querySelector('pre.shiki')?.textContent).toBe('const answer = 42')
  })
  it('streaming keeps unknown and language-less fences on the plain arm, and ```math literal until settle', async () => {
    const live = render(h(MarkdownText, { 'text': '```cobol\nDISPLAY "X".\n```\n\n```\nno language\n```\n\n```math\n\\sqrt{2}\n```', 'streaming': true }))
    await nextTick()
    await nextTick()
    expect(live.container.querySelector('pre.shiki')).toBeNull()
    await nextTick()
    expect(live.container.querySelector('.katex')).toBeNull()
    await nextTick()
    expect(live.container.textContent).toContain('\\sqrt{2}')
  })
  it('forwards localized labels to fenced code blocks', async () => {
    render(h(MarkdownText, { 'text': '```ts\nconst answer = 42\n```', 'codeLabels': { copyLabel: 'Copy code', copiedLabel: 'Copied' } }))
    await nextTick()
    await nextTick()
    expect(screen.getByRole('button', { name: 'Copy code' })).toBeTruthy()
  })
  it('renders absolute HTTP(S) images with bounded presentation', async () => {
    const markdown = [
      '![secure diagram](https://example.com/secure.png)',
      '![plain diagram](http://example.com/plain.png)',
    ].join('\n\n')
    const { container } = render(h(MarkdownText, { 'text': markdown }))
    await nextTick()
    const images = [...container.querySelectorAll('img')]
    await nextTick()
    expect(images.map(image => image.getAttribute('src'))).toEqual([
      'https://example.com/secure.png',
      'http://example.com/plain.png',
    ])
    for (const image of images) {
      await nextTick()
      expect(image.getAttribute('loading')).toBe('lazy')
      await nextTick()
      expect(image.getAttribute('decoding')).toBe('async')
      await nextTick()
      expect(image.getAttribute('referrerpolicy')).toBe('no-referrer')
    }
  })
  it('omits raw HTML when asked, in settled and streaming renders, and rebuilds the stream when the choice changes', async () => {
    const text = 'Before <b>bold</b> after\n\n<div align="center">block</div>\n\nTail'
    const view = render(h(MarkdownText, { 'text': text, 'omitHtml': true }))
    await nextTick()
    await nextTick()
    expect(view.container.textContent).toBe('Before bold after\nTail')
    await nextTick()
    expect(view.container.querySelector('div[align]')).toBeNull()
    view.rerender(h(MarkdownText, { 'text': text, 'streaming': true, 'omitHtml': true }))
    await nextTick()
    await nextTick()
    expect(view.container.textContent).toBe('Before bold after\nTail')
    view.rerender(h(MarkdownText, { 'text': text, 'streaming': true }))
    await nextTick()
    await nextTick()
    expect(view.container.textContent).toContain('<div align="center">block</div>')
  })
  it('neutralizes raw HTML, unsafe or relative links, and unsupported images', async () => {
    const markdown = [
      '<script>globalThis.compromised = true</script>',
      '<img src="x" onerror="globalThis.compromised = true">',
      '[script](javascript:alert(1)) [relative](/settings)',
      '[mail](mailto:dev@example.com) [web](http://example.com) [upper](HTTPS://example.com)',
      '![relative diagram](private.png)',
      '![absolute diagram](/workspace/private.png)',
      '![file diagram](file:///workspace/private.png)',
      '![script diagram](javascript:alert(1))',
      '![mail diagram](mailto:dev@example.com)',
    ].join('\n\n')
    const { container } = render(h(MarkdownText, { 'text': markdown }))
    await nextTick()
    await nextTick()
    expect(container.querySelector('script')).toBeNull()
    await nextTick()
    expect(container.querySelector('img')).toBeNull()
    const neutralized = [...container.querySelectorAll('p')]
      .find(paragraph => paragraph.textContent === 'script relative')
    await nextTick()
    expect(neutralized?.querySelector('a')).toBeNull()
    await nextTick()
    expect(screen.getByRole('link', { name: 'mail' }).getAttribute('target')).toBeNull()
    await nextTick()
    expect(screen.getByRole('link', { name: 'web' }).getAttribute('rel')).toBe('noopener noreferrer')
    await nextTick()
    expect(screen.getByRole('link', { name: 'upper' }).getAttribute('target')).toBe('_blank')
    await nextTick()
    expect(screen.getByText('relative diagram')).toBeTruthy()
    await nextTick()
    expect(screen.getByText('absolute diagram')).toBeTruthy()
    await nextTick()
    expect(screen.getByText('file diagram')).toBeTruthy()
    await nextTick()
    expect(screen.getByText('script diagram')).toBeTruthy()
    await nextTick()
    expect(screen.getByText('mail diagram')).toBeTruthy()
  })
  it('leads a known site link with its own mark and an unknown host with the globe', async () => {
    const { container } = render(h(MarkdownText, { 'text': '[repo](https://github.com/org/repo) [docs](https://example.com/a)' }))
    await nextTick()
    const pathsOf = (svg: SVGSVGElement): (string | null)[] => [...svg.querySelectorAll('path')].map(path => path.getAttribute('d'))
    const marks = [...container.querySelectorAll<SVGSVGElement>('p a svg')].map(pathsOf)
    const globe = pathsOf(render(h(LinkIconMedium, { 'kind': 'url' })).container.querySelector('svg')!)
    await nextTick()
    const github = pathsOf(render(h(LinkIconMedium, { 'kind': 'url', 'href': 'https://github.com/a' })).container.querySelector('svg')!)
    await nextTick()
    await nextTick()
    expect(marks).toEqual([github, globe])
  })
  it('keeps incomplete streaming Markdown renderable', async () => {
    const { container } = render(h(MarkdownText, { 'text': '## Streaming\n\n- first\n- **unfinished' }))
    await nextTick()
    await nextTick()
    expect(screen.getByRole('heading', { level: 2, name: 'Streaming' })).toBeTruthy()
    await nextTick()
    expect(container.querySelectorAll('li')).toHaveLength(2)
    await nextTick()
    expect(screen.getByText('**unfinished')).toBeTruthy()
  })
  it('renders inline and display TeX through KaTeX without enabling trusted commands', async () => {
    const source = [
      'Einstein wrote $E = mc^2$.',
      '',
      '$$',
      '\\frac{\\partial \\mathbf{u}}{\\partial t} + (\\mathbf{u} \\cdot \\nabla)\\mathbf{u} = -\\frac{1}{\\rho}\\nabla p',
      '$$',
      '',
      '$\\href{javascript:alert(1)}{unsafe}$',
    ].join('\n')
    const { container } = render(h(MarkdownText, { 'text': source }))
    await nextTick()
    await nextTick()
    expect(container.querySelectorAll('.katex')).toHaveLength(3)
    await nextTick()
    expect(container.querySelectorAll('.katex-display')).toHaveLength(1)
    await nextTick()
    expect(container.querySelector('.katex-display annotation')?.textContent).toContain('\\frac{\\partial \\mathbf{u}}')
    await nextTick()
    expect(container.querySelector('a')).toBeNull()
  })
  it('renders common TeX delimiters and same-line tagged display blocks after the reply settles', async () => {
    const source = [
      'Inline dollar $\\theta$ and backslash \\(\\frac{1}{5}\\).',
      '',
      '\\[\\frac{\\pi}{4} < \\theta < \\frac{\\pi}{2}\\]',
      '',
      '$$\\theta \\in \\left(\\frac{\\pi}{4}, \\frac{\\pi}{2}\\right). \\tag{1}$$',
      '',
      '| Symbol | Value |',
      '| --- | --- |',
      '| $\\theta$ | \\(\\frac{1}{5}\\) |',
    ].join('\n')
    const { container } = render(h(MarkdownText, { 'text': source }))
    await nextTick()
    await nextTick()
    expect(container.querySelectorAll('.katex')).toHaveLength(6)
    await nextTick()
    expect(container.querySelectorAll('.katex-display')).toHaveLength(2)
    await nextTick()
    expect(container.querySelector('.katex-display annotation')?.textContent).toContain('\\frac{\\pi}{4}')
    await nextTick()
    expect([...container.querySelectorAll('.katex-display')].at(-1)?.querySelector('annotation')?.textContent)
      .toContain('\\tag{1}')
    await nextTick()
    expect(container.querySelector('.katex-error')).toBeNull()
    await nextTick()
    expect(container.querySelector('table .katex')).not.toBeNull()
  })
  it('keeps backslash delimiters correct across Markdown boundaries and malformed candidates', async () => {
    const cases = [
      {
        source: '\\(\\alpha \\, \\beta\\)',
        math: 1,
        display: 0,
      },
      {
        source: String.raw `\\\(x\)`,
        math: 1,
        display: 0,
        value: 'x',
      },
      {
        source: '\\(\\frac{1}{5}\n+\\frac{1}{7}\\)',
        math: 1,
        display: 0,
        value: '\\frac{1}{5}\n+\\frac{1}{7}',
      },
      {
        source: '\\[a\\\\\nb\\]',
        math: 1,
        display: 1,
        value: 'a\\\\\nb',
      },
      {
        source: '> \\[\n> \\frac{1}{5}\n> \\]',
        math: 1,
        display: 1,
      },
      {
        source: '- \\[\n  \\frac{1}{5}\n  \\]',
        math: 1,
        display: 1,
      },
    ]
    for (const item of cases) {
      const rendered = render(h(MarkdownText, { 'text': item.source }))
      await nextTick()
      expect(rendered.container.querySelectorAll('.katex')).toHaveLength(item.math)
      await nextTick()
      expect(rendered.container.querySelectorAll('.katex-display')).toHaveLength(item.display)
      await nextTick()
      expect(rendered.container.querySelector('.katex-error')).toBeNull()
      if ('value' in item) {
        await nextTick()
        expect(rendered.container.querySelector('annotation')?.textContent).toBe(item.value)
      }
      rendered.unmount()
    }
    await nextTick()
    const literal = render(h(MarkdownText, { 'text': '\\\\(x\\)\n\n\\[x' }))
    await nextTick()
    await nextTick()
    expect(literal.container.querySelectorAll('.katex')).toHaveLength(0)
    await nextTick()
    expect(literal.container.querySelector('.katex-display')).toBeNull()
    await nextTick()
    expect(literal.container.textContent).toContain('[x')
  })
  it('keeps ordinary dollar blocks and incomplete delimiter candidates parseable', async () => {
    const cases = [
      { source: '$$\n\\theta\n$$', math: 1, display: 1 },
      { source: '$$$\\theta$$$', math: 1, display: 0 },
      { source: '$$a$b\nc', math: 0, display: 0 },
      { source: '  \\[\n  \\theta\n  \\]', math: 1, display: 1 },
      { source: '\\(\\theta', math: 0, display: 0 },
      { source: String.raw `\(a\\)`, math: 0, display: 0 },
      { source: '\\[\n\\[', math: 0, display: 0 },
      { source: '> \\[\nnot a quoted continuation\n\\]', math: 0, display: 0 },
    ]
    for (const item of cases) {
      const rendered = render(h(MarkdownText, { 'text': item.source }))
      await nextTick()
      expect(rendered.container.querySelectorAll('.katex')).toHaveLength(item.math)
      await nextTick()
      expect(rendered.container.querySelectorAll('.katex-display')).toHaveLength(item.display)
      await nextTick()
      expect(rendered.container.querySelector('.katex-error')).toBeNull()
      rendered.unmount()
    }
    await nextTick()
  })
  it('lets display math interrupt an open paragraph', async () => {
    for (const source of ['Prose line\n\\[x\\]', 'Prose line\n$$x$$']) {
      const rendered = render(h(MarkdownText, { 'text': source }))
      await nextTick()
      expect(rendered.container.querySelectorAll('p')).toHaveLength(1)
      await nextTick()
      expect(rendered.container.querySelectorAll('.katex-display')).toHaveLength(1)
      rendered.unmount()
    }
    await nextTick()
  })
  it('leaves a dollar block with trailing text to upstream inline math', async () => {
    const { container } = render(h(MarkdownText, { 'text': '$$x$$ trailing' }))
    await nextTick()
    await nextTick()
    expect(container.querySelectorAll('.katex')).toHaveLength(1)
    await nextTick()
    expect(container.querySelector('.katex-display')).toBeNull()
    await nextTick()
    expect(container.querySelector('annotation')?.textContent).toBe('x')
    await nextTick()
    expect(container.textContent).toContain('trailing')
  })
  it('renders escaped dollars and even backslash pairs before closing fences', async () => {
    const source = [
      String.raw `$$100\$$$`,
      '',
      String.raw `\(a\\\)`,
      '',
      String.raw `\[b\\\]`,
    ].join('\n')
    const { container } = render(h(MarkdownText, { 'text': source }))
    await nextTick()
    const values = [...container.querySelectorAll('annotation')].map(node => node.textContent)
    await nextTick()
    expect(values).toEqual([String.raw `100\$`, String.raw `a\\`, String.raw `b\\`])
    await nextTick()
    expect(container.querySelector('.katex-error')).toBeNull()
  })
  it('bounds fallback work for repeated unclosed backslash delimiters', async () => {
    const startedAt = performance.now()
    const { container } = render(h(MarkdownText, { 'text': '\\(x '.repeat(6400) }))
    await nextTick()
    await nextTick()
    expect(performance.now() - startedAt).toBeLessThan(3000)
    await nextTick()
    expect(container.querySelector('.katex')).toBeNull()
  })
  it('leaves TeX-looking fenced code literal', async () => {
    const source = '```tex\n\\[\\frac{1}{5}\\]\n$$x \\tag{1}$$\n```'
    const { container } = render(h(MarkdownText, { 'text': source }))
    await nextTick()
    await nextTick()
    expect(container.querySelector('.katex')).toBeNull()
    await nextTick()
    expect(container.querySelector('pre code')?.textContent).toContain('\\[\\frac{1}{5}\\]')
    await nextTick()
    expect(container.querySelector('pre code')?.textContent).toContain('$$x \\tag{1}$$')
  })
  it('exposes the compatibility syntax as a micromark extension', async () => {
    const extension = mathCompatibility()
    await nextTick()
    expect(Object.keys(extension)).toEqual(['flow', 'text'])
    await nextTick()
    expect(mathCompatibility()).toBe(extension)
  })
  it('defers TeX rendering while streaming so incomplete formulas never flash KaTeX errors', async () => {
    const partial = '$$\n\\frac{\\partial \\mathbf{u}}{\\partial'
    const complete = '$$\n\\frac{\\partial \\mathbf{u}}{\\partial t}\n$$'
    const live = render(h(MarkdownText, { 'text': partial, 'streaming': true }))
    await nextTick()
    await nextTick()
    expect(live.container.querySelector('.katex')).toBeNull()
    await nextTick()
    expect(live.container.querySelector('.katex-error')).toBeNull()
    await nextTick()
    expect(live.container.textContent).toContain('\\frac{\\partial \\mathbf{u}}{\\partial')
    live.rerender(h(MarkdownText, { 'text': complete }))
    await nextTick()
    await nextTick()
    expect(live.container.querySelectorAll('.katex')).toHaveLength(1)
    await nextTick()
    expect(live.container.querySelectorAll('.katex-display')).toHaveLength(1)
    await nextTick()
    expect(live.container.querySelector('.katex-error')).toBeNull()
  })
})
describe('JsonBlock', () => {
  it('collapsed by default; toggle reveals pretty-printed payload', async () => {
    render(h(JsonBlock, { 'label': 'args', 'payload': { a: 1 } }))
    await nextTick()
    await nextTick()
    expect(screen.queryByText(/"a": 1/)).toBeNull()
    await fireEvent.click(screen.getByRole('button', { name: /args/ }))
    await nextTick()
    expect(screen.getByText(/"a": 1/)).toBeDefined()
    await fireEvent.click(screen.getByRole('button', { name: /args/ }))
    await nextTick()
    expect(screen.queryByText(/"a": 1/)).toBeNull()
  })
  it('defaultOpen renders the body immediately', async () => {
    const { container } = render(h(JsonBlock, { 'label': 'args', 'payload': [1, 2], 'defaultOpen': true }))
    await nextTick()
    await nextTick()
    expect(container.querySelector('pre')?.textContent).toContain('1')
  })
  it('stringifies undefined payloads via String()', async () => {
    const { container } = render(h(JsonBlock, { 'label': 'x', 'payload': undefined, 'defaultOpen': true }))
    await nextTick()
    await nextTick()
    expect(container.querySelector('pre')?.textContent).toBe('undefined')
  })
  it('falls back to String() for circular payloads', async () => {
    const circular: {
      self?: unknown
    } = {}
    circular.self = circular
    const { container } = render(h(JsonBlock, { 'label': 'x', 'payload': circular, 'defaultOpen': true }))
    await nextTick()
    await nextTick()
    expect(container.querySelector('pre')?.textContent).toBe('[object Object]')
  })
  it('truncates beyond the size cap with a suffix note', async () => {
    const big = 'x'.repeat(30000)
    const { container } = render(h(JsonBlock, { 'label': 'x', 'payload': big, 'defaultOpen': true }))
    await nextTick()
    const body = container.querySelector('pre')!.textContent
    await nextTick()
    expect(body.length).toBeLessThan(30000)
    await nextTick()
    expect(body).toContain('截断')
  })
})
