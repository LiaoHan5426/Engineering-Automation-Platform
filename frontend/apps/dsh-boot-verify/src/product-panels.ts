import { createApp } from 'vue'
import WorkspaceOverview from '../../web/src/features/shell/WorkspaceOverview.vue'
import { i18n } from '../../web/src/lib/i18n'
import '@eap/ui/styles.css'
import './product-panels.css'


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
  const panels = [
    {
      id: 'eap-overview',
      label: '工作台',
      order: -20,
      component: WorkspaceOverview,
      props: { boardEnabled: false },
    },
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
                  app = createApp(panel.component, panel.props)
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
          if (window.location.hash === '#overview') {
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
