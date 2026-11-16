// @vitest-environment jsdom
import { h } from 'vue'
/** FontSettingsGroup behavior: the text font-size row shows collapsed, its
 * disclosure button toggles the font and size rows, and each row routes its
 * write to its own role. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from './vue-fixture.ts'
import { emptyGlobalSeats, bindSnapshotSelector } from './vue-fixture.ts'
import { FontSettingsGroup } from '../src/client/FontSettingsGroup.tsx'
import type { FontSettingsGroupProps } from '../src/client/FontSettingsGroup.tsx'
import { createFontRowStore } from '../src/client/settings-store.ts'

afterEach(cleanup)

const COPY: Record<string, string> = {
  'fontSize.more': 'More font settings',
  'fontSize.text.title': 'Font size',
  'fontFamily.code.title': 'Code font',
  'fontFamily.terminal.title': 'Terminal font',
  'fontSize.code.increase': 'Increase code font size',
  'fontSize.terminal.decrease': 'Decrease terminal font size',
}

function mount() {
  const store = createFontRowStore().create()
  store.actions.sync({ text: 14, code: 11, terminal: 13 }, { text: '', code: '"Iosevka"', terminal: '' }, 0)
  const setFontFamily = vi.fn()
  const setFontSize = vi.fn()
  const props: FontSettingsGroupProps = {
    ...emptyGlobalSeats,
    useStore: bindSnapshotSelector(store),
    actions: store.actions,
    t: (key: string) => COPY[key] ?? key,
    setFontFamily,
    setFontSize,
  }
  render(() => h(FontSettingsGroup, props))
  return { setFontFamily, setFontSize, header: screen.getByRole('button', { name: 'More font settings' }) }
}

describe('FontSettingsGroup', () => {
  it('starts collapsed and toggles the font rows from the font-size row', async () => {
    const g = mount()
    expect(screen.getByText('Font size')).toBeDefined()
    expect(g.header.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('textbox')).toBeNull()
    await fireEvent.click(g.header)
    expect(g.header.getAttribute('aria-expanded')).toBe('true')
    expect(document.getElementById(g.header.getAttribute('aria-controls')!)).not.toBeNull()
    expect(screen.getAllByRole('textbox')).toHaveLength(3)
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Code font' }).value).toBe('"Iosevka"')
    await fireEvent.click(g.header)
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('routes each row write to its role', async () => {
    const g = mount()
    await fireEvent.click(g.header)
    const terminal = screen.getByRole('textbox', { name: 'Terminal font' })
    await fireEvent.change(terminal, { target: { value: 'Hack' } })
    await fireEvent.blur(terminal)
    expect(g.setFontFamily).toHaveBeenCalledWith('terminal', '"Hack"')
    await fireEvent.click(screen.getByRole('button', { name: 'Increase code font size' }))
    expect(g.setFontSize).toHaveBeenCalledWith('code', 12)
    await fireEvent.click(screen.getByRole('button', { name: 'Decrease terminal font size' }))
    expect(g.setFontSize).toHaveBeenCalledWith('terminal', 12)
  })
})
