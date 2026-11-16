// @vitest-environment jsdom
import { h, shallowRef } from 'vue'
/** FontFamilyRow behavior: the field shows the persisted list, blur and Enter
 * commit the normalized input, and the field follows store changes. Also
 * covers the font-list normalization it relies on. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from './vue-fixture.ts'
import { emptyGlobalSeats, bindSnapshotSelector } from './vue-fixture.ts'
import { FontFamilyRow } from '../src/client/FontFamilyRow.tsx'
import type { FontFamilyRowComponentProps } from '../src/client/FontFamilyRow.tsx'
import { createFontRowStore } from '../src/client/settings-store.ts'
import { normalizeFontFamily, type FontRole } from '../src/theme-settings.ts'

afterEach(cleanup)

const COPY: Record<string, string> = {
  'fontFamily.code.title': 'Code font',
  'fontFamily.code.description': 'Used for code',
  'fontFamily.placeholder': 'Default',
}

function mount(kind: FontRole = 'code', code = '') {
  const store = createFontRowStore().create()
  store.actions.sync({ text: 14, code: 11, terminal: 13 }, { text: '', code, terminal: '' }, 0)
  const setFontFamily = vi.fn()
  const codeTitle = shallowRef('Code font')
  const props: FontFamilyRowComponentProps = {
    ...emptyGlobalSeats,
    useStore: bindSnapshotSelector(store),
    actions: store.actions,
    t: (key: string) => key === 'fontFamily.code.title' ? codeTitle.value : COPY[key] ?? key,
    role: kind,
    setFontFamily,
  }
  render(() => h(FontFamilyRow, props))
  return { store, setFontFamily, codeTitle, field: screen.getByRole<HTMLInputElement>('textbox', { name: 'Code font' }) }
}

describe('normalizeFontFamily', () => {
  it('quotes family names, keeps generic keywords, and drops empty names', async () => {
    expect(normalizeFontFamily(" 'JetBrains Mono' ,, MONOSPACE, ui-monospace ")).toBe('"JetBrains Mono", MONOSPACE, ui-monospace')
    expect(normalizeFontFamily(' , ')).toBe('')
  })

  it('removes characters that could escape the string or the boot script, and is idempotent', async () => {
    const list = normalizeFontFamily('Fira\\"Code</style>\u0007, Sarasa  Mono SC')
    expect(list).toBe('"FiraCode/style", "Sarasa Mono SC"')
    expect(normalizeFontFamily(list)).toBe(list)
  })
})

describe('FontFamilyRow', () => {
  it('shows the role copy and the persisted list, with a default placeholder', async () => {
    const { field } = mount('code', '"Iosevka"')
    expect(screen.getByText('Used for code')).toBeDefined()
    expect(field.value).toBe('"Iosevka"')
    expect(field.placeholder).toBe('Default')
  })

  it('commits the normalized list on blur and shows it in the field', async () => {
    const b = mount()
    await fireEvent.change(b.field, { target: { value: 'Fira Code, monospace' } })
    await fireEvent.blur(b.field)
    expect(b.setFontFamily).toHaveBeenCalledWith('"Fira Code", monospace')
    expect(b.field.value).toBe('"Fira Code", monospace')
  })

  it('preserves an uncommitted font list when locale copy changes', async () => {
    const b = mount('code', '"Iosevka"')
    await fireEvent.change(b.field, { target: { value: 'Draft font' } })
    await act(() => { b.codeTitle.value = '代码字体' })
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: '代码字体' }).value).toBe('Draft font')
    expect(b.setFontFamily).not.toHaveBeenCalled()
  })

  it('ignores Enter while an input method is composing', async () => {
    const b = mount()
    await fireEvent.change(b.field, { target: { value: '思源' } })
    await fireEvent.keyDown(b.field, { key: 'Enter', isComposing: true })
    await fireEvent.keyDown(b.field, { key: 'Enter', keyCode: 229 })
    expect(b.setFontFamily).not.toHaveBeenCalled()
    expect(b.field.value).toBe('思源')
  })

  it('commits on Enter and follows later store changes', async () => {
    const b = mount('code', '"Iosevka"')
    b.field.focus()
    await fireEvent.change(b.field, { target: { value: '' } })
    await fireEvent.keyDown(b.field, { key: 'Enter' })
    expect(b.setFontFamily).toHaveBeenCalledWith('')
    await fireEvent.keyDown(screen.getByRole('textbox', { name: 'Code font' }), { key: 'a' })
    expect(b.setFontFamily).toHaveBeenCalledOnce()
    await act(() => { b.store.actions.sync({ text: 14, code: 11, terminal: 13 }, { text: '', code: '"Hack"', terminal: '' }, 1) })
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Code font' }).value).toBe('"Hack"')
    await act(() => { b.store.actions.sync({ text: 14, code: 11, terminal: 13 }, { text: '', code: '"Stale"', terminal: '' }, 1) })
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Code font' }).value).toBe('"Hack"')
  })
})
