// @vitest-environment jsdom
import { h } from 'vue'
import { screen } from '@testing-library/dom'
import { flushVue as act, cleanupVue as cleanup, renderVue as render } from './vue-render.ts'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CommandText } from '../src/CommandText.tsx'
import { TerminalBlock } from '../src/TerminalBlock.tsx'
import { terminalBlockLabels } from './labels.client.ts'
const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts')
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', undefined)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100)
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return (this.textContent?.length ?? 0) * 10
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  if (originalFonts === undefined)
    Reflect.deleteProperty(document, 'fonts')
  else
    Object.defineProperty(document, 'fonts', originalFonts)
})
it('names and focuses overflowing text as it changes, without changing its scroll position', async () => {
  const view = render(h(CommandText, { 'text': 'echo ok', 'label': 'Command line 1' }))
  await act(() => {})
  const command = screen.getByText('echo ok')
  expect(command.hasAttribute('tabindex')).toBe(false)
  expect(command.hasAttribute('role')).toBe(false)
  expect(command.hasAttribute('aria-label')).toBe(false)
  await act(() => { view.rerender(h(CommandText, { 'text': 'echo a-long-command-argument', 'label': 'Command line 1' }, [])) })
  expect(screen.getByRole('group', { name: 'Command line 1' })).toBe(command)
  expect(command.tabIndex).toBe(0)
  command.scrollLeft = 40
  await act(() => { view.rerender(h(CommandText, { 'text': 'echo another-long-command-argument', 'label': 'Command line 1' }, [])) })
  expect(command.scrollLeft).toBe(40)
  await act(() => { view.rerender(h(CommandText, { 'text': 'echo ok', 'label': 'Command line 1' }, [])) })
  expect(command.hasAttribute('tabindex')).toBe(false)
  expect(command.hasAttribute('aria-label')).toBe(false)
})
it('updates focusability after resizing and font loading, and releases both observers', async () => {
  let resize: (() => void) | undefined
  const observe = vi.fn()
  const disconnect = vi.fn()
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resize = callback }
    observe = observe
    disconnect = disconnect
  })
  const fonts = new EventTarget()
  Object.defineProperty(document, 'fonts', { configurable: true, value: fonts })
  const removeListener = vi.spyOn(fonts, 'removeEventListener')
  const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300)
  const view = render(h(CommandText, { 'text': 'echo wider command', 'label': 'Command line 1' }))
  await act(() => {})
  const command = screen.getByText('echo wider command')
  expect(observe).toHaveBeenCalledWith(command)
  expect(command.hasAttribute('tabindex')).toBe(false)
  if (resize === undefined)
    throw new Error('Missing resize observer')
  width.mockReturnValue(100)
  await act(resize)
  expect(command.tabIndex).toBe(0)
  width.mockReturnValue(300)
  await act(() => { fonts.dispatchEvent(new Event('loadingdone')) })
  expect(command.hasAttribute('tabindex')).toBe(false)
  view.unmount()
  expect(disconnect).toHaveBeenCalledOnce()
  expect(removeListener).toHaveBeenCalledWith('loadingdone', expect.any(Function))
  width.mockClear()
  fonts.dispatchEvent(new Event('loadingdone'))
  expect(width).not.toHaveBeenCalled()
})
it('adds one named Tab stop for the overflowing line of a multiline command', async () => {
  const view = render(h(TerminalBlock, { 'command': 'echo ok\necho a-long-command-argument\necho done', 'labels': terminalBlockLabels }))
  await act(() => {})
  const commands = [...view.container.querySelectorAll('[data-command-text]')]
  expect(commands.map(command => command.hasAttribute('tabindex'))).toEqual([false, true, false])
  expect(screen.getByRole('group', { name: '命令第 2 行' })).toBe(commands[1])
})
