import { defineConfig } from 'vite-plus'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    dedupe: ['vue', 'react', 'react-dom'],
  },
  test: {
    setupFiles: ['./apps/web/__tests__/networkSetup.ts'],
    include: ['**/__tests__/**/*.{test,spec}.{ts,tsx,js,jsx,mts,cts}'],
  },
  defaultPackage: {
    dev: './apps/dsh-boot-verify',
    build: './apps/dsh-boot-verify',
    preview: './apps/dsh-boot-verify',
    pack: './packages/ui',
  },
  fmt: {
    printWidth: 100,
    singleQuote: true,
    semi: false,
    trailingComma: 'all',
  },
  lint: {
    plugins: ['typescript', 'vue'],
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'typescript/no-explicit-any': 'error',
      'typescript/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
    overrides: [
      {
        files: ['**/*.d.ts', '**/*.config.ts'],
        rules: { 'typescript/no-explicit-any': 'off' },
      },
    ],
  },
  check: { lint: true, fmt: true },
})
