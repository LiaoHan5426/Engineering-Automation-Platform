import { createI18n } from 'vue-i18n'

export const i18n = createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'en-US', messages: {
  'zh-CN': { tasks: '任务', sql: 'SQL 专家', databases: '数据库', capabilities: '能力', submit: '提交需求', analyze: '分析 SQL', connected: '已连接', hidden: '凭据已隐藏' },
  'en-US': { tasks: 'Tasks', sql: 'SQL Expert', databases: 'Databases', capabilities: 'Capabilities', submit: 'Submit requirement', analyze: 'Analyze SQL', connected: 'Connected', hidden: 'Credentials hidden' },
} })
