// @vitest-environment jsdom
import { h } from 'vue'
import { fireEvent, screen, waitFor, within } from '@testing-library/dom'
import { renderVue as render, cleanupVue as cleanup, flushVue as act } from './vue-render.ts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JsonTree as LocalizedJsonTree, type JsonTreeProps } from '../src/JsonTree.tsx'
import { jsonTreeLabels } from './labels.client.ts'
function JsonTree(props: Omit<JsonTreeProps, 'label' | 'labels'> & {
  label?: string
}) {
  return h(LocalizedJsonTree, { 'label': 'JSON', ...props, 'labels': jsonTreeLabels }, undefined)
}
let writeText: ReturnType<typeof vi.fn<Clipboard['writeText']>>
let originalClipboard: PropertyDescriptor | undefined
beforeEach(() => {
  originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  writeText = vi.fn<Clipboard['writeText']>().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  if (originalClipboard === undefined)
    Reflect.deleteProperty(navigator, 'clipboard')
  else
    Object.defineProperty(navigator, 'clipboard', originalClipboard)
})
function stubStringLayout(scrollHeight = 200): void {
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(scrollHeight)
  const computedStyle = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
    const style = computedStyle(element)
    style.lineHeight = '16px'
    if (style.paddingBottom === '')
      style.paddingBottom = '0px'
    return style
  })
}
describe('JsonTree', () => {
  it('ignores clipboard settlement after the row changes or the tree unmounts', async () => {
    vi.useFakeTimers()
    const pending: (() => void)[] = []
    writeText.mockImplementation(() => new Promise<void>((resolve) => { pending.push(resolve) }))
    const view = await act(async () => render(h(JsonTree, { 'data': { first: 1, second: 2 } }, undefined)))
    const rows = screen.getAllByRole('treeitem')
    await act(async () => fireEvent.mouseOver(rows[0] as HTMLElement))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy value' })))
    await act(async () => fireEvent.mouseOver(rows[1] as HTMLElement))
    await act(async () => { pending[0]!() })
    expect(screen.queryByRole('button', { name: 'Copied' })).toBeNull()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy value' })))
    view.unmount()
    const timerCount = vi.getTimerCount()
    await act(async () => { pending[1]!() })
    expect(vi.getTimerCount()).toBe(timerCount)
  })
  it('updates copy actions without rereading JSON properties on hover', async () => {
    const readValue = vi.fn(() => 'payload '.repeat(100))
    const data = Object.fromEntries(Array.from({ length: 500 }, (_, index) => [
      `field${index}`,
      { get value() { return readValue() } },
    ]))
    await act(async () => render(h(JsonTree, { 'data': data }, undefined)))
    const rows = within(screen.getByRole('tree')).getAllByRole('treeitem')
    readValue.mockClear()
    await act(async () => fireEvent.mouseOver(rows[0] as HTMLElement))
    expect(within(rows[0] as HTMLElement).getByRole('button', { name: 'Copy pretty JSON' })).toBeTruthy()
    await act(async () => fireEvent.mouseOver(rows[1] as HTMLElement))
    expect(within(rows[0] as HTMLElement).queryByRole('button', { name: 'Copy pretty JSON' })).toBeNull()
    expect(within(rows[1] as HTMLElement).getByRole('button', { name: 'Copy pretty JSON' })).toBeTruthy()
    expect(readValue).not.toHaveBeenCalled()
  })
  it('expands raw strings without ResizeObserver and keeps the visible viewport limit', async () => {
    stubStringLayout()
    vi.stubGlobal('ResizeObserver', undefined)
    let rawTop = 150
    const view = await act(async () => render(h('div', { 'style': { overflowY: 'auto', paddingBottom: '10px' } }, [h(JsonTree, { 'data': { first: 'raw\ntext', last: 'last\ntext' } }, undefined)])))
    const clip = view.container.firstElementChild as HTMLElement
    vi.spyOn(clip, 'clientTop', 'get').mockReturnValue(2)
    vi.spyOn(clip, 'clientHeight', 'get').mockReturnValue(140)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return new DOMRect(0, this === clip ? 100 : rawTop, 200, 140)
    })
    const rows = within(screen.getByRole('tree')).getAllByRole('treeitem')
    await act(async () => fireEvent.click(within(rows[0] as HTMLElement).getByRole('button', { name: 'Expand JSON node' })))
    const raw = rows[0]?.querySelector('pre') as HTMLPreElement
    expect(raw.textContent).toBe('raw\ntext')
    expect(raw.style.maxHeight).toBe('78px')
    expect(raw.nextElementSibling?.textContent).toBe(',')
    rawTop = 80
    await act(async () => fireEvent.scroll(clip))
    expect(raw.style.maxHeight).toBe('126px')
    rawTop = 300
    await act(async () => fireEvent.resize(window))
    expect(raw.style.maxHeight).toBe('16px')
    await act(async () => fireEvent.click(within(rows[0] as HTMLElement).getByRole('button', { name: 'Collapse JSON node' })))
    expect(raw.isConnected).toBe(false)
    rawTop = 100
    await act(async () => fireEvent.scroll(clip))
    expect(raw.style.maxHeight).toBe('16px')
    await act(async () => fireEvent.click(within(rows[1] as HTMLElement).getByRole('button', { name: 'Expand JSON node' })))
    expect(rows[1]?.querySelector('pre')?.nextElementSibling?.textContent).not.toBe(',')
  })
  it('shows the string expander only beyond the configured collapsed line count', async () => {
    stubStringLayout(48)
    let resize: (() => void) | undefined
    const disconnect = vi.fn()
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { resize = callback }
      observe() { }
      disconnect = disconnect
    })
    const data = { text: 'three lines of text' }
    const view = await act(async () => render(h(JsonTree, { 'data': data }, undefined)))
    expect(screen.queryByRole('button', { name: 'Expand JSON node' })).toBeNull()
    await act(async () => { view.rerender(h(JsonTree, { 'data': data, 'collapsedStringLines': 2 }, undefined)) })
    expect(screen.getByRole('button', { name: 'Expand JSON node' })).toBeTruthy()
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(16)
    await act(() => { resize?.() })
    expect(screen.queryByRole('button', { name: 'Expand JSON node' })).toBeNull()
    view.unmount()
    expect(disconnect).toHaveBeenCalledTimes(2)
  })
  it('keeps raw strings intact and samples the wrapping preference on every expansion', async () => {
    stubStringLayout()
    vi.stubGlobal('ResizeObserver', class {
      observe() { }
      disconnect() { }
    })
    let wrapped = false
    const stringWrapping = {
      label: 'Wrap lines',
      getDefault: () => wrapped,
      setDefault: (value: boolean) => { wrapped = value },
    }
    const original = `  leading spaces\n\t"quoted" \\${'long'.repeat(100)}\nlast line\n`
    await act(async () => render(h(JsonTree, { 'data': { first: original, second: original }, 'stringWrapping': stringWrapping }, undefined)))
    const [first, second] = within(screen.getByRole('tree')).getAllByRole('treeitem')
    const a = within(first as HTMLElement)
    const b = within(second as HTMLElement)
    await act(async () => fireEvent.click(a.getByRole('button', { name: 'Expand JSON node' })))
    await act(async () => fireEvent.click(b.getByRole('button', { name: 'Expand JSON node' })))
    expect(a.getByRole('button', { name: 'Wrap lines' }).getAttribute('aria-pressed')).toBe('false')
    await act(async () => fireEvent.click(a.getByRole('button', { name: 'Wrap lines' })))
    expect(wrapped).toBe(true)
    expect(a.getByRole('button', { name: 'Wrap lines' }).getAttribute('aria-pressed')).toBe('true')
    expect(b.getByRole('button', { name: 'Wrap lines' }).getAttribute('aria-pressed')).toBe('false')
    await act(async () => fireEvent.click(b.getByRole('button', { name: 'Collapse JSON node' })))
    await act(async () => fireEvent.click(b.getByRole('button', { name: 'Expand JSON node' })))
    expect(b.getByRole('button', { name: 'Wrap lines' }).getAttribute('aria-pressed')).toBe('true')
    await act(async () => fireEvent.click(b.getByRole('button', { name: 'Wrap lines' })))
    expect(wrapped).toBe(false)
    expect(a.getByRole('button', { name: 'Wrap lines' }).getAttribute('aria-pressed')).toBe('true')
    await act(async () => fireEvent.click(a.getByRole('button', { name: 'Collapse JSON node' })))
    await act(async () => fireEvent.click(a.getByRole('button', { name: 'Expand JSON node' })))
    const toggle = a.getByRole('button', { name: 'Wrap lines' })
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    const contents = document.getElementById(toggle.getAttribute('aria-controls') as string)
    expect(contents?.textContent).toBe(original)
    await act(async () => fireEvent.click(a.getByRole('button', { name: 'Copy value' })))
    await waitFor(() => { expect(writeText).toHaveBeenCalledWith(original) })
  })
  it('keeps the top level open and renders expandable value previews', async () => {
    await act(async () => render(h(JsonTree, { 'label': 'Payload', 'data': {
      nested: { answer: 42 },
      list: ['alpha', 'beta'],
    } }, undefined)))
    const tree = screen.getByRole('tree', { name: 'Payload' })
    const rows = within(tree).getAllByRole('treeitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.textContent).toBe('nested:{answer: 42},')
    expect(rows[1]?.textContent).toBe('list:["alpha", "beta"]')
    const expanders = within(tree).getAllByRole('button', { name: 'Expand JSON node' })
    expect(expanders[0]?.tabIndex).toBe(0)
    expect(expanders[1]?.tabIndex).toBe(-1)
    await act(async () => fireEvent.click(expanders[0] as HTMLElement))
    expect(within(tree).getAllByRole('treeitem')).toHaveLength(3)
    expect(screen.getByText('answer:')).toBeDefined()
    expect(within(tree).getByRole('button', { name: 'Collapse JSON node' })).toBeDefined()
  })
  it('moves the single tab stop between visible expanders with arrow keys', async () => {
    await act(async () => render(h(JsonTree, { 'expandTopLevel': false, 'data': {
      first: { nested: 1 },
      second: { nested: 2 },
    } }, undefined)))
    const tree = screen.getByRole('tree', { name: 'JSON' })
    const root = within(tree).getByRole('button', { name: 'Collapse JSON node' })
    const children = within(tree).getAllByRole('button', { name: 'Expand JSON node' })
    expect(root.tabIndex).toBe(0)
    await act(async () => fireEvent.keyDown(root, { key: 'ArrowDown' }))
    expect(document.activeElement).toBe(children[0])
    expect(root.tabIndex).toBe(-1)
    expect(children[0]?.tabIndex).toBe(0)
    await act(async () => fireEvent.keyDown(children[0] as HTMLElement, { key: 'ArrowRight' }))
    expect(children[0]?.getAttribute('aria-expanded')).toBe('true')
    await act(async () => fireEvent.keyDown(children[0] as HTMLElement, { key: 'ArrowLeft' }))
    expect(children[0]?.getAttribute('aria-expanded')).toBe('false')
    await act(async () => fireEvent.keyDown(children[0] as HTMLElement, { key: 'Enter' }))
    await act(async () => fireEvent.keyDown(children[0] as HTMLElement, { key: 'ArrowUp' }))
    expect(document.activeElement).toBe(root)
    await act(async () => fireEvent.keyDown(root, { key: 'ArrowUp' }))
    expect(document.activeElement).toBe(children[1])
  })
  it('copies an array element path without recovering data from rendered labels', async () => {
    await act(async () => render(h(JsonTree, { 'data': { list: [{ value: 'x' }, 'tail'] } }, undefined)))
    const tree = screen.getByRole('tree')
    await act(async () => fireEvent.click(within(tree).getByRole('button', { name: 'Expand JSON node' })))
    const arrayRow = within(tree).getAllByRole('treeitem')
      .find(row => row.textContent?.startsWith('0:'))
    expect(arrayRow).toBeDefined()
    await act(async () => fireEvent.mouseOver(arrayRow as HTMLElement))
    const copyButton = screen.getByRole('button', { name: 'Copy pretty JSON' })
    await act(async () => fireEvent.contextMenu(copyButton))
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: 'Copy property path' })))
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('$.list[0]')
    })
  })
  it('renders empty containers, JSON-adjacent primitives, and bounded deep previews', async () => {
    const anonymous = Object.defineProperty(() => { }, 'name', { value: '' })
    const date = new Date('2026-07-28T00:00:00.000Z')
    const data = {
      '': 'empty key',
      nil: null,
      text: 'quoted',
      flag: true,
      count: 3,
      big: 4n,
      date,
      named: function named() { },
      missing: undefined,
      symbol: Symbol('token'),
      emptyObject: {},
      emptyArray: [],
      primitivePreview: {
        nil: null,
        flag: false,
        big: 9n,
        missing: undefined,
      },
      exoticPreview: {
        symbol: Symbol(),
        named: function sample() { },
        anonymous,
        date,
      },
      wideObject: { a: 1, b: 2, c: 3, d: 4, e: 5 },
      wideArray: [1, 2, 3, 4, 5, 6],
      deep: { a: { b: { c: 1 } } },
    }
    await act(async () => render(h(JsonTree, { 'copyable': false, 'data': data }, undefined)))
    const text = screen.getByRole('tree').textContent
    expect(text).toContain('"":\"empty key\"')
    expect(text).toContain('nil:null')
    expect(text).toContain('flag:true')
    expect(text).toContain('count:3')
    expect(text).toContain('big:4n')
    expect(text).toContain('date:2026-07-28T00:00:00.000Z')
    expect(text).toContain('named:function() { }')
    expect(text).toContain('missing:undefined')
    expect(text).toContain('symbol:Symbol(token)')
    expect(text).toContain('emptyObject:{}')
    expect(text).toContain('emptyArray:[]')
    expect(text).toContain('primitivePreview:{nil: null, flag: false, big: 9, missing: undefined}')
    expect(text).toContain('exoticPreview:{symbol: Symbol, named: sample, anonymous: Function, date: }')
    expect(text).toContain('wideObject:{a: 1, b: 2, c: 3, d: 4, …}')
    expect(text).toContain('wideArray:[1, 2, 3, 4, 5, …]')
    expect(text).toContain('deep:{a: {b: {…}}}')
    expect(screen.queryByRole('button', { name: /Copy/ })).toBeNull()
    await act(async () => fireEvent.mouseOver(screen.getByRole('tree').parentElement as HTMLElement))
  })
  it('renders child commas and lets a clickable property label toggle its node', async () => {
    await act(async () => render(h(JsonTree, { 'data': { parent: { emptyObject: {}, emptyArray: [], scalar: 1, last: 2 } } }, undefined)))
    await act(async () => fireEvent.click(screen.getByText('parent:')))
    const tree = screen.getByRole('tree')
    const rows = within(tree).getAllByRole('treeitem')
    expect(rows.find(row => row.textContent === 'emptyObject:{},')).toBeDefined()
    expect(rows.find(row => row.textContent === 'emptyArray:[],')).toBeDefined()
    expect(rows.find(row => row.textContent === 'scalar:1,')).toBeDefined()
    expect(rows.find(row => row.textContent === 'last:2')).toBeDefined()
    await act(async () => fireEvent.click(screen.getByText('parent:')))
    expect(within(tree).getAllByRole('treeitem')).toHaveLength(1)
  })
  it('assigns the initial array tab stop and supports an empty collapsible root', async () => {
    const first = await act(async () => render(h(JsonTree, { 'data': ['plain', { nested: true }] }, undefined)))
    const tree = screen.getByRole('tree')
    expect(tree.textContent).toContain('0:"plain"')
    expect(within(tree).getByRole('button', { name: 'Expand JSON node' }).tabIndex).toBe(0)
    first.unmount()
    await act(async () => render(h(JsonTree, { 'expandTopLevel': false, 'data': {} }, undefined)))
    expect(screen.getByRole('tree').textContent).toBe('{}')
    expect(screen.queryByRole('button', { name: /JSON node/ })).toBeNull()
  })
  it('copies primitive and object values in every menu mode', async () => {
    const anonymous = Object.defineProperty(() => { }, 'name', { value: '' })
    await act(async () => render(h(JsonTree, { 'data': {
      plain: 'hello',
      'odd-key': 3,
      object: { a: 1 },
      missing: undefined,
      big: 7n,
      symbol: Symbol(),
      symbolNamed: Symbol('token'),
      named: function named() { },
      anonymous,
    } }, undefined)))
    const tree = screen.getByRole('tree')
    const row = (prefix: string) => {
      const match = within(tree).getAllByRole('treeitem')
        .find(item => item.textContent?.startsWith(prefix))
      expect(match).toBeDefined()
      return match as HTMLElement
    }
    const hover = async (prefix: string) => {
      await act(async () => fireEvent.mouseOver(row(prefix)))
      return screen.getByRole('button', { name: /Cop/ })
    }
    const select = async (name: string) => {
      const button = screen.getByRole('button', { name: /Cop/ })
      await act(async () => fireEvent.contextMenu(button))
      await act(async () => fireEvent.click(screen.getByRole('menuitem', { name })))
    }
    await act(async () => fireEvent.click(await hover('plain:')))
    await waitFor(() => { expect(writeText).toHaveBeenLastCalledWith('hello') })
    await hover('odd-key:')
    await select('Copy property path')
    await waitFor(() => { expect(writeText).toHaveBeenLastCalledWith('$["odd-key"]') })
    await select('Copy JSON')
    await waitFor(() => { expect(writeText).toHaveBeenLastCalledWith('3') })
    await act(async () => fireEvent.click(await hover('odd-key:')))
    await waitFor(() => { expect(writeText).toHaveBeenLastCalledWith('3') })
    await act(async () => fireEvent.click(await hover('object:')))
    await waitFor(() => { expect(writeText).toHaveBeenLastCalledWith('{\n  "a": 1\n}') })
    await select('Copy compact JSON')
    await waitFor(() => { expect(writeText).toHaveBeenLastCalledWith('{"a":1}') })
    for (const [prefix, expected] of [
      ['missing:', 'undefined'],
      ['big:', '7'],
      ['symbol:', 'Symbol'],
      ['symbolNamed:', 'token'],
      ['named:', 'named'],
      ['anonymous:', 'Function'],
    ] as const) {
      await act(async () => fireEvent.click(await hover(prefix)))
      await waitFor(() => { expect(writeText).toHaveBeenLastCalledWith(expected) })
    }
  })
  it('reports clipboard failure, resets feedback, and clears a prior timer', async () => {
    vi.useFakeTimers()
    writeText.mockRejectedValue(new Error('denied'))
    const view = await act(async () => render(h(JsonTree, { 'data': { value: 'x' } }, undefined)))
    const row = screen.getByRole('treeitem')
    await act(async () => fireEvent.mouseOver(row))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy value' })))
    await act(async () => { await Promise.resolve() })
    expect(screen.getByRole('button', { name: 'Copy failed' })).toBeDefined()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy failed' })))
    await act(async () => { await Promise.resolve() })
    await act(() => { vi.advanceTimersByTime(1500) })
    expect(screen.getByRole('button', { name: 'Copy value' })).toBeDefined()
    view.unmount()
  })
  it('keeps the copy action on its hovered row and clears stale targets', async () => {
    const view = await act(async () => render(h(JsonTree, { 'data': { first: { a: 1 }, second: 2 } }, undefined)))
    const root = view.container.firstElementChild as HTMLElement
    const tree = screen.getByRole('tree')
    const firstRow = within(tree).getAllByRole('treeitem')[0] as HTMLElement
    const secondRow = within(tree).getAllByRole('treeitem')[1] as HTMLElement
    await act(async () => fireEvent.mouseOver(firstRow))
    const copyButton = screen.getByRole('button', { name: 'Copy pretty JSON' })
    expect(firstRow.contains(copyButton)).toBe(true)
    await act(async () => fireEvent.mouseOver(copyButton))
    expect(screen.getByRole('button', { name: 'Copy pretty JSON' })).toBeDefined()
    await act(async () => fireEvent.mouseOver(firstRow))
    await act(async () => fireEvent.scroll(root))
    await act(async () => fireEvent.contextMenu(copyButton))
    await act(async () => fireEvent.mouseOver(secondRow))
    await act(async () => fireEvent.mouseOver(root))
    await act(async () => fireEvent.mouseLeave(root))
    expect(screen.getByRole('menu')).toBeDefined()
    await act(async () => fireEvent.keyDown(document, { key: 'Escape' }))
    expect(screen.queryByRole('button', { name: /Copy/ })).toBeNull()
    await act(async () => fireEvent.mouseOver(secondRow))
    expect(screen.getByRole('button', { name: 'Copy value' })).toBeDefined()
    await act(async () => fireEvent.mouseOver(root))
    expect(screen.queryByRole('button', { name: /Copy/ })).toBeNull()
    await act(async () => fireEvent.scroll(root))
    await act(async () => { view.rerender(h(JsonTree, { 'data': { replacement: 3 } }, undefined)) })
    expect(screen.queryByRole('button', { name: /Copy/ })).toBeNull()
  })
  it('copies the fixed root and clears it when the pointer leaves', async () => {
    const view = await act(async () => render(h(JsonTree, { 'data': { value: 1 } }, undefined)))
    const root = view.container.firstElementChild as HTMLElement
    const openingBracket = root.querySelector<HTMLElement>('[data-json-root-row]')
    expect(openingBracket).not.toBeNull()
    await act(async () => fireEvent.mouseOver(openingBracket as HTMLElement))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy pretty JSON' })))
    await waitFor(() => { expect(writeText).toHaveBeenCalledWith('{\n  "value": 1\n}') })
    await act(async () => fireEvent.mouseLeave(root))
    expect(screen.queryByRole('button', { name: /Copy/ })).toBeNull()
  })
})
