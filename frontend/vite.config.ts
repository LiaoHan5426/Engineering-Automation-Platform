import { defineConfig } from 'vite-plus'

export default defineConfig({
  defaultPackage: { dev: './apps/web', build: './apps/web', preview: './apps/web', pack: './packages/ui' },
  fmt: {
    options: {
      printWidth: 100,
      singleQuote: true,
      semi: false,
      trailingComma: 'all',
    },
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
