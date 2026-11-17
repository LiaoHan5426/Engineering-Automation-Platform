import { defineComponent, h, computed, shallowRef, watch } from 'vue'
/** One Sidebar Inspector with locally selected Chat and Session-log presentations. */
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { InspectorInjected } from './InspectorTable.tsx'
import { InspectorTable } from './InspectorTable.tsx'
import type { InspectorObjects, InspectorChatTarget } from './objects.ts'
import type { InspectorPickTarget } from './chat-node/pick-match.ts'
import { InspectorChatRevealer } from './chat-node/reveal.ts'
import css from './inspector.module.css'
/** Local Inspector presentations; these are not separate Conversation View registrations. */
export type InspectorPresentation = 'chat-node' | 'session-log'
/** Both sources remain lazy: only the selected table subscribes. */
export interface SessionInspectorInjected {
  /** @returns This Session's displayed main Chat column, or undefined without one. */
  readonly chatRoot: () => HTMLElement | undefined
  /**
   * @param owner - Visible picker button.
   * @param picked - True accepts the target; false keeps picking.
   * @param cancelled - Clear panel state when the gesture is cancelled or replaced.
   * @returns Silent cleanup, or undefined if the plugin is disposed or Chat is unavailable.
   */
  readonly pickChat: (
    owner: HTMLElement,
    picked: (target: InspectorPickTarget) => boolean,
    cancelled: () => void,
  ) => (() => void) | undefined
  /** @param target - Log or object coordinates. @returns Exact and nearby loaded Chat identities. */
  readonly resolveChatTargets: (target: InspectorChatTarget) => readonly InspectorChatTarget[]
  readonly hooks: {
    readonly chatRows: InspectorInjected['hooks']['rows']
    readonly logRows: InspectorInjected['hooks']['rows']
  }
  readonly keyedHooks: {
    readonly chatRecord: InspectorInjected['keyedHooks']['record']
    readonly logRecord: InspectorInjected['keyedHooks']['record']
  }
  readonly loadOlder: InspectorInjected['loadOlder']
  readonly objects: InspectorObjects
  /** @param key - Row identity. @param mode - Current table. @returns Current raw type for filtering. */
  readonly recordType: (key: string, mode: InspectorPresentation) => string | undefined
  /** @param key - Selected log row. @returns Its exact or approximate placement in the main Chat. */
  readonly logChatTarget: (key: string) => InspectorChatTarget | undefined
  /** @param target - Picked Chat identity. @param mode - Current table. @returns Its closest loaded row, when available. */
  readonly pickRow: (
    target: InspectorPickTarget,
    mode: InspectorPresentation,
  ) => string | undefined
}
/** Sidebar Session source and Inspector-owned actions and data. */
export type SessionInspectorProps = Pick<PropsRuntime<'sidebar.right.pane.tab'>, 'useSession'> &
  InjectFace<SessionInspectorInjected> &
  PropsLocale<'session-inspector'>
/** @param props - Session-bound sources. @returns One Inspector with an in-toolbar presentation selector. */
export const SessionInspectorView = defineComponent(
  (props: SessionInspectorProps) => {
    const mode = shallowRef<InspectorPresentation>('session-log')
    const setMode = (
      next: typeof mode.value | ((previous: typeof mode.value) => typeof mode.value),
    ) => {
      mode.value = typeof next === 'function' ? next(mode.value) : next
    }
    const picking = shallowRef(false)
    const setPicking = (
      next: typeof picking.value | ((previous: typeof picking.value) => typeof picking.value),
    ) => {
      picking.value = typeof next === 'function' ? next(picking.value) : next
    }
    const pickFailed = shallowRef(false)
    const setPickFailed = (
      next:
        | typeof pickFailed.value
        | ((previous: typeof pickFailed.value) => typeof pickFailed.value),
    ) => {
      pickFailed.value = typeof next === 'function' ? next(pickFailed.value) : next
    }
    const pickedRow = shallowRef<
      | {
        key: string
      }
      | undefined
    >(undefined)
    const setPickedRow = (
      next: typeof pickedRow.value | ((previous: typeof pickedRow.value) => typeof pickedRow.value),
    ) => {
      pickedRow.value = typeof next === 'function' ? next(pickedRow.value) : next
    }
    const pickButton = shallowRef<HTMLButtonElement | null>(null)
    const chat = computed(() => mode.value === 'chat-node')
    const revealer = computed(() => new InspectorChatRevealer(props.chatRoot))
    watch(
      () => [revealer.value, mode.value],
      (_next, _previous, onCleanup) => {
        const dispose = (() => () => {
          revealer.value.dispose()
        })()
        if (typeof dispose === 'function') onCleanup(dispose)
      },
      { immediate: true, flush: 'post' },
    )
    const typeOf = (key: string) => props.recordType(key, mode.value)
    const revealChat = (target: InspectorChatTarget) => {
      revealer.value.reveal(props.resolveChatTargets(target))
    }
    const navigation = computed(() => ({
      reveal: revealChat,
      target: chat.value ? (key: string) => props.objects.row(key)?.target : props.logChatTarget,
    }))
    watch(
      () => [picking.value, mode.value, props.pickChat, props.pickRow, revealer.value],
      (_next, _previous, onCleanup) => {
        const dispose = (() => {
          if (!picking.value || pickButton.value === null) return
          revealer.value.dispose()
          const stopPicking = props.pickChat(
            pickButton.value,
            (target) => {
              const key = props.pickRow(target, mode.value)
              if (key === undefined) {
                setPickFailed(true)
                return false
              }
              setPickedRow({ key })
              setPicking(false)
              setPickFailed(false)
              return true
            },
            () => {
              setPicking(false)
              setPickFailed(false)
            },
          )
          if (stopPicking === undefined) {
            setPicking(false)
            setPickFailed(true)
          }
          return stopPicking
        })()
        if (typeof dispose === 'function') onCleanup(dispose)
      },
      { immediate: true, flush: 'post' },
    )
    return () => {
      const selector = h('span', { class: css.modeControls }, [
        h(
          'select',
          {
            class: css.modeSelector,
            'aria-label': props.t('view.presentation'),
            value: mode.value,
            onChange: (event) => {
              setPicking(false)
              setPickFailed(false)
              setPickedRow(undefined)
              setMode(
                (event.currentTarget as HTMLInputElement).value === 'chat-node'
                  ? 'chat-node'
                  : 'session-log',
              )
            },
          },
          [
            h('option', { value: 'session-log' }, [props.t('view.sessionLog')]),
            h('option', { value: 'chat-node' }, [props.t('view.chatNode')]),
          ],
        ),
        h(
          'button',
          {
            ref: pickButton,
            type: 'button',
            class: css.pickButton,
            'aria-pressed': picking.value,
            'aria-label': props.t('picker.pick'),
            title: props.t(picking.value ? 'picker.cancel' : 'picker.pick'),
            onClick: () => {
              setPickFailed(false)
              setPicking(value => !value)
            },
          },
          [
            h(
              'svg',
              {
                width: '16',
                height: '16',
                viewBox: '0 0 16 16',
                fill: 'none',
                stroke: 'currentColor',
                'stroke-width': '1.3',
                'aria-hidden': 'true',
              },
              [
                h('circle', { cx: '8', cy: '8', r: '4.5' }),
                h('path', { d: 'M8 0v5M8 11v5M0 8h5M11 8h5' }),
              ],
            ),
          ],
        ),
      ])
      return h(InspectorTable, {
        key: mode.value,
        title: props.t(chat.value ? 'view.chatNode' : 'view.sessionLog'),
        modeSelector: selector,
        pickedRow: pickedRow.value,
        notice: picking.value
          ? props.t(pickFailed.value ? 'picker.noMatch' : 'picker.instructions')
          : pickFailed.value
            ? props.t('picker.noChat')
            : undefined,
        useRows: chat.value ? props.useChatRows : props.useLogRows,
        useRecord: chat.value ? props.useChatRecord : props.useLogRecord,
        useSession: props.useSession,
        loadOlder: props.loadOlder,
        typeOf: typeOf,
        t: props.t,
        flash: chat.value,
        showTime: !chat.value,
        navigation: navigation.value,
        ...(chat.value ? { objects: props.objects } : {}),
      })
    }
  },
  {
    props: [
      'useSession',
      'chatRoot',
      'pickChat',
      'resolveChatTargets',
      'objects',
      'recordType',
      'logChatTarget',
      'pickRow',
      'useChatRows',
      'useChatRecord',
      'useLogRows',
      'useLogRecord',
      'loadOlder',
      't',
    ],
  },
)
