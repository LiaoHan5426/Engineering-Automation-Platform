// An enclosing `[data-conversation-scroll]` owns scrolling when present;
// otherwise this view owns it. Each row subscribes to one stable node key.

import { computed, defineComponent, h, onScopeDispose, ref, shallowRef, watchEffect } from 'vue'
import type { NodeKey, RenderEntry } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InboxState } from '@deepseek-ai/dsh-agent/types'
import type { PendingSubmission } from '@deepseek-ai/dsh-api-session-controller/client'
import {
  Button,
  FenceCodeBlock,
  IconChevronDownOutlineRegular,
  MarkdownDelegateProvider,
  Modal,
  type MarkdownDelegateFenceInfo,
  type MarkdownMenuTarget,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { isAtOrOutside } from '../contract/group-tree.ts'
import type { ChatFlowHookContext, ChatViewSlotProps, OpenFileOptions } from '../contract/slots.ts'
import type { ChatSnapshot } from '../contract/snapshot.ts'
import { markdownLabels } from '../markdown-labels.ts'
import { TurnNavigator } from './TurnNavigator.tsx'
import { ChatAside } from './ChatAside.tsx'
import { mergeTurnRailItems } from './turn-rail-items.ts'
import { useTextInteraction } from './text-interaction.ts'
import { useChatScroll } from './use-chat-scroll.ts'
import {
  fileMediaUrl,
  resolveWorkspacePath,
  sessionFileAddress,
} from '@deepseek-ai/dsh-util-workspace-path'
import css from './ChatView.module.css'

/** Host/OS refusal text for the file-open dialog; empty throws keep a locale fallback. */
function openFailureMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error)
  return message === '' ? fallback : message
}

/**
 * Durable input identities suppress matching echoes in the same render.
 * The last input's Turn also distinguishes an empty opening control from
 * one whose human input or trigger notice is already present.
 */
function observedInputs(
  order: readonly string[],
  nodes: ChatSnapshot['nodes'],
): { readonly rpcIds: ReadonlySet<string>; readonly lastInputTurn: number | undefined } {
  const observed = new Set<string>()
  let lastInputTurn: number | undefined
  for (const key of order) {
    const node = nodes.get(key)
    if (node === undefined || !isAtOrOutside(node, 'input')) continue
    if (node.location.kind === 'turn' || node.location.kind === 'step')
      lastInputTurn = node.location.turn.turn
    const data: unknown = node.data
    const source =
      typeof data === 'object' && data !== null && 'source' in data ? data.source : undefined
    if (
      typeof source === 'object' &&
      source !== null &&
      'kind' in source &&
      source.kind === 'user' &&
      'rpcId' in source &&
      typeof source.rpcId === 'string'
    )
      observed.add(source.rpcId)
  }
  return { rpcIds: observed, lastInputTurn }
}

type PendingInput = PendingSubmission | InboxState['next-step'][number]

/** How long fold transitions stay enabled after a Turn stops running. */
const MOTION_TAIL_MS = 800

/**
 * The chat view slot entry: pure component over the composed props; each
 * ordered business Node crosses the keyed renderer seat.
 */
export const ChatView = defineComponent(
  (props: ChatViewSlotProps) => {
    const { getTriggerProps } = props.useContextMenu()
    const getMarkdownTriggerProps = (target: MarkdownMenuTarget) =>
      getTriggerProps(() => {
        switch (target.kind) {
          case 'file':
            return {
              kind: 'file',
              value: {
                sessionId: props.sessionId,
                path: props.resolveFilePath(target.path),
                ...(target.line === undefined ? {} : { line: target.line }),
              },
            }
          case 'url':
            return { kind: 'url', value: { sessionId: props.sessionId, url: target.url } }
          case 'image':
            return {
              kind: 'image',
              value: {
                sessionId: props.sessionId,
                url: target.url,
                ...(target.name === undefined ? {} : { name: target.name }),
                ...(target.mediaType === undefined ? {} : { mediaType: target.mediaType }),
                ...(target.path === undefined ? {} : { path: props.resolveFilePath(target.path) }),
              },
            }
        }
      })
    const order = props.useChat(s => s.order)
    const groupedEntries = props.useConversation(
      snapshot => snapshot.views.grouped('chat')?.entries,
    )
    const entries = computed<readonly RenderEntry[]>(
      () =>
        groupedEntries.value ?? order.value.map(key => ({ kind: 'node', key: key as NodeKey })),
    )
    const nodeStore = props.useChat(s => s.nodes)
    const deferCompletedTurns = props.usePresentation(
      policy => policy.collapseTiming === 'next-input',
    )
    const transcriptView = props.usePresentation(policy => policy.mode)
    const turnNavigationItems = props.useChat(s => s.navigation.items())
    const turnOutline = props.useProjection('turnOutline')
    const railItems = computed(() =>
      mergeTurnRailItems(turnNavigationItems.value, turnOutline.value),
    )
    const inboxWire = props.useProjection('inbox')
    // The Inbox projection preserves durable UserMessage records; its wire type erases replay-only unknown fields.
    const inbox = computed(() => inboxWire.value as InboxState | undefined)
    const cwd = props.useSessions(s => s.byId[props.sessionId]?.cwd)
    const fileImages = computed(() => ({
      fileDrag: props.fileDrag,
      resolve: (path: string) =>
        fileMediaUrl(document.baseURI, resolveWorkspacePath(cwd.value, path)),
      resourceAddress: (path: string) =>
        sessionFileAddress(props.sessionId, resolveWorkspacePath(cwd.value, path)),
      labels: {
        open: props.t('image.open'),
        loading: props.t('image.loading'),
        failed: props.t('image.failed'),
        dialog: props.t('image.dialog'),
        close: props.t('image.close'),
      },
    }))
    const renderCode = (fence: MarkdownDelegateFenceInfo) =>
      props.renderSlot('conversation.chat.markdown.fence', fence, {
        entryKey: fence.lang,
        children: h(FenceCodeBlock, {
          lang: fence.lang,
          code: fence.code,
          streaming: fence.streaming,
          labels: markdownLabels(props.t).code,
          diff: false,
        }),
      })
    const running = props.useSession(s => s.running)
    const motionTail = ref(false)
    watchEffect((onCleanup) => {
      if (!deferCompletedTurns.value) {
        motionTail.value = false
        return
      }
      if (running.value) {
        motionTail.value = true
        return
      }
      const timer = setTimeout(() => {
        motionTail.value = false
      }, MOTION_TAIL_MS)
      onCleanup(() => {
        clearTimeout(timer)
      })
    })
    const openState = props.useSession(s => s.openState)
    const openError = props.useSession(s => s.openError)
    const hasMore = props.useSession(s => s.hasMore)
    const loadingOlder = props.useSession(s => s.loadingOlder)
    const historyLoadStatus = props.useSession(s => s.historyLoadStatus)
    const historyWasPartial = props.useSession(s => s.historyWasPartial)
    const fileOpenError = shallowRef<{ path: string; message: string } | null>(null)
    const fileOpenBusy = ref(false)
    let fileOpenRequest = 0
    onScopeDispose(() => {
      fileOpenRequest += 1
    })
    const requestOpenFile = (path: string, options?: OpenFileOptions): void => {
      const id = ++fileOpenRequest
      fileOpenBusy.value = true
      void (options === undefined ? props.openFile(path) : props.openFile(path, options)).then(
        () => {
          if (id !== fileOpenRequest) return
          fileOpenError.value = null
          fileOpenBusy.value = false
        },
        (error: unknown) => {
          if (id !== fileOpenRequest) return
          fileOpenError.value = {
            path,
            message: openFailureMessage(error, props.t('fileOpen.unknown')),
          }
          fileOpenBusy.value = false
        },
      )
    }
    const closeFileOpenError = (): void => {
      fileOpenRequest += 1
      fileOpenError.value = null
      fileOpenBusy.value = false
    }
    const inboxSteering = computed(
      () => inbox.value?.['next-step'].filter(message => message.source.kind === 'user') ?? [],
    )
    const pendingSubmissions = props.useSession(s => s.pendingSubmissions)
    const submissionState = computed(() => {
      if (pendingSubmissions.value.length === 0)
        return [pendingSubmissions.value, undefined] as const
      const observed = observedInputs(order.value, nodeStore.value)
      return [
        pendingSubmissions.value.filter(
          submission =>
            submission.placement !== 'queued' && !observed.rpcIds.has(submission.requestId),
        ),
        observed.lastInputTurn,
      ] as const
    })
    const pendingInputs = computed(() => {
      const local = new Map(
        submissionState.value[0].map(submission => [submission.requestId, submission]),
      )
      const localIds = new Set(
        pendingSubmissions.value
          .filter(submission => submission.placement !== 'queued')
          .map(submission => submission.requestId),
      )
      const pending = inboxSteering.value.flatMap<PendingInput>((item) => {
        const source = item.source
        if (source.kind !== 'user' || !('rpcId' in source)) return [item]
        const submission = local.get(source.rpcId)
        if (submission === undefined) return localIds.has(source.rpcId) ? [] : [item]
        local.delete(source.rpcId)
        return [submission]
      })
      return [...pending, ...local.values()]
    })
    const scroll = useChatScroll(() => {
      const firstKey = order.value[0]
      const lastKey = order.value.at(-1) ?? null
      const latestSteering = pendingInputs.value.findLast(item => 'source' in item)
      return {
        isOpen: openState.value === 'open',
        order: order.value,
        firstSeq:
          firstKey === undefined ? null : (nodeStore.value.get(firstKey)?.anchorSeq ?? null),
        lastKey,
        running: running.value,
        loadingOlder: loadingOlder.value,
        historyLoadStatus: historyLoadStatus.value,
        hasMore: hasMore.value,
        chatScroll: props.chatScroll,
        loadOlder: props.loadOlder,
        consumeOlder: props.consumeOlder,
        loadThrough: props.loadThrough,
        deferCompletedTurns: deferCompletedTurns.value,
        lastIsUser: lastKey !== null && nodeStore.value.get(lastKey)?.kind === 'user',
        steeringId:
          latestSteering?.source.kind === 'user' && 'rpcId' in latestSteering.source
            ? latestSteering.source.rpcId
            : (latestSteering?.id ?? null),
        submissionId: submissionState.value[0].at(-1)?.requestId ?? null,
        submissionSteers: submissionState.value[0].at(-1)?.placement === 'steering',
        loadedTurns: turnNavigationItems.value,
        transcriptView: transcriptView.value,
      }
    })
    const interactionSurfaceRef = shallowRef<HTMLDivElement | null>(null)
    const interactionIds = props.useInteractionIds(ids => ids)
    const textInteraction = useTextInteraction(
      scroll.columnRef,
      interactionSurfaceRef,
      () => props.dispatchInteraction,
      () => interactionIds.value,
    )
    const flowContext: ChatFlowHookContext = { motion: scroll.motion }
    return () => {
      const t = props.t
      const activeInteraction = textInteraction.active.value
      const error = fileOpenError.value
      const currentHistory = !hasMore.value
        ? 'start'
        : loadingOlder.value
          ? 'loading'
          : historyLoadStatus.value === 'error'
            ? 'error'
            : scroll.historyInputHeld.value
              ? 'more'
              : scroll.historyProcessing.value
                ? 'processing'
                : 'more'
      return h('div', { class: css.frame }, [
        scroll.initialized.value
          ? h(TurnNavigator, {
            items: railItems.value,
            activeTurn: scroll.activeTurn.value,
            busyTurn: scroll.busyTurn.value,
            onNavigate: scroll.navigateToTurn,
            t,
          })
          : null,
        h(ChatAside, { renderSlot: props.renderSlot }),
        h(
          'div',
          {
            class: css.root,
            'data-chat-following-tail': scroll.followingTail.value ? '' : undefined,
          },
          [
            h('div', { ref: scroll.listRef, class: css.scroll }, [
              h(
                'div',
                {
                  ref: scroll.columnRef,
                  class: css.column,
                  'data-chat-flow': '',
                  'data-chat-motion':
                    deferCompletedTurns.value &&
                    scroll.initialized.value &&
                    (running.value || motionTail.value || pendingInputs.value.length > 0)
                      ? ''
                      : undefined,
                },
                [
                  openState.value === 'loading'
                    ? h('div', { class: css.hint }, t('chat.loadingHistory'))
                    : null,
                  openState.value === 'error' && openError.value !== null
                    ? h(
                      'div',
                      { class: css.openError },
                      t('chat.loadError', {
                        message: openError.value.message,
                        code: openError.value.code,
                      }),
                    )
                    : null,
                  hasMore.value || historyWasPartial.value
                    ? h(
                      'div',
                      {
                        class: css.older,
                        ref: (element) => {
                          scroll.historyEdgeRef(
                            element instanceof HTMLDivElement ? element : null,
                          )
                        },
                        'data-chat-history': historyLoadStatus.value,
                      },
                      [
                        h(
                          'button',
                          {
                            type: 'button',
                            disabled: !hasMore.value,
                            onClick: scroll.loadEarlier,
                          },
                          [
                            ...(
                              [
                                ['more', t('chat.loadOlder')],
                                ['loading', t('chat.loadingOlder')],
                                ['processing', t('chat.processingOlder')],
                                ['error', t('chat.retryOlder')],
                                ['start', t('chat.historyStart')],
                              ] as const
                            ).map(([state, label]) =>
                              h(
                                'span',
                                {
                                  key: state,
                                  'aria-hidden': state !== currentHistory,
                                  class: state === currentHistory ? undefined : css.historyHidden,
                                },
                                label,
                              ),
                            ),
                          ],
                        ),
                      ],
                    )
                    : null,
                  h(
                    MarkdownDelegateProvider,
                    {
                      getTriggerProps: getMarkdownTriggerProps,
                      openFile: requestOpenFile,
                      openExternalLink: props.openExternalLink,
                      fileImages: fileImages.value,
                      renderCode,
                    },
                    {
                      default: () =>
                        props.renderSlot(
                          'conversation.chat.flow',
                          {
                            entries: entries.value,
                            pendingInputs: pendingInputs.value,
                            lastInputTurn: submissionState.value[1],
                            deferCollapse:
                              deferCompletedTurns.value &&
                              !pendingInputs.value.some(
                                item => 'requestId' in item && item.placement === 'transcript',
                              ),
                            cwd: cwd.value,
                            openFile: requestOpenFile,
                            inspectCall: props.inspectCall,
                            forkAt: props.forkAt,
                            loadImage: props.loadImage,
                          },
                          { hookContext: flowContext },
                        ),
                    },
                  ),
                  h(
                    'div',
                    {
                      ref: interactionSurfaceRef,
                      class: css.textInteraction,
                      'data-text-interaction-surface': '',
                      'aria-hidden': activeInteraction === null,
                    },
                    [
                      activeInteraction === null
                        ? null
                        : props.renderSlot(
                          'conversation.chat.text-interaction',
                          {
                            trigger: activeInteraction.trigger,
                            readText: textInteraction.readText,
                            dismiss: textInteraction.dismiss,
                            clearSelection: textInteraction.clearSelection,
                          },
                          { entryKey: activeInteraction.id },
                        ),
                    ],
                  ),
                ],
              ),
              h('div', {
                class: css.turnSpacer,
                'data-chat-turn-spacer': '',
                'aria-hidden': 'true',
              }),
            ]),
          ],
        ),
        scroll.followingTail.value
          ? null
          : h('div', { class: css.toBottomSlot }, [
            h(
              'button',
              {
                type: 'button',
                class: css.toBottom,
                'aria-label': t('chat.toBottom'),
                onClick: scroll.returnToBottom,
              },
              [h(IconChevronDownOutlineRegular, { size: 16 })],
            ),
          ]),
        error === null
          ? null
          : h(
            Modal,
            {
              open: true,
              onClose: closeFileOpenError,
              closeLabel: t('close'),
              title: t('fileOpen.title'),
              description: error.message,
            },
            {
              footer: () => [
                h(
                  Button,
                  {
                    variant: 'outline',
                    className: css.modalAction ?? '',
                    onClick: closeFileOpenError,
                  },
                  { default: () => t('cancel') },
                ),
                h(
                  Button,
                  {
                    variant: 'primary',
                    className: css.modalAction ?? '',
                    disabled: fileOpenBusy.value,
                    onClick: () => {
                      requestOpenFile(error.path)
                    },
                  },
                  { default: () => t('retry') },
                ),
              ],
            },
          ),
      ])
    }
  },
  {
    name: 'ChatView',
    inheritAttrs: false,
    props: [
      'useSession',
      'useChat',
      'useConversation',
      'useSessions',
      'renderSlot',
      'sessionId',
      'openFile',
      'openExternalLink',
      'resolveFilePath',
      'useContextMenu',
      'loadOlder',
      'consumeOlder',
      'loadThrough',
      'loadImage',
      'inspectCall',
      'chatScroll',
      'forkAt',
      'usePresentation',
      'useProjection',
      'useInteractionIds',
      'dispatchInteraction',
      't',
      'fileDrag',
    ],
  },
)
