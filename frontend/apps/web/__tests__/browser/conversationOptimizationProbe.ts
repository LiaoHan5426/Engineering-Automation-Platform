import { i18n } from '../../src/lib/i18n'

declare global {
  interface Window {
    __conversationLanguage: (language: 'zh-CN' | 'en-US') => void
  }
}
window.__conversationLanguage = (language) => {
  i18n.global.locale.value = language
}
