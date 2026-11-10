import { defineConfig, loadEnv } from 'vite-plus'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VueMcp } from 'vite-plugin-vue-mcp'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target =
    process.env.EAP_API_PROXY ||
    env.EAP_API_PROXY ||
    (mode === 'mock' ? 'http://127.0.0.1:53200' : 'http://127.0.0.1:8080')
  const apiURL = env.VITE_API_URL || process.env.VITE_API_URL || '/api'
  const apiScope =
    env.VITE_API_SCOPE ||
    process.env.VITE_API_SCOPE ||
    (command === 'serve' && !/^https?:\/\//.test(apiURL) ? target + apiURL : apiURL)
  return {
    optimizeDeps: { include: ['monaco-editor'] },
    plugins: [
      vue(),
      tailwindcss(),
      ...(command === 'serve' && process.env.EAP_VUE_MCP === 'true'
        ? [VueMcp({ host: '127.0.0.1', updateCursorMcpJson: false })]
        : []),
    ],
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(apiURL),
      'import.meta.env.VITE_API_SCOPE': JSON.stringify(apiScope),
    },
    server: { host: '127.0.0.1', proxy: { '/api': { target, changeOrigin: true } } },
  }
})
