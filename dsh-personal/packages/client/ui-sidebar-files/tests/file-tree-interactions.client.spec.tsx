// @vitest-environment jsdom
/** Interactive accessories stay outside the primary action and its disabled scope. */
import { h as vueH } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '../../../test-support/client-runtime/src/vue-test.ts'
import { fireEvent } from '@testing-library/dom'
import { TreeFixture as FileTree } from './tree-fixture.client.tsx'
import type { Accessory } from './tree-fixture.client.tsx'
import type { FileTreeInput, TreeEntry, TreeEntryKind } from '../src/client/FileTree.tsx'
afterEach(() => { cleanup() })
type TestInput = FileTreeInput & {
  accessory?: Accessory | undefined
}
function ActionAccessory({ entry }: {
  entry: TreeEntry
}) {
  return vueH('button', {
    'onClick': () => { actions.get(entry.path)?.() },
  }, [
    'Action',
  ])
}
const actions = new Map<string, () => void>()
afterEach(() => { actions.clear() })
const file: TreeEntry = { path: 'pr/src/a', name: 'First.txt', meta: { kind: 'file', size: 1 } }
function draw(overrides: Partial<TestInput> = {}) {
  const onOpen = vi.fn<TestInput['onOpen']>()
  const props: TestInput = { root: 'pr', entries: [file], expanded: ['pr/src'], onOpen, onToggle: vi.fn(), ...overrides }
  const view = render(vueH(FileTree, {
    ...props,
  }))
  return { view, onOpen }
}
it.each<TreeEntryKind>(['file', 'directory', 'other'])('keeps a %s accessory button outside the primary action and its disabled scope', async (kind) => {
  const accessory = vi.fn()
  const onToggle = vi.fn()
  const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => { })
  try {
    const entry = { ...file, meta: { kind } }
    actions.set(entry.path, accessory)
    const onOpen = vi.fn()
    const view = render(vueH(FileTree, {
      'root': 'pr/src',
      'entries': [entry],
      'expanded': [],
      'onOpen': onOpen,
      'onToggle': onToggle,
      'accessory': ActionAccessory,
    }))
    const action = view.getByRole('button', { name: 'Action' })
    await act(() => { fireEvent.click(action) })
    expect(accessory).toHaveBeenCalledTimes(1)
    expect(onOpen).not.toHaveBeenCalled()
    expect(onToggle).not.toHaveBeenCalled()
    expect(view.container.querySelector('button button')).toBeNull()
    expect(action.closest('[aria-disabled="true"]')).toBeNull()
    expect(diagnostic).not.toHaveBeenCalled()
    if (kind !== 'other') {
      await act(() => { fireEvent.click(view.getByRole('button', { name: file.name })) })
      if (kind === 'file')
        expect(onOpen).toHaveBeenCalledWith(entry)
      else
        expect(onToggle).toHaveBeenCalledWith(entry, true)
    }
  }
  finally {
    diagnostic.mockRestore()
  }
})
it('leaves an accessory enabled when the caller refuses to open its file', async () => {
  const accessory = vi.fn()
  actions.set(file.path, accessory)
  const { view, onOpen } = draw({ root: 'pr/src', canOpen: () => false, accessory: ActionAccessory })
  const action = view.getByRole('button', { name: 'Action' })
  expect(action.closest('[aria-disabled="true"]')).toBeNull()
  await act(() => { fireEvent.click(action) })
  expect(accessory).toHaveBeenCalledTimes(1)
  expect(onOpen).not.toHaveBeenCalled()
})
