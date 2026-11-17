/** Common browser chrome; a presentation adapter attaches the page inside its content container. */
import { computed, defineComponent, h, onMounted, shallowRef, useId, watch } from 'vue'
import type { VNodeChild } from 'vue'
import {
  Button,
  IconChevronLeftOutlineRegular,
  IconChevronRightOutlineRegular,
  IconLinkOutlineRegular,
  IconRefreshOutlineRegular,
  Tooltip,
  IconRightUpOutlineRegular,
  SHIELD_OUTLINE_PATH,
  ICON_REGULAR_STROKE,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  InjectFace,
  PropsLocale,
  PropsRuntime,
  PropsStore,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { BrowserInjected } from '../browser/BrowserController.ts'
import { emptyBrowserFrame } from '../browser/BrowserFrame.ts'
import { currentBrowserTarget } from '../browser/BrowserPersistence.ts'
import type { BrowserStore } from '../browser/store.ts'
import css from './Browser.module.css'
const EMPTY_FRAME = emptyBrowserFrame()
function SandboxPolicyIcon({ sandboxed }: { readonly sandboxed: boolean }): VNodeChild {
  return h(
    'svg',
    { width: '15', height: '15', viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
    [
      h('path', {
        d: SHIELD_OUTLINE_PATH,
        stroke: 'currentColor',
        'stroke-width': ICON_REGULAR_STROKE,
        'stroke-linejoin': 'round',
      }),
      sandboxed
        ? h('path', {
          d: 'M12.1654 5.7552L8.9447 9.41475C8.73044 9.65816 8.53628 9.8804 8.35774 10.0423C8.1713 10.2114 7.94235 10.3717 7.64016 10.4254C7.48207 10.4535 7.32 10.4552 7.16151 10.4294C6.85843 10.3801 6.62728 10.2223 6.43836 10.0559C6.25752 9.89653 6.06037 9.67732 5.84264 9.43705L4.72925 8.20897L5.63557 7.38707L6.74897 8.61594C6.98603 8.87755 7.12974 9.03533 7.24673 9.13839C7.31033 9.19443 7.34485 9.21476 7.35823 9.22122C7.38068 9.22484 7.40352 9.22515 7.42593 9.22122C7.40522 9.22502 7.42893 9.23294 7.53583 9.136C7.65132 9.03126 7.79316 8.87139 8.02643 8.60638L11.2479 4.94763L12.1654 5.7552Z',
          fill: 'currentColor',
        })
        : h('path', {
          d: 'M10.6074 4.40278L8.00975 6.99973L10.6074 9.59739L9.59736 10.6074L6.9997 8.00978L4.40274 10.6074L3.3927 9.59739L5.98966 6.99973L3.3927 4.40278L4.40274 3.39273L6.9997 5.98969L9.59736 3.39273L10.6074 4.40278Z',
          fill: 'currentColor',
          transform: 'translate(1.2 0.8)',
        }),
    ],
  )
}
/** Browser body props assembled by the tab seat. */
export type BrowserBodyProps = PropsRuntime<'sidebar.right.pane.tab'> &
  PropsStore<BrowserStore> &
  PropsLocale<'sidebarBrowser'> &
  InjectFace<BrowserInjected>
/** Render provider-neutral navigation state and optional controls. */
export const BrowserBody = defineComponent(
  (props: BrowserBodyProps) => {
    const info = props.useTabInfo()
    const tabId = computed(() => info.value.tab.id)
    const saved = props.useStore(state => state.byTab[tabId.value])
    const initial = saved.value
    const initialUrl = info.value.tab.navigation.params?.url
    const viewportId = useId()
    const mounted = shallowRef(false)
    const stateKey = shallowRef<string | undefined>()
    const state = props.useBrowserState(stateKey)
    const edit = shallowRef<{
      readonly revision: number
      readonly value: string
    }>()
    watch(
      [() => info.value.tab.actions, () => info.value.tab.id, () => props.reload] as const,
      ([actions, id, reload], _old, onCleanup) => {
        onCleanup(
          actions.bindCommands({
            refresh: () => {
              reload(id)
            },
          }),
        )
      },
      { immediate: true, flush: 'post' },
    )
    onMounted(() => {
      watch(
        [
          () => props.mount,
          () => info.value.tab.id,
          () => info.value.tab.signal,
          () => info.value.tab.actions,
          () => props.actions,
        ] as const,
        ([mount, id, signal, actions], _old, onCleanup) => {
          onCleanup(
            mount({
              tabId: id,
              signal,
              viewportId,
              applicationOrigin: window.location.origin,
              initial,
              initialUrl,
              openTab: (url) => {
                actions.openTab('browser', { params: { url }, revealIfOpened: false })
              },
            }),
          )
          stateKey.value = id
          mounted.value = true
        },
        { immediate: true, flush: 'post' },
      )
    })
    return () => {
      const { loadUrl, restore, goBack, goForward, reload, setSandbox, t } = props
      const tab = info.value.tab
      const current = state.value
      const frame = current?.frame ?? EMPTY_FRAME
      const restoreTarget =
        current === undefined ? currentBrowserTarget(initial) : current.restoreTarget
      const target = frame.target ?? restoreTarget
      const revision = current?.addressRevision ?? 0
      const edited = edit.value
      const draft =
        edited !== undefined && edited.revision === revision
          ? edited.value
          : (target?.url ?? initialUrl ?? '')
      const unknown = frame.address === 'unknown'
      const externalUrl = unknown ? undefined : target?.url
      const sandboxed = frame.sandboxEnabled
      const failure = current?.addressFailure
      const error = frame.error
      const submit = (event: Event): void => {
        event.preventDefault()
        loadUrl(tab.id, draft)
      }
      const setDraft = (value: string): void => {
        edit.value = { revision, value }
      }
      return h('div', { class: css.root }, [
        h('form', { class: css.toolbar, onSubmit: submit }, [
          h(
            'button',
            {
              type: 'button',
              class: css.tool,
              'aria-label': t('back'),
              title: t('back'),
              disabled: !frame.canGoBack,
              onClick: () => {
                goBack(tab.id)
              },
            },
            [h(IconChevronLeftOutlineRegular)],
          ),
          h(
            'button',
            {
              type: 'button',
              class: css.tool,
              'aria-label': t('forward'),
              title: t('forward'),
              disabled: !frame.canGoForward,
              onClick: () => {
                goForward(tab.id)
              },
            },
            [h(IconChevronRightOutlineRegular)],
          ),
          h(
            Tooltip,
            {
              label: t('reload'),
              ...(tab.refreshShortcut === undefined
                ? {}
                : { shortcutKeys: tab.refreshShortcut.keys }),
              side: 'bottom',
              delayMs: 500,
            },
            {
              default: () => [
                h(
                  'button',
                  {
                    type: 'button',
                    class: css.tool,
                    'aria-label': t('reload'),
                    'aria-keyshortcuts': tab.refreshShortcut?.aria,
                    disabled: target === undefined || !mounted.value,
                    onClick: () => {
                      reload(tab.id)
                    },
                  },
                  [h(IconRefreshOutlineRegular)],
                ),
              ],
            },
          ),
          h('div', { class: css.addressBox }, [
            h('input', {
              class: [css.address, unknown ? css.addressUnknown : ''].join(' '),
              value: draft,
              'aria-label': t('address.placeholder'),
              placeholder: t('address.placeholder'),
              spellCheck: false,
              onInput: (event: Event) => {
                if (event.currentTarget instanceof HTMLInputElement)
                  setDraft(event.currentTarget.value)
              },
            }),
            unknown && h('span', { class: css.addressChanged }, [t('address.changed')]),
            h(
              'button',
              {
                type: 'submit',
                class: [css.tool, css.addressGo].join(' '),
                'aria-label': t('go'),
                title: t('go'),
              },
              [h(IconLinkOutlineRegular)],
            ),
          ]),
          h(
            'button',
            {
              type: 'button',
              class: css.tool,
              'aria-label': t('external'),
              title: t('external'),
              disabled: externalUrl === undefined,
              onClick:
                externalUrl === undefined
                  ? undefined
                  : () => {
                    window.open(externalUrl, '_blank', 'noopener,noreferrer')
                  },
            },
            [h(IconRightUpOutlineRegular, { size: 14 })],
          ),
          sandboxed !== undefined &&
            h(
              'button',
              {
                type: 'button',
                class: [css.tool, sandboxed ? '' : css.sandboxOff].join(' '),
                'aria-label': t(sandboxed ? 'sandbox.disable' : 'sandbox.enable'),
                title: t(sandboxed ? 'sandbox.disable' : 'sandbox.enable'),
                'aria-pressed': !sandboxed,
                onClick: () => {
                  setSandbox(tab.id, !sandboxed)
                },
              },
              [h(SandboxPolicyIcon, { sandboxed: sandboxed })],
            ),
        ]),
        sandboxed === false &&
          h('div', { class: css.sandboxWarning, role: 'status' }, [t('sandbox.warning')]),
        error !== undefined &&
          h('div', { class: css.failure, role: 'status' }, [
            error.code !== undefined && error.description !== undefined
              ? t('load.failed.detail', {
                code: String(error.code),
                description: error.description,
              })
              : t('load.failed'),
          ]),
        failure !== undefined &&
          h('div', { class: css.failure, role: 'alert' }, [t(`error.${failure}`)]),
        h('div', { class: css.content, 'aria-busy': frame.loading }, [
          h('div', { id: viewportId, class: css.viewport, 'aria-label': t('type.label') }),
          restoreTarget !== undefined &&
            h('section', { class: css.restore, 'aria-label': t('restore.previous') }, [
              h('p', { class: css.restoreLabel }, [t('restore.previous')]),
              h('p', { class: css.restoreTitle }, [restoreTarget.title]),
              h('p', { class: css.restoreUrl }, [restoreTarget.url]),
              h(
                Button,
                {
                  variant: 'primary',
                  size: 'sm',
                  disabled: !mounted.value,
                  onClick: () => {
                    restore(tab.id)
                  },
                },
                { default: () => [t('restore.action')] },
              ),
            ]),
          restoreTarget === undefined &&
            (target === undefined || frame.loading) &&
            error === undefined &&
            h('div', { class: css.placeholder }, [
              h('div', { class: css.start }, [t(target === undefined ? 'start' : 'loading')]),
            ]),
        ]),
        unknown && h('p', { class: css.limit }, [t('address.unknown')]),
      ])
    }
  },
  {
    props: [
      'mount',
      'loadUrl',
      'restore',
      'goBack',
      'goForward',
      'reload',
      'setSandbox',
      'useBrowserState',
      'useStore',
      'useTabInfo',
      't',
      'actions',
      'sessionId',
    ],
  },
)
