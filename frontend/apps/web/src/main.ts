import { createApp } from 'vue'
import NProgress from 'nprogress'
import { configureRuntimeRequests } from '@eap/runtime-client'
import { initializeAppearance } from './features/settings/appearance'
import { tablePlugin } from '@eap/plugin-table'
import '@eap/ui/styles.css'
import '@eap/plugin-table/styles.css'
import App from './App.vue'
import './style.css'
import './work-pages.css'
import { i18n } from './lib/i18n'
import { scenarioCatalog } from './features/shell/workbench'
import { chatStorage } from './features/chat/chatService'
import { clearLegacyChatHistory } from './features/chat/chatHistory'

// One-shot startup migration: drop the legacy local chat history for this API
// scope before any view (or its session) is created. The sentinel keeps any
// history created afterwards intact across refreshes. Runs at app boot, not in
// the chat view, so clearing does not depend on which page is first opened.
clearLegacyChatHistory(typeof localStorage === 'undefined' ? undefined : chatStorage(localStorage))

configureRuntimeRequests({
  onPendingChange: (pending) => {
    if (pending) NProgress.start()
    else NProgress.done()
  },
})

const disposeAppearance = initializeAppearance()
if (import.meta.hot) import.meta.hot.dispose(disposeAppearance)

createApp(App).use(tablePlugin).use(i18n).mount('#app')
void scenarioCatalog.load()
