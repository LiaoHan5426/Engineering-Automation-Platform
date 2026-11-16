import type { Context } from '@deepseek-ai/cordis'
import { computed, defineComponent, h, ref, shallowRef, useId, watchEffect } from 'vue'
import type { VNode } from 'vue'
import type { FileAttachmentRef, ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { PropsLocale, PropsRenderFactories, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  IconCheckOutlineRegular, IconChevronDownOutlineRegular, IconChevronUpOutlineRegular, IconCloseOutlineRegular,
  FileTypeIcon, fileSizeText, IconEditOutlineRegular, InlineEditor, IconQueueOutlineRegular, IconSendOutlineRegular,
  IconTrashOutlineRegular, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InboxState } from '@deepseek-ai/dsh-agent/types'
import type { QueueAction } from '@deepseek-ai/dsh-api-session-controller/types'
import type { MessageId } from '@deepseek-ai/dsh-llm/types'
import type { UserTextFacts } from '../index.ts'
import { NS } from '../locales.ts'
import css from './QueueDock.module.css'

const EMPTY_QUEUE = [] as const
const QUEUE_TEXT_FACTS: Readonly<Partial<UserTextFacts>> = {
  collapseWhitespace: true,
  trimWhitespace: true,
}

function textOf(content: InboxState['next-turn'][number]['content']): string | null {
  if (!content.every(block => block.type === 'text')) return null
  return content.map(block => block.text).join('')
}

/** Queue operations injected by the session-scoped registration. */
export interface QueueDockInjected {
  updateQueue: (itemId: MessageId, action: QueueAction) => Promise<void>
  notify: (level: 'info' | 'error', text: string) => void
  /** Resolve one durable queued image into a session-scoped browser URL. */
  loadImage: (attachment: ImageAttachmentRef) => Promise<string>
}

/**
 * Durable references carried by one queued row. Inbox projections are wire data
 * despite their typed face, so an image block without a reference is skipped
 * rather than trusted.
 * @param content - the row's wire content blocks.
 * @returns the row's durable image references in block order.
 */
function queueAttachments(content: InboxState['next-turn'][number]['content']): Array<
  | { readonly type: 'image'; readonly attachment: ImageAttachmentRef }
  | { readonly type: 'file'; readonly attachment: FileAttachmentRef }
> {
  const attachments: Array<
    | { readonly type: 'image'; readonly attachment: ImageAttachmentRef }
    | { readonly type: 'file'; readonly attachment: FileAttachmentRef }
  > = []
  for (const block of content) {
    if (block.type === 'image') {
      const { attachment } = block as { attachment?: ImageAttachmentRef }
      if (attachment !== undefined) attachments.push({ type: 'image', attachment })
    }
    if (block.type === 'file') {
      const { attachment } = block as { attachment?: FileAttachmentRef }
      if (attachment !== undefined) attachments.push({ type: 'file', attachment })
    }
  }
  return attachments
}

/** Compact file identity used beside queue thumbnails. */
const QueueFile = defineComponent((props: { attachment: FileAttachmentRef; label: string }) => () =>
  h('span', { class: css.file, 'aria-label': props.label, title: props.attachment.name }, [
    h('span', { class: css.fileIcon, 'aria-hidden': true }, [h(FileTypeIcon, { path: props.attachment.name, size: 16 })]),
    h('span', { class: css.fileName }, props.attachment.name),
    h('span', { class: css.fileSize }, fileSizeText(props.attachment.bytes)),
  ]), { name: 'QueueFile', inheritAttrs: false, props: ['attachment', 'label'] })

/** One durable queued image; late loads cannot update a replaced or disposed thumbnail. */
const QueueThumb = defineComponent((props: {
  attachment: ImageAttachmentRef; loadImage: QueueDockInjected['loadImage']; label: string
}) => {
  const url = ref<string | null>(null)
  watchEffect((onCleanup) => {
    let alive = true
    onCleanup(() => { alive = false })
    void props.loadImage(props.attachment).then(
      resolved => { if (alive) url.value = resolved },
      () => { /* The durable transcript surfaces read errors; retain the placeholder. */ },
    )
  })
  return () => url.value === null
    ? h('span', { class: css.thumb, 'aria-hidden': true })
    : h('img', { class: css.thumb, src: url.value, alt: props.label })
}, { name: 'QueueThumb', inheritAttrs: false, props: ['attachment', 'loadImage', 'label'] })

/** Full props of the dock entry, derived from its owner, session, inject and locale shares. */
export type QueueDockProps = PropsRuntime<'conversation.input.dock'> & QueueDockInjected & PropsLocale<'conversation'>
  & PropsRenderFactories

/** Durable and local queued submissions share one strip without duplicating admitted rows. */
export const QueueDock = defineComponent((props: QueueDockProps) => {
  const inboxWire = props.useProjection('inbox')
  // Preserve the existing wire-to-fold narrowing: the Host serializes the
  // Inbox fold unchanged, while its JSON-safe declaration erases message fields.
  const inbox = computed(() => inboxWire.value as unknown as InboxState | undefined)
  const pendingSubmissions = props.useSession(s => s.pendingSubmissions)
  const running = props.useSession(s => s.running)
  const queueMutable = props.useSession(s => s.subagent === null || s.subagent.address.mode === 'continuable')
  const queue = computed(() => {
    const rows = inbox.value?.['next-turn'] ?? EMPTY_QUEUE
    const inChat = new Set(pendingSubmissions.value.filter(item => item.placement === 'transcript').map(item => item.requestId))
    return inChat.size === 0 ? rows : rows.filter(({ source }) => (
      source.kind !== 'user' || !('rpcId' in source) || !inChat.has(source.rpcId)
    ))
  })
  const pendingQueue = computed(() => {
    const admitted = new Set(queue.value.flatMap(({ source }) => (
      source.kind === 'user' && 'rpcId' in source ? [source.rpcId] : []
    )))
    return pendingSubmissions.value.filter(submission => submission.placement === 'queued' && !admitted.has(submission.requestId))
  })
  const rowCount = computed(() => queue.value.length + pendingQueue.value.length)
  const editing = shallowRef<{ id: MessageId; text: string } | null>(null)
  const busy = ref<MessageId | null>(null)
  const collapsed = ref(true)
  const listId = useId()
  watchEffect(() => {
    if (rowCount.value === 0) collapsed.value = true
    if (editing.value !== null && (!queueMutable.value || !queue.value.some(row => row.id === editing.value?.id))) editing.value = null
  })
  const applyAction = async (itemId: MessageId, action: QueueAction, failure: string): Promise<boolean> => {
    const { updateQueue, notify } = props
    busy.value = itemId
    try {
      await updateQueue(itemId, action)
      return true
    } catch {
      notify('error', failure)
      return false
    } finally {
      if (busy.value === itemId) busy.value = null
    }
  }
  const saveEdit = async (): Promise<void> => {
    const current = editing.value
    if (current === null || current.text.trim() === '') return
    if (await applyAction(current.id, { kind: 'edit', content: [{ type: 'text', text: current.text }] }, props.t('queue.editFailed'))) editing.value = null
  }
  return () => {
    if (rowCount.value === 0) return null
    const interactionActive = queueMutable.value && (editing.value !== null || busy.value !== null)
    const expanded = !collapsed.value || interactionActive
    const listVisible = rowCount.value === 1 || expanded
    const lead = () => h('span', { class: css.lead, 'aria-hidden': true }, [h(IconQueueOutlineRegular)])
    const preview = (text: string) => h('span', { class: css.preview }, [props.renderFactorySlot('conversation.user.text', {
      text, facts: QUEUE_TEXT_FACTS, interactive: false, ellipsis: true,
    })])
    const actionButton = (
      label: 'queue.save' | 'queue.cancelEdit' | 'queue.edit' | 'queue.remove' | 'queue.steer',
      icon: VNode, onClick: () => void, disabled: boolean, title?: string, unsupported = false,
    ) => h(Tooltip, { portal: true, label: props.t(label), side: 'bottom', delayMs: 500, disabled: unsupported }, {
      default: () => h('button', { type: 'button', class: css.action, 'aria-label': props.t(label), title, disabled, onClick }, [icon]),
    })
    const rows = listVisible ? queue.value.map((row) => {
      const attachments = queueAttachments(row.content)
      const text = textOf(row.content)
      const draft = editing.value?.id === row.id ? editing.value : null
      return h('li', { key: row.id, class: css.row }, [
        rowCount.value === 1 ? lead() : null,
        draft !== null ? h(InlineEditor, {
          value: draft.text, label: props.t('queue.edit'),
          onChange: (value: string) => { editing.value = { id: row.id, text: value } },
          onSave: () => { void saveEdit() }, onCancel: () => { editing.value = null },
        }) : [
          attachments.length > 0 ? h('span', { class: css.attachments }, attachments.map((item, index) => item.type === 'image'
            ? h(QueueThumb, { key: `${item.attachment.attachmentId}:${index}`, attachment: item.attachment, loadImage: props.loadImage, label: props.t('queue.image') })
            : h(QueueFile, { key: `${item.attachment.attachmentId}:${item.attachment.name}:${index}`, attachment: item.attachment, label: props.t('queue.file', { name: item.attachment.name }) }))) : null,
          preview(row.content.filter(block => block.type === 'text').map(block => block.text).join('')),
        ],
        queueMutable.value ? h('div', { class: css.actions }, draft !== null ? [
          actionButton('queue.save', h(IconCheckOutlineRegular, { size: 14 }), () => { void saveEdit() }, busy.value !== null || draft.text.trim() === ''),
          actionButton('queue.cancelEdit', h(IconCloseOutlineRegular, { size: 14 }), () => { editing.value = null }, busy.value !== null),
        ] : [
          actionButton('queue.edit', h(IconEditOutlineRegular, { size: 14 }), () => { if (text !== null) editing.value = { id: row.id, text } }, busy.value !== null || text === null, text === null ? props.t('queue.edit.unsupported') : undefined, text === null),
          actionButton('queue.remove', h(IconTrashOutlineRegular, { size: 14 }), () => { void applyAction(row.id, { kind: 'remove' }, props.t('queue.removeFailed')) }, busy.value !== null),
          actionButton('queue.steer', h(IconSendOutlineRegular), () => { void applyAction(row.id, { kind: 'steer' }, props.t('queue.steerFailed')) }, busy.value !== null || !running.value, running.value ? undefined : props.t('queue.steer.unavailable'), !running.value),
        ]) : null,
      ])
    }) : []
    if (listVisible) for (const submission of pendingQueue.value) rows.push(h('li', {
      key: submission.requestId, class: [css.row, css.pendingRow], 'data-submission-echo': '',
    }, [
      rowCount.value === 1 ? lead() : null,
      submission.attachments.length > 0 ? h('span', { class: css.attachments }, submission.attachments.map((attachment, index) => attachment.type === 'image'
        ? h('img', { key: `${attachment.value.previewUrl}:${index}`, class: css.thumb, src: attachment.value.previewUrl, alt: props.t('queue.image') })
        : h(QueueFile, { key: `${attachment.value.attachmentId}:${attachment.value.name}:${index}`, attachment: attachment.value, label: props.t('queue.file', { name: attachment.value.name }) }))) : null,
      preview(submission.text),
      h('span', { class: css.status, role: 'status' }, props.t('queue.sending')),
      queueMutable.value ? h('div', { class: css.actions }, ([
        ['queue.edit', h(IconEditOutlineRegular, { size: 14 })],
        ['queue.remove', h(IconTrashOutlineRegular, { size: 14 })],
        ['queue.steer', h(IconSendOutlineRegular)],
      ] as const).map(([label, icon]) => h('button', {
        type: 'button', class: css.action, 'aria-label': props.t(label), title: props.t('queue.sending'), disabled: true,
      }, [icon]))) : null,
    ]))
    return h('div', { class: css.dock, 'data-queue-dock': '' }, [h('div', { class: css.panel }, [
      rowCount.value > 1 ? h('button', {
        type: 'button', class: css.header, 'aria-controls': listId, 'aria-expanded': expanded, disabled: interactionActive,
        onClick: () => { collapsed.value = !collapsed.value },
      }, [
        lead(), h('span', { class: css.count }, props.t('queue.count', { n: rowCount.value })),
        !listVisible && pendingQueue.value.length > 0 ? h('span', { class: css.status, role: 'status' }, props.t('queue.sending')) : null,
        h('span', { class: css.chevron, 'aria-hidden': true }, [h(expanded ? IconChevronDownOutlineRegular : IconChevronUpOutlineRegular)]),
      ]) : null,
      h('ul', { id: listId, class: css.list, hidden: !listVisible }, rows),
    ])])
  }
}, {
  name: 'QueueDock', inheritAttrs: false,
  props: ['useSession', 'useProjection', 'updateQueue', 'notify', 'loadImage', 'renderFactorySlot', 't'],
})

/** Registers queue actions backed by the session-scoped conversation service. */
export const queueDockEntry = {
  name: 'conversation-queue-dock',
  inject: ['slots', 'conversation', 'sessions', 'uiConversation'],
  apply(ctx: Context): void {
    ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
      name: 'conversation.input.dock',
      id: 'queue',
      order: 20,
      locale: NS,
      inject: (sessionId: SessionId): QueueDockInjected => {
        const actx = ctx.sessions.scope(sessionId)
        if (actx === undefined) throw new Error(`queue dock: session "${sessionId}" resolved no scope`)
        const conversation = actx.get('conversation')
        if (conversation === undefined) throw new Error('queue dock: conversation service unavailable')
        return {
          updateQueue: (itemId, action) => conversation.updateQueue(itemId, action),
          notify: (level, text) => { conversation.input.for(actx).notify(level, text) },
          loadImage: attachment => ctx.uiConversation.imageUrl(sessionId, attachment),
        }
      },
    }, QueueDock))
  },
}
