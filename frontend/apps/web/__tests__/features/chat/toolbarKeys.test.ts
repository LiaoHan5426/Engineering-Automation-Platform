// @vitest-environment happy-dom
import { expect, it } from 'vite-plus/test'
import { installToolbarFallback, toolbarStep } from '../../../src/features/chat/toolbarKeys'

it('moves across a horizontal toolbar and wraps at the ends', () => {
  expect(toolbarStep('ArrowRight', 0, 3)).toBe(1)
  expect(toolbarStep('ArrowLeft', 0, 3)).toBe(2)
  expect(toolbarStep('ArrowRight', 2, 3)).toBe(0)
  expect(toolbarStep('Home', 2, 3)).toBe(0)
  expect(toolbarStep('End', 0, 3)).toBe(2)
})

it('reverses left and right when the toolbar is right-to-left', () => {
  expect(toolbarStep('ArrowRight', 0, 3, { rtl: true })).toBe(2)
  expect(toolbarStep('ArrowLeft', 0, 3, { rtl: true })).toBe(1)
})

it('leaves vertical arrows and other keys to the control', () => {
  expect(toolbarStep('ArrowDown', 0, 3)).toBeNull()
  expect(toolbarStep('Enter', 0, 3)).toBeNull()
  expect(toolbarStep('ArrowRight', -1, 3)).toBeNull()
})

it('keeps one tab stop and skips a disabled action', () => {
  const bar = document.createElement('div')
  bar.innerHTML =
    '<button id="retry" disabled>重试</button><button id="summary">摘要</button><button id="files">源文件</button>'
  document.body.append(bar)
  const stop = installToolbarFallback(bar, false)
  const summary = bar.querySelector<HTMLButtonElement>('#summary')!
  const files = bar.querySelector<HTMLButtonElement>('#files')!
  const retry = bar.querySelector<HTMLButtonElement>('#retry')!
  expect(summary.tabIndex).toBe(0)
  expect(files.tabIndex).toBe(-1)
  expect(retry.tabIndex).toBe(0)
  summary.focus()
  summary.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  expect(document.activeElement).toBe(files)
  stop()
  bar.remove()
})
