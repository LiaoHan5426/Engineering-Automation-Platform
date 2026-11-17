/** Explicit framework seats for direct question fixtures. */
import { contextMenuHook } from '@deepseek-ai/dsh-client-test-runtime'
import { defineComponent } from 'vue'
import type { SessionAreaProps } from '@deepseek-ai/dsh-client-ui-slots'

function unusedSeat(): never {
  throw new Error('Unexpected framework seat in a direct question fixture')
}

export const questionSeats = {
  SessionProvider: defineComponent((_props: SessionAreaProps) => unusedSeat, {
    props: ['session', 'empty', 'children'],
  }),
  useSession: unusedSeat,
  useProjection: unusedSeat,
  useAccess: unusedSeat,
  useConversation: unusedSeat,
  useInput: unusedSeat,
  inputActions: {
    insertQuote: unusedSeat,
    captureInsertion: unusedSeat,
    insertText: unusedSeat,
    setDraft: unusedSeat,
    persistDraft: unusedSeat,
    addAttachments: unusedSeat,
    removeAttachment: unusedSeat,
    pruneAttachments: unusedSeat,
    submit: unusedSeat,
  },
  useChat: unusedSeat,
  useTrajectory: unusedSeat,
  useRemoteAccess: unusedSeat,
  useSessions: unusedSeat,
  useSessionRetainInfo: unusedSeat,
  useSessionAccess: unusedSeat,
  usePanelInfo: unusedSeat,
  useContextMenu: contextMenuHook(),
  useSessionStatus: unusedSeat,
  useWorkspaces: unusedSeat,
  useResource: unusedSeat,
  useWorkspaceAccess: unusedSeat,
}
