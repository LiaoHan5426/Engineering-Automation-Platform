import { defineConfig } from 'vite-plus'

/** Build the package root as a self-contained bundle. */
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
