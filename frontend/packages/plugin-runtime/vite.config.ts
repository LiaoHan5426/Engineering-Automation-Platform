import path from 'node:path'
import { createRequire } from 'node:module'
import { defineConfig } from 'vite-plus'
import vue from '@vitejs/plugin-vue'
import { dshViteAliasList } from './src/dsh/viteAlias.ts'

const require = createRequire(import.meta.url)
const vueRoot = path.dirname(require.resolve('vue/package.json'))

/**
 * Do NOT use @vitejs/plugin-vue-jsx here: dsh-personal .tsx seats use
 * `defineComponent((props) => () => h(...))`; vue-jsx strips that render return
 * ("Component is missing template or render function"). React JSX (better-sidebar)
 * is handled by Vite/esbuild automatic runtime.
 */
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: [...dshViteAliasList, { find: 'vue', replacement: vueRoot }],
    dedupe: ['vue', 'react', 'react-dom'],
  },
  test: {
    environment: 'happy-dom',
  },
})
