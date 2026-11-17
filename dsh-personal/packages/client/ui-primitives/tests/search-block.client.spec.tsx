import { nextTick } from 'vue'
import { h } from 'vue'
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from './content-render.ts'
import { DEFAULT_SEARCH_MAX_LINES, SearchBlock as LocalizedSearchBlock } from '../src/index.ts'
import type { SearchFileGroup, SearchMatchesBlockProps, SearchPathsBlockProps } from '../src/index.ts'
import { searchBlockLabels } from './labels.client.ts'
type SearchBlockProps = Omit<SearchMatchesBlockProps, 'labels'> | Omit<SearchPathsBlockProps, 'labels'>
function SearchMatchesBlock(props: Omit<SearchMatchesBlockProps, 'labels'>) {
  return h(LocalizedSearchBlock, { ...props, 'labels': searchBlockLabels })
}
function SearchPathsBlock(props: Omit<SearchPathsBlockProps, 'labels'>) {
  return h(LocalizedSearchBlock, { ...props, 'labels': searchBlockLabels })
}
function SearchBlock(props: SearchBlockProps) {
  return props.kind === 'matches'
    ? h(SearchMatchesBlock, { ...props }) : h(SearchPathsBlock, { ...props })
}
afterEach(cleanup)
beforeEach(() => {
  vi.useRealTimers()
})
function lines(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[class^="_line_"]')].map(row => row.textContent ?? '')
}
function fileHeaders(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[class^="_fileHeader_"]')].map(row => row.textContent ?? '')
}
function group(path: string, count: number, from = 1): SearchFileGroup {
  return {
    path,
    matches: Array.from({ length: count }, (_v, i) => ({ lineNumber: from + i, line: `hit ${from + i}` })),
  }
}
describe('SearchBlock matches kind', () => {
  it('renders each file as a header group with its matched lines', async () => {
    const view = render(h(SearchBlock, { 'kind': 'matches', 'truncated': false, 'total': 3, 'files': [
      { path: 'a.ts', matches: [{ lineNumber: 12, line: 'const a = 1' }, { lineNumber: 40, line: 'return a' }] },
      { path: 'b.ts', matches: [{ lineNumber: 7, line: 'const b = 2' }] },
    ] }))
    await nextTick()
    await nextTick()
    expect(fileHeaders(view.container)).toEqual(['a.ts2', 'b.ts1'])
    await nextTick()
    expect(lines(view.container)).toEqual(['12: const a = 1', '40: return a', '7: const b = 2'])
    await nextTick()
    // The summary counts matches and files, with no folded pre-cap total below the cap.
    expect(view.getByText('3 处匹配 · 2 个文件')).toBeTruthy()
    await nextTick()
    expect(view.queryByText(/显示|共/u)).toBeNull()
  })
  it('collapses and re-expands a single file group without touching the others', async () => {
    const view = render(h(SearchBlock, { 'kind': 'matches', 'truncated': false, 'total': 3, 'files': [
      { path: 'a.ts', matches: [{ lineNumber: 1, line: 'x' }] },
      { path: 'b.ts', matches: [{ lineNumber: 2, line: 'y' }] },
    ] }))
    await nextTick()
    const [headerA] = view.container.querySelectorAll('[class^="_fileHeader_"]')
    await nextTick()
    expect(headerA!.getAttribute('aria-expanded')).toBe('true')
    await fireEvent.click(headerA!)
    await nextTick()
    // a.ts collapsed: its match row is gone, b.ts's stays.
    expect(headerA!.getAttribute('aria-expanded')).toBe('false')
    await nextTick()
    expect(lines(view.container)).toEqual(['2: y'])
    await fireEvent.click(headerA!)
    await nextTick()
    expect(lines(view.container)).toEqual(['1: x', '2: y'])
  })
  it('folds the pre-cap total into the summary when truncated', async () => {
    const view = render(h(SearchBlock, { 'kind': 'matches', 'truncated': true, 'total': 99, 'files': [group('a.ts', 2)] }))
    await nextTick()
    await nextTick()
    expect(view.getByText('显示 2 / 共 99 处匹配 · 1 个文件')).toBeTruthy()
  })
})
describe('SearchBlock paths kind', () => {
  it('renders a flat path list with a path-count summary', async () => {
    const view = render(h(SearchBlock, { 'kind': 'paths', 'truncated': false, 'total': 2, 'paths': ['src/a.ts', 'src/b.ts'] }))
    await nextTick()
    await nextTick()
    expect(lines(view.container)).toEqual(['src/a.ts', 'src/b.ts'])
    await nextTick()
    expect(view.getByText('2 个路径')).toBeTruthy()
    await nextTick()
    // No file-group headers in the paths shape.
    expect(fileHeaders(view.container)).toEqual([])
  })
  it('folds the pre-cap total into the paths summary when truncated', async () => {
    const view = render(h(SearchBlock, { 'kind': 'paths', 'truncated': true, 'total': 50, 'paths': ['a', 'b'] }))
    await nextTick()
    await nextTick()
    expect(view.getByText('显示 2 / 共 50 个路径')).toBeTruthy()
  })
})
describe('SearchBlock empty arm', () => {
  it('shows the placeholder and no copy control for an empty matches result', async () => {
    const view = render(h(SearchBlock, { 'kind': 'matches', 'truncated': false, 'total': 0, 'files': [] }))
    await nextTick()
    await nextTick()
    expect(view.getByText('无结果')).toBeTruthy()
    await nextTick()
    expect(view.queryByText('复制')).toBeNull()
    await nextTick()
    expect(view.getByText('0 处匹配 · 0 个文件')).toBeTruthy()
  })
  it('shows the placeholder for an empty paths result', async () => {
    const view = render(h(SearchBlock, { 'kind': 'paths', 'truncated': false, 'total': 0, 'paths': [] }))
    await nextTick()
    await nextTick()
    expect(view.getByText('无结果')).toBeTruthy()
    await nextTick()
    expect(view.queryByText('复制')).toBeNull()
  })
})
describe('SearchBlock height cap', () => {
  it('renders every row and no expand control under the cap', async () => {
    const view = render(h(SearchBlock, { 'kind': 'paths', 'truncated': false, 'total': 4, 'paths': ['a', 'b', 'c', 'd'], 'maxLines': 4 }))
    await nextTick()
    await nextTick()
    expect(lines(view.container)).toHaveLength(4)
    await nextTick()
    expect(view.container.querySelector('[aria-label^="展开"]')).toBeNull()
  })
  it('slices head and tail over the cap and expands on click', async () => {
    const paths = Array.from({ length: 10 }, (_v, i) => `p${i + 1}`)
    const view = render(h(SearchBlock, { 'kind': 'paths', 'truncated': false, 'total': 10, 'paths': paths, 'maxLines': 4 }))
    await nextTick()
    await nextTick()
    // maxLines 4: head = ceil(4/2) = 2, tail = 2, 6 hidden.
    expect(lines(view.container)).toEqual(['p1', 'p2', 'p9', 'p10'])
    const toggle = view.getByRole('button', { name: '展开其余 6 行结果' })
    await nextTick()
    expect(toggle.textContent).toBe('… 其余 6 行')
    await fireEvent.click(toggle)
    await nextTick()
    expect(lines(view.container)).toHaveLength(10)
    const collapse = view.getByRole('button', { name: '收起结果' })
    await nextTick()
    expect(collapse.textContent).toBe('收起')
    await fireEvent.click(collapse)
    await nextTick()
    expect(lines(view.container)).toEqual(['p1', 'p2', 'p9', 'p10'])
  })
  it('counts a file header as one capped row alongside its matches', async () => {
    // One file with 10 matches → 11 rows (header + 10). Cap 4: head 2, tail 2.
    const view = render(h(SearchBlock, { 'kind': 'matches', 'truncated': false, 'total': 10, 'files': [group('a.ts', 10)], 'maxLines': 4 }))
    await nextTick()
    await nextTick()
    // Head takes the header then the first match; tail takes the last two matches.
    expect(lines(view.container)).toEqual(['1: hit 1', '9: hit 9', '10: hit 10'])
    await nextTick()
    expect(fileHeaders(view.container)).toEqual(['a.ts10'])
    await nextTick()
    expect(view.getByRole('button', { name: '展开其余 7 行结果' })).toBeTruthy()
  })
  it('renders the head slice alone when the cap leaves no tail', async () => {
    const view = render(h(SearchBlock, { 'kind': 'paths', 'truncated': false, 'total': 5, 'paths': ['a', 'b', 'c', 'd', 'e'], 'maxLines': 1 }))
    await nextTick()
    await nextTick()
    expect(lines(view.container)).toEqual(['a'])
    await nextTick()
    expect(view.getByRole('button', { name: '展开其余 4 行结果' })).toBeTruthy()
  })
  it('restores the owning file header above a tail slice that begins mid-file', async () => {
    // Two files of 10 matches each → 22 rows. Cap 8: head 4 (a.ts header + 3
    // matches), tail 4. The tail begins mid-b.ts, so its header is restored —
    // and, being a row itself, it consumes one tail slot rather than pushing the
    // card to 9 rows: the tail keeps its last 3 matches, total visible = 8.
    const view = render(h(SearchBlock, { 'kind': 'matches', 'truncated': false, 'total': 20, 'maxLines': 8, 'files': [
      group('a.ts', 10), group('b.ts', 10, 11),
    ] }))
    await nextTick()
    await nextTick()
    expect(fileHeaders(view.container)).toEqual(['a.ts10', 'b.ts10'])
    await nextTick()
    expect(lines(view.container)).toEqual([
      '1: hit 1', '2: hit 2', '3: hit 3',
      '18: hit 18', '19: hit 19', '20: hit 20',
    ])
    await nextTick()
    // Visible rows hold at maxLines (2 headers + 6 matches = 8), so the hidden
    // count stays exact: 22 − 8 = 14.
    expect(view.getByRole('button', { name: '展开其余 14 行结果' })).toBeTruthy()
  })
  it('caps at the documented default when maxLines is absent', async () => {
    const paths = Array.from({ length: DEFAULT_SEARCH_MAX_LINES + 1 }, (_v, i) => `p${i}`)
    const view = render(h(SearchBlock, { 'kind': 'paths', 'truncated': false, 'total': paths.length, 'paths': paths }))
    await nextTick()
    await nextTick()
    expect(lines(view.container)).toHaveLength(DEFAULT_SEARCH_MAX_LINES)
    await nextTick()
    expect(view.getByRole('button', { name: '展开其余 1 行结果' })).toBeTruthy()
  })
})
describe('SearchBlock copy', () => {
  it('copies the whole structured matches result, not the collapsed or capped view', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const view = render(h(SearchBlock, { 'kind': 'matches', 'truncated': true, 'total': 9, 'maxLines': 2, 'files': [
      { path: 'a.ts', matches: [{ lineNumber: 1, line: 'x' }, { lineNumber: 2, line: 'y' }] },
      { path: 'b.ts', matches: [{ lineNumber: 3, line: 'z' }] },
    ] }))
    await nextTick()
    // Collapse a group and leave the cap in place: the clipboard still gets it all.
    await fireEvent.click(view.container.querySelector('[class^="_fileHeader_"]')!)
    await fireEvent.click(screen.getByRole('button', { name: '复制' }))
    await nextTick()
    expect(writeText).toHaveBeenCalledWith('a.ts\n1: x\n2: y\n\nb.ts\n3: z')
    await act(async () => { await Promise.resolve() })
    await nextTick()
    expect(screen.getByRole('button', { name: '复制成功' })).toBeTruthy()
    // A second click while the ok label shows is a no-op.
    await fireEvent.click(screen.getByRole('button', { name: '复制成功' }))
    await nextTick()
    expect(writeText).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    await nextTick()
    expect(screen.getByRole('button', { name: '复制' })).toBeTruthy()
  })
  it('copies the newline-joined path list for the paths shape', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(h(SearchBlock, { 'kind': 'paths', 'truncated': false, 'total': 2, 'paths': ['src/a.ts', 'src/b.ts'] }))
    await nextTick()
    await fireEvent.click(screen.getByRole('button', { name: '复制' }))
    await nextTick()
    expect(writeText).toHaveBeenCalledWith('src/a.ts\nsrc/b.ts')
    await nextTick()
    expect(await screen.findByRole('button', { name: '复制成功' })).toBeTruthy()
  })
  it('does not claim success when the host refuses the write', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    })
    render(h(SearchBlock, { 'kind': 'paths', 'truncated': false, 'total': 1, 'paths': ['a'] }))
    await nextTick()
    await fireEvent.click(screen.getByRole('button', { name: '复制' }))
    await act(async () => { await Promise.resolve() })
    await nextTick()
    expect(screen.getByRole('button', { name: '复制' })).toBeTruthy()
    await nextTick()
    expect(screen.queryByRole('button', { name: '复制成功' })).toBeNull()
  })
  it('merges className onto the wrapper and tags the wrapper with the kind', async () => {
    const view = render(h(SearchBlock, { 'kind': 'paths', 'truncated': false, 'total': 0, 'paths': [], 'className': 'x' }))
    await nextTick()
    await nextTick()
    expect(view.container.firstElementChild?.classList.contains('x')).toBe(true)
    await nextTick()
    expect(view.container.firstElementChild?.getAttribute('data-search')).toBe('paths')
  })
})
