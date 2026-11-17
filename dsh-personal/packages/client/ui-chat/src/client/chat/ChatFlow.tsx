/** Ordered Chat rows, local echoes, and running status share the flow slot's parent. */
import { computed, defineComponent, h, type VNode } from 'vue'
import type { PendingSubmission } from '@deepseek-ai/dsh-api-session-controller/client'
import { assertNever } from '@deepseek-ai/dsh-util-values'
import type { ChatFlowSlotProps } from '../contract/slots.ts'
import { ChatNodeSeat } from './ChatNodeSeat.tsx'
import { ChatGroupSeat } from './ChatGroupSeat.tsx'
import { PendingSteeringBubble, PendingSubmissionBubble } from './MessageItem.tsx'
import { chatRenderKey } from './render-entry.ts'
import { RunningStatus } from './RunningStatus.tsx'

/** A local submission echo, or a Host-pending steering item without a local submission. */
type PendingInput = ChatFlowSlotProps['pendingInputs'][number]

/** Whether the echo is a local submission rather than a Host-pending steering item. */
function isLocalSubmission(item: PendingInput): item is PendingSubmission {
  return 'requestId' in item
}

/** Whether the echo is a local submission that opens a new Turn. */
function isTranscriptEcho(item: PendingInput): boolean {
  return isLocalSubmission(item) && item.placement === 'transcript'
}

/** Render the flow without adding a DOM parent or changing keyed row positions. */
export const ChatFlow = defineComponent(
  (props: ChatFlowSlotProps) => {
    const nodeStore = props.useChat(snapshot => snapshot.nodes)
    const running = props.useSession(snapshot => snapshot.running)
    const disconnected = props.useConnectionState(
      state => state === 'disconnected' || state === 'connecting',
    )
    const latestTurnAnchor = props.useChat(
      snapshot => snapshot.navigation.items().at(-1)?.anchorKey,
    )
    const latestKey = computed(() => latestTurnAnchor.value ?? '')
    const runningStartTime = props.useChatNode(latestKey, (node) => {
      const location = node?.location
      return location?.kind === 'turn' || location?.kind === 'step'
        ? location.turn.status === 'open'
          ? location.turn.start?.time
          : undefined
        : undefined
    })
    const latestTurnOpen = props.useChatNode(latestKey, (node) => {
      const location = node?.location
      return (
        (location?.kind === 'turn' || location?.kind === 'step') && location.turn.status === 'open'
      )
    })
    return () => {
      const { entries, pendingInputs, lastInputTurn, loadImage, renderFactorySlot, t } = props
      const holding = !running.value && latestTurnOpen.value
      const seatProps = {
        nodeStore: nodeStore.value,
        useChatNode: props.useChatNode,
        useChatNodeBottom: props.useChatNodeBottom,
        useChatNodeProcess: props.useChatNodeProcess,
        usePresentation: props.usePresentation,
        useStore: props.useStore,
        actions: props.actions,
        renderSlot: props.renderSlot,
        t,
        useGroupAction: props.useGroupAction,
        deferCollapse: props.deferCollapse,
        cwd: props.cwd,
        openFile: props.openFile,
        inspectCall: props.inspectCall,
        forkAt: props.forkAt,
        loadImage,
      }
      const rows = entries.map((entry) => {
        switch (entry.kind) {
          case 'node':
            return h(ChatNodeSeat, {
              ...seatProps,
              key: chatRenderKey(entry),
              nodeKey: entry.key,
              ...(entry.groupPart === undefined ? {} : { groupPart: entry.groupPart }),
            })
          case 'group':
            return h(ChatGroupSeat, {
              ...seatProps,
              key: chatRenderKey(entry),
              groupKey: entry.key,
              useChatGroup: props.useChatGroup,
              useGroupHeaderAction: props.useGroupHeaderAction,
            })
          default:
            return assertNever(entry)
        }
      })
      // Keep echoes and the running status in one keyed list, including the
      // same-Turn claim order when a transcript echo opens the next Turn.
      const firstTranscript = pendingInputs.findIndex(isTranscriptEcho)
      const leadingRows: VNode[] = []
      const openingRows: VNode[] = []
      const pendingRows: VNode[] = []
      for (const [index, item] of pendingInputs.entries()) {
        const row = isLocalSubmission(item)
          ? h(PendingSubmissionBubble, {
            key: item.requestId,
            submission: item,
            loadImage,
            renderFactorySlot,
            t,
          })
          : h(PendingSteeringBubble, {
            key: item.id,
            content: item.content,
            loadImage,
            renderFactorySlot,
            t,
          })
        if (index <= firstTranscript) leadingRows.push(row)
        else if (isTranscriptEcho(item)) openingRows.push(row)
        else pendingRows.push(row)
      }
      const tail = entries.at(-1)
      const node = tail?.kind === 'node' ? nodeStore.value.get(tail.key) : undefined
      if (
        node?.kind === 'turn-process' &&
        node.location.kind === 'turn' &&
        node.location.turn.status === 'open' &&
        node.location.turn.turn !== lastInputTurn
      ) {
        rows.splice(rows.length - 1, 0, ...leadingRows.splice(0))
      }
      // Retain the hidden status after the running bit clears until the Turn end
      // arrives, so its replacement occupies the same keyed position.
      return [
        ...rows,
        ...leadingRows,
        ...openingRows,
        ...(running.value || holding
          ? [
            h(RunningStatus, {
              key: 'running',
              startTime: runningStartTime.value,
              paused: disconnected.value,
              holding: holding === true,
              t,
            }),
          ]
          : []),
        ...pendingRows,
      ]
    }
  },
  {
    name: 'ChatFlow',
    inheritAttrs: false,
    props: [
      'entries',
      'pendingInputs',
      'lastInputTurn',
      'deferCollapse',
      'useSession',
      'useChat',
      'useChatNode',
      'useChatNodeBottom',
      'useChatNodeProcess',
      'useChatGroup',
      'usePresentation',
      'useConnectionState',
      'useStore',
      'actions',
      'renderSlot',
      'renderFactorySlot',
      't',
      'useGroupAction',
      'useGroupHeaderAction',
      'cwd',
      'openFile',
      'inspectCall',
      'forkAt',
      'loadImage',
    ],
  },
)
