// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { fireEvent, screen } from '@testing-library/dom'
import { renderVue as render, cleanupVue as cleanup, flushVue as act } from './vue-render.ts'
import { ImageLightbox } from '../src/ImageLightbox.tsx'
afterEach(cleanup)
const labels = { dialog: '原图预览', close: '关闭原图预览' }
describe('ImageLightbox', () => {
  it('focuses its close control, closes by button and Escape, and restores focus', async () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const onClose = vi.fn()
    const view = await act(async () => render(h(ImageLightbox, { 'src': 'blob:original', 'alt': '原图', 'labels': labels, 'onClose': onClose }, undefined)))
    const close = screen.getByRole('button', { name: '关闭原图预览' })
    expect(document.activeElement).toBe(close)
    await act(async () => fireEvent.keyDown(window, { key: 'a' }))
    expect(onClose).not.toHaveBeenCalled()
    const outerKey = vi.fn()
    document.body.addEventListener('keydown', outerKey)
    try {
      await act(async () => fireEvent.keyDown(close, { key: 'Escape' }))
      expect(outerKey).not.toHaveBeenCalled()
    }
    finally {
      document.body.removeEventListener('keydown', outerKey)
    }
    await act(async () => fireEvent.click(close))
    expect(onClose).toHaveBeenCalledTimes(2)
    view.unmount()
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })
  it('tolerates a focus owner it cannot restore (no active element at mount)', async () => {
    // jsdom always reports body as the fallback active element; stub the
    // element-less state a detached focus can leave.
    Object.defineProperty(document, 'activeElement', { configurable: true, get: () => null })
    try {
      const view = await act(async () => render(h(ImageLightbox, { 'src': 'blob:original', 'alt': '原图', 'labels': labels, 'onClose': vi.fn() }, undefined)))
      view.unmount()
    }
    finally {
      delete (document as {
        activeElement?: unknown
      }).activeElement
    }
  })
  it('closes on a mask press but not on a press over the image', async () => {
    const onClose = vi.fn()
    await act(async () => render(h(ImageLightbox, { 'src': 'blob:original', 'alt': '原图', 'labels': labels, 'onClose': onClose }, undefined)))
    await act(async () => fireEvent.mouseDown(screen.getByRole('img')))
    expect(onClose).not.toHaveBeenCalled()
    const mask = document.querySelector('[aria-hidden="true"]') as HTMLElement
    await act(async () => fireEvent.mouseDown(mask))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
it('leaves Escape to an open context menu before closing the image', async () => {
  const onClose = vi.fn()
  await act(async () => render(h(ImageLightbox, { 'src': 'blob:original', 'alt': 'Image', 'labels': labels, 'onClose': onClose }, undefined)))
  const menu = document.createElement('div')
  menu.setAttribute('role', 'menu')
  menu.tabIndex = 0
  document.body.append(menu)
  menu.focus()
  try {
    await act(async () => fireEvent.keyDown(screen.getByRole('button'), { key: 'Escape' }))
    expect(onClose).not.toHaveBeenCalled()
  }
  finally {
    menu.remove()
  }
  await act(async () => fireEvent.keyDown(screen.getByRole('button'), { key: 'Escape' }))
  expect(onClose).toHaveBeenCalledOnce()
})
