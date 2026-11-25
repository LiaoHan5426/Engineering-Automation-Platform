import path from 'node:path'
import { createRequire } from 'node:module'
import { defineConfig } from 'vite-plus'
import vue from '@vitejs/plugin-vue'

const require = createRequire(import.meta.url)
const vueRoot = path.dirname(require.resolve('vue/package.json'))

/**
 * Do NOT use @vitejs/plugin-vue-jsx here. React JSX in plugin clients is handled
 * by Vite/esbuild automatic runtime. The shell slot hosts are Vue `h()` functions.
 */
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: [{ find: 'vue', replacement: vueRoot }],
    dedupe: ['vue', 'react', 'react-dom'],
  },
  test: {
    environment: 'happy-dom',
  },
})
