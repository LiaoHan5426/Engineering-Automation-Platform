// @vitest-environment jsdom
/** The Settings entry leaves Settings for the Plugins page. */
import { h } from 'vue'
import { cleanupVue, renderVue } from '../../ui-primitives/tests/vue-render.ts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PluginsSettingsLink, type PluginsSettingsLinkProps } from '../src/client/PluginsSettingsLink.tsx'

afterEach(cleanupVue)

describe('PluginsSettingsLink', () => {
  it('closes Settings before opening Plugins and renders no content', () => {
    const calls: string[] = []
    const props = {
      close: vi.fn(() => { calls.push('close') }),
      openPlugins: vi.fn(() => { calls.push('open') }),
    } satisfies Pick<PluginsSettingsLinkProps, 'close' | 'openPlugins'>
    const { container } = renderVue(h(PluginsSettingsLink, props as PluginsSettingsLinkProps))
    expect(calls).toEqual(['close', 'open'])
    expect(container.childElementCount).toBe(0)
  })
})
