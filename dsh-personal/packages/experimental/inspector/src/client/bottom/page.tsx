import { defineComponent, h, shallowRef, useId, type VNodeRef } from 'vue'
/** Window-local Inspector frontend in the layout's bottom slot. */
import type { Context } from '@deepseek-ai/cordis'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { Button, IconCloseOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  HostObservable,
  InjectFace,
  PropsLocale,
  PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { ShortcutCommandId } from '@deepseek-ai/dsh-client-shortcuts/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { InspectorSourceId } from '../../shared/bridge/ids.ts'
import { bindInspectorKeyboard } from './keyboard.ts'
import { InspectorResizeHandle } from './resize.tsx'
import { zh, en, ja, es, fr, de, ru, pt } from './locales.ts'
import css from './page.module.css'
const ID = 'inspector.toggle' as ShortcutCommandId
type PanelState = 'unopened' | 'visible' | 'hidden'
interface InspectorPanelInjected {
  readonly frontendUrl: string
  readonly close: () => void
  readonly bindFrame: (frame: HTMLIFrameElement) => () => void
  readonly hooks: {
    readonly panel: HostObservable<PanelState>
  }
}
const InspectorPage = defineComponent(
  (
    props: PropsRuntime<'shell.bottom'> &
      PropsLocale<'inspectorPanel'> &
      InjectFace<InspectorPanelInjected>,
  ) => {
    const state = props.usePanel(value => value)
    const height = shallowRef(45)
    const setHeight = (
      next: typeof height.value | ((previous: typeof height.value) => typeof height.value),
    ) => {
      height.value = typeof next === 'function' ? next(height.value) : next
    }
    const panelId = useId()
    let release: (() => void) | undefined
    let retainedFrame: HTMLIFrameElement | null = null
    const frameRef: VNodeRef = (value) => {
      const frame = value instanceof HTMLIFrameElement ? value : null
      if (frame === retainedFrame) return
      release?.()
      retainedFrame = frame
      release = frame === null ? undefined : props.bindFrame(frame)
    }
    return () => {
      return h(
        'section',
        {
          id: panelId,
          class: css.panel,
          style: { '--inspector-height': `${height.value}dvh` },
          hidden: state.value !== 'visible',
          'aria-label': props.t('title'),
          'data-inspector-panel': true,
        },
        [
          state.value === 'visible' &&
            h(InspectorResizeHandle, {
              height: height.value,
              onResize: setHeight,
              label: props.t('resize'),
              panelId: panelId,
            }),
          h('header', { class: css.header }, [
            h('span', null, [props.t('title')]),
            h(
              Tooltip,
              { label: props.t('close'), side: 'top', portal: true },
              {
                default: () => [
                  h(
                    Button,
                    {
                      variant: 'ghost',
                      size: 'sm',
                      className: css.close ?? '',
                      'aria-label': props.t('close'),
                      onClick: props.close,
                    },
                    { icon: () => h(IconCloseOutlineRegular, { size: 14 }) },
                  ),
                ],
              },
            ),
          ]),
          state.value !== 'unopened' &&
            h('iframe', {
              ref: frameRef,
              class: css.page,
              src: props.frontendUrl,
              title: props.t('frameTitle'),
              name: 'dsh-nodejs-inspector',
              referrerPolicy: 'no-referrer',
              'data-inspector-devtools': true,
            }),
        ],
      )
    }
  },
  { props: ['t', 'frontendUrl', 'close', 'bindFrame', 'usePanel'] },
)
/**
 * Register bottom content and its window-local toggle command for one Client source.
 * @param ctx - Inspector context owning the registrations.
 * @param sourceId - Claimed identity of the embedding page's Client source.
 */
export function registerInspectorPage(ctx: Context, sourceId: InspectorSourceId): void {
  const query = new URLSearchParams({ disableLocaleInfoBar: 'true', clientSourceId: sourceId })
  const frontendUrl = `inspector/devtools/devtools_app.html?${query}`
  ctx.effect(() => ctx.locale.register('inspectorPanel', { zh, en, ja, es, fr, de, ru, pt }))
  const t = ctx.locale.bind('inspectorPanel')
  ctx.slots.inject('shell.bottom', function* () {
    const panel = createSnapshotStore<PanelState>('unopened')
    let opener: HTMLElement | undefined
    const close = (): void => {
      if (panel.getSnapshot() !== 'visible') return
      panel.set('hidden')
      if (opener?.isConnected) opener.focus()
    }
    yield ctx.shortcuts.register({
      id: ID,
      label: () => t('toggle'),
      aliases: ['inspector', 'nodejs', 'devtools'],
      defaults: {
        'desktop:macos': { code: 'Period', modifiers: ['primary', 'shift'] },
        'desktop:windows': { code: 'Period', modifiers: ['primary', 'shift'] },
        'desktop:linux': { code: 'Period', modifiers: ['primary', 'shift'] },
        'web:macos': { code: 'Period', modifiers: ['primary', 'shift'] },
        'web:windows': { code: 'Period', modifiers: ['primary', 'shift'] },
        'web:linux': { code: 'Period', modifiers: ['primary', 'shift'] },
      },
      regions: ['page', 'editable', 'terminal'],
      modals: [],
      resolve: ({ target }) => ({
        status: 'handled',
        run: () => {
          if (panel.getSnapshot() === 'visible') close()
          else {
            opener = target instanceof HTMLElement ? target : undefined
            panel.set('visible')
          }
        },
      }),
    })
    yield ctx.slots.register(
      {
        name: 'shell.bottom',
        locale: 'inspectorPanel',
        inject: (): InspectorPanelInjected => ({
          frontendUrl,
          close,
          hooks: { panel },
          bindFrame: frame =>
            bindInspectorKeyboard(
              frame,
              () => ctx.shortcuts.catalog.getSnapshot().find(row => row.id === ID)?.binding,
            ),
        }),
      },
      InspectorPage,
    )
  })
}
