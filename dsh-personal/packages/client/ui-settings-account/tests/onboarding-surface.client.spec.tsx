import { h, Fragment } from 'vue'
// @vitest-environment jsdom
import { cleanup, render } from '../../../test-support/client-runtime/src/vue-test.ts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlatformOverlay } from '../src/client/PlatformOverlay.tsx'
import { acquireOverlayInert } from '../src/client/overlay-inert.ts'
import { OnboardingSurface } from '../src/client/OnboardingSurface.tsx'
let appRoot: HTMLDivElement
beforeEach(() => {
  appRoot = document.createElement('div')
  appRoot.id = 'root'
  appRoot.inert = false
  document.body.appendChild(appRoot)
})
afterEach(() => {
  cleanup()
  appRoot.remove()
})
describe('OnboardingSurface', () => {
  it('portals the overlay chrome to document.body around its content', () => {
    const view = render(
      h(OnboardingSurface, null, { default: () => h('p', null, 'step content') }),
    )
    // Portaled: the overlay is a body child, not inside the render container.
    expect(view.container.querySelector('[class*="onboardingOverlay"]')).toBeNull()
    const overlay = document.body.querySelector('[class*="onboardingOverlay"]')
    expect(overlay).not.toBeNull()
    expect(overlay!.firstElementChild).toBe(overlay!.querySelector('[class*="dragBand"]'))
    const stage = overlay!.querySelector('[class*="onboardingStage"]')
    expect(stage).not.toBeNull()
    expect(stage!.textContent).toBe('step content')
  })
  it('holds #root inert for exactly its own lifetime', () => {
    const view = render(h(OnboardingSurface, null, { default: () => 'x' }))
    expect(appRoot.inert).toBe(true)
    expect(appRoot.style.opacity).toBe('0')
    view.unmount()
    expect(appRoot.inert).toBe(false)
    expect(appRoot.style.opacity).toBe('')
  })
  it('restores the root state owned by an earlier overlay', () => {
    appRoot.inert = true
    appRoot.style.opacity = '0.5'
    const view = render(h(OnboardingSurface, null, { default: () => 'x' }))
    view.unmount()
    expect(appRoot.inert).toBe(true)
    expect(appRoot.style.opacity).toBe('0.5')
  })
  it('renders without an #root element (compositions that mount elsewhere)', () => {
    appRoot.remove()
    const view = render(h(OnboardingSurface, null, { default: () => 'x' }))
    expect(document.body.querySelector('[class*="onboardingStage"]')!.textContent).toBe('x')
    view.unmount()
  })
  it('reveals the root during exit but keeps it inert until unmount', async () => {
    appRoot.style.opacity = '0.8'
    const view = render(h(OnboardingSurface, null, { default: () => 'x' }))
    await view.rerender(h(OnboardingSurface, { exiting: true }, { default: () => 'x' }))
    expect(appRoot.style.opacity).toBe('0.8')
    expect(appRoot.inert).toBe(true)
    expect(document.querySelector('[data-exiting]')).not.toBeNull()
    view.unmount()
    expect(appRoot.inert).toBe(false)
    expect(appRoot.style.opacity).toBe('0.8')
  })
  it('hides the root again if the owner cancels an exit', async () => {
    const view = render(h(OnboardingSurface, { exiting: true }, { default: () => 'x' }))
    expect(appRoot.style.opacity).toBe('')
    await view.rerender(h(OnboardingSurface, null, { default: () => 'x' }))
    expect(appRoot.style.opacity).toBe('0')
    expect(appRoot.inert).toBe(true)
    view.unmount()
    expect(appRoot.style.opacity).toBe('')
    expect(appRoot.inert).toBe(false)
  })
})
it('restores interaction when onboarding and its recharge overlay unmount together', () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  try {
    const bridge = { open: async () => {}, close: async () => {}, setBounds: async () => {} }
    const view = render(
      h(Fragment, null, [
        h(OnboardingSurface, null, { default: () => 'onboarding' }),
        h(PlatformOverlay, {
          bridge: bridge,
          page: 'top-up',
          backLabel: 'Back',
          loadingLabel: 'Loading',
          failureLabel: 'Failed',
          retryLabel: 'Retry',
          onClose: () => {},
        }),
      ]),
    )
    expect(appRoot.inert).toBe(true)
    view.unmount()
    expect(appRoot.inert).toBe(false)
    expect(appRoot.style.opacity).toBe('')
  } finally {
    vi.unstubAllGlobals()
  }
})
it('releasing one overlay twice cannot release a different active overlay', () => {
  const first = acquireOverlayInert(appRoot)
  const second = acquireOverlayInert(appRoot)
  first()
  first()
  expect(appRoot.inert).toBe(true)
  second()
  expect(appRoot.inert).toBe(false)
})
