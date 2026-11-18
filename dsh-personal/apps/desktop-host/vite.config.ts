import { defineConfig } from 'vite-plus'

export default defineConfig({
  pack: ['index', 'cli'].map(name => ({
    entry: ['lib/types/' + name + '.js'],
    outDir: 'lib',
    format: ['esm'] as const,
    outputOptions: { codeSplitting: false },
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
  }))
})
