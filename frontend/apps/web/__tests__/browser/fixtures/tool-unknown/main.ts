import { createApp, h } from 'vue'
import Panel from '../../../../src/features/capability/TrustedGitExecutionPanel.vue'
import { i18n } from '../../../../src/lib/i18n'
import '../../../../src/style.css'

createApp({
  render: () =>
    h('main', { style: 'max-width: 1100px; margin: auto; padding: 20px;' }, [
      h('h1', '受控 UNKNOWN 核对演练'),
      h('p', '测试专用宿主与自有进程；真实 HTTP / PostgreSQL，非产品用户接受。'),
      h(Panel, { enabled: true, operation: 'git-status' }),
      h(Panel, { enabled: true, operation: 'git-diff' }),
    ]),
})
  .use(i18n)
  .mount('#app')
