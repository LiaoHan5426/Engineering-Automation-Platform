import ModelSettings from '../../web/src/features/settings/ModelSettings.vue'
import { createApp } from 'vue'
import WorkspaceOverview from '../../web/src/features/shell/WorkspaceOverview.vue'
import DshPluginManager from '../../web/src/features/plugins/DshPluginManager.vue'
import { readBoardLocation } from '../../web/src/features/shell/boardLocation'
import { i18n } from '../../web/src/lib/i18n'
import '@eap/ui/styles.css'
import './product-panels.css'

import TaskBoard from './TaskBoard.vue'

type VueRuntime = Pick<typeof import('vue'), 'h' | 'onMounted' | 'onBeforeUnmount'>
type SidebarContext = {
  effect(register: () => unknown, label: string): void
  layout: { selectPanel(id: string): void }
  slots: {
    inject(name: string, register: () => unknown): unknown
    register(options: Record<string, unknown>, component: object): unknown
  }
}

export function registerProductPanels(ctx: SidebarContext, vue: VueRuntime) {
  ctx.effect(
    () =>
      ctx.slots.inject('sidebar.settings', () =>
        ctx.slots.register(
          { name: 'sidebar.settings' },
          {
            setup() {
              let dialog: HTMLDialogElement | null = null
              let container: HTMLElement | null = null
              let app: ReturnType<typeof createApp> | undefined
              const close = () => {
                app?.unmount()
                app = undefined
              }
              vue.onBeforeUnmount(close)
              return () =>
                vue.h('div', [
                  vue.h(
                    'button',
                    {
                      type: 'button',
                      onClick: () => {
                        if (!dialog || !container || dialog.open) return
                        app = createApp(ModelSettings, { hideAccountLogin: true })
                        app.use(i18n).mount(container)
                        dialog.showModal()
                      },
                    },
                    '设置',
                  ),
                  vue.h(
                    'dialog',
                    {
                      'aria-label': '设置',
                      class: 'eap-product-settings',
                      onClose: close,
                      ref: (node: unknown) => {
                        dialog = node instanceof HTMLDialogElement ? node : null
                      },
                    },
                    [
                      vue.h(
                        'button',
                        { type: 'button', onClick: () => dialog?.close() },
                        '关闭设置',
                      ),
                      vue.h('div', {
                        ref: (node: unknown) => {
                          container = node instanceof HTMLElement ? node : null
                        },
                      }),
                    ],
                  ),
                ])
            },
          },
        ),
      ),
    'EAP settings',
  )
  const panels = [
    {
      id: 'eap-overview',
      label: '工作台',
      order: -20,
      component: WorkspaceOverview,
      props: { boardEnabled: true },
    },
    { id: 'eap-board', label: '任务板', order: -18, component: TaskBoard, props: {} },
    { id: 'eap-plugins', label: '插件中心', order: -19, component: DshPluginManager, props: {} },
  ]
  ctx.effect(
    () =>
      ctx.slots.inject('sidebar.panellist', function* () {
        for (const panel of panels) {
          yield ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: panel.id,
              order: panel.order,
              label: panel.label,
            },
            {
              setup: () => () =>
                vue.h('span', { 'aria-hidden': 'true' }, panel.id === 'eap-overview' ? '▦' : '◇'),
            },
          )
        }
      }),
    'EAP product navigation',
  )
  ctx.effect(
    () =>
      ctx.slots.inject('main', function* () {
        for (const panel of panels) {
          yield ctx.slots.register(
            { name: 'main', key: panel.id },
            {
              setup() {
                let container: HTMLElement | null = null
                let app: ReturnType<typeof createApp> | undefined
                const render = () => {
                  if (container === null) return
                  app?.unmount()
                  const location =
                    panel.id === 'eap-board' ? readBoardLocation(window.location.hash) : null
                  app = location
                    ? createApp(TaskBoard, location)
                    : createApp(panel.component, panel.props)
                  app.use(i18n).mount(container)
                }
                vue.onMounted(() => {
                  render()
                  window.addEventListener('hashchange', render)
                })
                vue.onBeforeUnmount(() => {
                  window.removeEventListener('hashchange', render)
                  app?.unmount()
                })
                return () =>
                  vue.h('div', {
                    class: 'eap-product-panel',
                    ref: (node: unknown) => {
                      container = node instanceof HTMLElement ? node : null
                    },
                  })
              },
            },
          )
        }
        const openLinkedPanel = () => {
          if (readBoardLocation(window.location.hash)) {
            ctx.layout.selectPanel('eap-board')
          } else if (window.location.hash === '#overview') {
            ctx.layout.selectPanel('eap-overview')
          }
        }
        openLinkedPanel()
        window.addEventListener('hashchange', openLinkedPanel)
        yield () => window.removeEventListener('hashchange', openLinkedPanel)
      }),
    'EAP product panels',
  )
}
