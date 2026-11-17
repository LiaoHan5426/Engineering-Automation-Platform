/** Explicit framework seats for direct tool-row fixtures. */
import { contextMenuHook } from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { defineComponent } from 'vue'
import type { SessionAreaProps } from '@deepseek-ai/dsh-client-ui-slots'

function unusedSeat(): never {
  throw new Error('Unexpected framework seat in a direct tool-row fixture')
}

export const toolSeats = {
  callId: 'call',
  toolName: 'custom_tool',
  openFile: unusedSeat,
  sessionId: 'tool-fixture' as SessionId,
  loadImage: unusedSeat,
  SessionProvider: defineComponent((_props: SessionAreaProps) => unusedSeat, {
    props: ['session', 'empty'],
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
  useRemoteAccess: unusedSeat,
  useTrajectory: unusedSeat,
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
