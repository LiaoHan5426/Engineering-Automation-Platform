import { computed, defineComponent, h } from 'vue'
import type { InjectFace, PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { ChatFileMentions, ChatNodeViewProps, PresentationInjected, TurnTailOwnerProps } from '../contract/slots.ts'
import { AssistantMarkdown } from './AssistantMarkdown.tsx'

/** Business readers owned by the assistant renderer's existing Slot registration. */
export interface AssistantNodeInjected extends PresentationInjected {
  /** Resolve against the live Session directory. @param path - Recorded path. @returns Host path. */
  resolveFilePath: (path: string) => string
  /** Resolve closing-Turn mentions with the supplied ordinary file gesture callback. */
  fileMentions: (owner: TurnTailOwnerProps, getFileTriggerProps: NonNullable<Parameters<ChatFileMentions['forClosing']>[2]>) => ReturnType<ChatFileMentions['forClosing']>
}

type AssistantNodeViewProps = ChatNodeViewProps<'assistant-step'> & InjectFace<AssistantNodeInjected>
  & PropsRenderSlots<'conversation.chat.reasoning.body' | 'conversation.chat.message.images'>

/** Streaming, settled, and interrupted Assistant states share one keyed renderer instance. */
export const AssistantNodeView = defineComponent((props: AssistantNodeViewProps) => {
  const { getTriggerProps } = props.useContextMenu()
  const getFileTriggerProps = (path: string) => getTriggerProps(() => ({
    kind: 'file', value: { sessionId: props.sessionId, path: props.resolveFilePath(path) },
  }))
  const tail = props.useTurnData('turn-tail')
  const keepReplies = props.usePresentation(policy => policy.foldedReplies === 'all')
  const owner = computed<TurnTailOwnerProps | undefined>(() => {
    const { node, openFile } = props
    const turn = node.location.kind === 'turn' || node.location.kind === 'step' ? node.location.turn : undefined
    if (turn?.status !== 'closed' || node.data.finalNode === undefined) return undefined
    if (tail.value?.closing?.finalNode.seq !== node.data.finalNode.seq) return undefined
    return { turn, seq: node.data.finalNode.seq, openFile }
  })
  const mentions = computed(() => owner.value === undefined ? undefined : props.fileMentions(owner.value, getFileTriggerProps))
  const revealProcess = () => { props.turnProcess?.setOpen(true) }
  return () => {
    const { node, turnProcess, groupPart } = props
    const data = node.data
    const reasoningHidden = turnProcess !== undefined && turnProcess.foldable
      && (keepReplies.value ? groupPart !== 'reasoning'
        : turnProcess.spec.answerStep === data.step && turnProcess.spec.inlineReasoning)
      && !turnProcess.open
    return h(AssistantMarkdown, {
      blocks: data.blocks, groupPart, useDisclosure: props.useDisclosure,
      streaming: data.status === 'running',
      textInteractionSource: data.status === 'settled' && data.finalNode?.messageId !== undefined,
      interrupted: data.status === 'interrupted', loadImage: props.loadImage,
      reasoningHidden, useGroupAction: props.useGroupAction, usePresentation: props.usePresentation,
      renderSlot: props.renderSlot, revealProcess, mentions: mentions.value, t: props.t,
    })
  }
}, { name: 'AssistantNodeView', inheritAttrs: false, props: [
  'node', 'groupPart', 'useDisclosure', 'useGroupAction', 'useTurnData', 'turnProcess', 'openFile',
  'loadImage', 'fileMentions', 'usePresentation', 'renderSlot', 't', 'sessionId', 'useContextMenu', 'resolveFilePath',
] })
