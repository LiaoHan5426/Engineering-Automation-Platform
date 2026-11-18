import { defineConfig } from 'vite-plus'

export default defineConfig({
  pack: {
    entry: {
      index: 'lib/types/index.js',
      runner: 'lib/types/bin.js',
      output: 'lib/types/output.js',
    },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
  }
})
