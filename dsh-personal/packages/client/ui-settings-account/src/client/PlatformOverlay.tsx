import {
  normalizeClass,
  Fragment,
  Teleport,
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  watch,
} from 'vue'
/** Desktop Platform viewport; the native child owns remote content and credentials. */
import { Button, IconChevronLeftOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PlatformPage } from './platform-pages.ts'
import css from './PlatformOverlay.module.css'
import { acquireOverlayInert } from './overlay-inert.ts'
/** Non-secret commands supplied by the desktop application preload. */
export interface PlatformBridge {
  /** @param page - supported Platform destination. @param bounds - viewport rectangle. @returns after document load. */
  open(
    this: void,
    page: PlatformPage,
    bounds: {
      x: number
      y: number
      width: number
      height: number
    },
  ): Promise<void>
  /** @param bounds - viewport rectangle. @returns after native bounds update. */
  setBounds(
    this: void,
    bounds: {
      x: number
      y: number
      width: number
      height: number
    },
  ): Promise<void>
  /** @returns after the native document is destroyed. */
  close(this: void): Promise<void>
}
/** @param props - native commands, localized copy, and return action. @returns full-window Platform container. */
export const PlatformOverlay = defineComponent(
  (componentProps: {
    bridge: PlatformBridge
    page: PlatformPage
    backLabel: string
    loadingLabel: string
    failureLabel: string
    retryLabel: string
    onClose: () => void
  }) => {
    const layer = shallowRef<HTMLDivElement | null>(null)
    const back = shallowRef<HTMLButtonElement | null>(null)
    const viewport = shallowRef<HTMLDivElement | null>(null)
    const attemptRef = shallowRef(0)
    const setAttempt = (
      value:
        | typeof attemptRef.value
        | ((previous: typeof attemptRef.value) => typeof attemptRef.value),
    ): void => {
      attemptRef.value = typeof value === 'function' ? value(attemptRef.value) : value
    }
    const statusRef = shallowRef<'loading' | 'loaded' | 'failed'>('loading')
    const setStatus = (
      value:
        | typeof statusRef.value
        | ((previous: typeof statusRef.value) => typeof statusRef.value),
    ): void => {
      statusRef.value = typeof value === 'function' ? value(statusRef.value) : value
    }
    onMounted(() => {
      const dispose = (() => {
        const previousFocus =
          document.activeElement instanceof HTMLElement ? document.activeElement : null
        const background = Array.from(document.body.children)
          .filter(
            (element): element is HTMLElement =>
              element instanceof HTMLElement && element !== layer.value,
          )
          .map(element => acquireOverlayInert(element))
        back.value?.focus()
        return () => {
          for (const release of background) release()
          if (previousFocus?.isConnected) previousFocus.focus()
        }
      })()
      if (typeof dispose === 'function') onBeforeUnmount(dispose)
    })
    onMounted(() => {
      watch(
        () => [componentProps.page, attemptRef.value],
        (_values, _old) => {
          (() => {
            back.value?.focus()
          })()
        },
        { immediate: true, flush: 'post' },
      )
    })
    onMounted(() => {
      watch(
        () => [componentProps.bridge, componentProps.page, attemptRef.value],
        (_values, _old, onCleanup) => {
          const dispose = (() => {
            const element = viewport.value as HTMLDivElement
            let closed = false
            const bounds = () => {
              const rect = element.getBoundingClientRect()
              return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
            }
            const fail = () => {
              if (!closed) setStatus('failed')
            }
            setStatus('loading')
            void componentProps.bridge.open(componentProps.page, bounds()).then(() => {
              if (!closed) setStatus('loaded')
            }, fail)
            const observer = new ResizeObserver(() => {
              void componentProps.bridge.setBounds(bounds()).catch(fail)
            })
            observer.observe(element)
            return () => {
              const render_prop_bridge = componentProps.bridge
              closed = true
              observer.disconnect()
              void render_prop_bridge.close().catch(() => {
                // Window teardown may remove the desktop IPC receiver before React unmounts.
              })
            }
          })()
          if (typeof dispose === 'function') onCleanup(dispose)
        },
        { immediate: true, flush: 'post' },
      )
    })
    return () => {
      const render_statusRef = statusRef.value
      const render_prop_backLabel = componentProps.backLabel
      const render_prop_onClose = componentProps.onClose
      const render_prop_loadingLabel = componentProps.loadingLabel
      const render_prop_failureLabel = componentProps.failureLabel
      const render_prop_retryLabel = componentProps.retryLabel
      return h(Teleport, { to: document.body }, [
        h(
          'div',
          {
            ref: layer,
            class: css.overlay,
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': render_prop_backLabel,
            'data-shortcut-modal': 'platform',
          },
          [
            h('header', { class: css.header, 'data-window-drag': true }, [
              h('div', { class: css.controls }, [
                h('span', { class: css.trafficLights, 'aria-hidden': 'true' }),
                h('button', { ref: back, class: css.back, onClick: render_prop_onClose }, [
                  h(IconChevronLeftOutlineRegular, { size: 16 }),
                  render_prop_backLabel,
                ]),
              ]),
            ]),
            h('div', { ref: viewport, class: css.viewport }, [
              render_statusRef !== 'loaded' &&
                h(
                  'div',
                  {
                    class: css.status,
                    role: 'status',
                    'aria-label':
                      render_statusRef === 'loading' ? render_prop_loadingLabel : undefined,
                  },
                  [
                    render_statusRef === 'failed'
                      ? h(Fragment, null, [
                        h('span', { class: css.failure }, [render_prop_failureLabel]),
                        h(
                          Button,
                          {
                            variant: 'outline',
                            className: normalizeClass(css.retry),
                            onClick: () => {
                              setAttempt(value => value + 1)
                            },
                          },
                          {
                            default: () => render_prop_retryLabel,
                          },
                        ),
                      ])
                      : h('span', { class: css.spinner, 'aria-hidden': 'true' }),
                  ],
                ),
            ]),
          ],
        ),
      ])
    }
  },
  {
    inheritAttrs: false,
    props: ['bridge', 'page', 'backLabel', 'loadingLabel', 'failureLabel', 'retryLabel', 'onClose'],
  },
)
