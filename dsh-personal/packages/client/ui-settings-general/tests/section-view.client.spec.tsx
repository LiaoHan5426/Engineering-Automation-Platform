// @vitest-environment jsdom
/** The Factory renders the caller's selected settings page. */
import { h } from 'vue'
import { screen } from '@testing-library/dom'
import { cleanupVue, renderVue } from '../../ui-primitives/tests/vue-render.ts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FactoryComponentPropsOf } from '@deepseek-ai/dsh-client-ui-slots'
import { SettingsSectionView } from '../src/client/SettingsSectionView.tsx'

afterEach(cleanupVue)

describe('SettingsSectionView', () => {
  it('renders the requested entry with the caller leave action', () => {
    const close = vi.fn()
    const renderSlot = vi.fn(() => h('p', 'page body'))
    const props = { id: 'timeline', close, renderSlot } as Partial<FactoryComponentPropsOf<'settings.section.view'>>
    renderVue(h(SettingsSectionView, props as FactoryComponentPropsOf<'settings.section.view'>))
    expect(screen.getByText('page body')).toBeTruthy()
    expect(renderSlot).toHaveBeenCalledExactlyOnceWith('settings.section', { close }, { only: 'timeline' })
  })
})
