// @vitest-environment jsdom
import { h as vueH, shallowRef } from 'vue'
/** The chip title: the file type's sheet, then the name the registry captured. */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '../../../test-support/client-runtime/src/vue-test.ts'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SidebarRightTabInfo } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { PaneId, TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { TextTitle } from '../src/client/TextTitle.tsx'
afterEach(cleanup)
function unusedSeat(): never {
  throw new Error('The title fixture does not consume this framework capability')
}
function props(title: string): PropsRuntime<'sidebar.right.pane.tab.title'> {
  const info: SidebarRightTabInfo = {
    sidebar: { expanded: true, fullscreen: false },
    panel: { id: 'pane:title' as PaneId, isFloating: false },
    tab: {
      id: 'tab:title' as TabId, kind: 'files', contentId: 'title', title, visible: true,
      navigation: { address: 'title', params: undefined, revision: 0 },
      signal: new AbortController().signal,
      actions: { bindCommands: unusedSeat, openResource: unusedSeat, openTab: unusedSeat, close: unusedSeat },
    },
  }
  return {
    sessionId: 'session:title' as SessionId,
    useTabInfo: () => shallowRef(info),
    useSession: unusedSeat, useProjection: unusedSeat, useAccess: unusedSeat,
    useConversation: unusedSeat, useInput: unusedSeat, useChat: unusedSeat,
    useTrajectory: unusedSeat, useRemoteAccess: unusedSeat, useSessions: unusedSeat,
    useSessionRetainInfo: unusedSeat, useSessionAccess: unusedSeat,
    useSessionStatus: unusedSeat, usePanelInfo: unusedSeat, useContextMenu: unusedSeat,
    useWorkspaces: unusedSeat, useResource: unusedSeat, useWorkspaceAccess: unusedSeat,
    inputActions: {
      insertQuote: unusedSeat, captureInsertion: unusedSeat, insertText: unusedSeat,
      setDraft: unusedSeat, persistDraft: unusedSeat, addAttachments: unusedSeat,
      removeAttachment: unusedSeat, pruneAttachments: unusedSeat, submit: unusedSeat,
    },
  }
}
describe('TextTitle', () => {
  it('draws the type sheet before the title text, sized to the chip line', () => {
    const { container } = render(vueH(TextTitle, {
      ...props('README.md'),
    }))
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('16')
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
    expect(container.textContent).toBe('README.md')
  })
  it('picks the sheet from the title\'s extension', () => {
    const markdown = render(vueH(TextTitle, {
      ...props('notes.md'),
    })).container.querySelector('svg')?.innerHTML
    const pdf = render(vueH(TextTitle, {
      ...props('paper.pdf'),
    })).container.querySelector('svg')?.innerHTML
    expect(markdown).not.toBe(pdf)
  })
})
