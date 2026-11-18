import { defineConfig } from 'vite-plus'

/** Build the creation plugin and its internal proposal implementation. */
export default defineConfig({
  pack: [
    {
      entry: ['lib/types/index.js'],
      outDir: 'lib',
      format: ['esm'],
      platform: 'node',
      target: 'es2024',
      fixedExtension: false,
      dts: false,
      clean: false,
    },
  ]
})
