// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/dom'
import { h } from 'vue'
import { renderVue as render, cleanupVue as cleanup, flushVue } from './vue-render.ts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TextShimmer } from '../src/TextShimmer.tsx'
afterEach(cleanup)
describe('TextShimmer', () => {
  it('retains a string child as its activity and text change', async () => {
    const view = render(h(TextShimmer, { 'active': true }, { default: () => ['Reading'] }))
    const text = screen.getByText('Reading')
    expect(view.container.textContent).toBe('Reading')
    expect(view.container.querySelectorAll('[data-shimmer="true"]')).toHaveLength(1)
    await flushVue(() => { view.rerender(h(TextShimmer, { 'active': false }, { default: () => ['Read'] })) })
    expect(screen.getByText('Read')).toBe(text)
    expect(view.container.querySelector('[data-shimmer]')).toBeNull()
    expect(view.container.querySelector('[inert]')).toBeNull()
  })
  it('updates vnode content shared by both visual copies without moving the visible nodes', async () => {
    const row = (text: string, active: boolean) => {
      const summary = h('span', null, [h(TextShimmer, null, { default: () => [text] })])
      return h(TextShimmer, { active }, { default: () => [summary] })
    }
    const view = render(row('Research', true))
    const visible = screen.getByText('Research')
    await flushVue(() => { view.rerender(row('Research CLI products', true)) })
    expect(screen.getByText('Research CLI products')).toBe(visible)
    expect(view.container.textContent).toBe('Research CLI products')
    expect(view.container.querySelector('[data-shimmer-text]')?.getAttribute('data-shimmer-text')).toBe('Research CLI products')
    await flushVue(() => { view.rerender(row('Finished research', false)) })
    expect(screen.getByText('Finished research')).toBe(visible)
    expect(view.container.querySelector('[inert]')).toBeNull()
  })
  it('retains text and controls while nested fragments share one inert decoration', async () => {
    const open = vi.fn()
    const row = (active: boolean, title: string) => (h(TextShimmer, { 'active': active }, { default: () => [h(TextShimmer, null, { default: () => [title] }), h('button', { 'type': 'button', 'onClick': open }, [h(TextShimmer, null, { default: () => ['file.ts'] })])] }))
    const view = render(row(true, 'Read'))
    const title = screen.getByText('Read')
    const button = screen.getByRole('button', { name: 'file.ts' })
    const decoration = view.container.querySelector('[inert]')!
    expect(decoration.getAttribute('aria-hidden')).toBe('true')
    expect(view.container.querySelectorAll('[inert]')).toHaveLength(1)
    expect([...decoration.querySelectorAll('[data-shimmer-text]')].map(node => node.getAttribute('data-shimmer-text')))
      .toEqual(['Read', 'file.ts'])
    expect(view.container.textContent).toBe('Readfile.ts')
    fireEvent.click(button)
    expect(open).toHaveBeenCalledOnce()
    await flushVue(() => { view.rerender(row(true, 'Reading')) })
    expect(screen.getByText('Reading')).toBe(title)
    expect(screen.getByRole('button', { name: 'file.ts' })).toBe(button)
    expect(view.container.querySelector('[inert]')).toBe(decoration)
    await flushVue(() => { view.rerender(row(false, 'Read')) })
    expect(screen.getByText('Read')).toBe(title)
    expect(screen.getByRole('button', { name: 'file.ts' })).toBe(button)
    expect(view.container.querySelector('[inert]')).toBeNull()
  })
})
