// @vitest-environment jsdom
/** The chip title: the folder sheet, then the type's label. */
import { h as vueH, shallowRef } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '../../../test-support/client-runtime/src/vue-test.ts'

import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SidebarRightTabInfo } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { PaneId, TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { FilesTitle } from '../src/client/FilesTitle.tsx'
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
describe('FilesTitle', () => {
  it('draws the folder sheet before the title text, sized to the chip line', () => {
    const { container } = render(vueH(FilesTitle, {
      ...props('文件'),
    }))
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('16')
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
    expect(container.textContent).toBe('文件')
  })
})
