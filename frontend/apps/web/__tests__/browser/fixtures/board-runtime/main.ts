import { createApp, h } from 'vue'
import PluginCenter from '../../../../src/features/plugins/PluginCenter.vue'
import ProjectBoard from '../../../../src/features/shell/ProjectBoard.vue'
import { createPluginHost } from '../../../../src/features/plugins/host'
import { i18n } from '../../../../src/lib/i18n'
import '../../../../src/style.css'

const host = createPluginHost()
createApp({
  render: () =>
    h('main', { style: 'max-width:1100px;margin:auto;padding:20px' }, [
      h('p', '隔离真实 HTTP / PostgreSQL / Git 验收；部分范围统计使用持久夹具，不是产品人工接受。'),
      h(PluginCenter, { host }),
      host.boardContributionVisible.value
        ? h('div', { 'data-testid': 'board-contribution' }, [h(ProjectBoard)])
        : null,
    ]),
})
  .use(i18n)
  .mount('#app')
