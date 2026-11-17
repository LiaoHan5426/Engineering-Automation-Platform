// @vitest-environment jsdom
/** Isolated spreadsheet realms own engine options, copies, resize, and disposal. */
import { h } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '../../../test-support/client-runtime/src/vue-test.ts'
import type { Sheet } from '@fortune-sheet/core'
vi.mock('luckysheet-preview:assets', () => ({ css: '', scripts: [] }))
import { Workbook } from '../src/client/excel/Workbook.tsx'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('isolates engine data and read-only settings and disposes resized, replaced, and removed workbooks', async () => {
  const observers: {
    resize: ResizeObserverCallback
    disconnect: ReturnType<typeof vi.fn>
    observe: ReturnType<typeof vi.fn>
  }[] = []
  vi.stubGlobal(
    'ResizeObserver',
    class {
      disconnect = vi.fn()
      observe = vi.fn()
      constructor(resize: ResizeObserverCallback) {
        observers.push({ resize, disconnect: this.disconnect, observe: this.observe })
      }
    },
  )
  // jsdom does not execute srcdoc scripts; deliver its load after installing the external engine.
  const handlers = new Map<HTMLIFrameElement, EventListenerOrEventListenerObject>()
  vi.spyOn(HTMLIFrameElement.prototype, 'addEventListener').mockImplementation(function (
    this: HTMLIFrameElement,
    type,
    listener,
  ) {
    if (type === 'load' && listener !== null) handlers.set(this, listener)
  })
  const sheets: Sheet[] = [
    { name: 'Budget', celldata: [{ r: 0, c: 0, v: { f: '=1+1', v: 99, bg: '#ff0000' } }] },
  ]
  const engineA = {
    create: vi.fn<(options: Record<string, unknown>) => void>(),
    destroy: vi.fn(),
    resize: vi.fn(),
    getRangeHtml: vi.fn(() => '<table><tr><td>99</td></tr></table>'),
  }
  const engineB = {
    create: vi.fn<(options: Record<string, unknown>) => void>(),
    destroy: vi.fn(),
    resize: vi.fn(),
    getRangeHtml: vi.fn(() => '<table><tr><td>99</td></tr></table>'),
  }
  const view = render(
    h('div', [
      h(Workbook, { key: 'a', sheets, language: 'en', label: 'Budget A' }),
      h(Workbook, { key: 'b', sheets, language: 'en', label: 'Budget B' }),
    ]),
  )
  const [first, second] = [...view.container.querySelectorAll('iframe')]
  if (first?.contentWindow == null || second?.contentWindow == null)
    throw new Error('Missing workbook realm')
  first.contentWindow.luckysheet = engineA
  second.contentWindow.luckysheet = engineB
  const controls = ['luckysheet-functionbox-cell', 'luckysheet-rich-text-editor'].map((id) => {
    const control = first.contentWindow!.document.createElement('div')
    control.id = id
    control.contentEditable = 'true'
    control.textContent = '=1+1'
    return control
  })
  engineA.create.mockImplementation(() => { first.contentWindow!.document.body.append(...controls) })
  const loaded = (frame: HTMLIFrameElement) => {
    const listener = handlers.get(frame)
    if (typeof listener === 'function') listener.call(frame, new Event('load'))
    else listener?.handleEvent(new Event('load'))
  }
  await act(() => {
    loaded(first)
    loaded(second)
  })
  for (const control of controls) {
    expect(control.contentEditable).toBe('false')
    expect(control.getAttribute('aria-readonly')).toBe('true')
    for (const type of ['beforeinput', 'paste', 'drop', 'cut']) {
      const event = new Event(type, { cancelable: true })
      expect(control.dispatchEvent(event)).toBe(false)
    }
    expect(
      control.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, cancelable: true }),
      ),
    ).toBe(false)
    expect(
      control.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, cancelable: true }),
      ),
    ).toBe(true)
    expect(control.textContent).toBe('=1+1')
  }
  const cellRightClickMatcher: unknown = expect.objectContaining({
    copy: true,
    paste: false,
    insertRow: false,
    deleteColumn: false,
  })
  expect(engineA.create).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      data: sheets,
      allowEdit: false,
      allowCopy: true,
      fullscreenmode: false,
      forceCalculation: false,
      sheetFormulaBar: true,
      showsheetbar: true,
      showtoolbar: false,
      showstatisticBar: false,
      showstatisticBarConfig: { count: false, view: false, zoom: false },
      showsheetbarConfig: { add: false, menu: false, sheet: true },
      cellRightClickConfig: cellRightClickMatcher,
    }),
  )
  const importedA = engineA.create.mock.calls[0]![0].data
  const importedB = engineB.create.mock.calls[0]![0].data
  expect(importedA).not.toBe(sheets)
  expect(importedA).not.toBe(importedB)
  expect(first.getAttribute('srcdoc')).toContain("connect-src 'none'")
  expect(first.getAttribute('srcdoc')).not.toContain('https://')
  expect(observers[0]!.observe).toHaveBeenCalledExactlyOnceWith(first)
  await act(() => { observers[0]!.resize([], {} as ResizeObserver) })
  expect(engineA.resize).toHaveBeenCalledOnce()
  expect(engineB.resize).not.toHaveBeenCalled()
  await view.rerender(
    h('div', [h(Workbook, { key: 'b', sheets, language: 'en', label: 'Budget B' })]),
  )
  expect(engineA.destroy).toHaveBeenCalledOnce()
  expect(observers[0]!.disconnect).toHaveBeenCalledOnce()
  for (const control of controls) {
    expect(control.dispatchEvent(new Event('beforeinput', { cancelable: true }))).toBe(true)
    expect(
      control.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, cancelable: true }),
      ),
    ).toBe(true)
  }
  expect(engineB.destroy).not.toHaveBeenCalled()
  view.unmount()
  expect(engineB.destroy).toHaveBeenCalledOnce()
  expect(observers[1]!.disconnect).toHaveBeenCalledOnce()
})
