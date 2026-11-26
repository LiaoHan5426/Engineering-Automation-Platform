import { i18n } from '../../lib/i18n'

/** Existing views remain available through the five-entry desktop shell. */
export const shellPages = [
  {
    id: 'overview',
    name: i18n.global.t('workspaceOverview.title'),
    icon: '▦',
    group: '工作',
    hint: i18n.global.t('workspaceOverview.usage'),
  },
  {
    id: 'skills',
    name: i18n.global.t('skill.title'),
    icon: '◇',
    group: '设置',
    hint: i18n.global.t('skill.hint'),
  },
  {
    id: 'appearance',
    name: i18n.global.t('appearance.title'),
    icon: '◐',
    group: '设置',
    hint: i18n.global.t('appearance.hint'),
  },
  {
    id: 'sql',
    name: '分析工作台',
    icon: '▷',
    group: '工作',
    hint: '任务列表、任务流与新的分析输入',
  },
  {
    id: 'plugins',
    name: i18n.global.t('plugin.center'),
    icon: '▣',
    group: '设置',
    hint: i18n.global.t('plugin.centerHint'),
  },
  {
    id: 'model-settings',
    name: i18n.global.t('composerUi.modelSettings'),
    icon: '⚙',
    group: '设置',
    hint: i18n.global.t('composerUi.modelSettingsHint'),
  },
  { id: 'experts', name: '专家定义', icon: '◈', group: '设置', hint: '编排能力节点、依赖与授权' },
  { id: 'rules', name: '规则库', icon: '▤', group: '设置', hint: '查看规则、条件与试算结果' },
  { id: 'knowledge', name: '知识库', icon: '▢', group: '设置', hint: '录入业务知识并带来源检索' },
  {
    id: 'databases',
    name: '数据库资料',
    icon: '▦',
    group: '设置',
    hint: '登记脱敏表结构与索引快照',
  },
  {
    id: 'capabilities',
    name: '能力目录',
    icon: '⚙',
    group: '设置',
    hint: '运行时实际注册的确定性工具',
  },
  {
    id: 'patterns',
    name: i18n.global.t('patterns.title'),
    icon: '▣',
    group: '设置',
    hint: i18n.global.t('patterns.desc'),
  },
]

/**
 * 检查器是「按页面取值」的：每个页面声明自己能检查什么，切换页面立刻回到该页的说明，
 * 绝不把上一页的选中项留在那里。只有真正产出逐项结果（发现）的页面才显示选中卡片。
 */
export const INSPECTOR_PAGES: Record<string, { hint: string; pipeline?: boolean }> = {
  sql: {
    hint: '顶部状态条的四个数字都注明了出处（可展开查看口径）。点击任意一条发现，这里显示它的严重级、证据、语义保持建议与三个动作：复制建议 / 查看候选改写 / 标记忽略。',
    pipeline: true,
  },
  chat: { hint: i18n.global.t('chat.hint') },
  plugins: { hint: i18n.global.t('plugin.centerHint') },
  experts: {
    hint: '专家的能力引用、知识库与 MCP 工具授权在该专家面板内联展示；画布与清单都由当前草稿渲染。',
  },
  rules: {
    hint: '选择规则包查看规则，或切换到 SQL 试算。内置规则包可复制后修改。',
  },
  knowledge: { hint: '选择知识库，阅读文档、录入知识或检索内容。' },
  databases: { hint: '选择资料查看或编辑脱敏表结构与索引快照。' },
  capabilities: { hint: '按种类管理能力，或打开 Git 工作区检查与数据诊断。' },
}
