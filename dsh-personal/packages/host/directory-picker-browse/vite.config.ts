import { defineConfig } from 'vite-plus'

/** Node-only backend: listing and creation primitives over the host filesystem. */
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
