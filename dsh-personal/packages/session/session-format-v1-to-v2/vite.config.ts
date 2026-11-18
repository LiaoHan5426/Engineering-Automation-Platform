import { defineConfig } from 'vite-plus'

/** Build the frozen adjacent-migration library. */
export default defineConfig({
  pack: {
    entry: ['lib/types/index.js'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
  }
})
