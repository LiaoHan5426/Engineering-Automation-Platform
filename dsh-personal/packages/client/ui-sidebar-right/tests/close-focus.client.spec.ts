// @vitest-environment jsdom
/** Closing pages retains actual focus through layout replacement without stealing another input owner. */
import { afterEach, expect, it } from 'vitest'
import { nextTick } from 'vue'
import type { PaneId } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { closeWithPaneFocus, openWithPaneFocus } from '../src/client/shell/close-focus.ts'

const session = 'closing-session' as SessionId
afterEach(() => { document.body.replaceChildren() })
it('keeps focus when opening selects no pane', async () => {
  const first = pane('first')
  first.focus()
  openWithPaneFocus(document, session, () => undefined)
  await nextTick()
  expect(document.activeElement).toBe(first)
})

function pane(id: string, floating = false, ownerSession = session) {
  const owner = document.createElement('div')
  owner.dataset.sidebarRightSession = ownerSession
  owner.dataset.sidebarRightOpen = ''
  const element = document.createElement('section')
  element.tabIndex = -1
  element.dataset[floating ? 'dockkitFloat' : 'dockkitPane'] = id
  owner.append(element)
  document.body.append(owner)
  return element
}

it.each([false, true])('focuses the surviving pane after removing a focused page (floating: %s)', async (floating) => {
  const first = pane('first', floating)
  first.focus()
  let survivor: HTMLElement | undefined
  closeWithPaneFocus(document, session, 'first' as PaneId, () => {
    first.parentElement!.remove()
    survivor = pane('second')
  })
  await nextTick()
  expect(document.activeElement).toBe(survivor)
  closeWithPaneFocus(document, session, 'second' as PaneId, () => { survivor!.parentElement!.remove() })
  await nextTick()
  expect(document.activeElement).toBe(document.body)
})

it('prefers another tab in the same pane, then the active visible pane', async () => {
  const first = pane('first')
  const second = pane('second')
  second.dataset.dockkitPaneActive = ''
  const input = document.createElement('input')
  first.append(input)
  input.focus()
  closeWithPaneFocus(document, session, 'first' as PaneId, () => { input.remove() })
  await nextTick()
  expect(document.activeElement).toBe(first)
  closeWithPaneFocus(document, session, 'first' as PaneId, () => { first.parentElement!.remove() })
  await nextTick()
  expect(document.activeElement).toBe(second)
})

it('ignores hidden panes and other Sessions and preserves cleanup failure or explicit focus movement', async () => {
  const first = pane('first')
  const hidden = pane('hidden')
  delete hidden.parentElement!.dataset.sidebarRightOpen
  pane('other', false, 'other-session' as SessionId)
  const composer = document.createElement('textarea')
  document.body.append(composer)
  first.focus()
  expect(() => { closeWithPaneFocus(document, session, 'first' as PaneId, () => { throw new Error('cleanup') }) }).toThrow('cleanup')
  await nextTick()
  expect(document.activeElement).toBe(first)
  closeWithPaneFocus(document, session, 'first' as PaneId, () => { composer.focus() })
  await nextTick()
  expect(document.activeElement).toBe(composer)
  closeWithPaneFocus(document, session, 'first' as PaneId, () => {})
  await nextTick()
  expect(document.activeElement).toBe(composer)
  first.focus()
  closeWithPaneFocus(document, session, 'first' as PaneId, () => { first.parentElement!.remove() })
  await nextTick()
  expect(document.activeElement).toBe(document.body)
})
