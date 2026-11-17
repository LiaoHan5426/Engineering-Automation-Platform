import { nextTick } from 'vue'
import { h } from 'vue'
// @vitest-environment jsdom
import { contextMenuHook } from '@deepseek-ai/dsh-client-test-runtime'
import { cleanup, fireEvent, render } from './content-render.ts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MarkdownDelegateProvider } from '../src/index.ts'
import { parseGfm, parseGfmWithMath } from '../src/markdown/parse.ts'
import { MarkdownText } from './markdown-test-components.tsx'
afterEach(cleanup)
describe('Markdown file links', () => {
  it.each([
    ['src/index.ts', 'src/index.ts', undefined],
    ['src/index.ts:24', 'src/index.ts', { line: 24 }],
    ['/workspace/src/index.ts:24', '/workspace/src/index.ts', { line: 24 }],
    ['./README:24', './README', { line: 24 }],
    ['./Makefile:12', './Makefile', { line: 12 }],
    ['src/index.ts:24:5', 'src/index.ts', { line: 24 }],
    ['src/index.ts:24:0', 'src/index.ts', { line: 24 }],
    ['src/index.ts:0:5', 'src/index.ts', undefined],
    ['src/index.ts:0', 'src/index.ts', undefined],
    ['src/index.ts:30-24', 'src/index.ts', undefined],
    ['src/index.ts:1-0', 'src/index.ts', undefined],
    ['src/index.ts:9007199254740992', 'src/index.ts', undefined],
    ['src/index.ts:1-9007199254740992', 'src/index.ts', undefined],
    ['//server/file:24', '//server/file', { line: 24 }],
    ['%5C%5Cserver%5Cfile:24', '\\\\server\\file', { line: 24 }],
    ['%5Cwork%5Cfile:24', '\\work\\file', { line: 24 }],
    ['../index.ts:24', '../index.ts', { line: 24 }],
    ['./index.ts:24', './index.ts', { line: 24 }],
    ['index%2Ets', 'index.ts', undefined],
    ['file.ts#heading', 'file.ts', undefined],
    ['file.ts#L0', 'file.ts', undefined],
    ['file.ts#L3-L2', 'file.ts', undefined],
    ['file.ts#L9007199254740992', 'file.ts', undefined],
    ['file.ts#L1-L9007199254740992', 'file.ts', undefined],
    ['file.ts#L024', 'file.ts', { line: 24 }],
    ['src/index.ts:024', 'src/index.ts', { line: 24 }],
    ['../docs/My%20Notes.md:24-30', '../docs/My Notes.md', { line: 24 }],
    ['C:/work/file.ts:2', 'C:/work/file.ts', { line: 2 }],
    ['C:%5Cwork%5Cfile.ts:2-3', 'C:\\work\\file.ts', { line: 2 }],
    ['docs/notes%3A24', 'docs/notes:24', undefined],
    ['docs/notes%3A24:30', 'docs/notes:24', { line: 30 }],
    ['docs/notes:24#L3', 'docs/notes:24', { line: 3 }],
    ['docs/notes:review', 'docs/notes:review', undefined],
    ['/workspace/src/index.ts#L24', '/workspace/src/index.ts', { line: 24 }],
    ['../docs/My%20Notes.md#L24-L30', '../docs/My Notes.md', { line: 24 }],
    ['C:/work/file.ts#L2', 'C:/work/file.ts', { line: 2 }],
    ['C:%5Cwork%5Cfile.ts', 'C:\\work\\file.ts', undefined],
    ['docs/%E4%B8%AD%E6%96%87.md', 'docs/中文.md', undefined],
    ['file%23name%3F.txt', 'file#name?.txt', undefined],
  ])('opens %s through the preview callback', async (target, path, options) => {
    const openFile = vi.fn()
    const view = render(
      h(
        MarkdownDelegateProvider,
        { openFile: openFile },
        { default: () => [h(MarkdownText, { text: `[source](${target})` })] },
      ),
    )
    await nextTick()
    const link = view.getByRole('button', { name: 'source' })
    await nextTick()
    expect(link.getAttribute('title')).toBe(path)
    await fireEvent.click(link)
    await nextTick()
    expect(openFile).toHaveBeenCalledWith(path, options)
    await nextTick()
    expect(view.container.querySelector('a')).toBeNull()
  })
  it.each([
    ['D:\\dsh\\toc-agent\\.deploy\\notes.md', 'D:\\dsh\\toc-agent\\.deploy\\notes.md', undefined],
    ['<D:\\My Files\\.config\\a_b.md>', 'D:\\My Files\\.config\\a_b.md', undefined],
    ['D:\\.deploy\\notes.md#L4', 'D:\\.deploy\\notes.md', { line: 4 }],
    ['D:/repo\\.github\\ci.yml', 'D:/repo\\.github\\ci.yml', undefined],
    ['D:\\R&amp;D\\a&#32;b.md', 'D:\\R&D\\a b.md', undefined],
    ['D:\\a\\(b\\).md', 'D:\\a\\(b\\).md', undefined],
    ['src\\.github\\ci.yml', 'src\\.github\\ci.yml', undefined],
    ['.\\.env', '.\\.env', undefined],
    ['..\\.gitignore', '..\\.gitignore', undefined],
    ['docs\\_draft.md', 'docs\\_draft.md', undefined],
    ['docs/\\_draft.md', 'docs/_draft.md', undefined],
    ['C:/work/\\_draft.md', 'C:/work/_draft.md', undefined],
  ])('keeps backslashes only where %s is a Windows path', async (target, path, options) => {
    const openFile = vi.fn()
    const view = render(
      h(
        MarkdownDelegateProvider,
        { openFile: openFile },
        {
          default: () => [
            h(MarkdownText, { text: `[source](${target})\n\n[ref][r]\n\n[r]: ${target}` }),
          ],
        },
      ),
    )
    await nextTick()
    await nextTick()
    expect(view.getAllByRole('button').map(button => button.getAttribute('title'))).toEqual([
      path,
      path,
    ])
    await fireEvent.click(view.getByRole('button', { name: 'source' }))
    await nextTick()
    expect(openFile).toHaveBeenCalledExactlyOnceWith(path, options)
  })
  it.each([parseGfm, parseGfmWithMath])('keeps Windows image destinations in %o', async (parse) => {
    const [paragraph] = parse('![chart](D:\\img\\.cache\\a.png)').children
    await nextTick()
    expect(paragraph).toMatchObject({
      children: [{ type: 'image', url: 'D:\\img\\.cache\\a.png' }],
    })
  })
  it('reads backslash escapes in URLs', async () => {
    const view = render(h(MarkdownText, { text: '[source](https://example.com/a\\b\\_c)' }))
    await nextTick()
    await nextTick()
    expect(view.getByRole('link').getAttribute('href')).toBe('https://example.com/a%5Cb_c')
  })
  it.each(['/workspace/chart.png', 'C:/work/chart.png'])(
    'keeps %s accessible when inline images are unavailable',
    async (path) => {
      const openFile = vi.fn()
      const view = render(
        h(
          MarkdownDelegateProvider,
          { openFile: openFile },
          {
            default: () => [
              h(MarkdownText, {
                text: `![Preview](${path}) [Open image](${path})`,
                pathImages: { resolve: () => undefined },
              }),
            ],
          },
        ),
      )
      await nextTick()
      await nextTick()
      expect(view.container.querySelector('img')).toBeNull()
      await fireEvent.click(view.getByRole('button', { name: 'Open image' }))
      await nextTick()
      expect(openFile).toHaveBeenCalledExactlyOnceWith(path, undefined)
    },
  )
  it.each(['', '![](https://example.com/image.png)'])(
    'names an empty label %s with the decoded path',
    async (label) => {
      const view = render(
        h(
          MarkdownDelegateProvider,
          { openFile: vi.fn() },
          { default: () => [h(MarkdownText, { text: `[${label}](docs/My%20Notes.md)` })] },
        ),
      )
      await nextTick()
      await nextTick()
      expect(view.getByRole('button', { name: 'docs/My Notes.md' })).toBeTruthy()
    },
  )
  it('preserves an image label’s alternative text as the accessible name', async () => {
    const view = render(
      h(
        MarkdownDelegateProvider,
        { openFile: vi.fn() },
        {
          default: () => [
            h(MarkdownText, { text: '[![diagram](https://example.com/image.png)](src/a.ts)' }),
          ],
        },
      ),
    )
    await nextTick()
    await nextTick()
    expect(view.getByRole('button', { name: 'diagram' })).toBeTruthy()
  })
  it('handles reference links and code labels without nesting file-mention buttons', async () => {
    const openFile = vi.fn()
    const resolve = vi.fn()
    const view = render(
      h(
        MarkdownDelegateProvider,
        { openFile: openFile },
        {
          default: () => [
            h(MarkdownText, {
              text: '[see `index.ts`][source]\n\n[source]: src/index.ts#L3-L3',
              fileMentions: { resolve },
            }),
          ],
        },
      ),
    )
    await nextTick()
    await fireEvent.click(view.getByRole('button', { name: 'see index.ts' }))
    await nextTick()
    expect(openFile).toHaveBeenCalledWith('src/index.ts', { line: 3 })
    await nextTick()
    expect(resolve).not.toHaveBeenCalled()
    await nextTick()
    expect(view.container.querySelector('button button')).toBeNull()
  })
  it.each([
    'javascript:alert',
    'data:text/plain,hi',
    'vbscript:msgbox',
    '%6Aavascript:alert',
    '#L2',
    'file.ts?raw=1',
    'file%ZZ.ts',
    'file%00.ts',
    ':24',
    'data:123',
    'blob:123',
    'javascript:123',
    '%6Aavascript:123',
    'javascript:alert:24',
    'index%2Ets:24',
    'C:/file.ts?raw=1',
  ])('keeps unsupported destination %s inert', async (target) => {
    const openFile = vi.fn()
    const view = render(
      h(
        MarkdownDelegateProvider,
        { openFile: openFile },
        { default: () => [h(MarkdownText, { text: `[source](${target})` })] },
      ),
    )
    await nextTick()
    await nextTick()
    expect(view.getByText('source')).toBeTruthy()
    await nextTick()
    expect(view.container.querySelector('button, a')).toBeNull()
    await nextTick()
    expect(openFile).not.toHaveBeenCalled()
  })
  it.each([
    'mailto:10086',
    'https:123',
    'http:123',
    'https://example.com:8080',
    'index.ts:24',
    'example.com:8080',
    'localhost:3000',
    'Makefile:12',
    'tel:10086',
    'vscode:open',
    'file:///etc/passwd:24',
    'custom.scheme:value:24',
    'C:123',
  ])('preserves external destination %s with and without a file opener', async (target) => {
    const openFile = vi.fn()
    const markdown = h(MarkdownText, { text: `[external](${target})` })
    const view = render(
      h(MarkdownDelegateProvider, { openFile: openFile }, { default: () => [markdown] }),
    )
    await nextTick()
    await nextTick()
    expect(view.getByRole('link', { name: 'external' }).getAttribute('href')).toBe(target)
    await nextTick()
    expect(view.queryByRole('button')).toBeNull()
    await nextTick()
    expect(openFile).not.toHaveBeenCalled()
    view.rerender(markdown)
    await nextTick()
    await nextTick()
    expect(view.getByRole('link', { name: 'external' }).getAttribute('href')).toBe(target)
  })
  it('preserves external links and leaves local links inert without an opener', async () => {
    const view = render(
      h(MarkdownText, {
        text: '[web](https://example.com/a#L1) [mail](mailto:a@example.com) [file](src/a.ts)',
      }),
    )
    await nextTick()
    await nextTick()
    expect(view.getByRole('link', { name: 'web' }).getAttribute('target')).toBe('_blank')
    await nextTick()
    expect(view.getByRole('link', { name: 'mail' }).getAttribute('href')).toBe(
      'mailto:a@example.com',
    )
    await nextTick()
    expect(view.queryByRole('button')).toBeNull()
  })
  it('enables links after streaming and uses a replaced opener', async () => {
    const first = vi.fn()
    const second = vi.fn()
    const text = '[source](src/a.ts)\n\nmore\n\n'
    const view = render(
      h(
        MarkdownDelegateProvider,
        { openFile: first },
        { default: () => [h(MarkdownText, { text: text, streaming: true })] },
      ),
    )
    await nextTick()
    await nextTick()
    expect(view.queryByRole('button')).toBeNull()
    view.rerender(
      h(
        MarkdownDelegateProvider,
        { openFile: first },
        { default: () => [h(MarkdownText, { text: text })] },
      ),
    )
    await nextTick()
    await fireEvent.click(view.getByRole('button', { name: 'source' }))
    await nextTick()
    expect(first).toHaveBeenCalledOnce()
    view.rerender(
      h(
        MarkdownDelegateProvider,
        { openFile: second },
        { default: () => [h(MarkdownText, { text: text })] },
      ),
    )
    await nextTick()
    await fireEvent.click(view.getByRole('button', { name: 'source' }))
    await nextTick()
    expect(second).toHaveBeenCalledOnce()
    await nextTick()
    expect(first).toHaveBeenCalledOnce()
  })
  it.each(['C:/file.ts:24', '%5C%5Cserver%5Cfile:24', './file.ts:24:5'])(
    'leaves file destination %s inert while streaming',
    async (target) => {
      const view = render(
        h(
          MarkdownDelegateProvider,
          { openFile: vi.fn() },
          { default: () => [h(MarkdownText, { text: `[source](${target})`, streaming: true })] },
        ),
      )
      await nextTick()
      await nextTick()
      expect(view.getByText('source')).toBeTruthy()
      await nextTick()
      expect(view.container.querySelector('a, button')).toBeNull()
    },
  )
  it.each([
    'JaVaScRiPt:alert(1)',
    'javascript&#58;alert(1)',
    'java&#x09;script:alert(1)',
    'vbscript:msgbox(1)',
    'data:text/html,hello',
    'blob:https://example.com/id',
  ])('blocks active-content URL %s in settled and streaming messages', async (target) => {
    const openFile = vi.fn()
    const openExternalLink = vi.fn()
    const content = (streaming: boolean) =>
      h(
        MarkdownDelegateProvider,
        { openFile: openFile, openExternalLink: openExternalLink },
        { default: () => [h(MarkdownText, { text: `[source](${target})`, streaming: streaming })] },
      )
    const view = render(content(false))
    await nextTick()
    await nextTick()
    expect(view.container.querySelector('a, button')).toBeNull()
    view.rerender(content(true))
    await nextTick()
    await nextTick()
    expect(view.container.querySelector('a, button')).toBeNull()
    await nextTick()
    expect(openFile).not.toHaveBeenCalled()
    await nextTick()
    expect(openExternalLink).not.toHaveBeenCalled()
  })
  it('routes file and HTTP(S) links through the same provider', async () => {
    const openFile = vi.fn()
    const openExternalLink = vi.fn()
    const view = render(
      h(
        MarkdownDelegateProvider,
        { openFile: openFile, openExternalLink: openExternalLink },
        {
          default: () => [
            h(MarkdownText, { text: '[source](src/a.ts#L4) [web](https://example.com)' }),
          ],
        },
      ),
    )
    await nextTick()
    await fireEvent.click(view.getByRole('button', { name: 'source' }))
    await nextTick()
    expect(openFile).toHaveBeenCalledExactlyOnceWith('src/a.ts', { line: 4 })
    await nextTick()
    expect(openExternalLink).not.toHaveBeenCalled()
    await fireEvent.click(view.getByRole('link', { name: 'web' }))
    await nextTick()
    expect(openExternalLink).toHaveBeenCalledExactlyOnceWith('https://example.com')
    await nextTick()
    expect(openFile).toHaveBeenCalledOnce()
  })
  it('updates cached links when the nearest provider gains, replaces, or removes its file handler', async () => {
    const outer = vi.fn()
    const first = vi.fn()
    const second = vi.fn()
    const markdown = h(MarkdownText, { text: '[source](src/a.ts)' })
    const scope = (openFile?: (path: string) => void) =>
      h(
        MarkdownDelegateProvider,
        { openFile: outer },
        {
          default: () => [
            h(MarkdownDelegateProvider, { openFile: openFile }, { default: () => [markdown] }),
          ],
        },
      )
    const view = render(scope())
    await nextTick()
    await nextTick()
    expect(view.queryByRole('button')).toBeNull()
    view.rerender(scope(first))
    await nextTick()
    await fireEvent.click(view.getByRole('button', { name: 'source' }))
    await nextTick()
    expect(first).toHaveBeenCalledExactlyOnceWith('src/a.ts', undefined)
    view.rerender(scope(second))
    await nextTick()
    await fireEvent.click(view.getByRole('button', { name: 'source' }))
    await nextTick()
    expect(second).toHaveBeenCalledExactlyOnceWith('src/a.ts', undefined)
    await nextTick()
    expect(first).toHaveBeenCalledOnce()
    view.rerender(scope())
    await nextTick()
    await nextTick()
    expect(view.queryByRole('button')).toBeNull()
    await nextTick()
    expect(view.getByText('source')).toBeTruthy()
    await nextTick()
    expect(outer).not.toHaveBeenCalled()
  })
})
it.each(['src/main.ts#L42', 'src/main.ts:42', 'src/main.ts:42:5', 'src/main.ts:42-48'])(
  'captures %s and other link targets without activating them; linked images take priority',
  async (path) => {
    const openFile = vi.fn(),
      openExternalLink = vi.fn(),
      openContextMenu = vi.fn()
    const view = render(
      h(
        MarkdownDelegateProvider,
        {
          ...{ openFile, openExternalLink },
          getTriggerProps: contextMenuHook(openContextMenu)().getTriggerProps,
        },
        {
          default: () => [
            h(MarkdownText, {
              text: `[file](${path}) [web](https://example.com/a?q=1#part) [![picture](https://example.com/original.gif)](https://example.com/target)`,
            }),
          ],
        },
      ),
    )
    await nextTick()
    await fireEvent.contextMenu(view.getByRole('button', { name: 'file' }), {
      clientX: 2,
      clientY: 3,
    })
    await nextTick()
    expect(openContextMenu).toHaveBeenLastCalledWith(
      { kind: 'file', path: 'src/main.ts', line: 42 },
      { x: 2, y: 3 },
    )
    await fireEvent.contextMenu(view.getByRole('link', { name: 'web' }))
    await nextTick()
    expect(openContextMenu).toHaveBeenLastCalledWith(
      { kind: 'url', url: 'https://example.com/a?q=1#part' },
      expect.any(Object),
    )
    openContextMenu.mockClear()
    await fireEvent.contextMenu(view.getByRole('img', { name: 'picture' }))
    await nextTick()
    expect(openContextMenu).toHaveBeenCalledExactlyOnceWith(
      { kind: 'image', url: 'https://example.com/original.gif' },
      expect.any(Object),
    )
    await nextTick()
    expect(openFile).not.toHaveBeenCalled()
    await nextTick()
    expect(openExternalLink).not.toHaveBeenCalled()
  },
)
it('passes keyboard-positioned produced-file menus and local image identities to their owners', async () => {
  const openMenu = vi.fn(),
    openContextMenu = vi.fn()
  const view = render(
    h(
      MarkdownDelegateProvider,
      { getTriggerProps: contextMenuHook(openContextMenu)().getTriggerProps },
      {
        default: () => [
          h(MarkdownText, {
            text: '`report.svg` ![local](out/report.svg)',
            fileMentions: {
              resolve: () => ({
                title: 'out/report.svg',
                label: 'Report',
                open: vi.fn(),
                contextMenuProps: contextMenuHook((_target, point) => {
                  openMenu(point)
                })().getTriggerProps({ kind: 'image', value: { url: 'unused' } }),
              }),
            },
            pathImages: { resolve: () => 'blob:local' },
          }),
        ],
      },
    ),
  )
  await nextTick()
  await fireEvent.contextMenu(view.getByRole('button', { name: 'Report' }), {
    clientX: 5,
    clientY: 6,
  })
  await nextTick()
  expect(openMenu).toHaveBeenCalledWith({ x: 5, y: 6 })
  await fireEvent.contextMenu(view.getByRole('img'))
  await nextTick()
  expect(openContextMenu).toHaveBeenCalledWith(
    { kind: 'image', url: 'blob:local', path: 'out/report.svg' },
    { x: 0, y: 0 },
  )
})
