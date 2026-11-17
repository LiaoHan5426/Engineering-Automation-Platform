// @vitest-environment jsdom
/** The label of a changed file: its name, then its directory, with the complete path on hover. */
import { fireEvent, screen } from '@testing-library/dom'
import { h } from 'vue'
import { cleanupVue as cleanup, flushVue as act, renderVue } from './vue-render.client.ts'
import { within as queriesWithin } from '@testing-library/dom'
import { nextTick } from 'vue'
function render(node: Parameters<typeof renderVue>[0]) { const view = renderVue(node); return { ...view, ...queriesWithin(document.body) } }
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FileLabel } from '../src/client/FileLabel.tsx'
import css from '../src/client/FileLabel.module.css'
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
/** Render a label inside a button, the way the files menu and the local changes list hold it. */
function label(path: string, tooltip?: string) {
  const view = render(h('button', {
    'type': 'button',
  }, [h(FileLabel, {
    'path': path,
    ...tooltip === undefined ? {} : { tooltip },
  })]))
  const root = view.container.querySelector('[data-forge-file-label]')
  if (!(root instanceof HTMLElement))
    throw new Error('no file label')
  const parts = (element: Element | null): string[] | null => element === null ? null : [...element.children].map(part => part.textContent ?? '')
  const name = root.querySelector(`.${css.name}`)
  const directory = root.querySelector(`.${css.directory}`)
  return { view, root, name, directory, nameParts: parts(name), directoryParts: parts(directory) }
}
/** Hover the label past its delay and read the tooltip. */
async function hover(root: HTMLElement): Promise<string | null> {
  vi.useFakeTimers()
  {
    fireEvent.pointerEnter(root)
    await nextTick()
  }
  await act(() => { vi.advanceTimersByTime(1000) })
  return screen.getByRole('tooltip').textContent
}
describe('FileLabel', () => {
  it('names the file before its directory, reads the complete path to assistive technology, and shows it on hover', async () => {
    const b = label('packages/core/agent-controller/README.md')
    expect(b.nameParts).toEqual(['README.md'])
    expect(b.directoryParts?.join('')).toBe('packages/core/agent-controller')
    expect((b.name?.compareDocumentPosition(b.directory as Node) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(b.view.getByRole('button', { name: 'packages/core/agent-controller/README.md' })).toBeTruthy()
    expect(await hover(b.root)).toBe('packages/core/agent-controller/README.md')
  })
  it('shows only the name of a file at the repository root', async () => {
    const b = label('package.json')
    expect(b.nameParts).toEqual(['package.json'])
    expect(b.directory).toBeNull()
    expect(b.view.getByRole('button', { name: 'package.json' })).toBeTruthy()
  })
  it('keeps the end of a long name and a long directory whole while their starts can shorten', async () => {
    const directory = '.agents/notes/implemented/feature'
    const name = '2026-10-09-session-change-request-bindings.i18n.yaml'
    const b = label(`${directory}/${name}`)
    expect(b.nameParts).toEqual([name.slice(0, -12), name.slice(-12)])
    expect(b.directoryParts).toEqual([directory.slice(0, -12), directory.slice(-12)])
    expect(b.name?.lastElementChild?.className).toBe(css.tail)
  })
  it('keeps a character whole where the kept end begins', async () => {
    // Twelve UTF-16 units from the end fall inside the emoji; twelve characters start at it.
    const name = `${'a'.repeat(10)}😀${'b'.repeat(8)}.md`
    const b = label(`docs/${name}`)
    expect(b.nameParts).toEqual([name.slice(0, 10), name.slice(10)])
  })
  it('shows the tooltip it is given instead of the path', async () => {
    const b = label('lib/b.txt', 'lib/a.txt → lib/b.txt')
    expect(b.view.getByRole('button', { name: 'lib/b.txt' })).toBeTruthy()
    expect(await hover(b.root)).toBe('lib/a.txt → lib/b.txt')
  })
})
