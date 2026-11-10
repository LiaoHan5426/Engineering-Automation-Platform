import { createApp, h, ref } from 'vue'
import { Button } from '@eap/ui'
import PluginCenter from '../../../../src/features/plugins/PluginCenter.vue'
import PluginSlot from '../../../../src/features/plugins/PluginSlot.vue'
import ScenarioWorkspace from '../../../../src/features/ScenarioWorkspace.vue'
import { createPluginHost } from '../../../../src/features/plugins/host'
import { i18n } from '../../../../src/lib/i18n'
import '../../../../src/style.css'
const host = createPluginHost()
const view = ref(location.hash.slice(1) || 'scenes')
function navigate(id: string) {
  view.value = id
  location.hash = id
}
window.addEventListener('hashchange', () => {
  view.value = location.hash.slice(1) || 'scenes'
})
createApp({
  render: () =>
    h('main', { style: 'height:100vh;display:flex;flex-direction:column;min-width:0' }, [
      h(
        'p',
        '隔离 HTTP / PostgreSQL 与真实 GrapesJS 验收。下列导航和故障按钮仅用于测试，不是产品入口或人工接受。',
      ),
      h(
        'nav',
        { style: 'display:flex;flex-wrap:wrap;gap:8px' },
        ['builder-alpha', 'builder-beta', 'plugins', 'scenes'].map((id) =>
          h(Button, { 'data-testid': 'fixture-' + id, onClick: () => navigate(id) }, () => id),
        ),
      ),
      h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, [
        h(
          Button,
          {
            'data-testid': 'fixture-activation-fail',
            onClick: () =>
              host.armActivationFailure('Injected designer activation failure', 'builder'),
          },
          () => '测试：下次设计器激活失败',
        ),
      ]),
      view.value === 'plugins' ? h(PluginCenter, { host }) : null,
      view.value === 'scenes'
        ? h(ScenarioWorkspace, { pluginHost: host, onNavigate: navigate })
        : null,
      h(PluginSlot, {
        viewId: view.value,
        host,
        chatView: { render: () => h('p', 'No model or execution is enabled by this fixture') },
      }),
    ]),
})
  .use(i18n)
  .mount('#app')
