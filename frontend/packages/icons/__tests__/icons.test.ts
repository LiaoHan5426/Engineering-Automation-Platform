// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vite-plus/test'
import { createApp, h, type App } from 'vue'
import { IconPlus } from '../src/index'

let app: App | undefined
let root: HTMLDivElement | undefined
afterEach(() => {
  app?.unmount()
  root?.remove()
})
function mountIcon(props: Record<string, unknown> = {}) {
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({ render: () => h(IconPlus, props) })
  app.mount(root)
  const svg = root.querySelector('svg')
  expect(svg).not.toBeNull()
  return svg!
}

it('renders a local, decorative currentColor SVG without action semantics', () => {
  const svg = mountIcon()
  expect(svg.getAttribute('stroke')).toBe('currentColor')
  expect(svg.getAttribute('aria-hidden')).toBe('true')
  expect(svg.getAttribute('focusable')).toBe('false')
  expect(svg.hasAttribute('role')).toBe(false)
  expect(svg.hasAttribute('tabindex')).toBe(false)
  expect(svg.querySelector('path')).not.toBeNull()
  expect(svg.querySelector('image, use, script, foreignObject')).toBeNull()
})

it('uses shared sizing and stroke defaults with class/style and explicit prop overrides', () => {
  const svg = mountIcon({
    size: 20,
    strokeWidth: 2.5,
    class: 'consumer-icon',
    style: { color: 'var(--eap-color-text)' },
  })
  expect(svg.classList.contains('eap-icon')).toBe(true)
  expect(svg.classList.contains('consumer-icon')).toBe(true)
  expect(svg.getAttribute('width')).toBe('20')
  expect(svg.getAttribute('height')).toBe('20')
  expect(svg.getAttribute('stroke-width')).toBe('2.5')
  expect(svg.style.width).toBe('20px')
  expect(svg.style.height).toBe('20px')
  expect(svg.style.strokeWidth).toBe('2.5')
  expect(svg.style.color).toBe('var(--eap-color-text)')
})

it('inherits shared theme size and stroke with usable presentation fallbacks', () => {
  const svg = mountIcon()
  expect(svg.getAttribute('width')).toBe('1em')
  expect(svg.getAttribute('height')).toBe('1em')
  expect(svg.getAttribute('stroke-width')).toBe('1.75')
  expect(svg.style.width).toBe('var(--eap-icon-size, 1em)')
  expect(svg.style.height).toBe('var(--eap-icon-size, 1em)')
  expect(svg.style.strokeWidth).toBe('var(--eap-icon-stroke-width, 1.75)')
})

it('exposes a supplied label as a non-focusable image, not hidden decoration', () => {
  const svg = mountIcon({ label: 'Add item' })
  expect(svg.getAttribute('role')).toBe('img')
  expect(svg.getAttribute('aria-label')).toBe('Add item')
  expect(svg.hasAttribute('aria-hidden')).toBe(false)
  expect(svg.getAttribute('focusable')).toBe('false')
  expect(svg.hasAttribute('label')).toBe(false)
})
