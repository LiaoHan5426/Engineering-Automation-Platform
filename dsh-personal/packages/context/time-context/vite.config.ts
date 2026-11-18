import { defineConfig } from 'vite-plus'

/** Build both public entries separately so each inlines shared internal helpers. */
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
