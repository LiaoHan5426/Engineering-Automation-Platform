import clsx from 'clsx'
/** Desktop channel selection; persistence and updater transitions remain in Electron. */
import { defineComponent, h, shallowRef } from 'vue'
import {
  Menu,
  Toast,
  IconWarningOutlineRegular,
  IconLoadingOutlineRegular,
  IconChevronDownOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { DesktopChannelSource } from './desktop-channel-source.ts'
import type { DesktopUpdateChannel } from '../types.ts'
import css from './DesktopChannelRow.module.css'
/** Framework-bound shell state and explicit selection action. */
export interface DesktopChannelRowInjected {
  hooks: {
    channel: DesktopChannelSource['store']
  }
  select(channel: DesktopUpdateChannel): Promise<void>
}
type ChannelRowProps = PropsRuntime<'settings.general.item'> &
  PropsLocale<'settings'> &
  InjectFace<DesktopChannelRowInjected>
/** Render Desktop channel selection from the shell-owned source. */
export const DesktopChannelRow = defineComponent(
  (props: ChannelRowProps) => {
    const snapshot = props.useChannel(value => value)
    const open = shallowRef(false)
    return () => {
      const { state, failed, pending } = snapshot.value
      const busy = pending !== undefined || state?.changing === true
      const channel = pending ?? state?.channel
      return h(
        'div',
        { class: css.row, role: 'group', 'aria-label': props.t('desktop.channel.title') },
        [
          h('div', { class: css.rowText }, [
            h('div', { class: css.title }, [props.t('desktop.channel.title')]),
            h('div', { class: css.description }, [props.t('desktop.channel.description')]),
            failed || state?.error !== undefined
              ? h('div', { role: 'alert' }, [
                props.t(failed ? 'desktop.channel.readError' : 'desktop.channel.error'),
              ])
              : null,
          ]),
          h(
            Menu,
            {
              open: open.value,
              onClose: () => {
                open.value = false
              },
              portal: true,
              align: 'end',
              selectedId: channel ?? '',
              items: [
                { id: 'stable', label: props.t('desktop.channel.stable') },
                { id: 'nightly', label: props.t('desktop.channel.nightly') },
              ],
              onSelect: (id: string) => {
                open.value = false
                void props.select(id as DesktopUpdateChannel)
              },
            },
            {
              anchor: () =>
                h(
                  'button',
                  {
                    type: 'button',
                    class: css.selector,
                    disabled: busy || state === undefined,
                    'aria-busy': busy,
                    'aria-label': props.t('desktop.channel.title'),
                    'aria-haspopup': 'menu',
                    'aria-expanded': open.value,
                    onClick: () => {
                      open.value = !open.value
                    },
                  },
                  [
                    channel === undefined || channel === null
                      ? props.t('desktop.channel.unavailable')
                      : props.t(
                        channel === 'stable'
                          ? 'desktop.channel.stable'
                          : 'desktop.channel.nightly',
                      ),
                    busy
                      ? h(IconLoadingOutlineRegular, { className: clsx(css.spinner) })
                      : h(IconChevronDownOutlineRegular, { className: clsx(css.chevron) }),
                  ],
                ),
            },
          ),
        ],
      )
    }
  },
  { inheritAttrs: false, props: ['useChannel', 'select', 't'] },
)
/** Shell-owned operation feedback that survives closing Settings. */
export interface DesktopChannelToastInjected {
  hooks: {
    channel: DesktopChannelSource['store']
  }
  dismiss(sequence: number): void
  openConfiguration(): void
}
type ChannelToastProps = PropsRuntime<'shell.overlay'> &
  PropsLocale<'settings'> &
  InjectFace<DesktopChannelToastInjected>
/** Render the latest channel save result outside Settings. */
export const DesktopChannelToast = defineComponent(
  (props: ChannelToastProps) => {
    const notice = props.useChannel(value => value.notice)
    return () => {
      const current = notice.value
      if (current === undefined) return null
      return h(Toast, {
        key: current.sequence,
        text: props.t(`desktop.channel.result.${current.outcome}`),
        ...(current.outcome === 'configuration'
          ? {
            holdMs: 10000,
            actions: [
              { label: props.t('desktop.channel.details'), onClick: props.openConfiguration },
            ],
          }
          : {}),
        onDone: () => {
          props.dismiss(current.sequence)
        },
        ...(current.outcome === 'applied'
          ? { tone: 'success' as const }
          : { icon: h(IconWarningOutlineRegular) }),
      })
    }
  },
  { inheritAttrs: false, props: ['useChannel', 'dismiss', 'openConfiguration', 't'] },
)
