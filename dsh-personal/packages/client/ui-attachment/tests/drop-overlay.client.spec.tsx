// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { h } from 'vue'
import {} from '@testing-library/dom'
import { renderVue as render, cleanupVue as cleanup, flushVue as act } from './vue-render.ts'
import { DropOverlay } from '../src/DropOverlay.tsx'
afterEach(cleanup)
describe('DropOverlay', () => {
  it('portals the invitation with its title and limits desc to the body', async () => {
    const view = await act(async () =>
      render(
        h(
          DropOverlay,
          {
            disabled: false,
            labels: { title: '图片拖动到此处即可添加', desc: '最多 20 张，每张 5MB' },
          },
          undefined,
        ),
      ),
    )
    const overlay = view.getByRole('status')
    expect(overlay.parentElement).toBe(document.body)
    expect(overlay.textContent).toContain('图片拖动到此处即可添加')
    expect(overlay.textContent).toContain('最多 20 张，每张 5MB')
  })
  it('omits the desc line when none is resolved', async () => {
    const view = await act(async () =>
      render(
        h(DropOverlay, { disabled: false, labels: { title: '图片拖动到此处即可添加' } }, undefined),
      ),
    )
    expect(view.getByRole('status').textContent).toBe('图片拖动到此处即可添加')
  })
  it('drops the desc and switches the illustration while disabled', async () => {
    const enabled = await act(async () =>
      render(
        h(DropOverlay, { disabled: false, labels: { title: '拖入', desc: '限制' } }, undefined),
      ),
    )
    const enabledSvg = enabled.getByRole('status').querySelector('svg')!.innerHTML
    enabled.unmount()
    const disabled = await act(async () =>
      render(
        h(
          DropOverlay,
          { disabled: true, labels: { title: '当前无法添加图片', desc: '限制' } },
          undefined,
        ),
      ),
    )
    const overlay = disabled.getByRole('status')
    expect(overlay.textContent).toBe('当前无法添加图片')
    expect(overlay.querySelector('svg')!.innerHTML).not.toBe(enabledSvg)
  })
})
